import {
  compileShadoWorld,
  createShadoWorldAuthoring,
  createShadoEntityVisibilityWorkerLayout,
  ShadoEntityVisibilityProjection,
  ShadoEntityVisibilityWorker,
  ShadoVisibilityWorkerControl,
  ShadoWorldVisibilityCoordinator,
  type ShadoEntityVisibilityWorkerLayout,
  type ShadoVisibilityWorkerPort,
} from '../src/world';

function world() {
  return compileShadoWorld(
    [
      {
        name: 'quad',
        material: 'stone',
        positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
        indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
      },
    ],
    { name: 'worker-proof', tileSize: 16 }
  );
}

describe('Shado amortized entity-visibility worker', () => {
  it('maintains a fixed shared projection with incremental entity writes', () => {
    const layout = createShadoEntityVisibilityWorkerLayout(8);
    const buffer = new SharedArrayBuffer(layout.byteLength);
    const projection = new ShadoEntityVisibilityProjection(buffer, layout);

    projection.load(
      {
        count: 3,
        positionX: [1, 2, 3],
        positionY: [4, 5, 6],
        positionZ: [7, 8, 9],
      },
      2
    );
    projection.setEntity(1, 20, 21, 22, 3);

    expect(projection.count).toBe(3);
    expect(Array.from(projection.positionX.subarray(0, 3))).toEqual([1, 20, 3]);
    expect(Array.from(projection.radius.subarray(0, 3))).toEqual([2, 3, 2]);
    expect(() => {
      projection.count = 9;
    }).toThrow(/reserved capacity/);
  });

  it('keeps one running request and coalesces newer camera snapshots', async () => {
    const port = new FakeVisibilityWorker();
    const worker = await ShadoEntityVisibilityWorker.create(world(), {
      capacity: 4,
      workerFactory: () => port,
    });
    worker.projection.load({
      count: 3,
      positionX: [1, -1, 2],
      positionY: [0, 0, 0],
      positionZ: [0, 0, 0],
      radius: [1, 1, 1],
    });
    const planes = new Float32Array(24);
    const options = { camera: [0, 0, 0] as [number, number, number] };

    expect(worker.request(planes, [0xff], options)).toBe(1);
    expect(worker.request(planes, [0xff], options)).toBe(2);
    expect(worker.request(planes, [0xff], options)).toBe(3);
    expect(port.reduceGenerations).toEqual([1]);
    expect(worker.stats).toMatchObject({
      requestedGeneration: 3,
      completedGeneration: 0,
      inFlight: true,
      hasPendingRequest: true,
    });

    port.completeNext();
    expect(port.reduceGenerations).toEqual([1, 3]);
    expect(worker.acquireLatest()?.generation).toBe(1);

    port.completeNext();
    const result = worker.acquireLatest();
    expect(result?.generation).toBe(3);
    expect(Array.from(result?.visibleIndices ?? [])).toEqual([0, 2]);
    expect(Array.from(result?.flags ?? [])).toEqual([0xff, 0, 0xff]);
    expect(worker.stats).toMatchObject({
      requestedGeneration: 3,
      completedGeneration: 3,
      inFlight: false,
      hasPendingRequest: false,
    });

    worker.dispose();
    expect(port.terminated).toBe(true);
  });

  it('is the coordinator default for packaged world objects', async () => {
    const authoring = createShadoWorldAuthoring('worker-default');
    authoring.objects.prototypes.push({
      id: 'tree',
      source: '/tree.glb',
      boundsRadius: 1,
      metadata: {},
    });
    authoring.objects.stamps.push(
      {
        id: 'visible',
        prototype: 'tree',
        enabled: true,
        position: [1, 0, 0],
        rotationDegrees: [0, 0, 0],
        scale: [1, 1, 1],
        phaseMask: 1,
        tags: [],
        metadata: {},
      },
      {
        id: 'disabled',
        prototype: 'tree',
        enabled: false,
        position: [2, 0, 0],
        rotationDegrees: [0, 0, 0],
        scale: [1, 1, 1],
        phaseMask: 1,
        tags: [],
        metadata: {},
      },
      {
        id: 'other-phase',
        prototype: 'tree',
        enabled: true,
        position: [3, 0, 0],
        rotationDegrees: [0, 0, 0],
        scale: [1, 1, 1],
        phaseMask: 2,
        tags: [],
        metadata: {},
      }
    );
    const packageValue = compileShadoWorld(
      [
        {
          name: 'quad',
          material: 'stone',
          positions: new Float32Array([0, 0, 0, 4, 0, 0, 4, 1, 0, 0, 1, 0]),
          indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
        },
      ],
      { name: 'worker-default', tileSize: 16, authoring }
    );
    const port = new FakeVisibilityWorker();
    const coordinator = await ShadoWorldVisibilityCoordinator.create(packageValue, {
      workerFactory: () => port,
    });
    const planes = new Float32Array([
      1, 0, 0, 100, -1, 0, 0, 100, 0, 1, 0, 100, 0, -1, 0, 100, 0, 0, 1, 100, 0, 0, -1, 100,
    ]);
    const frame = coordinator.reduceWorld(planes, [0, 0, 0]);

    expect(coordinator.worldObjectVisibilityMode).toBe('worker');
    // First call publishes work and returns the one-time synchronous bootstrap.
    expect(
      Array.from(
        coordinator.reduceWorldObjects(planes, frame, {
          camera: [0, 0, 0],
          activePhaseMask: 1,
        }).visibleIndices
      )
    ).toEqual([0]);
    port.completeNext();
    // Subsequent calls acquire a complete worker generation without waiting.
    expect(
      Array.from(
        coordinator.reduceWorldObjects(planes, frame, {
          camera: [0, 0, 0],
          activePhaseMask: 1,
        }).visibleIndices
      )
    ).toEqual([0]);
    expect(coordinator.worldObjectVisibilityWorkerStats).toMatchObject({
      completedGeneration: 1,
      inFlight: true,
    });

    coordinator.dispose();
    expect(port.terminated).toBe(true);
  });
});

class FakeVisibilityWorker {
  public readonly reduceGenerations: number[] = [];
  public terminated = false;

  private readonly messageListeners: Array<(event: MessageEvent) => void> = [];
  private init:
    | {
        buffer: SharedArrayBuffer;
        layout: ShadoEntityVisibilityWorkerLayout;
      }
    | undefined;
  private pending: Array<{ generation: number; activePhaseMask: number }> = [];

  public postMessage(message: unknown): void {
    const value = message as {
      type: string;
      generation?: number;
      activePhaseMask?: number;
      buffer?: SharedArrayBuffer;
      layout?: ShadoEntityVisibilityWorkerLayout;
    };
    if (value.type === 'init') {
      this.init = {
        buffer: value.buffer!,
        layout: value.layout!,
      };
      queueMicrotask(() => this.emit({ type: 'ready' }));
      return;
    }
    if (value.type === 'reduce') {
      this.reduceGenerations.push(value.generation!);
      this.pending.push({
        generation: value.generation!,
        activePhaseMask: value.activePhaseMask ?? 0xffffffff,
      });
    }
  }

  public addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    if (type === 'message') this.messageListeners.push(listener);
  }

  public terminate(): void {
    this.terminated = true;
  }

  public completeNext(): void {
    const request = this.pending.shift();
    if (!request || !this.init) throw new Error('No fake visibility request is pending');
    const { buffer, layout } = this.init;
    const control = new Int32Array(buffer, layout.controlOffset, 16);
    const count = Atomics.load(control, ShadoVisibilityWorkerControl.EntityCount);
    const positionX = new Float32Array(buffer, layout.positionXOffset, layout.capacity);
    const enabled = new Uint8Array(buffer, layout.enabledOffset, layout.capacity);
    const phaseMask = new Uint32Array(buffer, layout.phaseMaskOffset, layout.capacity);
    const output = 1 - Atomics.load(control, ShadoVisibilityWorkerControl.PublishedOutputBuffer);
    const indices = new Uint32Array(buffer, layout.visibleIndicesOffsets[output], layout.capacity);
    const flags = new Uint8Array(buffer, layout.flagsOffsets[output], layout.capacity);
    flags.fill(0, 0, count);
    let visible = 0;
    for (let i = 0; i < count; i++) {
      if (positionX[i] < 0 || !enabled[i] || !(phaseMask[i] & request.activePhaseMask)) {
        continue;
      }
      indices[visible++] = i;
      flags[i] = 0xff;
    }
    Atomics.store(
      control,
      output === 0
        ? ShadoVisibilityWorkerControl.ResultCount0
        : ShadoVisibilityWorkerControl.ResultCount1,
      visible
    );
    Atomics.store(
      control,
      output === 0
        ? ShadoVisibilityWorkerControl.ResultEntityCount0
        : ShadoVisibilityWorkerControl.ResultEntityCount1,
      count
    );
    Atomics.store(control, ShadoVisibilityWorkerControl.PublishedOutputBuffer, output);
    Atomics.store(control, ShadoVisibilityWorkerControl.CompletedGeneration, request.generation);
    this.emit({ type: 'complete', generation: request.generation });
  }

  private emit(data: unknown): void {
    const event = { data } as MessageEvent;
    this.messageListeners.forEach(listener => listener(event));
  }
}

// Compile-time check that the fake keeps the browser-port boundary honest.
const _fakePort: ShadoVisibilityWorkerPort = new FakeVisibilityWorker();
void _fakePort;

#!/usr/bin/env node
// End-to-end WebGPU timing for actor upload -> optional scatter -> projected
// transform consumption in a render pass.

import { chromium } from '@playwright/test';
import { createServer } from 'node:http';

import { emitComputeScatterWGSL } from '../dist/render-data/index.js';

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? Number(process.argv[index + 1]) : fallback;
}

const actorCount = option('actors', 100_000);
const iterations = option('iterations', 10);
const changedRows = Math.max(1, Math.floor(actorCount * 0.01));
const browser = await chromium.launch({
  headless: true,
  channel: 'chromium',
  args: ['--enable-unsafe-webgpu'],
});
const page = await browser.newPage();
const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html' });
  response.end('<!doctype html><title>Shado scatter pipeline benchmark</title>');
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
if (!address || typeof address === 'string') {
  throw new Error('Could not create the benchmark HTTP origin');
}
await page.goto(`http://127.0.0.1:${address.port}`);

try {
  const results = await page.evaluate(
    async ({ actorCount, changedRows, iterations, rowScatterSource, shapedScatterSource }) => {
      const gpu = navigator.gpu;
      if (!gpu) throw new Error('WebGPU is unavailable');
      const adapter = await gpu.requestAdapter();
      if (!adapter) throw new Error('No WebGPU adapter is available');
      const timestampSupported = adapter.features.has('timestamp-query');
      const device = await adapter.requestDevice({
        requiredFeatures: timestampSupported ? ['timestamp-query'] : [],
      });
      const median = values => {
        if (!values.length) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)];
      };
      const consumerSource = `
@group(0) @binding(0) var<storage, read> actorWords: array<u32>;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
};

@vertex
fn mainVertex(
  @builtin(instance_index) instanceIndex: u32
) -> VertexOutput {
  var output: VertexOutput;
  let base = instanceIndex * 4u;
  let xy = unpack2x16unorm(actorWords[base]);
  // Keep the read live but place the point outside clip space. This isolates
  // projected-transform vertex fetch from raster/fragment overdraw.
  output.position = vec4<f32>(vec2<f32>(2.0) + xy * 0.001, 0.0, 1.0);
  output.color = vec4<f32>(xy, 0.5, 1.0);
  return output;
}

@fragment
fn mainFragment(input: VertexOutput) -> @location(0) vec4<f32> {
  return input.color;
}
`;
      const createScatterPipeline = source =>
        device.createComputePipeline({
          layout: 'auto',
          compute: {
            module: device.createShaderModule({ code: source }),
            entryPoint: 'main',
          },
        });
      const scatterPipelines = {
        row: createScatterPipeline(rowScatterSource),
        shaped: createScatterPipeline(shapedScatterSource),
      };
      const consumerModule = device.createShaderModule({ code: consumerSource });
      const consumerPipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module: consumerModule, entryPoint: 'mainVertex' },
        fragment: {
          module: consumerModule,
          entryPoint: 'mainFragment',
          targets: [{ format: 'rgba8unorm' }],
        },
        primitive: { topology: 'point-list' },
      });
      const residentBytes = actorCount * 16;
      const resident = device.createBuffer({
        size: residentBytes,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      });
      const fullData = new Uint32Array(actorCount * 4);
      for (let index = 0; index < actorCount; index++) {
        fullData[index * 4] = 0x80008000;
        fullData[index * 4 + 3] = 0x7fff0000;
      }
      device.queue.writeBuffer(resident, 0, fullData);
      const rowDelta = new Uint32Array(changedRows * 5);
      const shapedDelta = new Uint32Array(changedRows * 3);
      for (let index = 0; index < changedRows; index++) {
        const slot = (17 + index * 7919) % actorCount;
        const rowOffset = index * 5;
        rowDelta[rowOffset] = slot;
        rowDelta[rowOffset + 2] = 0x80008000;
        rowDelta[rowOffset + 4] = 0x7fff0000;
        const shapedOffset = index * 3;
        shapedDelta[shapedOffset] = slot;
        shapedDelta[shapedOffset + 2] = 0x80008000;
      }
      const createDeltaBuffer = delta =>
        device.createBuffer({
          size: delta.byteLength,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
      const deltaBuffers = {
        row: createDeltaBuffer(rowDelta),
        shaped: createDeltaBuffer(shapedDelta),
      };
      const params = new Uint32Array([changedRows, 0, 0, 0]);
      const paramsBuffer = device.createBuffer({
        size: params.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(paramsBuffer, 0, params);
      const scatterBindGroups = Object.fromEntries(
        Object.entries(scatterPipelines).map(([kind, pipeline]) => [
          kind,
          device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: { buffer: deltaBuffers[kind] } },
              { binding: 1, resource: { buffer: resident } },
              { binding: 2, resource: { buffer: paramsBuffer } },
            ],
          }),
        ])
      );
      const consumerBindGroup = device.createBindGroup({
        layout: consumerPipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: resident } }],
      });
      const target = device.createTexture({
        size: [256, 256],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });

      const querySet = timestampSupported
        ? device.createQuerySet({ type: 'timestamp', count: 4 })
        : undefined;
      const queryResolve = timestampSupported
        ? device.createBuffer({
            size: 32,
            usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
          })
        : undefined;
      const queryReadback = timestampSupported
        ? device.createBuffer({
            size: 32,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
          })
        : undefined;

      function encodeConsumer(encoder, startQuery, endQuery) {
        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: target.createView(),
              clearValue: { r: 0, g: 0, b: 0, a: 1 },
              loadOp: 'clear',
              storeOp: 'store',
            },
          ],
          ...(querySet
            ? {
                timestampWrites: {
                  querySet,
                  beginningOfPassWriteIndex: startQuery,
                  endOfPassWriteIndex: endQuery,
                },
              }
            : {}),
        });
        pass.setPipeline(consumerPipeline);
        pass.setBindGroup(0, consumerBindGroup);
        pass.draw(1, actorCount);
        pass.end();
      }

      async function run(kind) {
        const isScatter = kind !== 'full';
        const delta = kind === 'row' ? rowDelta : shapedDelta;
        const encodeSamples = [];
        const uploadSamples = [];
        const commandSamples = [];
        const completionSamples = [];
        const scatterGpuSamples = [];
        const consumerGpuSamples = [];
        for (let iteration = 0; iteration < iterations + 5; iteration++) {
          const started = performance.now();
          if (isScatter) {
            const recordWords = kind === 'row' ? 5 : 3;
            for (let index = 0; index < changedRows; index++) {
              delta[index * recordWords + 1] =
                ((iteration + 1) * 65537 + delta[index * recordWords]) >>> 0;
            }
          } else {
            fullData[0] = ((iteration + 1) * 65537) >>> 0;
          }
          const encoded = performance.now();
          if (isScatter) {
            device.queue.writeBuffer(deltaBuffers[kind], 0, delta);
          } else {
            device.queue.writeBuffer(resident, 0, fullData);
          }
          const uploaded = performance.now();
          const encoder = device.createCommandEncoder();
          if (isScatter) {
            const pass = encoder.beginComputePass({
              ...(querySet
                ? {
                    timestampWrites: {
                      querySet,
                      beginningOfPassWriteIndex: 0,
                      endOfPassWriteIndex: 1,
                    },
                  }
                : {}),
            });
            pass.setPipeline(scatterPipelines[kind]);
            pass.setBindGroup(0, scatterBindGroups[kind]);
            pass.dispatchWorkgroups(Math.ceil(changedRows / 64));
            pass.end();
          }
          encodeConsumer(encoder, 2, 3);
          if (querySet) {
            encoder.resolveQuerySet(querySet, 0, 4, queryResolve, 0);
            encoder.copyBufferToBuffer(queryResolve, 0, queryReadback, 0, 32);
          }
          const commands = encoder.finish();
          const commanded = performance.now();
          device.queue.submit([commands]);
          await device.queue.onSubmittedWorkDone();
          const completed = performance.now();
          let scatterGpuMs = 0;
          let consumerGpuMs = 0;
          if (queryReadback) {
            await queryReadback.mapAsync(GPUMapMode.READ);
            const timestamps = new BigUint64Array(queryReadback.getMappedRange()).slice();
            queryReadback.unmap();
            if (isScatter) {
              scatterGpuMs = Number(timestamps[1] - timestamps[0]) / 1_000_000;
            }
            consumerGpuMs = Number(timestamps[3] - timestamps[2]) / 1_000_000;
          }
          if (iteration >= 5) {
            encodeSamples.push(encoded - started);
            uploadSamples.push(uploaded - encoded);
            commandSamples.push(commanded - uploaded);
            completionSamples.push(completed - started);
            if (timestampSupported) {
              scatterGpuSamples.push(scatterGpuMs);
              consumerGpuSamples.push(consumerGpuMs);
            }
          }
        }
        return {
          kind,
          encodeMs: median(encodeSamples),
          uploadEnqueueMs: median(uploadSamples),
          commandEncodeMs: median(commandSamples),
          completionMs: median(completionSamples),
          scatterGpuMs: median(scatterGpuSamples),
          consumerGpuMs: median(consumerGpuSamples),
          uploadedBytes: isScatter ? delta.byteLength : fullData.byteLength,
          uploadCalls: 1,
        };
      }

      const full = await run('full');
      const rowScatter = await run('row');
      const shapedScatter = await run('shaped');
      return {
        adapterInfo: adapter.info,
        timestampSupported,
        full,
        rowScatter,
        shapedScatter,
      };
    },
    {
      actorCount,
      changedRows,
      iterations,
      rowScatterSource: emitComputeScatterWGSL(4),
      shapedScatterSource: emitComputeScatterWGSL({
        destinationStrideWords: 4,
        destinationOffsetWords: 0,
        copyWords: 2,
      }),
    }
  );

  console.log(
    `\n${actorCount.toLocaleString()} actors, ${changedRows.toLocaleString()} ` +
      `changed rows, ${iterations} measured iterations`
  );
  if (results.adapterInfo?.description) {
    console.log(`adapter: ${results.adapterInfo.description}`);
  }
  console.log(`timestamp-query: ${results.timestampSupported ? 'yes' : 'no'}`);
  console.log(
    'pipeline'.padEnd(17),
    'encode'.padStart(10),
    'upload'.padStart(10),
    'commands'.padStart(10),
    'complete'.padStart(11),
    'scatter GPU'.padStart(13),
    'consumer GPU'.padStart(14),
    'MiB'.padStart(9)
  );
  for (const row of [results.full, results.rowScatter, results.shapedScatter]) {
    const labels = {
      full: 'packed full',
      row: 'row scatter',
      shaped: 'shaped scatter',
    };
    console.log(
      labels[row.kind].padEnd(17),
      `${row.encodeMs.toFixed(3)}ms`.padStart(10),
      `${row.uploadEnqueueMs.toFixed(3)}ms`.padStart(10),
      `${row.commandEncodeMs.toFixed(3)}ms`.padStart(10),
      `${row.completionMs.toFixed(3)}ms`.padStart(11),
      `${row.scatterGpuMs.toFixed(3)}ms`.padStart(13),
      `${row.consumerGpuMs.toFixed(3)}ms`.padStart(14),
      (row.uploadedBytes / (1024 * 1024)).toFixed(3).padStart(9)
    );
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}

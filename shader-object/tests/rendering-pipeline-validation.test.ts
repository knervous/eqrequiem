/**
 * Comprehensive rendering pipeline validation test
 * Tests every step from property write → WASM → GPU upload → shader uniforms
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { ShadoInstanceContainer } from '../src/extensions/ShadoInstanceContainer';
import { ShadoActor } from '../src/extensions/ShadoActor';
import { NullEngine, Scene, Vector3 } from '@babylonjs/core';

describe('Rendering Pipeline Validation', () => {
  let engine: any;
  let scene: Scene;
  let pool: any;

  beforeAll(async () => {
    engine = new NullEngine();
    scene = new Scene(engine);
    
    const poolSuccess = await ShadoInstanceContainer.initialize(engine, { debugWasm: false });
    if (!poolSuccess) {
      throw new Error('Failed to initialize ShadoInstanceContainer WASM');
    }
  });

  describe('Step 1: Property → DataView Write', () => {
    it('should create pool and verify header DataView points to WASM', () => {
      pool = new ShadoInstanceContainer(engine);
      
      const headerDV = (pool as any)._headerDV;
      const asc = (pool.constructor as any).wasmModule;
      
      expect(headerDV).toBeDefined();
      expect(headerDV.buffer).toBe(asc.memory.buffer);
      console.log('✓ Header DataView points to WASM buffer');
    });

    it('should write visibleCount property and verify DataView has correct bytes', () => {
      const testValue = 42;
      pool.visibleCount = testValue;
      
      const headerDV = (pool as any)._headerDV;
      const readBack = headerDV.getUint32(0, true);
      
      expect(readBack).toBe(testValue);
      console.log(`✓ visibleCount write: ${testValue} → DataView reads: ${readBack}`);
    });

    it('should write multiple header properties and verify all', () => {
      pool.visibleCount = 10;
      pool.instancesCount = 20;
      
      const headerDV = (pool as any)._headerDV;
      const visRead = headerDV.getUint32(0, true);
      const countRead = headerDV.getUint32(8, true); // instancesCount at offset 8
      
      expect(visRead).toBe(10);
      expect(countRead).toBe(20);
      console.log(`✓ Multiple properties: visibleCount=${visRead}, instancesCount=${countRead}`);
    });
  });

  describe('Step 2: Arena → WASM Memory Sync', () => {
    it('should verify arena uses WASM memory', () => {
      const arena = (pool as any)._arena;
      const asc = (pool.constructor as any).wasmModule;
      const arenaF32 = arena.take();
      
      expect(arenaF32.buffer).toBe(asc.memory.buffer);
      console.log('✓ Arena Float32Array points to WASM buffer');
    });

    it('should verify property writes appear in arena Float32Array', () => {
      pool.visibleCount = 99;
      
      const arena = (pool as any)._arena;
      const arenaF32 = arena.take();
      const headerSegOffF = (pool as any)._headerSeg.offF;
      
      // Read visibleCount from arena at correct offset
      const visCountFloatView = new Uint32Array(arenaF32.buffer, arenaF32.byteOffset + headerSegOffF * 4, 1);
      const readBack = visCountFloatView[0];
      
      expect(readBack).toBe(99);
      console.log(`✓ Property write appears in arena: visibleCount=${readBack}`);
    });

    it('should add instances and verify they exist in WASM memory', () => {
      // Mock nameplate
      (pool as any)._nameplates = {
        addName: () => 0,
        nameCount: () => 10,
        rebuildStreams: () => {},
      };
      
      const inst = pool.addInstance();
      if (!inst) throw new Error('Failed to add instance');
      
      inst.translation.set([100, 200, 300, 1]);
      inst.color.set([0.5, 0.6, 0.7, 0.8]);
      
      const arena = (pool as any)._arena;
      const arenaF32 = arena.take();
      const instancesSeg = (pool as any)._structSeg?.instances;
      const instancesBase = instancesSeg?.offF || 0;
      
      // Read first instance translation from WASM
      const translationOffset = instancesBase + 0; // translation at offset 0
      const x = arenaF32[translationOffset + 0];
      const y = arenaF32[translationOffset + 1];
      const z = arenaF32[translationOffset + 2];
      
      expect(x).toBeCloseTo(100, 5);
      expect(y).toBeCloseTo(200, 5);
      expect(z).toBeCloseTo(300, 5);
      console.log(`✓ Instance data in WASM: translation=[${x}, ${y}, ${z}]`);
    });
  });

  describe('Step 3: GPU Upload Payload', () => {
    it('should prepare payload that matches WASM memory', () => {
      pool.visibleCount = 123;
      pool.instancesCount = 5;
      
      const payload = (pool as any).prepareUnifiedForUpload();
      const payloadDV = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
      
      const visCount = payloadDV.getUint32(0, true);
      const instCount = payloadDV.getUint32(8, true);
      
      expect(visCount).toBe(123);
      expect(instCount).toBe(5);
      console.log(`✓ Payload matches properties: visibleCount=${visCount}, instancesCount=${instCount}`);
    });

    it('should have payload buffer be the same as WASM buffer', () => {
      const payload = (pool as any).prepareUnifiedForUpload();
      const asc = (pool.constructor as any).wasmModule;
      
      expect(payload.buffer).toBe(asc.memory.buffer);
      console.log('✓ Payload is a view into WASM buffer (zero-copy)');
    });

    it('should verify payload contains instance data written via properties', () => {
      // Clear and add known instance
      pool = new ShadoInstanceContainer(engine);
      
      // Mock nameplate
      (pool as any)._nameplates = {
        addName: () => 0,
        nameCount: () => 10,
        rebuildStreams: () => {},
      };
      
      const inst = pool.addInstance();
      if (!inst) throw new Error('Failed to add instance');
      
      inst.translation.set([111, 222, 333, 1]);
      inst.color.set([0.1, 0.2, 0.3, 1.0]);
      
      (pool as any).syncStructArrayHeaderFields();
      
      const payload = (pool as any).prepareUnifiedForUpload();
      
      // Calculate where instance data starts
      const instancesSeg = (pool as any)._structSeg?.instances;
      const instancesBase = instancesSeg?.offF || 4;
      
      const x = payload[instancesBase + 0];
      const y = payload[instancesBase + 1];
      const z = payload[instancesBase + 2];
      
      expect(x).toBeCloseTo(111, 5);
      expect(y).toBeCloseTo(222, 5);
      expect(z).toBeCloseTo(333, 5);
      console.log(`✓ Payload contains instance data: translation=[${x}, ${y}, ${z}]`);
    });
  });

  describe('Step 4: Shader Uniform Binding', () => {
    it('should have correct header segment offset for shader uniform', () => {
      const headerSegOffF = (pool as any)._headerSeg.offF;
      
      // This is what gets bound as uInstancePoolHeaderBase
      expect(headerSegOffF).toBeGreaterThanOrEqual(0);
      console.log(`✓ Header segment offset (uInstancePoolHeaderBase) = ${headerSegOffF}`);
    });

    it('should have correct instances array base offset', () => {
      const instancesSeg = (pool as any)._structSeg?.instances;
      
      expect(instancesSeg).toBeDefined();
      const instancesBase = instancesSeg?.offF;
      
      // This is what gets bound as uInstancePool_instancesBase
      expect(instancesBase).toBeGreaterThanOrEqual(0);
      console.log(`✓ Instances array base (uInstancePool_instancesBase) = ${instancesBase}`);
    });

    it('should have correct instances stride', () => {
      const stride = ShadoActor.getSchema().headerFloatCount;
      
      // This is what gets bound as uInstancePool_instancesStride
      expect(stride).toBeGreaterThan(0);
      console.log(`✓ Instance stride (uInstancePool_instancesStride) = ${stride} floats`);
    });

    it('should have correct instances count', () => {
      pool.instancesCount = 42;
      const count = pool.instancesCount;
      
      // This is what gets bound as uInstancePool_instancesCount
      expect(count).toBe(42);
      console.log(`✓ Instance count (uInstancePool_instancesCount) = ${count}`);
    });
  });

  describe('Step 5: End-to-End Instance Access', () => {
    it('should write instance via property → read from payload at correct shader offset', () => {
      pool = new ShadoInstanceContainer(engine);
      
      // Mock nameplate to avoid dependency
      (pool as any)._nameplates = {
        addName: () => 0,
        nameCount: () => 10,
        rebuildStreams: () => {},
      };
      
      // Add 3 instances with known data
      for (let i = 0; i < 3; i++) {
        const inst = pool.addInstance();
        if (!inst) throw new Error('Failed to add instance');
        
        inst.translation.set([i * 100, i * 200, i * 300, 1]);
        inst.color.set([i * 0.1, i * 0.2, i * 0.3, 1]);
        inst.visibleFlag = 1;
      }
      
      (pool as any).syncStructArrayHeaderFields();
      
      const payload = (pool as any).prepareUnifiedForUpload();
      const instancesBase = (pool as any)._structSeg?.instances?.offF || 0;
      const instanceStride = ShadoActor.getSchema().headerFloatCount;
      
      // Verify each instance
      for (let i = 0; i < 3; i++) {
        const base = instancesBase + i * instanceStride;
        const x = payload[base + 0];
        const y = payload[base + 1];
        const z = payload[base + 2];
        
        expect(x).toBeCloseTo(i * 100, 5);
        expect(y).toBeCloseTo(i * 200, 5);
        expect(z).toBeCloseTo(i * 300, 5);
        
        console.log(`✓ Instance ${i}: translation=[${x}, ${y}, ${z}]`);
      }
    });

    it('should verify shader would read correct data using fetch pattern', () => {
      // Simulate what the shader does:
      // int base = uInstancePool_instancesBase + instanceId * uInstancePool_instancesStride;
      // vec4 translation = InstancePool_fetch4(base + ShadoActor_translation_OFF);
      
      const payload = (pool as any).prepareUnifiedForUpload();
      const instancesBase = (pool as any)._structSeg?.instances?.offF || 0;
      const instanceStride = ShadoActor.getSchema().headerFloatCount;
      
      const instanceId = 1; // Read second instance
      const ShadoActor_translation_OFF = 0;
      
      const base = instancesBase + instanceId * instanceStride;
      const fetchOffset = base + ShadoActor_translation_OFF;
      
      // Shader does: InstancePool_fetch4(fetchOffset) which reads 4 consecutive floats
      const translation = [
        payload[fetchOffset + 0],
        payload[fetchOffset + 1],
        payload[fetchOffset + 2],
        payload[fetchOffset + 3],
      ];
      
      expect(translation[0]).toBeCloseTo(100, 5);
      expect(translation[1]).toBeCloseTo(200, 5);
      expect(translation[2]).toBeCloseTo(300, 5);
      console.log(`✓ Shader fetch simulation: translation=[${translation.join(', ')}]`);
    });
  });

  describe('Step 6: Memory Growth and Reallocation', () => {
    it('should maintain data integrity after growing beyond initial capacity', () => {
      pool = new ShadoInstanceContainer(engine);
      
      // Mock nameplate
      (pool as any)._nameplates = {
        addName: () => 0,
        nameCount: () => 10,
        rebuildStreams: () => {},
      };
      
      // Add initial instance
      const inst0 = pool.addInstance();
      if (!inst0) throw new Error('Failed to add instance');
      inst0.translation.set([999, 888, 777, 1]);
      
      // Force growth by adding many instances
      for (let i = 0; i < 50; i++) {
        pool.addInstance();
      }
      
      // Verify first instance data survived growth
      const payload = (pool as any).prepareUnifiedForUpload();
      const instancesBase = (pool as any)._structSeg?.instances?.offF || 0;
      
      const x = payload[instancesBase + 0];
      const y = payload[instancesBase + 1];
      const z = payload[instancesBase + 2];
      
      expect(x).toBeCloseTo(999, 5);
      expect(y).toBeCloseTo(888, 5);
      expect(z).toBeCloseTo(777, 5);
      console.log(`✓ Data survived memory growth: translation=[${x}, ${y}, ${z}]`);
    });

    it('should verify DataView still points to WASM after growth', () => {
      const headerDV = (pool as any)._headerDV;
      const asc = (pool.constructor as any).wasmModule;
      
      expect(headerDV.buffer).toBe(asc.memory.buffer);
      console.log('✓ DataView still points to WASM buffer after growth');
    });
  });

  describe('Step 7: Frustum Culling Integration', () => {
    it('should update visibleCount after culling and have it appear in payload', () => {
      pool = new ShadoInstanceContainer(engine);
      
      // Mock nameplate
      (pool as any)._nameplates = {
        addName: () => 0,
        nameCount: () => 10,
        rebuildStreams: () => {},
      };
      
      // Add instances
      for (let i = 0; i < 10; i++) {
        const inst = pool.addInstance();
        if (!inst) continue;
        inst.translation.set([i * 10, 0, 0, 1]);
        inst.visibleFlag = 1;
      }
      
      const mockCamera = {
        getScene: () => scene,
        globalPosition: new Vector3(0, 0, 0),
        position: new Vector3(0, 0, 0),
      };
      
      // Perform culling
      pool.frustumCull(mockCamera as any, 1.0, 1000);
      
      const visibleCount = pool.visibleCount;
      
      // Verify visibleCount appears in payload
      const payload = (pool as any).prepareUnifiedForUpload();
      const payloadVisibleCount = new Uint32Array(payload.buffer, payload.byteOffset, 1)[0];
      
      expect(payloadVisibleCount).toBe(visibleCount);
      console.log(`✓ Frustum culling: visibleCount=${visibleCount}, payload has ${payloadVisibleCount}`);
    });
  });

  describe('Step 8: Multiple Pools Independence', () => {
    it('should maintain separate data in multiple pools', () => {
      const pool1 = new ShadoInstanceContainer(engine);
      const pool2 = new ShadoInstanceContainer(engine);
      
      // Mock nameplates for both
      (pool1 as any)._nameplates = {
        addName: () => 0,
        nameCount: () => 10,
        rebuildStreams: () => {},
      };
      (pool2 as any)._nameplates = {
        addName: () => 0,
        nameCount: () => 10,
        rebuildStreams: () => {},
      };
      
      // Write different data to each
      pool1.visibleCount = 111;
      pool2.visibleCount = 222;
      
      const inst1 = pool1.addInstance();
      const inst2 = pool2.addInstance();
      
      if (inst1) inst1.translation.set([100, 200, 300, 1]);
      if (inst2) inst2.translation.set([400, 500, 600, 1]);
      
      (pool1 as any).syncStructArrayHeaderFields();
      (pool2 as any).syncStructArrayHeaderFields();
      
      const payload1 = (pool1 as any).prepareUnifiedForUpload();
      const payload2 = (pool2 as any).prepareUnifiedForUpload();
      
      const vis1 = new Uint32Array(payload1.buffer, payload1.byteOffset, 1)[0];
      const vis2 = new Uint32Array(payload2.buffer, payload2.byteOffset, 1)[0];
      
      expect(vis1).toBe(111);
      expect(vis2).toBe(222);
      
      const base1 = (pool1 as any)._structSeg?.instances?.offF || 0;
      const base2 = (pool2 as any)._structSeg?.instances?.offF || 0;
      
      const x1 = payload1[base1 + 0];
      const x2 = payload2[base2 + 0];
      
      expect(x1).toBeCloseTo(100, 5);
      expect(x2).toBeCloseTo(400, 5);
      
      console.log(`✓ Pool 1: visibleCount=${vis1}, x=${x1}`);
      console.log(`✓ Pool 2: visibleCount=${vis2}, x=${x2}`);
    });
  });
});

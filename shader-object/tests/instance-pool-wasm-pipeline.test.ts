import { describe, it, expect, beforeAll } from '@jest/globals';
import { ShadoInstanceContainer } from '../src/extensions/ShadoInstanceContainer';
import { ShadoActor } from '../src/extensions/ShadoActor';
import { VATBuilder } from '../src/extensions/VATBuilder/VATBuilder';
import { NullEngine, Scene, Vector3 } from '@babylonjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('ShadoInstanceContainer WASM Pipeline Integration', () => {
  let engine: any;
  let scene: Scene;
  let pool: any;
  let vatDQ: any;

  beforeAll(async () => {
    engine = new NullEngine();
    scene = new Scene(engine);
    
    // Initialize both ShadoInstanceContainer and VATBuilder
    try {
      const poolSuccess = await ShadoInstanceContainer.initialize(engine, { debugWasm: false });
      const vatSuccess = await VATBuilder.initialize(engine, { debugWasm: false });
      
      if (!poolSuccess || !vatSuccess) {
        throw new Error(`Failed to initialize WASM modules: pool=${poolSuccess}, vat=${vatSuccess}`);
      }
    } catch (err) {
      console.error('WASM initialization error:', err);
      throw err;
    }
  });

  describe('1. Construction and Initialization', () => {
    it('should create ShadoInstanceContainer with WASM enabled', () => {
      pool = new ShadoInstanceContainer(engine);
      
      expect(pool).toBeDefined();
      expect((pool as any)._useWasm).toBe(true);
      expect((pool as any).__wasmBasePtr).toBeGreaterThanOrEqual(0); // 0 is valid!
      
      console.log('WASM Base Pointer:', (pool as any).__wasmBasePtr);
      console.log('Header Segment:', (pool as any)._headerSeg);
    });

    it('should have correct arena layout after initialization', () => {
      const headerSeg = (pool as any)._headerSeg;
      const structSeg = (pool as any)._structSeg;
      
      expect(headerSeg.offF).toBe(0); // Header should start at 0
      expect(headerSeg.lenF).toBeGreaterThan(0);
      expect(headerSeg.capF).toBeGreaterThan(0);
      
      expect(structSeg.instances).toBeDefined();
      expect(structSeg.instances.offF).toBeGreaterThan(0); // Should be after header
      
      console.log('Header segment:', headerSeg);
      console.log('Instances segment:', structSeg.instances);
    });
  });

  describe('2. Property Read/Write with WASM', () => {
    it('should write and read header properties through DataView', () => {
      // Write via properties
      (pool as any).visibleCount = 42;
      (pool as any).instancesPtr = 99999;
      (pool as any).instancesCount = 77;
      
      // Read back via properties
      expect((pool as any).visibleCount).toBe(42);
      expect((pool as any).instancesPtr).toBe(99999);
      expect((pool as any).instancesCount).toBe(77);
      
      console.log('Property reads:', {
        visibleCount: (pool as any).visibleCount,
        instancesPtr: (pool as any).instancesPtr,
        instancesCount: (pool as any).instancesCount,
      });
    });

    it('should sync properties to WASM memory', () => {
      const headerDV = (pool as any)._headerDV;
      
      // Read directly from DataView
      const visibleCount = headerDV.getUint32(0, true);
      const instancesPtr = headerDV.getUint32(4, true);
      const instancesCount = headerDV.getUint32(8, true);
      
      expect(visibleCount).toBe(42);
      expect(instancesPtr).toBe(99999);
      expect(instancesCount).toBe(77);
      
      console.log('DataView reads:', { visibleCount, instancesPtr, instancesCount });
    });

    it('should have payload matching property values', () => {
      const payload = (pool as any).prepareUnifiedForUpload();
      const payloadDV = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
      
      const visibleCount = payloadDV.getUint32(0, true);
      const instancesPtr = payloadDV.getUint32(4, true);
      const instancesCount = payloadDV.getUint32(8, true);
      
      expect(visibleCount).toBe(42);
      expect(instancesPtr).toBe(99999);
      expect(instancesCount).toBe(77);
      
      console.log('Payload reads:', { visibleCount, instancesPtr, instancesCount });
      console.log('First 10 floats:', Array.from(payload.slice(0, 10)));
    });
  });

  describe('3. Adding Instances', () => {
    it('should add instances without crashing', () => {
      // Clear and start fresh
      pool = new ShadoInstanceContainer(engine);
      
      for (let i = 0; i < 10; i++) {
        const inst = pool.addStructToArray('instances');
        inst.translation.set([i, 0, 0, 1]);
        inst.color.set([1, 0.5, 0.5, 1]);
        inst.visibleFlag = 1;
      }
      
      expect((pool as any)._structArrayCount.instances).toBe(10);
      console.log('Added 10 instances successfully');
    });

    it('should update instancesPtr after adding instances', () => {
      const instancesPtr = (pool as any).instancesPtr;
      const structSeg = (pool as any)._structSeg.instances;
      const expectedPtr = (pool as any).__wasmBasePtr + structSeg.offF * 4;
      
      console.log('instancesPtr:', instancesPtr);
      console.log('expectedPtr:', expectedPtr);
      console.log('Difference:', instancesPtr - expectedPtr);
      
      // They should match after syncStructArrayHeaderFields
      (pool as any).syncStructArrayHeaderFields();
      const syncedPtr = (pool as any).instancesPtr;
      expect(syncedPtr).toBe(expectedPtr);
    });
  });

  describe('4. Memory Growth and Reallocation', () => {
    it('should handle adding instances beyond initial capacity', () => {
      pool = new ShadoInstanceContainer(engine);
      
      // Add instances up to and beyond initial capacity
      for (let i = 0; i < 150; i++) {
        const inst = pool.addStructToArray('instances');
        inst.translation.set([i, 0, 0, 1]);
        inst.color.set([1, 1, 1, 1]);
        inst.visibleFlag = 1;
        
        // Check consistency every 10 instances
        if (i % 10 === 0) {
          const count = (pool as any)._structArrayCount.instances;
          expect(count).toBe(i + 1);
        }
      }
      
      expect((pool as any)._structArrayCount.instances).toBe(150);
      console.log('Successfully added 150 instances');
    });

    it('should maintain property integrity after growth', () => {
      // Set a known value
      (pool as any).visibleCount = 123;
      
      // Force growth by adding more instances
      for (let i = 0; i < 50; i++) {
        pool.addStructToArray('instances');
      }
      
      // Check value is still correct
      expect((pool as any).visibleCount).toBe(123);
      console.log('visibleCount maintained after growth:', (pool as any).visibleCount);
    });

    it('should have valid WASM pointers after growth', () => {
      const Ctor = pool.constructor as any;
      const asc = Ctor.wasmModule;
      const currentBuffer = asc.memory.buffer;
      const basePtr = (pool as any).__wasmBasePtr;
      const lastMemBuf = (pool as any)._lastMemBuf;
      
      expect(lastMemBuf).toBe(currentBuffer);
      expect(basePtr).toBeGreaterThan(0);
      
      console.log('Buffer check:', {
        bufferLength: currentBuffer.byteLength,
        basePtr,
        buffersMatch: lastMemBuf === currentBuffer,
      });
    });
  });

  describe('5. WASM Frustum Culling', () => {
    it('should perform frustum culling without crashing', () => {
      // Create fresh pool for this test
      pool = new ShadoInstanceContainer(engine);
      
      // Mock nameplate for pool
      (pool as any)._nameplates = {
        addName: () => 0,
        nameCount: () => 10,
        rebuildStreams: () => {},
      };
      
      // Add 100 instances spread out in space
      for (let i = 0; i < 100; i++) {
        const inst = pool.addInstance();
        const x = (i % 10) - 5;
        const z = Math.floor(i / 10) - 5;
        
        if (inst) {
          inst.translation.set([x * 2, 0, z * 2, 1]);
          inst.color.set([1, 1, 1, 1]);
          inst.visibleFlag = 1;
        }
      }
      
      // Mock camera with required methods
      const mockCamera = {
        getScene: () => scene,
        globalPosition: new Vector3(0, 0, 0),
        position: new Vector3(0, 0, 0),
      };
      
      // Call frustumCull
      expect(() => {
        pool.frustumCull(mockCamera as any, 1.0, 1000);
      }).not.toThrow();
      
      const visibleCount = pool.getVisibleCount();
      console.log('Visible count after culling:', visibleCount);
      expect(visibleCount).toBeGreaterThanOrEqual(0);
      expect(visibleCount).toBeLessThanOrEqual(100);
    });

    it('should write visibleCount back to CPU memory', () => {
      const visibleCountBefore = (pool as any).visibleCount;
      
      const mockCamera = {
        getScene: () => scene,
        globalPosition: new Vector3(0, 0, 0),
        position: new Vector3(0, 0, 0),
      };
      
      pool.frustumCull(mockCamera as any, 1.0, 1000);
      
      const visibleCountAfter = (pool as any).visibleCount;
      
      console.log('Visible count before:', visibleCountBefore, 'after:', visibleCountAfter);
      expect(visibleCountAfter).toBeDefined();
    });
  });

  describe('6. GPU Upload Pipeline', () => {
    it('should prepare payload with correct data', () => {
      pool = new ShadoInstanceContainer(engine);
      
      // Add a few instances with known data
      for (let i = 0; i < 5; i++) {
        const inst = pool.addStructToArray('instances');
        inst.translation.set([i * 10, i * 20, i * 30, 1]);
        inst.color.set([0.1 * i, 0.2 * i, 0.3 * i, 1]);
      }
      
      (pool as any).syncStructArrayHeaderFields();
      
      const payload = (pool as any).prepareUnifiedForUpload();
      
      // Check header
      const payloadDV = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
      const instancesPtr = payloadDV.getUint32(4, true);
      const instancesCount = payloadDV.getUint32(8, true);
      
      console.log('Payload header:', {
        visibleCount: payloadDV.getUint32(0, true),
        instancesPtr,
        instancesCount,
      });
      
      expect(instancesCount).toBe(5);
      expect(instancesPtr).toBeGreaterThan(0);
      
      // Check that instance data is present
      const structSeg = (pool as any)._structSeg.instances;
      const firstInstanceOffset = structSeg.offF;
      
      // Read first instance translation
      const tx = payload[firstInstanceOffset + 0];
      const ty = payload[firstInstanceOffset + 1];
      const tz = payload[firstInstanceOffset + 2];
      const tw = payload[firstInstanceOffset + 3];
      
      console.log('First instance translation:', [tx, ty, tz, tw]);
      expect(tw).toBe(1); // Scale should be 1
    });

    it('should match property reads with payload data', () => {
      const visibleCountProp = (pool as any).visibleCount;
      const instancesPtrProp = (pool as any).instancesPtr;
      const instancesCountProp = (pool as any).instancesCount;
      
      const payload = (pool as any).prepareUnifiedForUpload();
      const payloadDV = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
      
      const visibleCountPayload = payloadDV.getUint32(0, true);
      const instancesPtrPayload = payloadDV.getUint32(4, true);
      const instancesCountPayload = payloadDV.getUint32(8, true);
      
      console.log('Property vs Payload:', {
        visibleCount: { prop: visibleCountProp, payload: visibleCountPayload, match: visibleCountProp === visibleCountPayload },
        instancesPtr: { prop: instancesPtrProp, payload: instancesPtrPayload, match: instancesPtrProp === instancesPtrPayload },
        instancesCount: { prop: instancesCountProp, payload: instancesCountPayload, match: instancesCountProp === instancesCountPayload },
      });
      
      expect(visibleCountPayload).toBe(visibleCountProp);
      expect(instancesPtrPayload).toBe(instancesPtrProp);
      expect(instancesCountPayload).toBe(instancesCountProp);
    });
  });

  describe('7. Multiple Instance Pools', () => {
    it('should support multiple ShadoInstanceContainer instances with separate WASM memory', () => {
      const pool1 = new ShadoInstanceContainer(engine);
      const pool2 = new ShadoInstanceContainer(engine);
      
      // Add different numbers to each
      for (let i = 0; i < 10; i++) {
        const inst = pool1.addStructToArray('instances') as any;
        inst.translation.set([i, 0, 0, 1]);
      }
      
      for (let i = 0; i < 20; i++) {
        const inst = pool2.addStructToArray('instances') as any;
        inst.translation.set([i, 10, 0, 1]);
      }
      
      expect((pool1 as any)._structArrayCount.instances).toBe(10);
      expect((pool2 as any)._structArrayCount.instances).toBe(20);
      
      // They should have different WASM base pointers
      const base1 = (pool1 as any).__wasmBasePtr;
      const base2 = (pool2 as any).__wasmBasePtr;
      
      console.log('Pool 1 base:', base1);
      console.log('Pool 2 base:', base2);
      
      expect(base1).not.toBe(base2);
    });

    it('should maintain independent data in each pool', () => {
      const pool1 = new ShadoInstanceContainer(engine);
      const pool2 = new ShadoInstanceContainer(engine);
      
      (pool1 as any).visibleCount = 111;
      (pool2 as any).visibleCount = 222;
      
      expect((pool1 as any).visibleCount).toBe(111);
      expect((pool2 as any).visibleCount).toBe(222);
      
      console.log('Pool 1 visibleCount:', (pool1 as any).visibleCount);
      console.log('Pool 2 visibleCount:', (pool2 as any).visibleCount);
    });
  });
});

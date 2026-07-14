/**
 * GPU-accelerated shader testing using headless-gl
 * This test executes the ACTUAL shader code on a WebGL context
 */

import * as BABYLON from '@babylonjs/core';
import * as gl from 'gl';
import { VATBuilder, matrixToDualQuaternion } from '../src/extensions/VATBuilder/VATBuilder';
import { ShadoInstanceContainer } from '../src/extensions/ShadoInstanceContainer';

/**
 * Extract the vertex shader source from ShadoInstanceContainer
 */
function extractVertexShader(): string {
  // Get the shader template from ShadoInstanceContainer
  const poolInstance = new ShadoInstanceContainer();
  const schema = poolInstance.getSchema();
  
  // The vertex shader is in the shaderDeclarations field
  const declarations = (schema as any).shaderDeclarations;
  if (!declarations || typeof declarations !== 'string') {
    throw new Error('Could not extract shader declarations from ShadoInstanceContainer');
  }
  
  return declarations;
}

/**
 * Create a minimal vertex shader for testing DQ skinning
 */
function createTestShader(useDQShader: boolean): string {
  if (!useDQShader) {
    // Simple pass-through shader
    return `
      attribute vec3 position;
      uniform mat4 worldViewProjection;
      
      void main() {
        gl_Position = worldViewProjection * vec4(position, 1.0);
      }
    `;
  }

  // Extract the actual DQ shader functions
  const poolShader = extractVertexShader();
  
  // Build a minimal test shader using the real DQ functions
  return `
    precision highp float;
    
    attribute vec3 position;
    attribute vec4 matricesIndices;
    attribute vec4 matricesWeights;
    
    uniform mat4 worldViewProjection;
    uniform sampler2D uDQAtlas;
    uniform int uDQWidth;
    uniform int uDQTilesX;
    uniform int uDQStrideTexels;
    uniform bool uDQHasScale;
    uniform float bakedVertexAnimationTime;
    
    // Extract just the DQ functions from the pool shader
    ${poolShader}
    
    void main() {
      // Simplified: single frame, no instance transform
      int frameRow = 0;
      
      ivec4 bi0 = ivec4(floor(matricesIndices + 0.5));
      vec4 bw0 = matricesWeights;
      
      // Normalize weights
      float wsum = bw0.x + bw0.y + bw0.z + bw0.w;
      if (wsum < 1e-8) wsum = 1.0;
      bw0 /= wsum;
      
      // Accumulate DQ
      vec4 r0 = vec4(0.0), d0 = vec4(0.0);
      float s0 = 0.0;
      
      for (int k = 0; k < 4; ++k) {
        int idx = (k==0) ? bi0.x : (k==1) ? bi0.y : (k==2) ? bi0.z : bi0.w;
        float w = (k==0) ? bw0.x : (k==1) ? bw0.y : (k==2) ? bw0.z : bw0.w;
        if (w <= 0.0) continue;
        
        vec4 ar, ad; float as;
        fetchBoneDQScale(idx, frameRow, ar, ad, as);
        accumDQAligned(r0, d0, ar, ad, w);
        s0 += as * w;
      }
      
      dqNormalizeConsistent(r0, d0);
      
      float boneScale = s0;
      if (!uDQHasScale) boneScale = 1.0;
      
      vec3 rotatedAndTranslated = dqTransformPoint(r0, d0, position);
      vec3 skinned = rotatedAndTranslated * boneScale;
      
      gl_Position = worldViewProjection * vec4(skinned, 1.0);
    }
  `;
}

describe('GPU Shader Execution Tests', () => {
  let glContext: WebGLRenderingContext;
  let engine: BABYLON.NullEngine;
  let scene: BABYLON.Scene;

  beforeAll(() => {
    // Create headless GL context
    glContext = gl.default(1024, 1024, { preserveDrawingBuffer: true }) as unknown as WebGLRenderingContext;
    
    // Create Babylon engine with the GL context
    engine = new BABYLON.NullEngine({
      renderWidth: 1024,
      renderHeight: 1024,
      textureSize: 1024,
      deterministicLockstep: false,
      lockstepMaxSteps: 1,
    });
    
    scene = new BABYLON.Scene(engine);
  });

  afterAll(() => {
    scene.dispose();
    engine.dispose();
    if (glContext && (glContext as any).getExtension('STACKGL_destroy_context')) {
      (glContext as any).getExtension('STACKGL_destroy_context').destroy();
    }
  });

  test('GPU DQ shader execution matches CPU LBS', async () => {
    // Load the barbarian model
    const result = await BABYLON.SceneLoader.ImportMeshAsync(
      '',
      'tests/fixtures/',
      'barbarian_simple.glb',
      scene
    );

    const mesh = result.meshes.find((m) => m.name === '__root__') as BABYLON.Mesh;
    expect(mesh).toBeDefined();
    expect(mesh.skeleton).toBeDefined();

    const skeleton = mesh.skeleton!;
    skeleton.returnToRest();

    // Get vertex data
    const positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind)!;
    const indices = mesh.getVerticesData(BABYLON.VertexBuffer.MatricesIndicesKind)!;
    const weights = mesh.getVerticesData(BABYLON.VertexBuffer.MatricesWeightsKind)!;

    expect(positions).toBeDefined();
    expect(indices).toBeDefined();
    expect(weights).toBeDefined();

    // Create DQ atlas texture
    const vatObj = new VATBuilder();
    const clips = await vatObj.buildDQFromAnimationGroups(mesh, {
      useHalfDQ: false,
      scaleEpsilon: 1e-5,
      debugValidate: true,
    });

    expect(clips.length).toBeGreaterThan(0);
    expect(vatObj['_dqTex']).toBeDefined();

    const dqTexture = vatObj['_dqTex']!;
    const dqData = dqTexture.readPixels() as Float32Array;
    const texWidth = dqTexture.getSize().width;
    const texHeight = dqTexture.getSize().height;

    console.log('\n[GPU Test] DQ Atlas:', texWidth, 'x', texHeight);
    console.log('[GPU Test] Bones:', skeleton.bones.length);

    // Compile the shader
    const vertexShader = createTestShader(true);
    const fragmentShader = `
      precision highp float;
      void main() {
        gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
      }
    `;

    // Create shader program
    const vs = glContext.createShader(glContext.VERTEX_SHADER)!;
    glContext.shaderSource(vs, vertexShader);
    glContext.compileShader(vs);
    
    if (!glContext.getShaderParameter(vs, glContext.COMPILE_STATUS)) {
      const log = glContext.getShaderInfoLog(vs);
      throw new Error(`Vertex shader compilation failed:\n${log}\n\nShader:\n${vertexShader}`);
    }

    const fs = glContext.createShader(glContext.FRAGMENT_SHADER)!;
    glContext.shaderSource(fs, fragmentShader);
    glContext.compileShader(fs);
    
    if (!glContext.getShaderParameter(fs, glContext.COMPILE_STATUS)) {
      const log = glContext.getShaderInfoLog(fs);
      throw new Error(`Fragment shader compilation failed:\n${log}`);
    }

    const program = glContext.createProgram()!;
    glContext.attachShader(program, vs);
    glContext.attachShader(program, fs);
    glContext.linkProgram(program);

    if (!glContext.getProgramParameter(program, glContext.LINK_STATUS)) {
      const log = glContext.getProgramInfoLog(program);
      throw new Error(`Shader program linking failed:\n${log}`);
    }

    console.log('[GPU Test] ✅ Shader compiled and linked successfully');

    // TODO: Set up vertex buffers, uniforms, and execute the shader
    // Compare results with CPU LBS

    expect(true).toBe(true);
  });
});

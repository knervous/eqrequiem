// src/Game/Model/entity-shader.ts
import BABYLON from "@bjs";

// Vertex shader: sample VAT texture at frameTime to offset position
BABYLON.Effect.ShadersStore["vatVertexShader"] = `
  precision highp float;
  // Attributes
  attribute vec3 position;
  attribute vec3 normal;
  attribute vec2 uv;
  // VAT data
  uniform sampler2D vatTexture;
  uniform float frameTime;
  // Built-ins
  uniform mat4 worldViewProjection;
  // Varyings
  varying vec2 vUV;
  void main(void) {
    // each vertex’s “id” is passed in as its UV or custom attribute; 
    // map that to a UV lookup into the VAT texture:
    float vertexId = uv.x; 
    // frame along the vertical axis: frameTime / totalFrames
    vec2 lookupUV = vec2(
      (vertexId + 0.5) / textureSize(vatTexture, 0).x,
      (frameTime + 0.5) / textureSize(vatTexture, 0).y
    );
    vec4 delta = texture2D(vatTexture, lookupUV);
    vec3 animatedPos = position + delta.xyz;
    gl_Position = worldViewProjection * vec4(animatedPos, 1.0);
    vUV = uv;
  }
`;

// Fragment shader: just sample a diffuse texture (or solid color)
BABYLON.Effect.ShadersStore["vatFragmentShader"] = `
  precision highp float;
  varying vec2 vUV;
  uniform sampler2D diffuseSampler;
  void main(void) {
    gl_FragColor = texture2D(diffuseSampler, vUV);
  }
`;

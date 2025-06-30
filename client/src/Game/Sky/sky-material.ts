
import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";


// register a vertex shader called “skyVertex”
BABYLON.Effect.ShadersStore["skyVertexShader"] = `
 precision highp float;

// Babylon built-in attributes:
attribute vec3 position;
attribute vec2 uv;

// Babylon built-in uniform:
uniform mat4 worldViewProjection;

// Our custom uniforms:
uniform vec2 uUVOffset;
uniform float uDomeHeight; // Height range (maxY - minY) * scale
uniform float uDomeMinY;   // minY * scale
uniform float uScale;   // minY * scale

// Varyings to pass to the fragment:
varying vec2 vUV;
varying float vHeight;

void main() {
    vUV = uv + uUVOffset;
    // Normalize height: map position.y from [uDomeMinY, uDomeMinY + uDomeHeight] to [0, 1]
    vHeight = clamp((position.y * uScale - uDomeMinY) / uDomeHeight, 0.0, 1.0);
    gl_Position = worldViewProjection * vec4(position, 1.0);
}
`;

// register a fragment shader called “skyFragment”
BABYLON.Effect.ShadersStore["skyFragmentShader"] = `
  precision highp float;

  // interpolated from the vertex:
  varying vec2 vUV;
  varying float vHeight;

  // our texture:
  uniform sampler2D textureSampler;

  // the three colours you CPU-interpolate per frame:
  uniform vec3 uLowColor;
  uniform vec3 uMidColor;
  uniform vec3 uHighColor;

  void main() {
    // sample your sky/cloud texture:
    vec4 base = texture2D(textureSampler, vUV);

    // do a two-stage blend through low→mid→high:
    vec3 grad1 = mix(uLowColor,  uMidColor,  clamp(vHeight * 2.0, 0.0, 1.0));
    vec3 grad2 = mix(uMidColor,  uHighColor, clamp((vHeight - 0.5) * 2.0, 0.0, 1.0));
    vec3 gradient = mix(grad1, grad2, step(0.5, vHeight));

    // modulate your texture by the gradient:
    gl_FragColor = vec4(base.rgb * gradient, base.a);
  }
`;

export const createSkyLayerMaterial = (
  layerMesh: BJS.Mesh,
  scene: BJS.Scene,
  scale: number,
): BJS.ShaderMaterial => {
  // 1. Create the ShaderMaterial (you can cache one instance if you like)
  const mat = new BABYLON.ShaderMaterial(
    "skyLayerShader",
    scene,
    { vertex: "sky", fragment: "sky" },
    {
      attributes: ["position", "uv"],
      uniforms: [
        "worldViewProjection", "uUVOffset", "uDomeHeight", "uDomeMinY", "uScale",
        "uLowColor", "uMidColor", "uHighColor",
      ],
      samplers: ["textureSampler"],
    },
  );
  mat.backFaceCulling = false;

  // 2. Hook up the texture
  const pbr = layerMesh.material as BJS.PBRMaterial;
  const tex = pbr.albedoTexture!;
  mat.setTexture("textureSampler", tex);

  // 3. Compute dome bounds and set uniforms
  layerMesh.refreshBoundingInfo();
  const bi = layerMesh.getBoundingInfo();
  const minY = bi.minimum.y;
  const maxY = bi.maximum.y;
  const yRange = maxY - minY;

  mat.setFloat("uDomeHeight", scale * yRange);
  mat.setFloat("uDomeMinY", scale * minY);
  mat.setFloat("uScale", scale);
  mat.setVector2("uUVOffset", new BABYLON.Vector2(0, 0));

  // 4. Replace the mesh’s material
  layerMesh.material = mat;
  pbr.dispose();

  return mat;
};
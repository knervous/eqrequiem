import BABYLON from "@bjs";
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
export const createSkyLayerMaterial = (layerMesh, scene, scale) => {
    // 1. Create the ShaderMaterial (you can cache one instance if you like)
    const mat = new BABYLON.ShaderMaterial("skyLayerShader", scene, { vertex: "sky", fragment: "sky" }, {
        attributes: ["position", "uv"],
        uniforms: [
            "worldViewProjection",
            "uUVOffset",
            "uDomeHeight",
            "uDomeMinY",
            "uScale",
            "uLowColor",
            "uMidColor",
            "uHighColor",
        ],
        samplers: ["textureSampler"],
        // Sky is still authored in GLSL; make WebGPU's compatibility path explicit.
        shaderLanguage: BABYLON.ShaderLanguage.GLSL,
    });
    mat.backFaceCulling = false;
    // 2. Hook up the texture
    const pbr = layerMesh.material;
    const tex = pbr.albedoTexture;
    mat.setTexture("textureSampler", tex);
    // 3. Compute dome bounds and set uniforms
    layerMesh.refreshBoundingInfo();
    const bi = layerMesh.getBoundingInfo();
    const minY = bi.minimum.y;
    const maxY = bi.maximum.y;
    const yRange = (maxY - minY) / 1.25;
    mat.setFloat("uDomeHeight", scale * yRange);
    mat.setFloat("uDomeMinY", scale * minY);
    mat.setFloat("uScale", scale);
    mat.setVector2("uUVOffset", new BABYLON.Vector2(0, 0));
    // 4. Replace the mesh’s material
    layerMesh.material = mat;
    pbr.dispose();
    return mat;
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2t5LW1hdGVyaWFsLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic2t5LW1hdGVyaWFsLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBLE9BQU8sT0FBTyxNQUFNLE1BQU0sQ0FBQztBQUczQiw4Q0FBOEM7QUFDOUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsaUJBQWlCLENBQUMsR0FBRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Q0EwQmhELENBQUM7QUFFRixrREFBa0Q7QUFDbEQsT0FBTyxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsbUJBQW1CLENBQUMsR0FBRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0NBMkJsRCxDQUFDO0FBRUYsTUFBTSxDQUFDLE1BQU0sc0JBQXNCLEdBQUcsQ0FDcEMsU0FBbUIsRUFDbkIsS0FBZ0IsRUFDaEIsS0FBYSxFQUNPLEVBQUU7SUFDdEIsd0VBQXdFO0lBQ3hFLE1BQU0sR0FBRyxHQUFHLElBQUksT0FBTyxDQUFDLGNBQWMsQ0FDcEMsZ0JBQWdCLEVBQ2hCLEtBQUssRUFDTCxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxFQUNsQztRQUNFLFVBQVUsRUFBRSxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUM7UUFDOUIsUUFBUSxFQUFFO1lBQ1IscUJBQXFCO1lBQ3JCLFdBQVc7WUFDWCxhQUFhO1lBQ2IsV0FBVztZQUNYLFFBQVE7WUFDUixXQUFXO1lBQ1gsV0FBVztZQUNYLFlBQVk7U0FDYjtRQUNELFFBQVEsRUFBRSxDQUFDLGdCQUFnQixDQUFDO1FBQzVCLDRFQUE0RTtRQUM1RSxjQUFjLEVBQUUsT0FBTyxDQUFDLGNBQWMsQ0FBQyxJQUFJO0tBQzVDLENBQ0YsQ0FBQztJQUNGLEdBQUcsQ0FBQyxlQUFlLEdBQUcsS0FBSyxDQUFDO0lBRTVCLHlCQUF5QjtJQUN6QixNQUFNLEdBQUcsR0FBRyxTQUFTLENBQUMsUUFBMkIsQ0FBQztJQUNsRCxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsYUFBYyxDQUFDO0lBQy9CLEdBQUcsQ0FBQyxVQUFVLENBQUMsZ0JBQWdCLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFFdEMsMENBQTBDO0lBQzFDLFNBQVMsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO0lBQ2hDLE1BQU0sRUFBRSxHQUFHLFNBQVMsQ0FBQyxlQUFlLEVBQUUsQ0FBQztJQUN2QyxNQUFNLElBQUksR0FBRyxFQUFFLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUMxQixNQUFNLElBQUksR0FBRyxFQUFFLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUMxQixNQUFNLE1BQU0sR0FBRyxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsR0FBRyxJQUFJLENBQUM7SUFFcEMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxhQUFhLEVBQUUsS0FBSyxHQUFHLE1BQU0sQ0FBQyxDQUFDO0lBQzVDLEdBQUcsQ0FBQyxRQUFRLENBQUMsV0FBVyxFQUFFLEtBQUssR0FBRyxJQUFJLENBQUMsQ0FBQztJQUN4QyxHQUFHLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUM5QixHQUFHLENBQUMsVUFBVSxDQUFDLFdBQVcsRUFBRSxJQUFJLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFdkQsaUNBQWlDO0lBQ2pDLFNBQVMsQ0FBQyxRQUFRLEdBQUcsR0FBRyxDQUFDO0lBQ3pCLEdBQUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUVkLE9BQU8sR0FBRyxDQUFDO0FBQ2IsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IEJBQllMT04gZnJvbSBcIkBianNcIjtcbmltcG9ydCB0eXBlICogYXMgQkpTIGZyb20gXCJAYmFieWxvbmpzL2NvcmVcIjtcblxuLy8gcmVnaXN0ZXIgYSB2ZXJ0ZXggc2hhZGVyIGNhbGxlZCDigJxza3lWZXJ0ZXjigJ1cbkJBQllMT04uRWZmZWN0LlNoYWRlcnNTdG9yZVtcInNreVZlcnRleFNoYWRlclwiXSA9IGBcbiBwcmVjaXNpb24gaGlnaHAgZmxvYXQ7XG5cbi8vIEJhYnlsb24gYnVpbHQtaW4gYXR0cmlidXRlczpcbmF0dHJpYnV0ZSB2ZWMzIHBvc2l0aW9uO1xuYXR0cmlidXRlIHZlYzIgdXY7XG5cbi8vIEJhYnlsb24gYnVpbHQtaW4gdW5pZm9ybTpcbnVuaWZvcm0gbWF0NCB3b3JsZFZpZXdQcm9qZWN0aW9uO1xuXG4vLyBPdXIgY3VzdG9tIHVuaWZvcm1zOlxudW5pZm9ybSB2ZWMyIHVVVk9mZnNldDtcbnVuaWZvcm0gZmxvYXQgdURvbWVIZWlnaHQ7IC8vIEhlaWdodCByYW5nZSAobWF4WSAtIG1pblkpICogc2NhbGVcbnVuaWZvcm0gZmxvYXQgdURvbWVNaW5ZOyAgIC8vIG1pblkgKiBzY2FsZVxudW5pZm9ybSBmbG9hdCB1U2NhbGU7ICAgLy8gbWluWSAqIHNjYWxlXG5cbi8vIFZhcnlpbmdzIHRvIHBhc3MgdG8gdGhlIGZyYWdtZW50OlxudmFyeWluZyB2ZWMyIHZVVjtcbnZhcnlpbmcgZmxvYXQgdkhlaWdodDtcblxudm9pZCBtYWluKCkge1xuICAgIHZVViA9IHV2ICsgdVVWT2Zmc2V0O1xuICAgIC8vIE5vcm1hbGl6ZSBoZWlnaHQ6IG1hcCBwb3NpdGlvbi55IGZyb20gW3VEb21lTWluWSwgdURvbWVNaW5ZICsgdURvbWVIZWlnaHRdIHRvIFswLCAxXVxuICAgIHZIZWlnaHQgPSBjbGFtcCgocG9zaXRpb24ueSAqIHVTY2FsZSAtIHVEb21lTWluWSkgLyB1RG9tZUhlaWdodCwgMC4wLCAxLjApO1xuICAgIGdsX1Bvc2l0aW9uID0gd29ybGRWaWV3UHJvamVjdGlvbiAqIHZlYzQocG9zaXRpb24sIDEuMCk7XG59XG5gO1xuXG4vLyByZWdpc3RlciBhIGZyYWdtZW50IHNoYWRlciBjYWxsZWQg4oCcc2t5RnJhZ21lbnTigJ1cbkJBQllMT04uRWZmZWN0LlNoYWRlcnNTdG9yZVtcInNreUZyYWdtZW50U2hhZGVyXCJdID0gYFxuICBwcmVjaXNpb24gaGlnaHAgZmxvYXQ7XG5cbiAgLy8gaW50ZXJwb2xhdGVkIGZyb20gdGhlIHZlcnRleDpcbiAgdmFyeWluZyB2ZWMyIHZVVjtcbiAgdmFyeWluZyBmbG9hdCB2SGVpZ2h0O1xuXG4gIC8vIG91ciB0ZXh0dXJlOlxuICB1bmlmb3JtIHNhbXBsZXIyRCB0ZXh0dXJlU2FtcGxlcjtcblxuICAvLyB0aGUgdGhyZWUgY29sb3VycyB5b3UgQ1BVLWludGVycG9sYXRlIHBlciBmcmFtZTpcbiAgdW5pZm9ybSB2ZWMzIHVMb3dDb2xvcjtcbiAgdW5pZm9ybSB2ZWMzIHVNaWRDb2xvcjtcbiAgdW5pZm9ybSB2ZWMzIHVIaWdoQ29sb3I7XG5cbiAgdm9pZCBtYWluKCkge1xuICAgIC8vIHNhbXBsZSB5b3VyIHNreS9jbG91ZCB0ZXh0dXJlOlxuICAgIHZlYzQgYmFzZSA9IHRleHR1cmUyRCh0ZXh0dXJlU2FtcGxlciwgdlVWKTtcblxuICAgIC8vIGRvIGEgdHdvLXN0YWdlIGJsZW5kIHRocm91Z2ggbG934oaSbWlk4oaSaGlnaDpcbiAgICB2ZWMzIGdyYWQxID0gbWl4KHVMb3dDb2xvciwgIHVNaWRDb2xvciwgIGNsYW1wKHZIZWlnaHQgKiAyLjAsIDAuMCwgMS4wKSk7XG4gICAgdmVjMyBncmFkMiA9IG1peCh1TWlkQ29sb3IsICB1SGlnaENvbG9yLCBjbGFtcCgodkhlaWdodCAtIDAuNSkgKiAyLjAsIDAuMCwgMS4wKSk7XG4gICAgdmVjMyBncmFkaWVudCA9IG1peChncmFkMSwgZ3JhZDIsIHN0ZXAoMC41LCB2SGVpZ2h0KSk7XG5cbiAgICAvLyBtb2R1bGF0ZSB5b3VyIHRleHR1cmUgYnkgdGhlIGdyYWRpZW50OlxuICAgIGdsX0ZyYWdDb2xvciA9IHZlYzQoYmFzZS5yZ2IgKiBncmFkaWVudCwgYmFzZS5hKTtcbiAgfVxuYDtcblxuZXhwb3J0IGNvbnN0IGNyZWF0ZVNreUxheWVyTWF0ZXJpYWwgPSAoXG4gIGxheWVyTWVzaDogQkpTLk1lc2gsXG4gIHNjZW5lOiBCSlMuU2NlbmUsXG4gIHNjYWxlOiBudW1iZXIsXG4pOiBCSlMuU2hhZGVyTWF0ZXJpYWwgPT4ge1xuICAvLyAxLiBDcmVhdGUgdGhlIFNoYWRlck1hdGVyaWFsICh5b3UgY2FuIGNhY2hlIG9uZSBpbnN0YW5jZSBpZiB5b3UgbGlrZSlcbiAgY29uc3QgbWF0ID0gbmV3IEJBQllMT04uU2hhZGVyTWF0ZXJpYWwoXG4gICAgXCJza3lMYXllclNoYWRlclwiLFxuICAgIHNjZW5lLFxuICAgIHsgdmVydGV4OiBcInNreVwiLCBmcmFnbWVudDogXCJza3lcIiB9LFxuICAgIHtcbiAgICAgIGF0dHJpYnV0ZXM6IFtcInBvc2l0aW9uXCIsIFwidXZcIl0sXG4gICAgICB1bmlmb3JtczogW1xuICAgICAgICBcIndvcmxkVmlld1Byb2plY3Rpb25cIixcbiAgICAgICAgXCJ1VVZPZmZzZXRcIixcbiAgICAgICAgXCJ1RG9tZUhlaWdodFwiLFxuICAgICAgICBcInVEb21lTWluWVwiLFxuICAgICAgICBcInVTY2FsZVwiLFxuICAgICAgICBcInVMb3dDb2xvclwiLFxuICAgICAgICBcInVNaWRDb2xvclwiLFxuICAgICAgICBcInVIaWdoQ29sb3JcIixcbiAgICAgIF0sXG4gICAgICBzYW1wbGVyczogW1widGV4dHVyZVNhbXBsZXJcIl0sXG4gICAgICAvLyBTa3kgaXMgc3RpbGwgYXV0aG9yZWQgaW4gR0xTTDsgbWFrZSBXZWJHUFUncyBjb21wYXRpYmlsaXR5IHBhdGggZXhwbGljaXQuXG4gICAgICBzaGFkZXJMYW5ndWFnZTogQkFCWUxPTi5TaGFkZXJMYW5ndWFnZS5HTFNMLFxuICAgIH0sXG4gICk7XG4gIG1hdC5iYWNrRmFjZUN1bGxpbmcgPSBmYWxzZTtcblxuICAvLyAyLiBIb29rIHVwIHRoZSB0ZXh0dXJlXG4gIGNvbnN0IHBiciA9IGxheWVyTWVzaC5tYXRlcmlhbCBhcyBCSlMuUEJSTWF0ZXJpYWw7XG4gIGNvbnN0IHRleCA9IHBici5hbGJlZG9UZXh0dXJlITtcbiAgbWF0LnNldFRleHR1cmUoXCJ0ZXh0dXJlU2FtcGxlclwiLCB0ZXgpO1xuXG4gIC8vIDMuIENvbXB1dGUgZG9tZSBib3VuZHMgYW5kIHNldCB1bmlmb3Jtc1xuICBsYXllck1lc2gucmVmcmVzaEJvdW5kaW5nSW5mbygpO1xuICBjb25zdCBiaSA9IGxheWVyTWVzaC5nZXRCb3VuZGluZ0luZm8oKTtcbiAgY29uc3QgbWluWSA9IGJpLm1pbmltdW0ueTtcbiAgY29uc3QgbWF4WSA9IGJpLm1heGltdW0ueTtcbiAgY29uc3QgeVJhbmdlID0gKG1heFkgLSBtaW5ZKSAvIDEuMjU7XG5cbiAgbWF0LnNldEZsb2F0KFwidURvbWVIZWlnaHRcIiwgc2NhbGUgKiB5UmFuZ2UpO1xuICBtYXQuc2V0RmxvYXQoXCJ1RG9tZU1pbllcIiwgc2NhbGUgKiBtaW5ZKTtcbiAgbWF0LnNldEZsb2F0KFwidVNjYWxlXCIsIHNjYWxlKTtcbiAgbWF0LnNldFZlY3RvcjIoXCJ1VVZPZmZzZXRcIiwgbmV3IEJBQllMT04uVmVjdG9yMigwLCAwKSk7XG5cbiAgLy8gNC4gUmVwbGFjZSB0aGUgbWVzaOKAmXMgbWF0ZXJpYWxcbiAgbGF5ZXJNZXNoLm1hdGVyaWFsID0gbWF0O1xuICBwYnIuZGlzcG9zZSgpO1xuXG4gIHJldHVybiBtYXQ7XG59O1xuIl19
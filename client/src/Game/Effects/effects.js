import BABYLON from '@bjs';
// Somewhere in your code before creating the PostProcess:
BABYLON.Effect.ShadersStore['gaussianBlurFragmentShader'] = `
precision highp float;

varying vec2 vUV;
uniform sampler2D textureSampler;

// How large the blur offset is (in “pixels”).
uniform float blurSize;  

// The overall screen resolution, so we can convert blurSize to UV space.
uniform vec2 screenSize;

void main(void) {
    // Convert blurSize (pixels) to UV offsets:
    vec2 onePixel = blurSize / screenSize;
    vec4 color = vec4(0.0);
    
    // Top row
    color += texture2D(textureSampler, vUV + onePixel * vec2(-1.0, -1.0)) * (1.0/16.0);
    color += texture2D(textureSampler, vUV + onePixel * vec2( 0.0, -1.0)) * (2.0/16.0);
    color += texture2D(textureSampler, vUV + onePixel * vec2( 1.0, -1.0)) * (1.0/16.0);
    
    // Middle row
    color += texture2D(textureSampler, vUV + onePixel * vec2(-1.0, 0.0))  * (2.0/16.0);
    color += texture2D(textureSampler, vUV)                              * (4.0/16.0);
    color += texture2D(textureSampler, vUV + onePixel * vec2( 1.0, 0.0))  * (2.0/16.0);
    
    // Bottom row
    color += texture2D(textureSampler, vUV + onePixel * vec2(-1.0, 1.0)) * (1.0/16.0);
    color += texture2D(textureSampler, vUV + onePixel * vec2( 0.0, 1.0)) * (2.0/16.0);
    color += texture2D(textureSampler, vUV + onePixel * vec2( 1.0, 1.0)) * (1.0/16.0);

    gl_FragColor = color;
}
`;
BABYLON.Effect.ShadersStore['vignetteFragmentShader'] = `
    precision highp float;
    varying vec2 vUV;
    uniform sampler2D textureSampler;
    uniform float vignetteStrength;
    
    void main(void) {
        // Sample the current pixel color from the scene.
        vec4 color = texture2D(textureSampler, vUV);
        
        // Calculate distance from the center of the screen.
        float dist = distance(vUV, vec2(0.5, 0.5));
        
        // Create a vignette factor with smoothstep.
        // The vignetteStrength controls how strong the effect is.
        float vignette = smoothstep(0.8, 0.2, dist * vignetteStrength);
        
        // Multiply the scene color's RGB by the vignette value,
        // but force the output alpha to 1.0 so the background is always opaque.
        gl_FragColor = vec4(color.rgb * vignette, 1.0);
    }
`;
/**
 *
 * @param {import('@babylonjs/core/Cameras/arcRotateCamera').ArcRotateCamera} camera
 * @param {import('@babylonjs/core').Scene} scene
 */
export const animateVignette = (camera, scene) => {
    const vignetteParams = { strength: 0.0 };
    const vignetteEffect = new BABYLON.PostProcess('vignette', 'vignette', ['vignetteStrength'], // List of uniforms
    null, // No additional samplers
    1.0, camera);
    vignetteEffect.onApply = (effect) => {
        effect.setFloat('vignetteStrength', vignetteParams.strength);
    };
    const pulseAnimation = new BABYLON.Animation('vignettePulse', 'strength', 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    const keys = [
        { frame: 0, value: 1.0 },
        { frame: 60, value: 0.5 },
        { frame: 120, value: 0.3 },
    ];
    pulseAnimation.setKeys(keys);
    vignetteParams.animations = [];
    vignetteParams.animations.push(pulseAnimation);
    /**
     *
     */
    scene.beginAnimation(vignetteParams, 0, 120, false, 0.5, () => {
        vignetteEffect.dispose();
    });
};
/**
 * Create and animate a Gaussian blur post-process,
 * e.g. for a "teleport" fade-out effect.
 *
 * @param {BABYLON.Camera} camera
 * @param {BABYLON.Scene} scene
 */
export function gaussianBlurTeleport(camera, scene) {
    // We'll animate blurParams.blurSize from 0 to some larger value
    const blurParams = {
        blurSize: 0, // start with no blur
    };
    // Get the current screen resolution.
    // We need this to convert from “pixel” size to UV offsets in the shader.
    const screenSize = new BABYLON.Vector2(scene.getEngine().getRenderWidth(), scene.getEngine().getRenderHeight());
    // Create the PostProcess using the custom "gaussianBlur" shader:
    const gaussianBlurPP = new BABYLON.PostProcess('gaussianBlurPP', // name
    'gaussianBlur', // shader name (from ShadersStore)
    ['blurSize', 'screenSize'], // list of uniform names
    null, // no extra samplers
    1.0, // full-screen ratio
    camera);
    // Pass uniforms into the shader on every frame
    gaussianBlurPP.onApply = (effect) => {
        effect.setFloat('blurSize', blurParams.blurSize);
        effect.setFloat2('screenSize', screenSize.x, screenSize.y);
    };
    // Create an animation that increases blurSize over time
    const blurAnimation = new BABYLON.Animation('gaussianBlurAnimation', 'blurSize', // property on our blurParams object
    60, // frames per second
    BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
    // Keyframes: (frame, value) => how blurSize changes
    blurAnimation.setKeys([
        { frame: 0, value: 6 }, // no blur at start
        { frame: 60, value: 0 }, // moderate blur at frame 60
    ]);
    // Attach the animation to blurParams
    blurParams.animations = [blurAnimation];
    // Begin the animation
    // - from frame 0 to 120
    // - non-looping
    // - speed factor = 1.0
    scene.beginAnimation(blurParams, 0, 60, false, 1.5, () => {
        // Once animation completes, clean up the PostProcess
        gaussianBlurPP.dispose();
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWZmZWN0cy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImVmZmVjdHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsT0FBTyxPQUFPLE1BQU0sTUFBTSxDQUFDO0FBRTNCLDBEQUEwRDtBQUMxRCxPQUFPLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQyw0QkFBNEIsQ0FBQyxHQUFHOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0NBa0MzRCxDQUFDO0FBR0YsT0FBTyxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsd0JBQXdCLENBQUMsR0FBRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0NBcUJ2RCxDQUFDO0FBRUY7Ozs7R0FJRztBQUNILE1BQU0sQ0FBQyxNQUFNLGVBQWUsR0FBRyxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsRUFBRTtJQUMvQyxNQUFNLGNBQWMsR0FBRyxFQUFFLFFBQVEsRUFBRSxHQUFHLEVBQUUsQ0FBQztJQUN6QyxNQUFNLGNBQWMsR0FBRyxJQUFJLE9BQU8sQ0FBQyxXQUFXLENBQzVDLFVBQVUsRUFDVixVQUFVLEVBQ1YsQ0FBQyxrQkFBa0IsQ0FBQyxFQUFFLG1CQUFtQjtJQUN6QyxJQUFJLEVBQUUseUJBQXlCO0lBQy9CLEdBQUcsRUFDSCxNQUFNLENBQ1AsQ0FBQztJQUNGLGNBQWMsQ0FBQyxPQUFPLEdBQUcsQ0FBQyxNQUFNLEVBQUUsRUFBRTtRQUNsQyxNQUFNLENBQUMsUUFBUSxDQUFDLGtCQUFrQixFQUFFLGNBQWMsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUMvRCxDQUFDLENBQUM7SUFFRixNQUFNLGNBQWMsR0FBRyxJQUFJLE9BQU8sQ0FBQyxTQUFTLENBQzFDLGVBQWUsRUFDZixVQUFVLEVBQ1YsRUFBRSxFQUNGLE9BQU8sQ0FBQyxTQUFTLENBQUMsbUJBQW1CLEVBQ3JDLE9BQU8sQ0FBQyxTQUFTLENBQUMsMEJBQTBCLENBQzdDLENBQUM7SUFFRixNQUFNLElBQUksR0FBRztRQUNYLEVBQUUsS0FB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LCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgQkFCWUxPTiBmcm9tICdAYmpzJztcblxuLy8gU29tZXdoZXJlIGluIHlvdXIgY29kZSBiZWZvcmUgY3JlYXRpbmcgdGhlIFBvc3RQcm9jZXNzOlxuQkFCWUxPTi5FZmZlY3QuU2hhZGVyc1N0b3JlWydnYXVzc2lhbkJsdXJGcmFnbWVudFNoYWRlciddID0gYFxucHJlY2lzaW9uIGhpZ2hwIGZsb2F0O1xuXG52YXJ5aW5nIHZlYzIgdlVWO1xudW5pZm9ybSBzYW1wbGVyMkQgdGV4dHVyZVNhbXBsZXI7XG5cbi8vIEhvdyBsYXJnZSB0aGUgYmx1ciBvZmZzZXQgaXMgKGluIOKAnHBpeGVsc+KAnSkuXG51bmlmb3JtIGZsb2F0IGJsdXJTaXplOyAgXG5cbi8vIFRoZSBvdmVyYWxsIHNjcmVlbiByZXNvbHV0aW9uLCBzbyB3ZSBjYW4gY29udmVydCBibHVyU2l6ZSB0byBVViBzcGFjZS5cbnVuaWZvcm0gdmVjMiBzY3JlZW5TaXplO1xuXG52b2lkIG1haW4odm9pZCkge1xuICAgIC8vIENvbnZlcnQgYmx1clNpemUgKHBpeGVscykgdG8gVVYgb2Zmc2V0czpcbiAgICB2ZWMyIG9uZVBpeGVsID0gYmx1clNpemUgLyBzY3JlZW5TaXplO1xuICAgIHZlYzQgY29sb3IgPSB2ZWM0KDAuMCk7XG4gICAgXG4gICAgLy8gVG9wIHJvd1xuICAgIGNvbG9yICs9IHRleHR1cmUyRCh0ZXh0dXJlU2FtcGxlciwgdlVWICsgb25lUGl4ZWwgKiB2ZWMyKC0xLjAsIC0xLjApKSAqICgxLjAvMTYuMCk7XG4gICAgY29sb3IgKz0gdGV4dHVyZTJEKHRleHR1cmVTYW1wbGVyLCB2VVYgKyBvbmVQaXhlbCAqIHZlYzIoIDAuMCwgLTEuMCkpICogKDIuMC8xNi4wKTtcbiAgICBjb2xvciArPSB0ZXh0dXJlMkQodGV4dHVyZVNhbXBsZXIsIHZVViArIG9uZVBpeGVsICogdmVjMiggMS4wLCAtMS4wKSkgKiAoMS4wLzE2LjApO1xuICAgIFxuICAgIC8vIE1pZGRsZSByb3dcbiAgICBjb2xvciArPSB0ZXh0dXJlMkQodGV4dHVyZVNhbXBsZXIsIHZVViArIG9uZVBpeGVsICogdmVjMigtMS4wLCAwLjApKSAgKiAoMi4wLzE2LjApO1xuICAgIGNvbG9yICs9IHRleHR1cmUyRCh0ZXh0dXJlU2FtcGxlciwgdlVWKSAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICogKDQuMC8xNi4wKTtcbiAgICBjb2xvciArPSB0ZXh0dXJlMkQodGV4dHVyZVNhbXBsZXIsIHZVViArIG9uZVBpeGVsICogdmVjMiggMS4wLCAwLjApKSAgKiAoMi4wLzE2LjApO1xuICAgIFxuICAgIC8vIEJvdHRvbSByb3dcbiAgICBjb2xvciArPSB0ZXh0dXJlMkQodGV4dHVyZVNhbXBsZXIsIHZVViArIG9uZVBpeGVsICogdmVjMigtMS4wLCAxLjApKSAqICgxLjAvMTYuMCk7XG4gICAgY29sb3IgKz0gdGV4dHVyZTJEKHRleHR1cmVTYW1wbGVyLCB2VVYgKyBvbmVQaXhlbCAqIHZlYzIoIDAuMCwgMS4wKSkgKiAoMi4wLzE2LjApO1xuICAgIGNvbG9yICs9IHRleHR1cmUyRCh0ZXh0dXJlU2FtcGxlciwgdlVWICsgb25lUGl4ZWwgKiB2ZWMyKCAxLjAsIDEuMCkpICogKDEuMC8xNi4wKTtcblxuICAgIGdsX0ZyYWdDb2xvciA9IGNvbG9yO1xufVxuYDtcblxuXG5CQUJZTE9OLkVmZmVjdC5TaGFkZXJzU3RvcmVbJ3ZpZ25ldHRlRnJhZ21lbnRTaGFkZXInXSA9IGBcbiAgICBwcmVjaXNpb24gaGlnaHAgZmxvYXQ7XG4gICAgdmFyeWluZyB2ZWMyIHZVVjtcbiAgICB1bmlmb3JtIHNhbXBsZXIyRCB0ZXh0dXJlU2FtcGxlcjtcbiAgICB1bmlmb3JtIGZsb2F0IHZpZ25ldHRlU3RyZW5ndGg7XG4gICAgXG4gICAgdm9pZCBtYWluKHZvaWQpIHtcbiAgICAgICAgLy8gU2FtcGxlIHRoZSBjdXJyZW50IHBpeGVsIGNvbG9yIGZyb20gdGhlIHNjZW5lLlxuICAgICAgICB2ZWM0IGNvbG9yID0gdGV4dHVyZTJEKHRleHR1cmVTYW1wbGVyLCB2VVYpO1xuICAgICAgICBcbiAgICAgICAgLy8gQ2FsY3VsYXRlIGRpc3RhbmNlIGZyb20gdGhlIGNlbnRlciBvZiB0aGUgc2NyZWVuLlxuICAgICAgICBmbG9hdCBkaXN0ID0gZGlzdGFuY2UodlVWLCB2ZWMyKDAuNSwgMC41KSk7XG4gICAgICAgIFxuICAgICAgICAvLyBDcmVhdGUgYSB2aWduZXR0ZSBmYWN0b3Igd2l0aCBzbW9vdGhzdGVwLlxuICAgICAgICAvLyBUaGUgdmlnbmV0dGVTdHJlbmd0aCBjb250cm9scyBob3cgc3Ryb25nIHRoZSBlZmZlY3QgaXMuXG4gICAgICAgIGZsb2F0IHZpZ25ldHRlID0gc21vb3Roc3RlcCgwLjgsIDAuMiwgZGlzdCAqIHZpZ25ldHRlU3RyZW5ndGgpO1xuICAgICAgICBcbiAgICAgICAgLy8gTXVsdGlwbHkgdGhlIHNjZW5lIGNvbG9yJ3MgUkdCIGJ5IHRoZSB2aWduZXR0ZSB2YWx1ZSxcbiAgICAgICAgLy8gYnV0IGZvcmNlIHRoZSBvdXRwdXQgYWxwaGEgdG8gMS4wIHNvIHRoZSBiYWNrZ3JvdW5kIGlzIGFsd2F5cyBvcGFxdWUuXG4gICAgICAgIGdsX0ZyYWdDb2xvciA9IHZlYzQoY29sb3IucmdiICogdmlnbmV0dGUsIDEuMCk7XG4gICAgfVxuYDtcblxuLyoqXG4gKiBcbiAqIEBwYXJhbSB7aW1wb3J0KCdAYmFieWxvbmpzL2NvcmUvQ2FtZXJhcy9hcmNSb3RhdGVDYW1lcmEnKS5BcmNSb3RhdGVDYW1lcmF9IGNhbWVyYSBcbiAqIEBwYXJhbSB7aW1wb3J0KCdAYmFieWxvbmpzL2NvcmUnKS5TY2VuZX0gc2NlbmUgXG4gKi9cbmV4cG9ydCBjb25zdCBhbmltYXRlVmlnbmV0dGUgPSAoY2FtZXJhLCBzY2VuZSkgPT4ge1xuICBjb25zdCB2aWduZXR0ZVBhcmFtcyA9IHsgc3RyZW5ndGg6IDAuMCB9O1xuICBjb25zdCB2aWduZXR0ZUVmZmVjdCA9IG5ldyBCQUJZTE9OLlBvc3RQcm9jZXNzKFxuICAgICd2aWduZXR0ZScsXG4gICAgJ3ZpZ25ldHRlJyxcbiAgICBbJ3ZpZ25ldHRlU3RyZW5ndGgnXSwgLy8gTGlzdCBvZiB1bmlmb3Jtc1xuICAgIG51bGwsIC8vIE5vIGFkZGl0aW9uYWwgc2FtcGxlcnNcbiAgICAxLjAsXG4gICAgY2FtZXJhLFxuICApO1xuICB2aWduZXR0ZUVmZmVjdC5vbkFwcGx5ID0gKGVmZmVjdCkgPT4ge1xuICAgIGVmZmVjdC5zZXRGbG9hdCgndmlnbmV0dGVTdHJlbmd0aCcsIHZpZ25ldHRlUGFyYW1zLnN0cmVuZ3RoKTtcbiAgfTtcblxuICBjb25zdCBwdWxzZUFuaW1hdGlvbiA9IG5ldyBCQUJZTE9OLkFuaW1hdGlvbihcbiAgICAndmlnbmV0dGVQdWxzZScsXG4gICAgJ3N0cmVuZ3RoJyxcbiAgICA2MCxcbiAgICBCQUJZTE9OLkFuaW1hdGlvbi5BTklNQVRJT05UWVBFX0ZMT0FULFxuICAgIEJBQllMT04uQW5pbWF0aW9uLkFOSU1BVElPTkxPT1BNT0RFX0NPTlNUQU5ULFxuICApO1xuXG4gIGNvbnN0IGtleXMgPSBbXG4gICAgeyBmcmFtZTogMCwgdmFsdWU6IDEuMCB9LFxuICAgIHsgZnJhbWU6IDYwLCB2YWx1ZTogMC41IH0sXG4gICAgeyBmcmFtZTogMTIwLCB2YWx1ZTogMC4zIH0sXG4gIF07XG5cbiAgcHVsc2VBbmltYXRpb24uc2V0S2V5cyhrZXlzKTtcblxuICB2aWduZXR0ZVBhcmFtcy5hbmltYXRpb25zID0gW107XG4gIHZpZ25ldHRlUGFyYW1zLmFuaW1hdGlvbnMucHVzaChwdWxzZUFuaW1hdGlvbik7XG5cbiAgLyoqXG4gICAqIFxuICAgKi9cbiAgc2NlbmUuYmVnaW5BbmltYXRpb24odmlnbmV0dGVQYXJhbXMsIDAsIDEyMCwgZmFsc2UsIDAuNSwgKCkgPT4ge1xuICAgIHZpZ25ldHRlRWZmZWN0LmRpc3Bvc2UoKTtcbiAgfSk7XG5cbn07XG5cbi8qKlxuICogQ3JlYXRlIGFuZCBhbmltYXRlIGEgR2F1c3NpYW4gYmx1ciBwb3N0LXByb2Nlc3MsIFxuICogZS5nLiBmb3IgYSBcInRlbGVwb3J0XCIgZmFkZS1vdXQgZWZmZWN0LlxuICogXG4gKiBAcGFyYW0ge0JBQllMT04uQ2FtZXJhfSBjYW1lcmFcbiAqIEBwYXJhbSB7QkFCWUxPTi5TY2VuZX0gc2NlbmVcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdhdXNzaWFuQmx1clRlbGVwb3J0KGNhbWVyYSwgc2NlbmUpIHtcbiAgLy8gV2UnbGwgYW5pbWF0ZSBibHVyUGFyYW1zLmJsdXJTaXplIGZyb20gMCB0byBzb21lIGxhcmdlciB2YWx1ZVxuICBjb25zdCBibHVyUGFyYW1zID0ge1xuICAgIGJsdXJTaXplOiAwLCAvLyBzdGFydCB3aXRoIG5vIGJsdXJcbiAgfTtcblxuICAvLyBHZXQgdGhlIGN1cnJlbnQgc2NyZWVuIHJlc29sdXRpb24uXG4gIC8vIFdlIG5lZWQgdGhpcyB0byBjb252ZXJ0IGZyb20g4oCccGl4ZWzigJ0gc2l6ZSB0byBVViBvZmZzZXRzIGluIHRoZSBzaGFkZXIuXG4gIGNvbnN0IHNjcmVlblNpemUgPSBuZXcgQkFCWUxPTi5WZWN0b3IyKFxuICAgIHNjZW5lLmdldEVuZ2luZSgpLmdldFJlbmRlcldpZHRoKCksXG4gICAgc2NlbmUuZ2V0RW5naW5lKCkuZ2V0UmVuZGVySGVpZ2h0KCksXG4gICk7XG5cbiAgLy8gQ3JlYXRlIHRoZSBQb3N0UHJvY2VzcyB1c2luZyB0aGUgY3VzdG9tIFwiZ2F1c3NpYW5CbHVyXCIgc2hhZGVyOlxuICBjb25zdCBnYXVzc2lhbkJsdXJQUCA9IG5ldyBCQUJZTE9OLlBvc3RQcm9jZXNzKFxuICAgICdnYXVzc2lhbkJsdXJQUCcsIC8vIG5hbWVcbiAgICAnZ2F1c3NpYW5CbHVyJywgLy8gc2hhZGVyIG5hbWUgKGZyb20gU2hhZGVyc1N0b3JlKVxuICAgIFsnYmx1clNpemUnLCAnc2NyZWVuU2l6ZSddLCAvLyBsaXN0IG9mIHVuaWZvcm0gbmFtZXNcbiAgICBudWxsLCAvLyBubyBleHRyYSBzYW1wbGVyc1xuICAgIDEuMCwgLy8gZnVsbC1zY3JlZW4gcmF0aW9cbiAgICBjYW1lcmEsXG4gICk7XG5cbiAgLy8gUGFzcyB1bmlmb3JtcyBpbnRvIHRoZSBzaGFkZXIgb24gZXZlcnkgZnJhbWVcbiAgZ2F1c3NpYW5CbHVyUFAub25BcHBseSA9IChlZmZlY3QpID0+IHtcbiAgICBlZmZlY3Quc2V0RmxvYXQoJ2JsdXJTaXplJywgYmx1clBhcmFtcy5ibHVyU2l6ZSk7XG4gICAgZWZmZWN0LnNldEZsb2F0Mignc2NyZWVuU2l6ZScsIHNjcmVlblNpemUueCwgc2NyZWVuU2l6ZS55KTtcbiAgfTtcblxuICAvLyBDcmVhdGUgYW4gYW5pbWF0aW9uIHRoYXQgaW5jcmVhc2VzIGJsdXJTaXplIG92ZXIgdGltZVxuICBjb25zdCBibHVyQW5pbWF0aW9uID0gbmV3IEJBQllMT04uQW5pbWF0aW9uKFxuICAgICdnYXVzc2lhbkJsdXJBbmltYXRpb24nLFxuICAgICdibHVyU2l6ZScsIC8vIHByb3BlcnR5IG9uIG91ciBibHVyUGFyYW1zIG9iamVjdFxuICAgIDYwLCAvLyBmcmFtZXMgcGVyIHNlY29uZFxuICAgIEJBQllMT04uQW5pbWF0aW9uLkFOSU1BVElPTlRZUEVfRkxPQVQsXG4gICAgQkFCWUxPTi5BbmltYXRpb24uQU5JTUFUSU9OTE9PUE1PREVfQ09OU1RBTlQsXG4gICk7XG5cbiAgLy8gS2V5ZnJhbWVzOiAoZnJhbWUsIHZhbHVlKSA9PiBob3cgYmx1clNpemUgY2hhbmdlc1xuICBibHVyQW5pbWF0aW9uLnNldEtleXMoW1xuICAgIHsgZnJhbWU6IDAsIHZhbHVlOiA2IH0sIC8vIG5vIGJsdXIgYXQgc3RhcnRcbiAgICB7IGZyYW1lOiA2MCwgdmFsdWU6IDAgfSwgLy8gbW9kZXJhdGUgYmx1ciBhdCBmcmFtZSA2MFxuICBdKTtcblxuICAvLyBBdHRhY2ggdGhlIGFuaW1hdGlvbiB0byBibHVyUGFyYW1zXG4gIGJsdXJQYXJhbXMuYW5pbWF0aW9ucyA9IFtibHVyQW5pbWF0aW9uXTtcblxuICAvLyBCZWdpbiB0aGUgYW5pbWF0aW9uXG4gIC8vIC0gZnJvbSBmcmFtZSAwIHRvIDEyMFxuICAvLyAtIG5vbi1sb29waW5nXG4gIC8vIC0gc3BlZWQgZmFjdG9yID0gMS4wXG4gIHNjZW5lLmJlZ2luQW5pbWF0aW9uKGJsdXJQYXJhbXMsIDAsIDYwLCBmYWxzZSwgMS41LCAoKSA9PiB7XG4gICAgLy8gT25jZSBhbmltYXRpb24gY29tcGxldGVzLCBjbGVhbiB1cCB0aGUgUG9zdFByb2Nlc3NcbiAgICBnYXVzc2lhbkJsdXJQUC5kaXNwb3NlKCk7XG4gIH0pO1xufVxuIl19
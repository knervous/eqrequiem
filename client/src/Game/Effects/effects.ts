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
  const vignetteEffect = new BABYLON.PostProcess(
    'vignette',
    'vignette',
    ['vignetteStrength'], // List of uniforms
    null, // No additional samplers
    1.0,
    camera,
  );
  vignetteEffect.onApply = (effect) => {
    effect.setFloat('vignetteStrength', vignetteParams.strength);
  };

  const pulseAnimation = new BABYLON.Animation(
    'vignettePulse',
    'strength',
    60,
    BABYLON.Animation.ANIMATIONTYPE_FLOAT,
    BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT,
  );

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
  const screenSize = new BABYLON.Vector2(
    scene.getEngine().getRenderWidth(),
    scene.getEngine().getRenderHeight(),
  );

  // Create the PostProcess using the custom "gaussianBlur" shader:
  const gaussianBlurPP = new BABYLON.PostProcess(
    'gaussianBlurPP', // name
    'gaussianBlur', // shader name (from ShadersStore)
    ['blurSize', 'screenSize'], // list of uniform names
    null, // no extra samplers
    1.0, // full-screen ratio
    camera,
  );

  // Pass uniforms into the shader on every frame
  gaussianBlurPP.onApply = (effect) => {
    effect.setFloat('blurSize', blurParams.blurSize);
    effect.setFloat2('screenSize', screenSize.x, screenSize.y);
  };

  // Create an animation that increases blurSize over time
  const blurAnimation = new BABYLON.Animation(
    'gaussianBlurAnimation',
    'blurSize', // property on our blurParams object
    60, // frames per second
    BABYLON.Animation.ANIMATIONTYPE_FLOAT,
    BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT,
  );

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

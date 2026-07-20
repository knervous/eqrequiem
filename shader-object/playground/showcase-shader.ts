import { EQ_SHOWCASE_GLSL, type ShadoInstanceGLSLHooks } from '@knervous/shado';

/**
 * Shader strategy for the Playground actor.
 *
 * Shado owns the complete DQ/VAT shader. Applications add only behavior at
 * named insertion points—never brittle `.replace()` calls against generated
 * source. The shared equipment strategy handles armor layers and weapon
 * visibility; this example adds one small field-driven color treatment.
 */
export const PLAYGROUND_ACTOR_SHADER: ShadoInstanceGLSLHooks = Object.freeze({
  ...EQ_SHOWCASE_GLSL,
  vertexInstance: `
${EQ_SHOWCASE_GLSL.vertexInstance ?? ''}
  int lightingTone = clamp(int(floor(inst.lightingTone + 0.5)), 0, 2);
  if (lightingTone == 1) {
    shadoColor.rgb *= vec3(1.08, 0.96, 0.84);
  } else if (lightingTone == 2) {
    shadoColor.rgb *= vec3(0.84, 0.96, 1.08);
  }`,
});

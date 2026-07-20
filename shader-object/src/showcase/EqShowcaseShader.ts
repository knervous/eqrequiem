import type { ShadoInstanceGLSLHooks } from '../extensions/ShadoInstanceContainer/ShadoInstanceContainer';

/**
 * Material behavior used by the equipment showcase.
 *
 * `aMeta.y` selects a weapon variant. The remaining packed metadata channels
 * contain four texture-array layers, one for each complete armor family.
 */
export const EQ_SHOWCASE_GLSL: ShadoInstanceGLSLHooks = Object.freeze({
  vertexDeclarations: `
#ifdef EQ_ARMOR_VARIANTS
flat varying float vEqLayer;
#endif`,

  fragmentDeclarations: `
#ifdef EQ_ARMOR_VARIANTS
uniform highp sampler2DArray uEqArmorAtlas;
flat varying float vEqLayer;
#endif`,

  vertexInstance: `
#ifdef EQ_ARMOR_VARIANTS
  int packedEq01 = int(floor(aMeta.z + 0.5));
  int packedEq23 = int(floor(aMeta.w + 0.5));
  vec4 eqLayers = vec4(
    float((packedEq01 & 255) - 1),
    float(((packedEq01 >> 8) & 255) - 1),
    float((packedEq23 & 255) - 1),
    float(((packedEq23 >> 8) & 255) - 1)
  );
  int armorSet = clamp(int(floor(inst.armorClass + 0.5)), 0, 3);
  vEqLayer = armorSet == 0 ? eqLayers.x
    : armorSet == 1 ? eqLayers.y
    : armorSet == 2 ? eqLayers.z
    : eqLayers.w;
#endif`,

  vertexAfterPosition: `
  if (aMeta.y > 0.5 && abs(aMeta.y - inst.weaponClass) > 0.25) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  }`,

  fragmentSurface: `
#ifdef EQ_ARMOR_VARIANTS
  if (vEqLayer >= 0.0) {
    surface = textureLod(uEqArmorAtlas, vec3(fract(vUV), vEqLayer), 0.0) * vColor;
  }
#endif`,
});

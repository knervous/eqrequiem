import { field, gpuStruct } from '../decorators';
import { ShadoActor } from '../extensions/ShadoActor';
import { ShadoInstanceContainer } from '../extensions/ShadoInstanceContainer/ShadoInstanceContainer';
import { shadoPublish } from '../publish';
import { SHOWCASE_WEAPONS } from './EqShowcaseCatalog';

@gpuStruct({ name: 'EqShowcaseActor' })
export class EqShowcaseActor extends ShadoActor {
  @field('vec4') skinTint!: Float32Array;
  @field('vec4') chestTint!: Float32Array;
  @field('vec4') legTint!: Float32Array;
  @field('vec4') trimTint!: Float32Array;

  @shadoPublish({
    name: 'armor',
    label: 'Armor',
    group: 'Appearance',
    description: 'One complete Requiem material family across the whole character.',
    values: ['armorless', 'leather', 'chain', 'plate'],
  })
  @field('f32') armorClass!: number;

  @shadoPublish({
    name: 'mainHand',
    label: 'Main hand',
    group: 'Equipment',
    socket: 'r_point',
    description: 'Weapon attached to the EQ right-hand socket.',
    values: [
      { value: 'none', label: 'Unarmed' },
      ...SHOWCASE_WEAPONS.map((value, index) => ({
        value,
        label: `Weapon ${index + 1}`,
        description: `EQ right-hand model ${value}`,
      })),
    ],
  })
  @field('f32') weaponClass!: number;

  public override initialize() {
    super.initialize();
    this.skinTint = new Float32Array([1, 1, 1, 1]);
    this.chestTint = new Float32Array([1, 1, 1, 1]);
    this.legTint = new Float32Array([1, 1, 1, 1]);
    this.trimTint = new Float32Array([1, 1, 1, 1]);
    this.armorClass = 0;
    this.weaponClass = 0;
  }
}

export class EqShowcaseContainer extends ShadoInstanceContainer<EqShowcaseActor> {
  public override generateGLSLPair(): { vs: string; fs: string } {
    const pair = super.generateGLSLPair();
    const chooseAppearance = `
  vec4 partTint = inst.color;
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
  #endif`;
    pair.vs = pair.vs
      .replace(
        'varying vec4 vColor;',
        `varying vec4 vColor;
#ifdef EQ_ARMOR_VARIANTS
flat varying float vEqLayer;
#endif`
      )
      .replace('vColor = C;', `${chooseAppearance}\n  vColor = partTint;`)
      .replace('vColor = inst.color;', `${chooseAppearance}\n  vColor = partTint;`)
      .replace(
        'gl_Position = worldViewProjection * vec4(p, 1.0);',
        `gl_Position = worldViewProjection * vec4(p, 1.0);
  if (aMeta.y > 0.5 && abs(aMeta.y - inst.weaponClass) > 0.25) {
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
  }`
      );
    pair.fs = pair.fs
      .replace(
        'uniform highp sampler2DArray uAtlasArray;',
        `uniform highp sampler2DArray uAtlasArray;
#ifdef EQ_ARMOR_VARIANTS
uniform highp sampler2DArray uEqArmorAtlas;
#endif`
      )
      .replace(
        'varying vec4 vColor;',
        `varying vec4 vColor;
#ifdef EQ_ARMOR_VARIANTS
flat varying float vEqLayer;
#endif`
      )
      .replace('gl_FragColor = c * vColor;', `
  vec4 surface = c * vColor;
  #ifdef EQ_ARMOR_VARIANTS
    if (vEqLayer >= 0.0) {
      surface = textureLod(uEqArmorAtlas, vec3(fract(vUV), vEqLayer), 0.0) * vColor;
    }
  #endif
  gl_FragColor = surface;`);
    return pair;
  }
}

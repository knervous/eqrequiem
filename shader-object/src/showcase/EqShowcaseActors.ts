import { field, gpuStruct } from '../decorators';
import { ShadoActor } from '../extensions/ShadoActor';
import { ShadoInstanceContainer } from '../extensions/ShadoInstanceContainer/ShadoInstanceContainer';
import { shadoPublish } from '../publish';
import { SHOWCASE_WEAPONS } from './EqShowcaseCatalog';
import { EQ_SHOWCASE_GLSL } from './EqShowcaseShader';

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
  protected override getGLSLHooks() {
    return EQ_SHOWCASE_GLSL;
  }
}

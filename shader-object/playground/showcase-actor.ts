import {
  ShadoActor,
  ShadoInstanceContainer,
  SHOWCASE_WEAPONS,
  field,
  gpuStruct,
  shadoPublish,
} from '@knervous/shado';
import { PLAYGROUND_ACTOR_SHADER } from './showcase-shader';

/**
 * An actor is a packed schema, not a Babylon mesh class.
 *
 * `@field` values are stored in Shado's contiguous CPU/WASM/GPU arena.
 * `@shadoPublish` adds a friendly, validated facade for tools and game code:
 * `actor.published.armor = 'plate'` writes the numeric `armorClass` field.
 */
@gpuStruct({ name: 'PlaygroundShowcaseActor' })
export class PlaygroundShowcaseActor extends ShadoActor {
  @field('vec4') skinTint!: Float32Array;
  @field('vec4') chestTint!: Float32Array;
  @field('vec4') legTint!: Float32Array;
  @field('vec4') trimTint!: Float32Array;

  @shadoPublish({
    name: 'armor',
    label: 'Armor',
    group: 'Appearance',
    description: 'Selects one complete texture-array material family.',
    values: ['armorless', 'leather', 'chain', 'plate'],
  })
  @field('f32')
  armorClass!: number;

  @shadoPublish({
    name: 'mainHand',
    label: 'Main hand',
    group: 'Equipment',
    socket: 'r_point',
    description: 'Selects geometry attached to the right-hand socket.',
    values: [
      { value: 'none', label: 'Unarmed' },
      ...SHOWCASE_WEAPONS.map((value, index) => ({
        value,
        label: `Weapon ${index + 1}`,
      })),
    ],
  })
  @field('f32')
  weaponClass!: number;

  @shadoPublish({
    name: 'lightingTone',
    label: 'Lighting tone',
    group: 'Appearance',
    description: 'A sample custom field consumed by the Playground shader hook.',
    values: ['natural', 'warm', 'cool'],
  })
  @field('f32')
  lightingTone!: number;

  public override initialize(): void {
    super.initialize();
    this.skinTint = new Float32Array([1, 1, 1, 1]);
    this.chestTint = new Float32Array([1, 1, 1, 1]);
    this.legTint = new Float32Array([1, 1, 1, 1]);
    this.trimTint = new Float32Array([1, 1, 1, 1]);
    this.armorClass = 0;
    this.weaponClass = 0;
    this.lightingTone = 0;
  }
}

/**
 * Containers own actor allocation, VAT playback, culling, and one instanced
 * draw. A subclass selects material behavior through stable named hooks.
 */
export class PlaygroundShowcaseContainer extends ShadoInstanceContainer<PlaygroundShowcaseActor> {
  protected override getGLSLHooks() {
    return PLAYGROUND_ACTOR_SHADER;
  }
}

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
 * An actor is a packed schema, not a Babylon mesh class. These declarations
 * remain ordinary TypeScript properties; the registrations below connect them
 * to Shado's contiguous CPU/WASM/GPU arena.
 */
export class PlaygroundShowcaseActor extends ShadoActor {
  skinTint!: Float32Array;
  chestTint!: Float32Array;
  legTint!: Float32Array;
  trimTint!: Float32Array;
  armorClass!: number;
  weaponClass!: number;
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

// Babylon Playground transpiles TypeScript without decorator syntax enabled.
// Shado decorators are also callable registration functions, so this is the
// portable equivalent of `@field`, `@shadoPublish`, and `@gpuStruct`.
field('vec4')(PlaygroundShowcaseActor.prototype, 'skinTint');
field('vec4')(PlaygroundShowcaseActor.prototype, 'chestTint');
field('vec4')(PlaygroundShowcaseActor.prototype, 'legTint');
field('vec4')(PlaygroundShowcaseActor.prototype, 'trimTint');

field('f32')(PlaygroundShowcaseActor.prototype, 'armorClass');
shadoPublish({
  name: 'armor',
  label: 'Armor',
  group: 'Appearance',
  description: 'Selects one complete texture-array material family.',
  values: ['armorless', 'leather', 'chain', 'plate'],
})(PlaygroundShowcaseActor.prototype, 'armorClass');

field('f32')(PlaygroundShowcaseActor.prototype, 'weaponClass');
shadoPublish({
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
})(PlaygroundShowcaseActor.prototype, 'weaponClass');

field('f32')(PlaygroundShowcaseActor.prototype, 'lightingTone');
shadoPublish({
  name: 'lightingTone',
  label: 'Lighting tone',
  group: 'Appearance',
  description: 'A sample custom field consumed by the Playground shader hook.',
  values: ['natural', 'warm', 'cool'],
})(PlaygroundShowcaseActor.prototype, 'lightingTone');

gpuStruct({ name: 'PlaygroundShowcaseActor' })(PlaygroundShowcaseActor);

/**
 * Containers own actor allocation, VAT playback, culling, and one instanced
 * draw. A subclass selects material behavior through stable named hooks.
 */
export class PlaygroundShowcaseContainer extends ShadoInstanceContainer<PlaygroundShowcaseActor> {
  protected override getGLSLHooks() {
    return PLAYGROUND_ACTOR_SHADER;
  }
}

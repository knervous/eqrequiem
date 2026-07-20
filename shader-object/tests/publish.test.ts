import { NullEngine } from '@babylonjs/core';
import { field, gpuStruct } from '../src/decorators';
import { ShadoActor } from '../src/extensions/ShadoActor';
import { getShadoPublishedProperties, shadoPublish } from '../src/publish';

@gpuStruct({ name: 'PublishedActor', useWasm: false })
class PublishedActor extends ShadoActor {
  @shadoPublish({
    name: 'armor',
    label: 'Armor set',
    description: 'Complete material family.',
    values: ['armorless', 'leather', 'chain', 'plate'],
  })
  @field('f32') armorClass!: number;

  @shadoPublish({
    name: 'mainHand',
    socket: 'r_point',
    values: ['none', 'sword'],
  })
  @field('f32') weaponClass!: number;
}

describe('@shadoPublish', () => {
  it('maps friendly enum values to numeric GPU fields and exposes descriptions', async () => {
    const engine = new NullEngine();
    await PublishedActor.initialize(engine, { wasm: false });
    const actor = new PublishedActor(engine);
    actor.initialize();
    actor.armorClass = 0;
    actor.weaponClass = 0;

    actor.published.armor = 'chain';
    actor.published.$set('mainHand', 'sword');

    expect(actor.armorClass).toBe(2);
    expect(actor.weaponClass).toBe(1);
    expect(actor.published.armor).toBe('chain');
    expect(actor.published.toJSON()).toEqual({ armor: 'chain', mainHand: 'sword' });
    expect(getShadoPublishedProperties(actor)).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'armor', label: 'Armor set' }),
      expect.objectContaining({ name: 'mainHand', socket: 'r_point' }),
    ]));
    expect(() => actor.published.$set('armor', 'cloth')).toThrow(/Expected one of/);

    actor.dispose();
    engine.dispose();
  });
});

import { NullEngine } from '@babylonjs/core';
import { ShadoActor } from '../src/extensions/ShadoActor';
import { ShadoInstanceContainer } from '../src/extensions/ShadoInstanceContainer/ShadoInstanceContainer';
import { createEqShowcaseUi, createShadoVatShowcaseUi } from '../src/showcase/ShadoVatShowcaseUi';

class CompatibilityContainer extends ShadoInstanceContainer<ShadoActor> {
  public legacyIndexOf(actor: ShadoActor): number | undefined {
    return this._structArrayIndex.instances?.get(actor);
  }
}

describe('1.0.x API compatibility', () => {
  it('retains the published ShadoActor packed field names and offsets', () => {
    const schema = ShadoActor.getSchema();
    expect(
      schema.fields.map(field => [field.name, field.headerFloatOffset, field.headerFloatSize])
    ).toEqual([
      ['translation', 0, 4],
      ['rotation', 4, 4],
      ['color', 8, 4],
      ['visibleIndex', 12, 1],
      ['nameIndex', 13, 1],
      ['nameWorldPerEM', 14, 1],
      ['nameLiftWorld', 15, 1],
      ['nameplateColor', 16, 4],
      ['animationBuffer', 20, 4],
      ['visibleFlag', 24, 1],
      ['padding1', 25, 1],
      ['padding2', 26, 1],
      ['padding3', 27, 1],
    ]);
    expect(schema.headerFloatCount).toBe(28);
  });

  it('keeps no-argument shader include registration working', () => {
    expect(() => ShadoActor.registerIncludes()).not.toThrow();
  });

  it('keeps the original showcase UI exports as aliases', () => {
    expect(createEqShowcaseUi).toBe(createShadoVatShowcaseUi);
  });

  it('maintains the protected child index used by existing subclasses', async () => {
    const engine = new NullEngine();
    await CompatibilityContainer.initialize(engine, {
      wasm: false,
      extra: ShadoActor,
    });
    const container = new CompatibilityContainer(engine);
    const actor = container.addStructToArray<ShadoActor>('instances');

    expect(container.legacyIndexOf(actor)).toBe(0);

    container.dispose();
    engine.dispose();
  });
});

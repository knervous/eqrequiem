import { NullEngine } from '@babylonjs/core';
import { field, gpuStruct } from '../src/decorators';
import { ShadoActor } from '../src/extensions/ShadoActor';

@gpuStruct({ name: 'SpecializedActor', useWasm: false })
class SpecializedActor extends ShadoActor {
  @field('u32') entityId!: number;
}

describe('Shado schema inheritance', () => {
  it('builds a subclass schema after the base class has been initialized', async () => {
    const engine = new NullEngine();
    await ShadoActor.initialize(engine, { wasm: false });

    const base = ShadoActor.getSchema();
    const specialized = SpecializedActor.getSchema();

    expect(base.name).toBe('ShadoActor');
    expect(base.fields.some(field => field.name === 'entityId')).toBe(false);
    expect(specialized.name).toBe('SpecializedActor');
    expect(specialized.fields.some(field => field.name === 'translation')).toBe(true);
    expect(specialized.fields.some(field => field.name === 'entityId')).toBe(true);

    engine.dispose();
  });
});

import { NullEngine } from '@babylonjs/core';
import { field, gpuStruct } from '../src/decorators';
import { ShadoActor } from '../src/extensions/ShadoActor';
import {
  ShadoInstanceContainer,
  type ShadoInstanceGLSLHooks,
} from '../src/extensions/ShadoInstanceContainer/ShadoInstanceContainer';
import { EqShowcaseActor, EqShowcaseContainer } from '../src/showcase/EqShowcaseActors';
import { EQ_SHOWCASE_GLSL } from '../src/showcase/EqShowcaseShader';

@gpuStruct({ name: 'TestPlaygroundActor' })
class TestPlaygroundActor extends ShadoActor {
  @field('f32') armorClass!: number;
  @field('f32') weaponClass!: number;
  @field('f32') lightingTone!: number;
}

const TEST_PLAYGROUND_SHADER: ShadoInstanceGLSLHooks = {
  ...EQ_SHOWCASE_GLSL,
  vertexInstance: `${EQ_SHOWCASE_GLSL.vertexInstance ?? ''}
  shadoColor.rgb *= mix(vec3(1.0), vec3(1.08, 0.96, 0.84), inst.lightingTone);`,
};

class TestPlaygroundContainer extends ShadoInstanceContainer<TestPlaygroundActor> {
  protected override getGLSLHooks() {
    return TEST_PLAYGROUND_SHADER;
  }
}

describe('showcase shader hooks', () => {
  it('composes equipment behavior through named shader hooks', async () => {
    const engine = new NullEngine();
    await EqShowcaseContainer.initialize(engine, {
      wasm: false,
      extra: EqShowcaseActor,
    });
    const container = new EqShowcaseContainer(engine);
    const { vs, fs } = container.generateGLSLPair();

    expect(vs).toContain('flat varying float vEqLayer;');
    expect(vs).toContain('inst.weaponClass');
    expect(vs).toContain('int armorSet = clamp');
    expect(fs).toContain('uniform highp sampler2DArray uEqArmorAtlas;');
    expect(fs).toContain('surface = textureLod(uEqArmorAtlas');
    expect(fs).toContain('gl_FragColor = surface;');

    container.dispose();
    engine.dispose();
  });

  it('supports an application-defined actor schema and composed material strategy', async () => {
    const engine = new NullEngine();
    await TestPlaygroundContainer.initialize(engine, {
      wasm: false,
      extra: TestPlaygroundActor,
    });
    const container = new TestPlaygroundContainer(engine);
    const { vs } = container.generateGLSLPair();
    const actorFields = TestPlaygroundActor.getSchema([]).fields.map(field => field.name);

    expect(actorFields).toContain('lightingTone');
    expect(vs).toContain('inst.lightingTone');
    expect(vs).toContain('int armorSet = clamp');
    expect(vs.indexOf('int armorSet = clamp')).toBeLessThan(vs.indexOf('inst.lightingTone'));

    container.dispose();
    engine.dispose();
  });
});

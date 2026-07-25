import { makeMSDFTextShaders } from '../src/msdf';

describe('MSDF nameplate visibility shaders', () => {
  it('uses inline actor visibility without declaring a WebGPU texture binding', () => {
    const shaders = makeMSDFTextShaders({
      actorStructName: 'DynamicActor',
      containerStructName: 'DynamicContainer',
      useVisibilityTexture: false,
    });

    expect(shaders.vertexGLSL).toContain('DynamicActor_visibleFlag_OFF');
    expect(shaders.vertexGLSL).not.toContain('uShadoVisibilityFlags');
    expect(shaders.vertexGLSL).not.toContain('uShadoVisibleIndexTexWidth');
    expect(shaders.vertexWGSL).toContain(
      'DynamicContainer_fetchI32(ownerBase + DynamicActor_visibleFlag_OFF) != 0'
    );
    expect(shaders.vertexWGSL).not.toContain(
      'DynamicContainer_fetch(ownerBase + DynamicActor_visibleFlag_OFF)'
    );
  });

  it('keeps sidecar visibility bindings for pooled actors', () => {
    const shaders = makeMSDFTextShaders({ useVisibilityTexture: true });

    expect(shaders.vertexGLSL).toContain('uShadoVisibilityFlags');
    expect(shaders.vertexGLSL).toContain('uShadoVisibleIndexTexWidth');
    expect(shaders.vertexGLSL).not.toContain('ShadoActor_visibleFlag_OFF');
  });
});

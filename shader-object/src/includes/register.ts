import { BABYLON } from '../babylon';
import type { ShadoStructSchema } from '../schema/ShadoStructSchema';
import { resolveCtor } from '../utils/type-helpers';

export function setIncludeChunkWGSL(name: string, wgsl: string) {
  const Eff: any = BABYLON.Effect;
  const Store: any = BABYLON.ShaderStore;
  for (const s of [
    Eff?.IncludesShadersStoreWGSL,
    Store?.IncludesShadersStoreWGSL,
    Store?.ShadersStoreWGSL?.IncludesShadersStore,
    Eff?.ShadersStoreWGSL?.IncludesShadersStore,
  ]) {
    if (s) s[name] = wgsl;
  }
}

export function setIncludeChunkFX(name: string, fx: string) {
  const Eff: any = BABYLON.Effect;
  const Store: any = BABYLON.ShaderStore;
  for (const s of [
    Eff?.IncludesShadersStoreWGSL,
    Eff?.ShadersStoreWGSL?.IncludesShadersStore,
    Store?.IncludesShadersStoreWGSL,
    Store?.ShadersStoreWGSL?.IncludesShadersStore,
  ]) {
    if (s) delete s[name];
  }
  for (const s of [Eff?.IncludesShadersStore, Store?.IncludesShadersStore]) {
    if (s) s[name] = fx;
  }
}

export function setIncludeChunkBoth(name: string, glsl: string, wgsl: string) {
  setIncludeChunkFX(name, glsl);
  setIncludeChunkWGSL(name, wgsl);
}

export function registerIncludesOnEngine(schema: ShadoStructSchema, customName?: string) {
  for (const f of schema.fields as any) {
    const isVarArray = typeof f.type === 'object' && !!f.type?.arrayOf;
    const isStructRef = f.type && typeof f.type === 'object' && 'structOf' in f.type;
    if (isStructRef) {
      const childCtor = resolveCtor(f.type.structOf);
      if (!childCtor?.getSchema)
        throw new Error(
          `Field ${f.name} in ${schema.name} is a struct but structOf has no getSchema()`
        );
      const child = childCtor.getSchema();
      registerIncludesOnEngine(child);
    } else if (isVarArray && f.type.arrayOf?.structOf) {
      const child = resolveCtor(f.type.arrayOf.structOf).getSchema();
      registerIncludesOnEngine(child);
    }
  }
  const name = customName ?? schema.name;
  setIncludeChunkFX(name, schema.emitHeaderStruct());
  setIncludeChunkFX(`${name}Storage`, schema.emitGLSLStorage(0, 0));
  setIncludeChunkFX(`${name}Offsets`, schema.emitOffsets());

  setIncludeChunkWGSL(name, (schema as any).emitHeaderStructWGSL());
  setIncludeChunkWGSL(`${name}Offsets`, (schema as any).emitOffsetsWGSL());
  setIncludeChunkWGSL(`${name}Storage`, (schema as any).emitWGSLStorage());
}

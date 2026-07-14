import type { FieldDef, FieldType } from '../types';
import { roundUpFloats } from '../utils/glsl-wgsl';
import {
  isVector,
  floatStrideOf,
  isMatrix,
  isStructRef,
  isVarArray,
  resolveCtor,
} from '../utils/type-helpers';
import { ShadoStructSchema } from './ShadoStructSchema';
import type { ShadoConfig } from '../decorators';

export class ShadoSchemaBuilder {
  private _name: string;
  private fields: FieldDef[] = [];
  private built = false;
  private _config: ShadoConfig;

  constructor(name: string, config: ShadoConfig = {}) {
    this._name = name;
    this._config = config;
  }

  public registerField(name: string, type: FieldType): this {
    if (this.built) throw new Error('Schema already built');
    this.fields.push({ name, type });
    return this;
  }

  public build(): ShadoStructSchema {
    if (this.built) throw new Error('Schema already built');
    this.built = true;

    const sorted = this.fields.slice();

    let fcursor = 0;
    for (const f of sorted) {
      if (isVarArray(f.type)) continue;

      if (isStructRef(f.type)) {
        const childCtor = resolveCtor(f.type.structOf);
        const childSchema = childCtor.getSchema();
        const size = childSchema.headerFloatCount;
        const align = 4;
        f.headerFloatOffset = roundUpFloats(fcursor, align);
        f.headerFloatSize = size;
        fcursor = f.headerFloatOffset + size;
      } else {
        const size = floatStrideOf(f.type as any);
        const align = isVector(f.type as any) || isMatrix(f.type as any) ? 4 : 1;
        f.headerFloatOffset = roundUpFloats(fcursor, align);
        f.headerFloatSize = size;
        fcursor = f.headerFloatOffset + size;
      }
    }
    fcursor = roundUpFloats(fcursor, 4);
    const schema = new ShadoStructSchema(this._name, sorted, fcursor);
    (schema as any).config = this._config;
    return schema;
  }
}

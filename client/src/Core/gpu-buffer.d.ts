import type * as BJS from "@babylonjs/core";
export type ScalarType = "f32" | "i32" | "u32";
export type VectorType = "vec2" | "vec3" | "vec4";
export type MatrixType = "mat2" | "mat3" | "mat4";
export interface VarArrayType {
    varOf: ScalarType | VectorType | MatrixType | StructRef;
}
export type FieldType = ScalarType | VectorType | MatrixType | VarArrayType | StructRef;
export interface FieldDef {
    order: number;
    name: string;
    type: FieldType;
    headerFloatOffset?: number;
    headerFloatSize?: number;
}
export interface SchemaBuildOptions {
    alignFloats?: 1 | 2 | 4;
}
export declare class GPUStructSchema {
    readonly name: string;
    readonly fields: ReadonlyArray<FieldDef>;
    readonly headerFloatCount: number;
    readonly embeddedStructs: Record<string, {
        schema: GPUStructSchema;
        headerFloatOffset: number;
        headerFloatSize: number;
    }>;
    readonly structArrays: Record<string, {
        schema: GPUStructSchema;
        floatStride: number;
    }>;
    readonly varArrays: Record<string, {
        elemType: ScalarType | VectorType | MatrixType;
        floatStride: number;
    }>;
    constructor(name: string, laidOut: FieldDef[], headerFloatCount: number);
    materialIOFor(engine: BJS.Engine): {
        uniforms: string[];
        samplers: string[];
    };
    /** Header struct for both backends (name + "Header"). */
    emitHeaderStruct(): string;
    /** GLSL include: single buffer fetch + helpers */
    emitGLSLStorage(group?: number, startBinding?: number): string;
}
export declare class GPUStructSchemaBuilder {
    private _name;
    private fields;
    private built;
    constructor(name: string);
    registerField(order: number, name: string, type: FieldType): this;
    build(): GPUStructSchema;
}
export declare function registerIncludesOnEngine(schema: GPUStructSchema): void;
export interface GPUClassMeta {
    name?: string;
}
export declare function gpuStruct(meta?: GPUClassMeta): (ctor: any) => void;
export declare function field(order: number, type: FieldType): (target: any, propertyKey: string) => void;
export interface StructRef {
    structOf: GPURecordCtor;
}
type DirtyEvent = {
    kind: "header";
    byteOffset?: number;
    byteLength?: number;
} | {
    kind: "var";
    field: string;
    byteOffset?: number;
    byteLength?: number;
} | {
    kind: "struct-array";
    field: string;
    index?: number;
    byteOffset?: number;
    byteLength?: number;
};
type DirtyHandler = (ev: DirtyEvent) => void;
type GPURecordCtor = typeof GPURecord & {
    getSchema(): GPUStructSchema;
    registerIncludes(): void;
};
export declare abstract class GPURecord {
    readonly headerRaw: ArrayBuffer;
    protected static schema?: GPUStructSchema;
    protected readonly _view: DataView;
    private _backing;
    private _includeName;
    private _arena;
    private _headerSeg;
    private _varSeg;
    private _structSeg;
    private _structArrayCount;
    private _structArraySlots;
    private _structArrayUnsubs;
    private _dirtyHandlers?;
    private _headerDirty;
    onDirty(cb: DirtyHandler): () => void;
    emitHeaderDirty(byteOffset?: number, byteLength?: number): void;
    static shaderIO(engine: BJS.Engine): {
        uniforms: string[];
        samplers: string[];
    };
    static getSchema(this: GPURecordCtor): GPUStructSchema;
    static registerIncludes(this: GPURecordCtor): void;
    /** Assign/resize a variable array. Data is copied into the record arena. */
    setVarArray(field: string, data: Float32Array | number[]): void;
    /** Initialize a struct-array segment for N children per parent (single parent phase). */
    initStructArray(field: string, countPerParent: number, childSchema: GPUStructSchema): void;
    /** Bulk set a struct-array (copies child headers into the arena). */
    setStructArray(field: string, items: GPURecord[], countPerParent: number): void;
    /** Bind/update a child into an existing struct-array slot with live propagation. */
    bindStructArrayItem(field: string, index: number, child: GPURecord, childSchema?: GPUStructSchema): void;
    /** Upload + bind. Call before drawing. */
    commitAndBind(effect: BJS.Effect): void;
    dispose(): void;
    protected constructor(engine: BJS.Engine);
    private _ensureArenaLayout;
    private _repack;
    /** Called by backings during commit. Copies header if needed and returns the whole float arena. */
    prepareUnifiedForUpload(): Float32Array;
}
export {};

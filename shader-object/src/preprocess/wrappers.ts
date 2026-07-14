import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { emitASUnmanagedFromSchema } from '../asc/schema';
import type { InitializeConfig } from '../types';
import type { ShadoStructSchema } from '../schema/ShadoStructSchema';

export type ModuleExportRef = {
  module: string;
  export?: string;
};

export type WrapperSchemaConfig = ModuleExportRef & {
  initialize?: false | (Omit<InitializeConfig, 'extra'> & { extra?: ModuleExportRef | unknown });
};

export type WrapperPreprocessConfig = {
  name?: string;
  outDir: string;
  schemas: WrapperSchemaConfig[];
  emit?: Array<'assemblyscript' | 'glsl' | 'wgsl' | 'json'>;
  gzip?: boolean | Array<'assemblyscript' | 'glsl' | 'wgsl' | 'json'>;
};

export type WrapperPreprocessResult = {
  name: string;
  outDir: string;
  files: string[];
  schemas: Array<{ name: string; headerFloatCount: number }>;
};

type ResolvedSchema = {
  schema: ShadoStructSchema;
};

const gzipAsync = promisify(gzip);

export async function preprocessShadoWrappers(
  config: WrapperPreprocessConfig,
  options: { configDir?: string; only?: 'assemblyscript' | 'gpu' | 'all' } = {}
): Promise<WrapperPreprocessResult> {
  if (!config.outDir) throw new Error('Wrapper preprocessing requires outDir');
  if (!config.schemas?.length) throw new Error('Wrapper preprocessing requires schemas[]');

  const emit = new Set(config.emit ?? ['assemblyscript', 'glsl', 'wgsl', 'json']);
  if (options.only === 'assemblyscript') {
    emit.clear();
    emit.add('assemblyscript');
  } else if (options.only === 'gpu') {
    emit.clear();
    emit.add('glsl');
    emit.add('wgsl');
    emit.add('json');
  }

  const outDir = path.resolve(process.cwd(), config.outDir);
  await fs.mkdir(outDir, { recursive: true });

  const resolved = await Promise.all(
    config.schemas.map(schemaConfig => resolveSchema(schemaConfig, options.configDir))
  );

  const files: string[] = [];
  const manifestSchemas: Array<{
    name: string;
    headerFloatCount: number;
    files: Record<string, string | undefined>;
  }> = [];
  for (const { schema } of resolved) {
    const baseName = safeFileName(schema.name);
    const schemaFiles: Record<string, string | undefined> = {};
    const metadata = {
      kind: 'shado.wrapper.schema',
      version: 1,
      name: schema.name,
      headerFloatCount: schema.headerFloatCount,
      fields: schema.fields,
      varArrays: Object.fromEntries(
        Object.entries(schema.varArrays).map(([name, meta]) => [
          name,
          { elemType: meta.elemType, floatStride: meta.floatStride },
        ])
      ),
      structArrays: Object.fromEntries(
        Object.entries(schema.structArrays).map(([name, meta]) => [
          name,
          { schema: meta.schema.name, floatStride: meta.floatStride },
        ])
      ),
    };

    if (emit.has('json')) {
      const written = await writeTextMaybeGzip(
        outDir,
        `${baseName}.schema.json`,
        `${JSON.stringify(metadata, null, 2)}\n`,
        shouldGzip(config.gzip, 'json')
      );
      files.push(...written.files);
      schemaFiles.schema = written.fileName;
      schemaFiles.schemaGzip = written.gzipFileName;
    }
    if (emit.has('assemblyscript')) {
      const written = await writeTextMaybeGzip(
        outDir,
        `${baseName}.asc.ts`,
        `${emitASUnmanagedFromSchema(schema)}\n`,
        shouldGzip(config.gzip, 'assemblyscript')
      );
      files.push(...written.files);
      schemaFiles.assemblyscript = written.fileName;
      schemaFiles.assemblyscriptGzip = written.gzipFileName;
    }
    if (emit.has('glsl')) {
      const written = await writeTextMaybeGzip(
        outDir,
        `${baseName}.glsl`,
        [schema.emitOffsets(), schema.emitGLSLStorage()].join('\n\n') + '\n',
        shouldGzip(config.gzip, 'glsl')
      );
      files.push(...written.files);
      schemaFiles.glsl = written.fileName;
      schemaFiles.glslGzip = written.gzipFileName;
    }
    if (emit.has('wgsl')) {
      const written = await writeTextMaybeGzip(
        outDir,
        `${baseName}.wgsl`,
        [schema.emitOffsetsWGSL(), schema.emitWGSLStorage()].join('\n\n') + '\n',
        shouldGzip(config.gzip, 'wgsl')
      );
      files.push(...written.files);
      schemaFiles.wgsl = written.fileName;
      schemaFiles.wgslGzip = written.gzipFileName;
    }
    manifestSchemas.push({
      name: schema.name,
      headerFloatCount: schema.headerFloatCount,
      files: schemaFiles,
    });
  }

  const manifest = {
    kind: 'shado.wrapper.manifest',
    version: 1,
    name: config.name ?? 'wrappers',
    schemas: manifestSchemas,
  };
  files.push(await writeText(outDir, 'manifest.json', `${JSON.stringify(manifest, null, 2)}\n`));

  return {
    name: manifest.name,
    outDir,
    files,
    schemas: resolved.map(({ schema }) => ({
      name: schema.name,
      headerFloatCount: schema.headerFloatCount,
    })),
  };
}

async function resolveSchema(
  schemaConfig: WrapperSchemaConfig,
  configDir = process.cwd()
): Promise<ResolvedSchema> {
  const ctor = await importRef(schemaConfig, configDir);
  if (!ctor) {
    throw new Error(`Could not resolve ${schemaConfig.export ?? 'default'} from ${schemaConfig.module}`);
  }

  const initialize = schemaConfig.initialize;
  if (initialize !== false && typeof ctor.initialize === 'function') {
    const initConfig = await resolveInitializeConfig(initialize ?? { wasm: false }, configDir);
    const ok = await ctor.initialize({}, { wasm: false, ...initConfig });
    if (!ok) throw new Error(`${ctor.name ?? schemaConfig.module}.initialize() failed`);
  }

  const schema =
    ctor.schema ??
    (typeof ctor.getSchema === 'function' ? ctor.getSchema([]) : undefined);
  if (!schema) {
    throw new Error(`${ctor.name ?? schemaConfig.module} does not expose a Shado schema`);
  }
  return { schema };
}

async function resolveInitializeConfig(
  config: WrapperSchemaConfig['initialize'],
  configDir: string
): Promise<InitializeConfig> {
  if (!config) return { wasm: false };
  const next: InitializeConfig = { ...(config as InitializeConfig), wasm: config.wasm ?? false };
  const extra = (config as any).extra;
  if (isModuleExportRef(extra)) {
    next.extra = await importRef(extra, configDir);
  }
  return next;
}

async function importRef(ref: ModuleExportRef, configDir: string): Promise<any> {
  const specifier = resolveModuleSpecifier(ref.module, configDir);
  const mod = await import(specifier);
  return ref.export ? mod[ref.export] : (mod.default ?? mod);
}

function resolveModuleSpecifier(moduleName: string, configDir: string): string {
  if (moduleName.startsWith('.') || moduleName.startsWith('/')) {
    return pathToFileURL(path.resolve(configDir, moduleName)).href;
  }
  return moduleName;
}

function isModuleExportRef(value: unknown): value is ModuleExportRef {
  return !!value && typeof value === 'object' && typeof (value as any).module === 'string';
}

function safeFileName(name: string): string {
  return name.replace(/[^a-z0-9._-]+/gi, '-');
}

async function writeText(outDir: string, fileName: string, contents: string): Promise<string> {
  const file = path.join(outDir, fileName);
  await fs.writeFile(file, contents);
  return file;
}

async function writeTextMaybeGzip(
  outDir: string,
  fileName: string,
  contents: string,
  shouldCompress: boolean
): Promise<{ fileName: string; gzipFileName?: string; files: string[] }> {
  const file = await writeText(outDir, fileName, contents);
  const files = [file];
  let gzipFileName: string | undefined;
  if (shouldCompress) {
    gzipFileName = `${fileName}.gz`;
    const gzipFile = path.join(outDir, gzipFileName);
    await fs.writeFile(gzipFile, await gzipAsync(Buffer.from(contents, 'utf8'), { level: 9 }));
    files.push(gzipFile);
  }
  return { fileName, gzipFileName, files };
}

function shouldGzip(
  gzip: WrapperPreprocessConfig['gzip'],
  kind: 'assemblyscript' | 'glsl' | 'wgsl' | 'json'
): boolean {
  if (gzip === true) return true;
  return Array.isArray(gzip) ? gzip.includes(kind) : false;
}

// tsup.config.ts
import { defineConfig } from 'tsup';
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin as ESPlugin, PluginBuild, BuildResult, OutputFile } from 'esbuild';
import {
  decode,
  encode,
  type SourceMapLine,
  type SourceMapSegment,
} from '@jridgewell/sourcemap-codec';
import { transform as swcTransform, type Options as SwcOptions } from '@swc/core';

const devBuild = process.env.DEV === 'true';


const INLINE_MAP_RE =
  /\/\/# sourceMappingURL=data:application\/json(?:;charset=[^;,\s]+)?;base64,([A-Za-z0-9+/=]+)\s*$/;

// Ensure sanitizeMap sets a filename (helps some toolchains)
function sanitizeMap(map: any, fileName?: string): any | null {
  if (!map || typeof map !== 'object') return null;
  if (map.sourceRoot == null) delete map.sourceRoot;
  const sources: string[] = Array.isArray(map.sources)
    ? map.sources.filter((s: unknown): s is string => typeof s === 'string')
    : [];
  let sourcesContent: string[] | undefined;
  if (Array.isArray(map.sourcesContent)) {
    const kept: string[] = [];
    for (let i = 0; i < Math.min(map.sourcesContent.length, sources.length); i++) {
      const c = map.sourcesContent[i];
      kept.push(typeof c === 'string' ? c : '');
    }
    sourcesContent = kept;
  }
  if (sources.length === 0) return null;
  const out: any = {
    version: 3,
    file: typeof map.file === 'string' ? map.file : fileName ? path.basename(fileName) : undefined,
    names: Array.isArray(map.names)
      ? map.names.filter((n: unknown): n is string => typeof n === 'string')
      : [],
    sources,
    sourcesContent,
    mappings: typeof map.mappings === 'string' ? map.mappings : '',
  };
  if (typeof map.sourceRoot === 'string' && map.sourceRoot.length) out.sourceRoot = map.sourceRoot;
  return out;
}

function extractInlineMapAndCode(js: string): { code: string; map: any | null } {
  const m = js.match(INLINE_MAP_RE);
  if (!m) return { code: js, map: null };
  try {
    const json = Buffer.from(m[1], 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    const code = js.replace(INLINE_MAP_RE, '').replace(/\n$/, '');
    return { code, map: parsed };
  } catch {
    const code = js.replace(INLINE_MAP_RE, '').replace(/\n$/, '');
    return { code, map: null };
  }
}
function embedInlineMap(code: string, mapObj: any): string {
  const json = JSON.stringify(mapObj);
  const b64 = Buffer.from(json, 'utf8').toString('base64');
  const withoutOld = code.replace(INLINE_MAP_RE, '').replace(/\n$/, '');
  return `${withoutOld}\n//# sourceMappingURL=data:application/json;base64,${b64}`;
}
function stripSourceMapTrailer(code: string): string {
  return code.replace(INLINE_MAP_RE, '').replace(/\n$/, '');
}

function remapMappings(
  mappings: string,
  keep: Set<number>,
  indexRemap: Map<number, number>
): { mappings: string; kept: boolean } {
  if (!mappings) return { mappings: '', kept: false };

  const decoded = decode(mappings);
  const outLines: SourceMapLine[] = [];
  let kept = false;

  for (const line of decoded) {
    const outLine: SourceMapLine = [];

    let inPrevGen = 0;
    let inPrevSource = 0;
    let inPrevLine = 0;
    let inPrevColumn = 0;
    let inPrevName = 0;

    let outPrevGen = 0;
    let outPrevSource = 0;
    let outPrevLine = 0;
    let outPrevColumn = 0;
    let outPrevName = 0;

    for (const segment of line) {
      const genDelta = segment[0];
      inPrevGen += genDelta;
      const absGen = inPrevGen;

      if (segment.length < 4) {
        const outSeg: SourceMapSegment = [absGen - outPrevGen];
        outLine.push(outSeg);
        outPrevGen = absGen;
        continue;
      }

      const sourceDelta = segment[1]!;
      inPrevSource += sourceDelta;
      const absSource = inPrevSource;
      const lineDelta = segment[2]!;
      inPrevLine += lineDelta;
      const absLine = inPrevLine;
      const columnDelta = segment[3]!;
      inPrevColumn += columnDelta;
      const absColumn = inPrevColumn;

      let absName: number | undefined;
      if (segment.length === 5) {
        const nameDelta = segment[4]!;
        inPrevName += nameDelta;
        absName = inPrevName;
      }

      if (!keep.has(absSource)) {
        continue;
      }

      const mappedSource = indexRemap.get(absSource);
      if (mappedSource == null) continue;

      kept = true;

      const baseSegment: [number, number, number, number] = [
        absGen - outPrevGen,
        mappedSource - outPrevSource,
        absLine - outPrevLine,
        absColumn - outPrevColumn,
      ];

      const outSegment: SourceMapSegment =
        absName != null
          ? [...baseSegment, absName - outPrevName]
          : baseSegment;

      if (absName != null) {
        outPrevName = absName;
      }

      outLine.push(outSegment);

      outPrevGen = absGen;
      outPrevSource = mappedSource;
      outPrevLine = absLine;
      outPrevColumn = absColumn;
    }

    outLines.push(outLine);
  }

  return { mappings: encode(outLines), kept };
}

function makeKeepSrcPredicate(keepRoot: string) {
  const normalizedRoot = keepRoot.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  return (sourcePath: string): boolean => {
    const normalized = sourcePath.replace(/\\/g, '/');
    if (!normalizedRoot) return false;
    return (
      normalized.includes(`/${normalizedRoot}/`) ||
      normalized.startsWith(`${normalizedRoot}/`) ||
      normalized.startsWith(`./${normalizedRoot}/`) ||
      normalized.includes(`../${normalizedRoot}/`)
    );
  };
}

function filterSourcesFromMap(
  map: any,
  keepFn: (source: string) => boolean,
  fileName?: string
): any | null {
  const sanitized = sanitizeMap(map, fileName);
  if (!sanitized || !Array.isArray(sanitized.sources)) return sanitized;

  const keepSet = new Set<number>();
  sanitized.sources.forEach((source: string | undefined, index: number) => {
    if (typeof source === 'string' && keepFn(source)) keepSet.add(index);
  });

  if (!keepSet.size) return null;

  const ordered = [...keepSet].sort((a, b) => a - b);
  const indexRemap = new Map<number, number>();
  const newSources: string[] = [];
  const newSourcesContent: string[] = [];

  for (const oldIndex of ordered) {
    const mappedIndex = newSources.length;
    indexRemap.set(oldIndex, mappedIndex);
    newSources.push(sanitized.sources[oldIndex]);
    if (Array.isArray(sanitized.sourcesContent)) {
      const content = sanitized.sourcesContent[oldIndex];
      newSourcesContent.push(typeof content === 'string' ? content : '');
    }
  }

  const { mappings, kept } = remapMappings(sanitized.mappings ?? '', keepSet, indexRemap);
  if (!kept) return null;

  const next: any = {
    ...sanitized,
    sources: newSources,
    mappings,
  };

  if (newSourcesContent.length) next.sourcesContent = newSourcesContent;

  return next;
}

/* ────────── plugins ────────── */
function pruneSourceMapsPlugin({ keepRoot = 'src' }: { keepRoot?: string } = {}): ESPlugin {
  const keepSrc = makeKeepSrcPredicate(keepRoot);
  return {
    name: 'prune-sourcemaps',
    setup(build: PluginBuild) {
      build.onStart(() => {
        build.initialOptions.write = false;
      });
      build.onEnd(async (result: BuildResult) => {
        if (result.errors?.length) return;
        const outs = new Map<string, OutputFile>((result.outputFiles ?? []).map(f => [f.path, f]));

        for (const jsFile of [...outs.values()].filter(f => /\.m?js$/.test(f.path))) {
          const original = jsFile.text;
          const { code, map } = extractInlineMapAndCode(original);
          if (!map) continue;

          const filtered = filterSourcesFromMap(map, keepSrc, jsFile.path);
          if (process.env.DEBUG_SOURCEMAP === '1') {
            const originalSources = Array.isArray(map.sources) ? map.sources.length : 0;
            const filteredSources = filtered && Array.isArray(filtered.sources) ? filtered.sources.length : 0;
            console.log('[sourcemap][prune]', {
              file: jsFile.path,
              originalSources,
              filteredSources,
            });
          }

          const newJs = filtered ? embedInlineMap(code, filtered) : stripSourceMapTrailer(code);
          outs.set(jsFile.path, {
            path: jsFile.path,
            contents: Buffer.from(newJs, 'utf8'),
            text: newJs,
            hash: jsFile.hash,
          });
        }

        (result as any).outputFiles = [...outs.values()];
      });
    },
  };
}

/** SWC post-minify: chain **inline** map and re-embed **inline**. */
function swcMinifyInlinePlugin({
  patterns = [/\.m?js$/],
  keepRoot = 'src',
}: {
  patterns?: RegExp[];
  keepRoot?: string;
} = {}): ESPlugin {
  const shouldMinify = (p: string) => patterns.some(r => r.test(p));
  const keepSrc = makeKeepSrcPredicate(keepRoot);
  return {
    name: 'swc-minify-inline',
    setup(build: PluginBuild) {
      build.onStart(() => {
        build.initialOptions.write = false;
      });
      build.onEnd(async (result: BuildResult) => {
        if (result.errors?.length) return;
        const outs = new Map<string, OutputFile>((result.outputFiles ?? []).map(f => [f.path, f]));

        for (const jsFile of [...outs.values()].filter(
          f => shouldMinify(f.path) && !f.path.endsWith('.map')
        )) {
          const inputJs = jsFile.text;
          const { code: codeNoInline, map: inlineMap } = extractInlineMapAndCode(inputJs);
          const inputMap = inlineMap ? sanitizeMap(inlineMap, jsFile.path) : null;

          const swcOpts: SwcOptions = {
            filename: path.basename(jsFile.path),
            sourceMaps: true,
            inputSourceMap: inputMap ? JSON.stringify(inputMap) : undefined,
            minify: true,
            module: { type: 'es6' },
            jsc: {
              target: 'es2022',
              minify: { compress: { passes: 3, unsafe: true } as any, mangle: true },
              keepClassNames: false,
            },
          };

          const out = await swcTransform(codeNoInline, swcOpts);
          const parsedOutMap = out.map ? JSON.parse(out.map) : null;
          const producedMap = parsedOutMap
            ? filterSourcesFromMap(parsedOutMap, keepSrc, jsFile.path)
            : null;

          const finalCode = producedMap
            ? embedInlineMap(out.code, producedMap)
            : stripSourceMapTrailer(out.code);
          outs.set(jsFile.path, {
            path: jsFile.path,
            contents: Buffer.from(finalCode, 'utf8'),
            text: finalCode,
            hash: jsFile.hash,
          });
          if (process.env.DEBUG_SOURCEMAP === '1') {
            console.log('[sourcemap][swc][embed]', {
              file: jsFile.path,
              hasComment: finalCode.includes('sourceMappingURL'),
            });
          }
        }

        (result as any).outputFiles = [...outs.values()];

        // Write once
        const outdirAbs = path.resolve(
          build.initialOptions.absWorkingDir || process.cwd(),
          build.initialOptions.outdir || 'dist'
        );
        for (const f of (result as any).outputFiles as OutputFile[]) {
          const dest = f.path.startsWith(outdirAbs)
            ? f.path
            : path.resolve(outdirAbs, path.relative(build.initialOptions.outdir || 'dist', f.path));
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, f.contents);
          if (process.env.DEBUG_SOURCEMAP === '1' && dest.endsWith('.js')) {
            const written = fs.readFileSync(dest, 'utf8');
            console.log('[sourcemap][write]', {
              file: dest,
              hasComment: written.includes('sourceMappingURL'),
            });
          }
        }
      });
    },
  };
}

/** Vendor map masker (keeps inline data-URL). */
const excludeVendorFromSourceMapPlugin: ESPlugin = {
  name: 'excludeVendorFromSourceMapPlugin',
  setup(build: PluginBuild) {
    const emptyMapB64 = Buffer.from(
      JSON.stringify({ version: 3, sources: [''], mappings: 'A' })
    ).toString('base64');

    build.onLoad({ filter: /node_modules[/\\].+\.(m?js|ts)$/ }, args => {
      const contents =
        fs.readFileSync(args.path, 'utf8') +
        `\n//# sourceMappingURL=data:application/json;base64,${emptyMapB64}`;
      return { contents, loader: 'default' as const };
    });
  },
};

/* ────────── tsup config ────────── */
console.log(`[tsup] ${devBuild ? 'development' : 'production'} build`);
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'babylon/index': 'src/babylon/index.ts',
    'asc/index': 'src/asc/index.ts',
    'msdf/index': 'src/msdf/index.ts',
    'render/index': 'src/render/index.ts',
    'preprocess/index': 'src/preprocess/index.ts',
    'preprocess/runtime': 'src/preprocess/runtime.ts',
    cli: 'src/cli.ts',
  },
  dts: true,
  format: devBuild ? ['esm'] : ['esm', 'cjs'],
  sourcemap: devBuild ? 'inline' : true,
  clean: devBuild ? false : true,
  target: 'es2022',
  treeshake: true,
  splitting: devBuild ? false: true,
  
  esbuildPlugins: !devBuild ? [
    excludeVendorFromSourceMapPlugin,
    pruneSourceMapsPlugin({ keepRoot: 'src' }),
    swcMinifyInlinePlugin(),
  ] : [],

  esbuildOptions(o) {
    o.loader = {
      ...(o.loader || {}),
      '.fx': 'text',
      '.wgsl.fx': 'text',
      '.glsl.fx': 'text',
      '.asc': 'text',
      '.wasm.gz': 'binary',
    };
    o.alias = {
      ...(o.alias || {}),
      binaryen: './src/vendor/binaryen/binaryen-shim.ts',
    };
    o.define = {
      ...(o.define || {}),
      'process.env.NODE_ENV': '"production"',
      __DEV__: 'false',
    };
    o.legalComments = 'none';
  },

  external: [
    '@babylonjs/core',
    '@babylonjs/loaders',
    '@babylonjs/serializers',
    'assemblyscript',
    'assemblyscript/asc',
    'binaryen',
  ],
});

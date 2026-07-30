import fs from 'node:fs';
import path from 'node:path';

const RELEASE_VERSION = '1.2.0';
const root = path.resolve(process.cwd());

function readJson(relativePath: string): any {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

describe('1.2.0 release metadata', () => {
  const manifest = readJson('package.json');
  const lockfile = readJson('package-lock.json');
  const sandboxLockfile = readJson('sandbox/package-lock.json');

  it('keeps the manifest, lockfiles, and runtime version synchronized', () => {
    expect(manifest.version).toBe(RELEASE_VERSION);
    expect(lockfile.version).toBe(RELEASE_VERSION);
    expect(lockfile.packages[''].version).toBe(RELEASE_VERSION);
    expect(sandboxLockfile.packages['..'].version).toBe(RELEASE_VERSION);

    const source = fs.readFileSync(path.join(root, 'src/index.ts'), 'utf8');
    expect(source).toContain(`export const VERSION = '${RELEASE_VERSION}'`);
  });

  it('packages the new scaling entry points and their release documentation', () => {
    expect(manifest.private).not.toBe(true);
    expect(manifest.exports['./render-data']).toMatchObject({
      source: './src/render-data/index.ts',
      import: './dist/render-data/index.js',
      require: './dist/render-data/index.cjs',
    });
    expect(manifest.exports['./storage']).toMatchObject({
      source: './src/storage/index.ts',
      import: './dist/storage/index.js',
      require: './dist/storage/index.cjs',
    });
    expect(manifest.files).toEqual(
      expect.arrayContaining([
        'RELEASE_NOTES.md',
        'SHADO_RENDER_DATA_SCALING.md',
        'OPFS_DEFERRED_STORAGE_SLABS.md',
      ])
    );

    for (const file of [
      'src/render-data/index.ts',
      'src/storage/index.ts',
      'RELEASE_NOTES.md',
      'SHADO_RENDER_DATA_SCALING.md',
      'OPFS_DEFERRED_STORAGE_SLABS.md',
    ]) {
      expect(fs.existsSync(path.join(root, file))).toBe(true);
    }
  });

  it('starts the packaged changelog with this release and gates publishing', () => {
    const notes = fs.readFileSync(path.join(root, 'RELEASE_NOTES.md'), 'utf8');
    expect(notes).toMatch(/^# Release notes\s+## 1\.2\.0 — 2026-07-30/);
    expect(notes).toContain('five-million');
    expect(notes).toContain('compute scatter');
    expect(notes).toContain('OPFS cold-tier option');
    expect(notes).toContain('mobile responsive');

    expect(manifest.scripts.prepublishOnly).toBe('npm run release:check');
    expect(manifest.scripts['release:check']).toContain('npm run typecheck');
    expect(manifest.scripts['release:check']).toContain('npm test -- --runInBand');
    expect(manifest.scripts['release:check']).toContain('npm run build');
    expect(manifest.scripts['release:check']).toContain('npm run pack:check');
  });
});

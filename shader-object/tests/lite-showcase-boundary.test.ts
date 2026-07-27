import fs from 'node:fs';
import path from 'node:path';

describe('Babylon Lite sandbox boundary', () => {
  const root = path.resolve(process.cwd());

  it('keeps the default Lite showcase free of full Babylon imports', () => {
    const source = fs.readFileSync(
      path.join(root, 'sandbox/src/LitePlayground.ts'),
      'utf8'
    );
    expect(source).toContain("from '@babylonjs/lite'");
    expect(source).not.toContain("from '@babylonjs/core");
    expect(source).not.toContain("from '@knervous/shado';");
  });

  it('exposes only renderer-neutral modules through the showcase subpath', () => {
    const source = fs.readFileSync(
      path.join(root, 'src/showcase/index.ts'),
      'utf8'
    );
    expect(source).toContain("export * from './ShadoVatShowcaseUi'");
    expect(source).not.toContain("export * from './EqShowcase'");
    expect(source).not.toContain("export * from './ShadoShowcaseEnvironment'");
  });

  it('keeps Babylon Lite as the root-route default', () => {
    const source = fs.readFileSync(
      path.join(root, 'sandbox/src/App.tsx'),
      'utf8'
    );
    expect(source).toContain("return getRoutePath() === '/' ? 'lite' : 'babylonjs'");
    expect(source).toContain("await import('./LitePlayground')");
  });
});

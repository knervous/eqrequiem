import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const requiredText = new Map([
  [
    'src/UI/components/login/login-window.tsx',
    [
      "text=\"Libra\"",
      "text=\"Sandbox\"",
      "const libraUrl = '/apps/libra/'",
      "const sandboxUrl = '/apps/sandbox/'",
    ],
  ],
  [
    'src/UI/components/login/login-window.js',
    ["from './login-window.tsx'"],
  ],
  ['apps/libra/index.html', ['/src/subapps/libra-main.tsx']],
  ['apps/sandbox/index.html', ['/src/subapps/sandbox-main.tsx']],
]);

for (const [file, expected] of requiredText) {
  const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  for (const text of expected) {
    assert.ok(source.includes(text), `${file} is missing ${JSON.stringify(text)}`);
  }
}

console.log('Server select and bundled subapp entrypoint contracts are present.');

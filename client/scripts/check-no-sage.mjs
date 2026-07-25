import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clientRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const forbiddenTerms = [
  ['sage', '-core'].join(''),
  ['eq', 'sage'].join(''),
  ['VITE_USE_', 'SAGE'].join(''),
  ['USE_', 'SAGE'].join(''),
];
const forbiddenPattern = new RegExp(forbiddenTerms.join('|'));
const checkedExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.mjs',
  '.ts',
  '.tsx',
]);
const ignoredDirectories = new Set(['dist', 'node_modules']);

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return ignoredDirectories.has(entry.name)
          ? []
          : collectFiles(filePath);
      }
      return checkedExtensions.has(path.extname(entry.name)) ? [filePath] : [];
    }),
  );
  return nested.flat();
}

const files = await collectFiles(clientRoot);
const violations = [];
for (const filePath of files) {
  const source = await readFile(filePath, 'utf8');
  if (forbiddenPattern.test(source)) {
    violations.push(path.relative(clientRoot, filePath));
  }
}

assert.deepEqual(
  violations,
  [],
  `Unsupported Sage coupling found in:\n${violations.join('\n')}`,
);
console.log(`Checked ${files.length} client files: no Sage coupling found.`);

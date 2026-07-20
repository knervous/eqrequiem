import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const count = Math.max(1, Number(process.env.VAT_BENCH_SAMPLES) || 180_000);
const matrices = new Float32Array(count * 16);
for (let i = 0; i < count; i++) {
  const offset = i * 16;
  const angle = (i % 360) * Math.PI / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  matrices[offset] = cosine;
  matrices[offset + 2] = -sine;
  matrices[offset + 5] = 1;
  matrices[offset + 8] = sine;
  matrices[offset + 10] = cosine;
  matrices[offset + 12] = (i % 91) * 0.03;
  matrices[offset + 13] = (i % 37) * -0.02;
  matrices[offset + 14] = (i % 53) * 0.01;
  matrices[offset + 15] = 1;
}

for (const flavor of ['scalar', 'simd', 'relaxed_simd']) {
  const bytes = readFileSync(path.join(root, `build/vat-pack-kernel-${flavor}.wasm`));
  if (!WebAssembly.validate(bytes)) {
    console.log(`${flavor.padEnd(12)} unsupported`);
    continue;
  }
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const { memory, packDQ } = instance.exports;
  const inputPtr = 1024;
  const outputPtr = (inputPtr + matrices.byteLength + 15) & ~15;
  const required = outputPtr + count * 8 * Float32Array.BYTES_PER_ELEMENT;
  if (memory.buffer.byteLength < required) {
    memory.grow(Math.ceil((required - memory.buffer.byteLength) / 65_536));
  }
  new Float32Array(memory.buffer, inputPtr, matrices.length).set(matrices);
  for (let i = 0; i < 4; i++) packDQ(inputPtr, outputPtr, count, 0);
  const samples = [];
  for (let i = 0; i < 18; i++) {
    const started = performance.now();
    packDQ(inputPtr, outputPtr, count, 0);
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  const throughput = Math.round(count / median * 1000);
  console.log(`${flavor.padEnd(12)} ${median.toFixed(3).padStart(8)} ms  ${throughput.toLocaleString().padStart(12)} matrices/s`);
}

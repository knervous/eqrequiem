export function asPrelude(): string {
  return `/* @generated */
// Simple bump allocator using wasm memory
let __heap: usize = (memory.size() as usize) << 16; // pages -> bytes
export function alloc(bytes: i32): usize {
  let ptr = __heap;
  let need = ptr + <usize>bytes;
  let pagesNeeded = <i32>((need + 0xFFFF) >>> 16);
  let have = memory.size();
  if (pagesNeeded > have) memory.grow(pagesNeeded - have);
  __heap = need;
  return ptr;
}
`;
}

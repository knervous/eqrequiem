export class BindingAlloc {
  private next = 10;
  private used = new Map<string, number>();
  constructor(startAt = 10) {
    this.next = startAt;
  }
  takeFor(symbol: string, count = 1): number {
    if (this.used.has(symbol)) return this.used.get(symbol)!;
    const b = this.next;
    this.used.set(symbol, b);
    this.next += count;
    return b;
  }
  take(count = 1): number {
    const b = this.next;
    this.next += count;
    return b;
  }
}
const RESERVED_TYPES = new Set(['FragmentInputs']);
export function safeTypeName(name: string) {
  return RESERVED_TYPES.has(name) ? `${name}_User` : name;
}

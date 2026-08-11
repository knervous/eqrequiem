import { FloatingTextPool, formatCombatText } from '../src/msdf/floatingText';

/**
 * The animation curve is the product here, so it is asserted rather than eyeballed.
 * The sandbox scene at `/floating-text` is for judging whether it *feels* right; these
 * hold the properties that make it readable at all.
 */

const alphaOf = (color: string): number => Number.parseInt(color.slice(-2), 16);

describe('floating combat text', () => {
  it('is legible from its first frame, rises, and retires', () => {
    const pool = new FloatingTextPool();
    pool.spawn({ kind: 'damage', text: '42', x: 0, y: 0, z: 3 }, 0);

    // Full size immediately. The MSDF layer bakes glyph metrics on first sight, so a
    // value that starts small never grows — it just never renders.
    const born = pool.advance(0)[0]!;
    expect(born.fontSize).toBeGreaterThan(10);

    const settled = pool.advance(400)[0]!;
    expect(settled.fontSize).toBe(born.fontSize);
    expect(settled.z).toBeGreaterThan(born.z);

    // Gone, and no longer occupying a slot.
    expect(pool.advance(1_700)).toHaveLength(0);
    expect(pool.activeCount).toBe(0);
  });

  it('stays fully readable for most of its life, then fades', () => {
    const pool = new FloatingTextPool();
    pool.spawn({ kind: 'damage', text: '42', x: 0, y: 0, z: 3 }, 0);

    // A number that starts fading immediately is unreadable exactly when looked at.
    expect(alphaOf(pool.advance(800)[0]!.color)).toBe(255);
    const late = pool.advance(1_300)[0]!;
    expect(alphaOf(late.color)).toBeLessThan(255);
    expect(alphaOf(late.color)).toBeGreaterThan(0);
  });

  it('rises by exactly the configured distance', () => {
    const pool = new FloatingTextPool({ riseUnits: 5, laneSpacingUnits: 0 });
    pool.spawn({ kind: 'damage', text: '1', x: 0, y: 0, z: 10, slot: 3 }, 0);
    const nearlyDone = pool.advance(1_599)[0]!;
    expect(nearlyDone.z).toBeGreaterThan(14.9);
    expect(nearlyDone.z).toBeLessThanOrEqual(15);
  });

  it('separates values that land on the same target in the same frame', () => {
    const pool = new FloatingTextPool();
    pool.spawn({ kind: 'damage', text: '10', x: 0, y: 0, z: 3, slot: 1 }, 0);
    pool.spawn({ kind: 'critical', text: '99', x: 0, y: 0, z: 3, slot: 2 }, 0);
    pool.spawn({ kind: 'miss', text: 'miss', x: 0, y: 0, z: 3, slot: 3 }, 0);

    const drawn = pool.advance(300);
    expect(drawn).toHaveLength(3);
    // Every pair must differ in height or horizontal position; identical placement is
    // the bug this fans out to avoid.
    for (let i = 0; i < drawn.length; i++) {
      for (let j = i + 1; j < drawn.length; j++) {
        const a = drawn[i]!;
        const b = drawn[j]!;
        expect(Math.abs(a.z - b.z) + Math.abs(a.x - b.x)).toBeGreaterThan(0.1);
      }
    }
  });

  it('makes a critical louder than an ordinary hit', () => {
    const pool = new FloatingTextPool();
    pool.spawn({ kind: 'damage', text: '50', x: 0, y: 0, z: 3, slot: 1 }, 0);
    pool.spawn({ kind: 'critical', text: '50', x: 0, y: 0, z: 3, slot: 1 }, 0);
    const [normal, critical] = pool.advance(500);
    expect(critical!.fontSize).toBeGreaterThan(normal!.fontSize);
    expect(critical!.color).not.toBe(normal!.color);
  });

  it('drops the oldest value rather than refusing the newest', () => {
    const pool = new FloatingTextPool({ maxActive: 3 });
    for (let i = 0; i < 5; i++) {
      pool.spawn({ kind: 'damage', text: `${i}`, x: 0, y: 0, z: 3, slot: i }, 0);
    }
    const texts = pool.advance(100).map((instance) => instance.text);
    expect(texts).toHaveLength(3);
    expect(texts).toContain('4');
    expect(texts).not.toContain('0');
  });

  it('formats results the way a player reads them', () => {
    expect(formatCombatText('damage', 37.6)).toBe('38');
    expect(formatCombatText('heal', 20)).toBe('+20');
    expect(formatCombatText('miss')).toBe('miss');
    expect(formatCombatText('resist')).toBe('resist');
  });
});

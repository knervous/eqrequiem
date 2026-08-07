// File: client/e2e/interaction.spec.ts
//
// The rules behind the floating interaction prompt: what a subject offers,
// which subject wins the prompt, and how the prompt reads.
import { expect, test } from '@playwright/test';

type Action = { id: string; label: string; slot: string };

const npc = (over: Record<string, unknown> = {}) => ({
  id: '1',
  kind: 'npc',
  name: 'Guard',
  distance: 5,
  ...over,
});

const merchant = (over: Record<string, unknown> = {}) =>
  npc({ id: '2', name: 'Merchant', charClass: 41, ...over });

test.beforeEach(async ({ page }) => {
  await page.goto('/gamepad.html');
  await page.waitForFunction(() => Boolean(window.interactionHarness));
});

const interactions = (
  page: import('@playwright/test').Page,
  subject: unknown,
): Promise<Action[]> =>
  page.evaluate(
    (value) => window.interactionHarness.getInteractions(value),
    subject,
  );

test.describe('what a subject offers', () => {
  test('every living npc can be hailed', async ({ page }) => {
    const actions = await interactions(page, npc());
    expect(actions.map((a) => a.id)).toEqual(['hail']);
    expect(actions[0].slot).toBe('primary');
  });

  test('a merchant adds trade as the second slot', async ({ page }) => {
    const actions = await interactions(page, merchant());
    expect(actions.map((a) => a.id)).toEqual(['hail', 'trade']);
    expect(actions.map((a) => a.slot)).toEqual(['primary', 'secondary']);
    // "Trade" reads better in a floating prompt than "Open Merchant".
    expect(actions[1].label).toBe('Trade');
  });

  test('a non-merchant class does not offer trade', async ({ page }) => {
    const actions = await interactions(page, npc({ charClass: 1 }));
    expect(actions.map((a) => a.id)).toEqual(['hail']);
  });

  test('a corpse offers loot instead of hail', async ({ page }) => {
    const actions = await interactions(page, npc({ kind: 'corpse' }));
    expect(actions.map((a) => a.id)).toEqual(['loot']);
  });

  test('an empty corpse offers nothing', async ({ page }) => {
    const actions = await interactions(
      page,
      npc({ kind: 'corpse', hasLoot: false }),
    );
    expect(actions).toEqual([]);
  });

  test('world objects route by their type', async ({ page }) => {
    const door = await interactions(
      page,
      { id: 'd', kind: 'object', name: 'Door', distance: 3, objectType: 'door' },
    );
    const other = await interactions(
      page,
      { id: 'o', kind: 'object', name: 'Statue', distance: 3 },
    );
    expect(door.map((a) => a.id)).toEqual(['open']);
    expect(other.map((a) => a.id)).toEqual(['examine']);
  });

  test('never offers more than two actions', async ({ page }) => {
    for (const subject of [npc(), merchant(), npc({ kind: 'corpse' })]) {
      const actions = await interactions(page, subject);
      expect(actions.length).toBeLessThanOrEqual(2);
    }
  });
});

test.describe('which subject gets the prompt', () => {
  const select = (
    page: import('@playwright/test').Page,
    subjects: unknown[],
    options: Record<string, unknown> = {},
  ) =>
    page.evaluate(
      ({ list, opts }) => window.interactionHarness.selectFocus(list, opts),
      { list: subjects, opts: options },
    );

  test('picks the nearest interactable subject', async ({ page }) => {
    const focus = await select(page, [
      npc({ id: 'far', distance: 12 }),
      npc({ id: 'near', distance: 3 }),
    ]);
    expect(focus.subject.id).toBe('near');
  });

  test('ignores anything beyond range', async ({ page }) => {
    const focus = await select(page, [npc({ distance: 40 })]);
    expect(focus).toBeNull();
  });

  test('ignores subjects with nothing to offer', async ({ page }) => {
    const focus = await select(page, [
      npc({ id: 'empty', kind: 'corpse', hasLoot: false, distance: 1 }),
      npc({ id: 'guard', distance: 9 }),
    ]);
    expect(focus.subject.id).toBe('guard');
  });

  test('shows nothing while the player is in combat', async ({ page }) => {
    const focus = await select(page, [npc({ distance: 2 })], {
      inCombat: true,
    });
    expect(focus).toBeNull();
  });

  test('keeps the current subject unless a rival is clearly closer', async ({
    page,
  }) => {
    // A metre of difference is not enough to steal focus mid-conversation.
    const sticky = await select(
      page,
      [npc({ id: 'held', distance: 6 }), npc({ id: 'rival', distance: 5.2 })],
      { currentId: 'held' },
    );
    expect(sticky.subject.id).toBe('held');

    const stolen = await select(
      page,
      [npc({ id: 'held', distance: 9 }), npc({ id: 'rival', distance: 2 })],
      { currentId: 'held' },
    );
    expect(stolen.subject.id).toBe('rival');
  });

  test('returns null when nothing is nearby', async ({ page }) => {
    expect(await select(page, [])).toBeNull();
  });
});

test.describe('prompt text', () => {
  const prompt = (
    page: import('@playwright/test').Page,
    subject: unknown,
    glyphs: Record<string, string>,
  ) =>
    page.evaluate(
      ({ value, map }) => window.interactionHarness.buildPrompt(value, map),
      { value: subject, map: glyphs },
    );

  test('reads as glyph then label, in slot order', async ({ page }) => {
    const text = await prompt(page, merchant(), {
      primary: 'X',
      secondary: 'Y',
    });
    expect(text).toBe('[X] Hail   [Y] Trade');
  });

  test('falls back to keyboard keys when no controller is driving', async ({
    page,
  }) => {
    const text = await prompt(page, merchant(), {
      primary: 'H',
      secondary: 'E',
    });
    expect(text).toBe('[H] Hail   [E] Trade');
  });

  test('an unbound slot shows the label alone', async ({ page }) => {
    const text = await prompt(page, merchant(), { primary: 'X' });
    expect(text).toBe('[X] Hail   Trade');
  });

  test('no focus produces no text', async ({ page }) => {
    const text = await page.evaluate(() =>
      window.interactionHarness.buildPrompt(null, {}),
    );
    expect(text).toBe('');
  });
});

import { expect, test } from '@playwright/test';

test('maps packed actor slabs through OPFS with bounded residency and reopen persistence', async ({
  page,
}) => {
  const fileName = `playwright-${Date.now()}-${Math.random().toString(16).slice(2)}.slabs`;
  await page.goto('/test');
  const result = await page.evaluate(async fileName => {
    const { DeferredStorageSlabStore } = await import('/@id/@knervous/shado/storage');
    const options = {
      directory: ['shado-playwright'],
      fileName,
      initialByteLength: 1_000_000 * 16,
      slabByteLength: 1_000_000,
      recordStrideBytes: 16,
      maxResidentSlabs: 2,
      preferSharedArrayBuffer: true,
    };
    const store = await DeferredStorageSlabStore.open(options);
    try {
      const sentinels = [0, 62_500, 999_999];
      for (const actorIndex of sentinels) {
        const slab = await store.mapRecordSlab(actorIndex);
        const local = store.localRecordIndex(actorIndex);
        slab.writeRecords(local, new Uint32Array([actorIndex, actorIndex ^ 0x55aa55aa, 3, 4]));
        slab.release();
      }
      await store.flush();
      const beforeClose = {
        logicalRecordCount: store.logicalRecordCount,
        slabCount: store.slabCount,
        residentSlabCount: store.residentSlabCount,
        residentByteLength: store.residentByteLength,
        shared: crossOriginIsolated,
        stats: store.stats,
      };
      await store.close();

      const reopened = await DeferredStorageSlabStore.open({
        ...options,
        initialByteLength: 0,
      });
      try {
        const values = [];
        for (const actorIndex of sentinels) {
          const slab = await reopened.mapRecordSlab(actorIndex);
          const local = reopened.localRecordIndex(actorIndex);
          const bytes = slab.recordBytes(local);
          values.push([...new Uint32Array(bytes.buffer, bytes.byteOffset, 4)]);
          slab.release();
        }
        return {
          beforeClose,
          reopenRecordCount: reopened.logicalRecordCount,
          reopenResidentBytes: reopened.residentByteLength,
          values,
        };
      } finally {
        await reopened.destroy();
      }
    } catch (error) {
      await store.destroy();
      throw error;
    }
  }, fileName);

  expect(result).toMatchObject({
    beforeClose: {
      logicalRecordCount: 1_000_000,
      slabCount: 16,
      residentSlabCount: 2,
      residentByteLength: 2_000_000,
      shared: true,
      stats: {
        peakResidentSlabs: 2,
        peakResidentBytes: 2_000_000,
      },
    },
    reopenRecordCount: 1_000_000,
    reopenResidentBytes: 2_000_000,
  });
  expect(result.beforeClose.stats.evictions).toBeGreaterThan(0);
  expect(result.beforeClose.stats.bytesWritten).toBeLessThan(16_000_000);
  expect(result.values).toEqual([
    [0, 0x55aa55aa, 3, 4],
    [62_500, 62_500 ^ 0x55aa55aa, 3, 4],
    [999_999, 999_999 ^ 0x55aa55aa, 3, 4],
  ]);
});

test('routes showcase overflow to packed OPFS rows under a fixed hot budget', async ({ page }) => {
  const fileName = `showcase-policy-${Date.now()}-${Math.random().toString(16).slice(2)}.slabs`;
  await page.goto('/test');
  const result = await page.evaluate(async fileName => {
    const { createShowcaseOpfsBacking } = await import('/src/ShowcaseOpfsBacking.ts');
    const stats = { instances: 0 };
    const controller = {
      stats,
      async addRandom(count: number) {
        stats.instances += count;
      },
      removeRandom() {
        stats.instances = Math.max(0, stats.instances - 1);
      },
    };
    const backing = createShowcaseOpfsBacking(controller as never, {
      fileName,
      hotInstanceLimit: 100,
    });
    try {
      await backing.setEnabled(true);
      await backing.addRandom(100_000);
      const populated = backing.snapshot();
      await backing.removeRandom();
      const removed = backing.snapshot();
      await backing.setEnabled(false);
      await backing.addRandom(10);
      return {
        hotInstances: stats.instances,
        populated,
        removedColdInstances: removed.coldInstances,
        disabled: backing.snapshot(),
      };
    } finally {
      await backing.dispose();
    }
  }, fileName);

  expect(result.hotInstances).toBe(110);
  expect(result.populated).toMatchObject({
    supported: true,
    enabled: true,
    busy: false,
    coldInstances: 99_900,
    logicalByteLength: 99_900 * 16,
    hotInstanceLimit: 100,
  });
  expect(result.populated.residentByteLength).toBeLessThanOrEqual(16 * 1024 * 1024);
  expect(result.removedColdInstances).toBe(99_899);
  expect(result.disabled.enabled).toBe(false);
});

test('showcase controls become a touch-sized mobile drawer with panel tabs', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/test');
  await page.evaluate(async () => {
    const { createShadoVatShowcaseUi } = await import('/@id/@knervous/shado/showcase');
    const parent = document.createElement('div');
    parent.id = 'mobile-ui-fixture';
    parent.style.cssText = 'position:fixed;inset:0;z-index:100';
    const canvas = document.createElement('canvas');
    parent.appendChild(canvas);
    document.body.appendChild(parent);
    const stats = {
      loaded: 0,
      total: 0,
      failed: 0,
      instances: 0,
      visible: 0,
      cullingRange: 600,
      cullingMode: 'cpu',
      reducerMs: 0,
      reducerAverageMs: 0,
      loadedCodes: [],
    };
    let storageEnabled = false;
    const deferredStorage = {
      snapshot: () => ({
        supported: true,
        enabled: storageEnabled,
        busy: false,
        coldInstances: 0,
        logicalByteLength: 0,
        residentByteLength: 0,
        hotInstanceLimit: 20_000,
      }),
      async setEnabled(enabled: boolean) {
        storageEnabled = enabled;
      },
      async addRandom() {},
      async removeRandom() {},
    };
    const controller = {
      models: [],
      stats,
      selected: undefined,
      async loadAll() {},
      async loadModel() {},
      async addGlb() {},
      async addRandom() {},
      removeRandom() {},
      shuffle() {},
      setCullingRange() {},
      setNameplatesEnabled() {},
      setSelectedName() {},
      setSelectedAnimation() {},
      setSelectedAnimationSpeed() {},
      setSelectedTransform() {},
      setSelectedPublished() {},
      moveSelectedFromScreen() {},
      subscribeSelection(listener: (selection: undefined) => void) {
        listener(undefined);
        return () => {};
      },
      dispose() {},
    };
    (window as any).__mobileUiHandle = createShadoVatShowcaseUi(
      canvas,
      controller as never,
      undefined,
      { deferredStorage }
    );
  });

  const controls = page.locator('#mobile-ui-fixture [data-eq-showcase=controls]');
  const launcher = page.locator('#mobile-ui-fixture [data-role=showcase-mobile-launcher]');
  await expect(launcher).toBeVisible();
  await expect(launcher).toHaveCSS('min-height', '44px');
  await expect(controls).toHaveAttribute('data-mobile-open', 'false');

  await launcher.click();
  await expect(controls).toHaveAttribute('data-mobile-open', 'true');
  await page.locator('#mobile-ui-fixture [data-mobile-panel-target=selected]').click();
  await expect(controls).toHaveAttribute('data-mobile-panel', 'selected');
  await expect(page.locator('#mobile-ui-fixture [data-role=roster-panel]')).toHaveCSS(
    'display',
    'none'
  );
  await expect(page.locator('#mobile-ui-fixture [data-role=selected-panel]')).not.toHaveCSS(
    'display',
    'none'
  );

  await page.locator('#mobile-ui-fixture [data-mobile-panel-target=roster]').click();
  const storageToggle = page.locator('#mobile-ui-fixture [data-role=deferred-storage-toggle]');
  await storageToggle.check();
  await expect(
    page.locator('#mobile-ui-fixture [data-role=deferred-storage-add-5m]')
  ).toBeVisible();

  await page.locator('#mobile-ui-fixture [data-role=showcase-mobile-close]').click();
  await expect(controls).toHaveAttribute('data-mobile-open', 'false');
  await page.evaluate(() => {
    (window as any).__mobileUiHandle.dispose();
    document.querySelector('#mobile-ui-fixture')?.remove();
  });
  await expect(page.locator('[data-role=shado-showcase-responsive-style]')).toHaveCount(0);
});

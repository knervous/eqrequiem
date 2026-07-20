import {
  createShadoVatShowcaseUi,
  type ShadoVatShowcaseController,
  type ShadoVatShowcaseStats,
} from '@knervous/shado';

/**
 * Small host adapter around Shado's reusable DOM overlay.
 *
 * The controller reports its first stats snapshot while it is being created,
 * before the overlay can receive the controller. Keeping the latest snapshot
 * here makes the normal Babylon setup order explicit and race-free.
 */
export type PlaygroundShowcaseUi = {
  onStats(stats: ShadoVatShowcaseStats): void;
  attach(controller: ShadoVatShowcaseController): void;
  dispose(): void;
};

export function createPlaygroundShowcaseUi(canvas: HTMLCanvasElement): PlaygroundShowcaseUi {
  let latest: ShadoVatShowcaseStats | undefined;
  let view: ReturnType<typeof createShadoVatShowcaseUi> | undefined;

  return {
    onStats(stats) {
      latest = stats;
      view?.update(stats);
    },
    attach(controller) {
      view?.dispose();
      view = createShadoVatShowcaseUi(canvas, controller);
      view.update(latest ?? controller.stats);
    },
    dispose() {
      view?.dispose();
      view = undefined;
    },
  };
}

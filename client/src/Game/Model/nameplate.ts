import type * as BJS from "@babylonjs/core";
import { TextRenderer, FontAsset } from '@babylonjs/addons';
import GameManager from "@game/Manager/game-manager";

export class Nameplate {
  private static fontAsset: FontAsset | null = null;
  private static initialized = false;
  private static scene: BJS.Scene | null = null;
  private static textRenderers: TextRenderer[] = [];
  private static initPromise: Promise<void> | null = null; // Store the initialization promise

  private static async initialize(scene: BJS.Scene): Promise<void> {
    if (Nameplate.initialized) return;
    Nameplate.initialized = true;
    Nameplate.scene = scene;
    const sdfFontDefinition = await (await fetch("https://assets.babylonjs.com/fonts/roboto-regular.json")).text();
    Nameplate.fontAsset = new FontAsset(sdfFontDefinition, "https://assets.babylonjs.com/fonts/roboto-regular.png");
    scene.onAfterRenderObservable.add(this.render.bind(this));
  }

  public static dispose() {
    this.textRenderers.forEach((renderer) => {
      renderer.dispose();
    });
    this.textRenderers = [];
  }

  private static render() {
    if (!Nameplate.scene || !Nameplate.fontAsset) return;
    const camera = GameManager.instance.scene?.activeCamera;
    if (!camera) return;

    Nameplate.textRenderers.forEach((renderer) => {
      renderer.render(camera!.getViewMatrix(), camera!.getProjectionMatrix());
    });
  }

  static async removeNameplate(tr: TextRenderer): Promise<void> {
    const index = Nameplate.textRenderers.indexOf(tr);
    if (index !== -1) {
      Nameplate.textRenderers.splice(index, 1);
      tr.dispose();
    }
  }

  static async createNameplate(scene: BJS.Scene): Promise<TextRenderer> {
    if (!Nameplate.initPromise) {
      Nameplate.initPromise = Nameplate.initialize(scene);
    }
    await Nameplate.initPromise;
    const tr = await TextRenderer.CreateTextRendererAsync(Nameplate.fontAsset!, scene.getEngine());
    tr.isBillboard = true;

    Nameplate.textRenderers.push(tr);
    return tr;
  }
}
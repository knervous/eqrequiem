export function buildUi(scene: BABYLON.Scene, actorPool: any, animationRanges: any[]) {
  const ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI", true, scene);

  const panel = new BABYLON.GUI.StackPanel();
  panel.isVertical = true;
  panel.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
  panel.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
  panel.paddingLeft = "12px";
  panel.paddingTop = "12px";
  panel.width = "200px";
  panel.spacing = 8;
  ui.addControl(panel);

  function mkBtn(text: string, onClick: () => void) {
    const b = BABYLON.GUI.Button.CreateSimpleButton(text, text);
    b.width = "200px";
    b.height = "36px";
    b.cornerRadius = 8;
    b.thickness = 1;
    b.color = "#333";
    b.background = "#f1f1f1";
    b.onPointerUpObservable.add(onClick);
    return b;
  }

  panel.addControl(mkBtn("➕ Add Instance", () => actorPool.addInstances(1, animationRanges)));
  panel.addControl(mkBtn("➕ Add 100", () => actorPool.addInstances(100, animationRanges)));
  panel.addControl(mkBtn("➕ Add 1000", () => actorPool.addInstances(1000, animationRanges)));
  panel.addControl(mkBtn("➖ Remove Random", () => actorPool.removeRandomInstance()));
  panel.addControl(mkBtn("Shuffle All", () => actorPool.shuffleInstances(animationRanges)));

  // ── Distance Radius slider ───────────────────────────────────────────────
  const radiusTitle = new BABYLON.GUI.TextBlock("radiusTitle", "Cull Radius: 100");
  radiusTitle.color = "white";
  radiusTitle.fontSize = 16;
  radiusTitle.height = "22px";
  panel.addControl(radiusTitle);

  const radiusSlider = new BABYLON.GUI.Slider();
  radiusSlider.minimum = 5;
  radiusSlider.maximum = 300;
  radiusSlider.value = 100; // starts at 100
  radiusSlider.isThumbCircle = true;
  radiusSlider.height = "20px";
  radiusSlider.width = "200px";
  radiusSlider.step = 1;
  radiusSlider.borderColor = "#FFF";
  panel.addControl(radiusSlider);

  radiusSlider.onValueChangedObservable.add(v => {
    radiusTitle.text = `Cull Radius: ${v.toFixed(0)}`;
  });

  // ── Top-left HUD: Count + perf ───────────────────────────────────────────
  const hudLeft = new BABYLON.GUI.StackPanel();
  hudLeft.isVertical = true;
  hudLeft.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  hudLeft.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
  hudLeft.paddingLeft = "12px";
  hudLeft.paddingTop = "12px";
  hudLeft.width = "320px";
  hudLeft.spacing = 6;
  ui.addControl(hudLeft);

  const countLabel = new BABYLON.GUI.TextBlock("countLabel", "Instances: 0");
  countLabel.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  countLabel.color = "white";
  countLabel.fontSize = 18;
  countLabel.height = "24px";
  countLabel.paddingLeft = "8px";
  hudLeft.addControl(countLabel);

  const visibleCountLabel = new BABYLON.GUI.TextBlock("visibleCountLabel", "Drawn Instances: 0");
  visibleCountLabel.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  visibleCountLabel.color = "white";
  visibleCountLabel.fontSize = 18;
  visibleCountLabel.height = "24px";
  visibleCountLabel.paddingLeft = "8px";
  hudLeft.addControl(visibleCountLabel);

  const perfLabel = new BABYLON.GUI.TextBlock("perfLabel", "Move tick (Wasm): 0.000 ms");
  perfLabel.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  perfLabel.color = "white";
  perfLabel.fontSize = 16;
  perfLabel.height = "24px";
  perfLabel.paddingLeft = "8px";
  hudLeft.addControl(perfLabel);

  const cullPerfLabel = new BABYLON.GUI.TextBlock("cullPerfLabel", "Frustum Culling (Wasm): 0.000 ms");
  cullPerfLabel.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
  cullPerfLabel.color = "white";
  cullPerfLabel.fontSize = 16;
  cullPerfLabel.height = "24px";
  cullPerfLabel.paddingLeft = "8px";
  hudLeft.addControl(cullPerfLabel);

  // Return the control ref so you can read it each frame
  return { countLabel, visibleCountLabel, perfLabel, cullPerfLabel, radiusSlider };
}

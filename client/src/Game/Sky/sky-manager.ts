import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import type { ZoneManager } from "@game/Zone/zone-manager";
import { FileSystem } from "@game/FileSystem/filesystem";
import { createSkyLayerMaterial } from "./sky-material";



export default class DayNightSkyManager {
  private readonly domeGradientTable: {
    low: BJS.Color3;
    mid: BJS.Color3;
    high: BJS.Color3;
  }[] = [
      {
        low: new BABYLON.Color3(0 / 255, 0 / 255, 82 / 255),
        mid: new BABYLON.Color3(0 / 255, 0 / 255, 51 / 255),
        high: new BABYLON.Color3(0 / 255, 0 / 255, 66 / 255),
      },
      {
        low: new BABYLON.Color3(0 / 255, 0 / 255, 82 / 255),
        mid: new BABYLON.Color3(0 / 255, 0 / 255, 51 / 255),
        high: new BABYLON.Color3(0 / 255, 0 / 255, 66 / 255),
      },
      {
        low: new BABYLON.Color3(0 / 255, 0 / 255, 82 / 255),
        mid: new BABYLON.Color3(0 / 255, 0 / 255, 51 / 255),
        high: new BABYLON.Color3(0 / 255, 0 / 255, 66 / 255),
      },
      {
        low: new BABYLON.Color3(0 / 255, 0 / 255, 82 / 255),
        mid: new BABYLON.Color3(0 / 255, 0 / 255, 51 / 255),
        high: new BABYLON.Color3(0 / 255, 0 / 255, 66 / 255),
      },
      {
        low: new BABYLON.Color3(150 / 255, 22 / 255, 58 / 255),
        mid: new BABYLON.Color3(82 / 255, 34 / 255, 97 / 255),
        high: new BABYLON.Color3(122 / 255, 30 / 255, 101 / 255),
      },
      {
        low: new BABYLON.Color3(190 / 255, 26 / 255, 22 / 255),
        mid: new BABYLON.Color3(119 / 255, 46 / 255, 146 / 255),
        high: new BABYLON.Color3(154 / 255, 54 / 255, 105 / 255),
      },
      {
        low: new BABYLON.Color3(229 / 255, 84 / 255, 22 / 255),
        mid: new BABYLON.Color3(179 / 255, 102 / 255, 180 / 255),
        high: new BABYLON.Color3(185 / 255, 100 / 255, 104 / 255),
      },
      {
        low: new BABYLON.Color3(234 / 255, 86 / 255, 138 / 255),
        mid: new BABYLON.Color3(143 / 255, 98 / 255, 219 / 255),
        high: new BABYLON.Color3(222 / 255, 94 / 255, 226 / 255),
      },
      {
        low: new BABYLON.Color3(198 / 255, 158 / 255, 242 / 255),
        mid: new BABYLON.Color3(138 / 255, 160 / 255, 234 / 255),
        high: new BABYLON.Color3(158 / 255, 146 / 255, 238 / 255),
      },
      {
        low: new BABYLON.Color3(238 / 255, 250 / 255, 254 / 255),
        mid: new BABYLON.Color3(184 / 255, 238 / 255, 246 / 255),
        high: new BABYLON.Color3(210 / 255, 242 / 255, 250 / 255),
      },
      {
        low: new BABYLON.Color3(238 / 255, 250 / 255, 254 / 255),
        mid: new BABYLON.Color3(184 / 255, 238 / 255, 246 / 255),
        high: new BABYLON.Color3(210 / 255, 242 / 255, 250 / 255),
      },
      {
        low: new BABYLON.Color3(238 / 255, 250 / 255, 254 / 255),
        mid: new BABYLON.Color3(184 / 255, 238 / 255, 246 / 255),
        high: new BABYLON.Color3(210 / 255, 242 / 255, 250 / 255),
      },
      {
        low: new BABYLON.Color3(238 / 255, 250 / 255, 254 / 255),
        mid: new BABYLON.Color3(184 / 255, 238 / 255, 246 / 255),
        high: new BABYLON.Color3(210 / 255, 242 / 255, 250 / 255),
      },
      {
        low: new BABYLON.Color3(238 / 255, 250 / 255, 254 / 255),
        mid: new BABYLON.Color3(184 / 255, 238 / 255, 246 / 255),
        high: new BABYLON.Color3(210 / 255, 242 / 255, 250 / 255),
      },
      {
        low: new BABYLON.Color3(238 / 255, 250 / 255, 254 / 255),
        mid: new BABYLON.Color3(184 / 255, 238 / 255, 246 / 255),
        high: new BABYLON.Color3(210 / 255, 242 / 255, 250 / 255),
      },
      {
        low: new BABYLON.Color3(238 / 255, 250 / 255, 254 / 255),
        mid: new BABYLON.Color3(184 / 255, 238 / 255, 246 / 255),
        high: new BABYLON.Color3(210 / 255, 242 / 255, 250 / 255),
      },
      {
        low: new BABYLON.Color3(178 / 255, 154 / 255, 230 / 255),
        mid: new BABYLON.Color3(111 / 255, 122 / 255, 207 / 255),
        high: new BABYLON.Color3(142 / 255, 130 / 255, 218 / 255),
      },
      {
        low: new BABYLON.Color3(206 / 255, 86 / 255, 174 / 255),
        mid: new BABYLON.Color3(130 / 255, 55 / 255, 163 / 255),
        high: new BABYLON.Color3(178 / 255, 70 / 255, 182 / 255),
      },
      {
        low: new BABYLON.Color3(186 / 255, 62 / 255, 34 / 255),
        mid: new BABYLON.Color3(121 / 255, 15 / 255, 76 / 255),
        high: new BABYLON.Color3(150 / 255, 22 / 255, 50 / 255),
      },
      {
        low: new BABYLON.Color3(150 / 255, 14 / 255, 58 / 255),
        mid: new BABYLON.Color3(95 / 255, 0 / 255, 82 / 255),
        high: new BABYLON.Color3(122 / 255, 6 / 255, 74 / 255),
      },
      {
        low: new BABYLON.Color3(98 / 255, 6 / 255, 118 / 255),
        mid: new BABYLON.Color3(43 / 255, 0 / 255, 71 / 255),
        high: new BABYLON.Color3(66 / 255, 0 / 255, 94 / 255),
      },
      {
        low: new BABYLON.Color3(0 / 255, 0 / 255, 82 / 255),
        mid: new BABYLON.Color3(0 / 255, 0 / 255, 51 / 255),
        high: new BABYLON.Color3(0 / 255, 0 / 255, 66 / 255),
      },
      {
        low: new BABYLON.Color3(0 / 255, 0 / 255, 82 / 255),
        mid: new BABYLON.Color3(0 / 255, 0 / 255, 51 / 255),
        high: new BABYLON.Color3(0 / 255, 0 / 255, 66 / 255),
      },
      {
        low: new BABYLON.Color3(0 / 255, 0 / 255, 82 / 255),
        mid: new BABYLON.Color3(0 / 255, 0 / 255, 51 / 255),
        high: new BABYLON.Color3(0 / 255, 0 / 255, 66 / 255),
      },
    ];
  // Configurable Fields
  scale = 7000;
  scrollSpeed = 0.00001;
  dayLengthSeconds = 120;
  timeOfDay = 12.0;

  // Internal properties
  #camera;
  #scene: BJS.Scene | null = null;
  #domeRoot;
  skyContainer: BJS.AssetContainer | null = null;
  #layer1Mat: BJS.ShaderMaterial | null = null;
  #layer2Mat: BJS.ShaderMaterial | null = null;
  #sun;
  #worldEnv;
  #uvOffsetLayer1 = new BABYLON.Vector2(0, 0);
  #uvOffsetLayer2 = new BABYLON.Vector2(0, 0);
  parent: ZoneManager;
  constructor(parent) {
    this.parent = parent;
  }

  async createSky(name, noWorldEnv: boolean = false) {
    this.#scene = this.parent.GameManager.scene!;
    this.#scene.fogEnabled = true;
    this.#scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR;
    this.#scene.fogColor = new BABYLON.Color3(0.5, 0.5, 0.5);
    this.#scene.fogStart = 1000;
    this.#scene.fogEnd = 5000;
    this.#camera = this.parent.GameManager.Camera;
    const bytes = await FileSystem.getFileBytes(
      `eqrequiem/sky`,
      `${name}.babylon`,
    );
    if (!bytes) {
      console.log(`[SkyManager] Failed to load sky file: ${name}`);
      return;
    }
    const file = new File([bytes], `${name}.babylon`, {
      type: "application/babylon",
    });
    const sky = await BABYLON.LoadAssetContainerAsync(
      file,
          this.#scene!,
    ).catch((error) => {
      console.error(`[SkyManager] Error importing sky mesh: ${error}`);
      return null;
    });
    if (!sky) {
      console.error(`[SkyManager] Failed to load sky mesh: ${name}`);
      return;
    }
    this.skyContainer = sky;
    // Create sky dome
    sky.addAllToScene();
    this.#domeRoot = sky.meshes[0];
    //this.scale = 100;
    this.#domeRoot.scaling = new BABYLON.Vector3(
      this.scale,
      this.scale,
      this.scale,
    );
    this.#domeRoot.name = "__sky__";
    this.#domeRoot.position = this.#camera.position.clone();
    this.#domeRoot.position.y += this.scale * 0.25; // Adjust height to match camera
    // These two are treated separately and are the entrypoint for manipulations for time of day
    // Cloud layer is seen first, then upperLayer

    const [cloudLayer, upperLayer] = this.#domeRoot.getChildMeshes();
    upperLayer.renderingGroupId = 0; // Render first
    cloudLayer.renderingGroupId = 0; // Render second

    this.#layer1Mat = createSkyLayerMaterial(cloudLayer, this.#scene, this.scale);
    this.#layer2Mat = createSkyLayerMaterial(upperLayer, this.#scene, this.scale);

    // Create world environment
    if (!noWorldEnv) {
      this.#worldEnv = new BABYLON.HemisphericLight(
        "worldEnv",
        new BABYLON.Vector3(0, 1, 0),
        this.#scene,
      );
      this.#worldEnv.intensity = 0.1;
    }


    // Create sun
    this.#sun = new BABYLON.DirectionalLight(
      "sun",
      new BABYLON.Vector3(0, -1, 0),
      this.#scene,
    );
    this.#sun.position = new BABYLON.Vector3(0, 1000, 0);
    this.#sun.shadowMinZ = 0;
    this.#sun.shadowMaxZ = 10000;
    this.#sun.intensity = 1;

    // Update initial state
    this.#updateSunAndSky();
    this.#updateSkydomeColors();
  }

  worldTick() {
    this.timeOfDay += 0.01;
    if (this.timeOfDay > 24) this.timeOfDay = 0;
    this.#updateSunAndSky();
  }

  dispose() {
    if (this.#domeRoot) {
      this.#domeRoot.dispose();
      this.#domeRoot = null;
    }

    // Dispose of shader materials
    if (this.#layer1Mat) {
      this.#layer1Mat.dispose();
      this.#layer1Mat = null;
    }
    if (this.#layer2Mat) {
      this.#layer2Mat.dispose();
      this.#layer2Mat = null;
    }

    // Dispose of lights
    if (this.#worldEnv) {
      this.#worldEnv.dispose();
      this.#worldEnv = null;
    }
    if (this.#sun) {
    // Dispose of shadow generator if it exists
      if (this.#sun.shadowGenerator) {
        this.#sun.shadowGenerator.dispose();
      }
      this.#sun.dispose();
      this.#sun = null;
    }

    if (this.skyContainer) {
      this.skyContainer.dispose();
      this.skyContainer = null;
    }

    // Null references to scene and camera
    this.#scene = null;
    this.#camera = null;

  // Null parent reference (optional, depending on ZoneManager behavior)
  }

  tick(delta) {
    if (!this.#domeRoot) return;

    // Move dome to camera
    this.#domeRoot.position = this.#camera.position.clone();
    this.#domeRoot.position.y += this.scale * 0.25; // Adjust height to match camera
    if (!this.#layer1Mat || !this.#layer2Mat) {
      return;
    }
    // Update UV offsets
    this.#uvOffsetLayer1.x += this.scrollSpeed * delta;
    this.#uvOffsetLayer2.y += this.scrollSpeed * delta;


    this.#layer1Mat.setVector2("uUVOffset", this.#uvOffsetLayer1);
    this.#layer2Mat.setVector2("uUVOffset", this.#uvOffsetLayer2);


  }

  setTimeOfDay(time) {
    this.timeOfDay = ((time % 24) + 24) % 24;
    this.#updateSunAndSky();
    this.#updateSkydomeColors();

    // compute your two gradient stops on the CPU:

  }
  #updateSkydomeColors() {
    if (!this.#layer1Mat || !this.#layer2Mat) {
      return;
    }
    const t = (this.timeOfDay % 24 + 24) % 24;
    const h0 = Math.floor(t), h1 = (h0 + 1) % 24, f = t - h0;
    const e0 = this.domeGradientTable[h0];
    const e1 = this.domeGradientTable[h1];

    const low  = BABYLON.Color3.Lerp(e0.low,  e1.low,  f);
    const mid  = BABYLON.Color3.Lerp(e0.mid,  e1.mid,  f);
    const high = BABYLON.Color3.Lerp(e0.high, e1.high, f);

    // push those into the shader:
    this.#layer1Mat.setColor3("uLowColor",  low);
    this.#layer1Mat.setColor3("uMidColor",  mid);
    this.#layer1Mat.setColor3("uHighColor", high);

    this.#layer2Mat.setColor3("uLowColor",  low);
    this.#layer2Mat.setColor3("uMidColor",  mid);
    this.#layer2Mat.setColor3("uHighColor", high);

    if (this.#scene) {
      this.#scene.fogColor = mid;
      // this.#scene.fogStart = 1000 * heightNorm;
      // this.#scene.fogEnd = 5000 * heightNorm;
    }
  }

  #updateSunAndSky() {
    if (!this.#sun) return;

    const t = this.timeOfDay / 24.0;
    const elev = (Math.sin(t * Math.PI * 2 - Math.PI / 2) * Math.PI) / 2;
    const az = t * Math.PI * 2 + Math.PI / 2;
    const dist = 1000;

    // Sun position
    const x = dist * Math.cos(elev) * Math.sin(az);
    const y = dist * Math.sin(elev);
    const z = dist * Math.cos(elev) * Math.cos(az);
    this.#sun.position = new BABYLON.Vector3(x, y, z);
    this.#sun.setDirectionToTarget(BABYLON.Vector3.Zero());

    // Sun color and intensity
    const heightNorm = Math.max(0, Math.sin(elev));
    const dawn = new BABYLON.Color3(1, 0.4, 0.2);
    const noon = new BABYLON.Color3(1, 1, 0.9);
    const dusk = new BABYLON.Color3(1, 0.3, 0.1);
    let col;
    if (heightNorm <= 0) col = dawn;
    else if (t < 0.5) {
      col = BABYLON.Color3.Lerp(dawn, noon, heightNorm);
      
    } else {
      col = BABYLON.Color3.Lerp(noon, dusk, 1 - heightNorm);
    }

    this.#sun.diffuse = col;
    this.#sun.intensity = (heightNorm * 2) + 0.2;
    
  }
}

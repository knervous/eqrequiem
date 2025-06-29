import BABYLON from "@bjs";
import type * as BJS from "@babylonjs/core";
import type { ZoneManager } from "@game/Zone/zone-manager";
import { GradientMaterial } from '@babylonjs/materials/gradient/gradientMaterial';

const skyUrl = "https://eqrequiem.blob.core.windows.net/assets/sky/";

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
  scale = 5000;
  scrollSpeed = 0.0001;
  dayLengthSeconds = 120;
  timeOfDay = 12.0;

  // Internal properties
  #scene;
  #camera;
  #domeRoot;
  #layer1Mat;
  #layer2Mat;
  #sun;
  #skyMat;
  #worldEnv;
  #uvOffsetLayer1 = new BABYLON.Vector2(0, 0);
  #uvOffsetLayer2 = new BABYLON.Vector2(0, 0);
  #moveInterval;
  parent: ZoneManager;
  constructor(parent) {
    this.parent = parent;
  }

  async createSky(name, noWorldEnv: boolean = false) {
    this.#scene = this.parent.GameManager.scene!;
    this.#camera = this.parent.GameManager.Camera;
    // Create sky dome
    const sky = await BABYLON.LoadAssetContainerAsync(
      skyUrl + `${name}.glb`,
      this.#scene,
    );
    sky.addAllToScene();
    this.#domeRoot = sky.meshes[0];
    this.#domeRoot.scaling = new BABYLON.Vector3(
      this.scale,
      this.scale,
      this.scale,
    );
    this.#domeRoot.name = "__sky__";
    sky.meshes.forEach((mesh) => {
      mesh.isPickable = false; // Disable picking on sky meshes
      mesh.receiveShadows = false; // Disable shadows on sky meshes
      mesh.checkCollisions = false; // Disable collisions on sky meshes
      mesh.renderingGroupId = 0; // Ensure sky renders first
    });


    // Get child meshes (cloud and upper layers)
    const [cloudLayer, upperLayer] = this.#domeRoot.getChildMeshes();



    const multimat = new BABYLON.MultiMaterial('multi', this.#scene);
    const origMaterial = cloudLayer.material;
  
    const gradientMaterial = new GradientMaterial('grad', this.#scene);
    gradientMaterial.topColor = new BABYLON.Color3(119 / 255, 46 / 255, 146 / 255);
    gradientMaterial.bottomColor = new BABYLON.Color3(190 / 255, 26 / 255, 22 / 255);// 
    gradientMaterial.offset = 0;
    gradientMaterial.smoothness = 1;
    gradientMaterial.scale = 5;
    gradientMaterial.alpha = 1;
    gradientMaterial.disableLighting = true;
    gradientMaterial.topColorAlpha = 0.1;
    gradientMaterial.bottomColorAlpha = 0.6;
    gradientMaterial.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
    gradientMaterial.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
  
    cloudLayer.material = multimat;
  
    multimat.subMaterials.push(origMaterial);
    multimat.subMaterials.push(gradientMaterial);
  
    const verticesCount = cloudLayer.getTotalVertices();
    const indc = cloudLayer.getTotalIndices();
    new BABYLON.SubMesh(0, 0, verticesCount, 0, indc, cloudLayer);
    new BABYLON.SubMesh(1, 0, verticesCount, 0, indc, cloudLayer);

    // Configure materials
    this.#layer1Mat = cloudLayer.material;
    this.#layer2Mat = upperLayer.material;

    [this.#layer1Mat, this.#layer2Mat].forEach((mat, i) => {
      // mat.transparencyMode = BABYLON.Material.MATERIAL_OPAQUE;
      // mat.alpha =1.0;
      mat.emissiveColor = new BABYLON.Color3(1, 0.8, 0.7);
      console.log('Sky mat info', mat, i);
      mat.backFaceCulling = false;
      mat.zOffset = i; // Layer order
    });

    // Create sky material

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
    if (this.#worldEnv) {
      this.#worldEnv.dispose();
      this.#worldEnv = null;
    }
    if (this.#sun) {
      this.#sun.dispose();
      this.#sun = null;
    }
    if (this.#moveInterval) {
      clearInterval(this.#moveInterval);
      this.#moveInterval = null;
    }
  }

  tick(delta) {
    if (!this.#domeRoot) return;

    // Move dome to camera
    this.#domeRoot.position = this.#camera.position;

    // Update UV offsets
    this.#uvOffsetLayer1.x += this.scrollSpeed * delta;
    this.#uvOffsetLayer2.y += this.scrollSpeed * delta;

    // Apply UV offsets
    if (this.#layer1Mat && this.#layer1Mat.diffuseTexture) {
      this.#layer1Mat.diffuseTexture.uOffset = this.#uvOffsetLayer1.x;
      this.#layer1Mat.diffuseTexture.vOffset = this.#uvOffsetLayer1.y;
    }
    if (this.#layer2Mat && this.#layer2Mat.diffuseTexture) {
      this.#layer2Mat.diffuseTexture.uOffset = this.#uvOffsetLayer2.x;
      this.#layer2Mat.diffuseTexture.vOffset = this.#uvOffsetLayer2.y;
    }
  }

  setTimeOfDay(time) {
    this.timeOfDay = ((time % 24) + 24) % 24;
    this.#updateSunAndSky();
  }

  #updateSkyDomeColor() {
    if (!this.#layer1Mat || !this.#layer2Mat) return;
    const t = ((this.timeOfDay % 24) + 24) % 24;
    const h0 = Math.floor(t);
    const h1 = (h0 + 1) % 24;
    const frac = t - h0;

    const e0 = this.domeGradientTable[h0];
    const e1 = this.domeGradientTable[h1];

    // Interpolate colors
    const low = BABYLON.Color3.Lerp(e0.low, e1.low, frac);
    const mid = BABYLON.Color3.Lerp(e0.mid, e1.mid, frac);
    // const high = BABYLON.Color3.Lerp(e0.high, e1.high, frac);

    if (this.#layer1Mat) {
      this.#layer1Mat.emissiveColor = low;
      this.#layer1Mat.alpha = 0.5;
    }
    if (this.#layer2Mat) {
      this.#layer2Mat.emissiveColor = mid;
      this.#layer2Mat.alpha = 0.5;
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
    this.#sun.intensity = heightNorm + 0.2;

    // Update sky material
    if (this.#skyMat) {
      this.#skyMat.luminance = this.#sun.intensity;
      this.#skyMat.inclination = elev / Math.PI;
      this.#skyMat.azimuth = az / (Math.PI * 2);
      // Update turbidity and scattering
      const turbNoon = 2,
        turbDawn = 20;
      this.#skyMat.turbidity = turbDawn + (turbNoon - turbDawn) * heightNorm;
      const rayNoon = 1,
        rayDawn = 4;
      this.#skyMat.rayleigh = rayDawn + (rayNoon - rayDawn) * heightNorm;
    }



    this.#updateSkyDomeColor();
  }
}

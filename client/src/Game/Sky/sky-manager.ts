import {
  Node3D,
  Vector3,
  MeshInstance3D,
  StandardMaterial3D,
  Vector2,
  BaseMaterial3D,
  Color,
  WorldEnvironment,
  Environment,
  Sky,
  PhysicalSkyMaterial,
  DirectionalLight3D,
  RenderingServer,
  Camera3D,
  GradientTexture2D,
  Gradient,
} from "godot";
import { BaseGltfModel } from "../GLTF/base";

export default class DayNightSkyManager {
  // ─── Configurable Fields ──────────────────────────
  public scale = 5000;
  public scrollSpeed = 0.0001;      // UV scroll speed
  public dayLengthSeconds = 120;    // how long a full 0–24h cycle takes
  public timeOfDay = 12.0;          // 0 = midnight, 12 = noon

  // ── 1) Prepare your 24×3 color table once ───────────────────
  private readonly domeGradientTable: { low: Color; mid: Color; high: Color }[] = [
    /*  0 */ { low: new Color(0/255,   0/255,   82/255), mid: new Color(0/255,   0/255,   51/255), high: new Color(0/255,   0/255,   66/255) },
    /*  1 */ { low: new Color(0/255,   0/255,   82/255), mid: new Color(0/255,   0/255,   51/255), high: new Color(0/255,   0/255,   66/255) },
    /*  2 */ { low: new Color(0/255,   0/255,   82/255), mid: new Color(0/255,   0/255,   51/255), high: new Color(0/255,   0/255,   66/255) },
    /*  3 */ { low: new Color(0/255,   0/255,   82/255), mid: new Color(0/255,   0/255,   51/255), high: new Color(0/255,   0/255,   66/255) },
    /*  4 */ { low: new Color(150/255, 22/255,  58/255), mid: new Color(82/255,  34/255,  97/255), high: new Color(122/255, 30/255, 101/255) },
    /*  5 */ { low: new Color(190/255, 26/255,  22/255), mid: new Color(119/255, 46/255, 146/255), high: new Color(154/255, 54/255, 105/255) },
    /*  6 */ { low: new Color(229/255, 84/255,  22/255), mid: new Color(179/255,102/255,180/255), high: new Color(185/255,100/255,104/255) },
    /*  7 */ { low: new Color(234/255, 86/255, 138/255), mid: new Color(143/255, 98/255,219/255), high: new Color(222/255, 94/255,226/255) },
    /*  8 */ { low: new Color(198/255,158/255,242/255), mid: new Color(138/255,160/255,234/255), high: new Color(158/255,146/255,238/255) },
    /*  9 */ { low: new Color(238/255,250/255,254/255), mid: new Color(184/255,238/255,246/255), high: new Color(210/255,242/255,250/255) },
    /* 10 */ { low: new Color(238/255,250/255,254/255), mid: new Color(184/255,238/255,246/255), high: new Color(210/255,242/255,250/255) },
    /* 11 */ { low: new Color(238/255,250/255,254/255), mid: new Color(184/255,238/255,246/255), high: new Color(210/255,242/255,250/255) },
    /* 12 */ { low: new Color(238/255,250/255,254/255), mid: new Color(184/255,238/255,246/255), high: new Color(210/255,242/255,250/255) },
    /* 13 */ { low: new Color(238/255,250/255,254/255), mid: new Color(184/255,238/255,246/255), high: new Color(210/255,242/255,250/255) },
    /* 14 */ { low: new Color(238/255,250/255,254/255), mid: new Color(184/255,238/255,246/255), high: new Color(210/255,242/255,250/255) },
    /* 15 */ { low: new Color(238/255,250/255,254/255), mid: new Color(184/255,238/255,246/255), high: new Color(210/255,242/255,250/255) },
    /* 16 */ { low: new Color(178/255,154/255,230/255), mid: new Color(111/255,122/255,207/255), high: new Color(142/255,130/255,218/255) },
    /* 17 */ { low: new Color(206/255, 86/255,174/255), mid: new Color(130/255, 55/255,163/255), high: new Color(178/255, 70/255,182/255) },
    /* 18 */ { low: new Color(186/255, 62/255, 34/255), mid: new Color(121/255, 15/255, 76/255), high: new Color(150/255, 22/255, 50/255) },
    /* 19 */ { low: new Color(150/255, 14/255, 58/255), mid: new Color(95/255,  0/255, 82/255), high: new Color(122/255,  6/255, 74/255) },
    /* 20 */ { low: new Color(98/255,  6/255,118/255), mid: new Color(43/255,  0/255, 71/255), high: new Color(66/255,  0/255, 94/255) },
    /* 21 */ { low: new Color(0/255,  0/255, 82/255), mid: new Color(0/255,  0/255, 51/255), high: new Color(0/255,  0/255, 66/255) },
    /* 22 */ { low: new Color(0/255,  0/255, 82/255), mid: new Color(0/255,  0/255, 51/255), high: new Color(0/255,  0/255, 66/255) },
    /* 23 */ { low: new Color(0/255,  0/255, 82/255), mid: new Color(0/255,  0/255, 51/255), high: new Color(0/255,  0/255, 66/255) },
  ];
  


  // ─── Sky‑dome (two layers) ────────────────────────
  private domeRoot: Node3D;
  private layer1Mat: StandardMaterial3D;
  private layer2Mat: StandardMaterial3D;
  private uv1 = new Vector2(0, 0);
  private uv2 = new Vector2(0, 0);
  uvOffsetLayer1: Vector2 = new Vector2(0, 0);
  uvOffsetLayer2: Vector2 = new Vector2(0, 0);
  // Pre-allocate Vector3 objects
  
  private layer1OffsetVec: Vector3 = new Vector3(0, 0, 0);
  private layer2OffsetVec: Vector3 = new Vector3(0, 0, 0);
  // ─── Procedural Sky & Sun ─────────────────────────
  private worldEnv: WorldEnvironment;
  private skyMat: PhysicalSkyMaterial;
  private sun: DirectionalLight3D;

  // ─── For camera follow ────────────────────────────
  private cam: Camera3D;
  private camStartPos = new Vector3();

  constructor(parent: Node3D, name: string, camera: Camera3D) {
    this.name = "DayNightSkyManager";
    this.cam = camera;
    this.camStartPos = camera.global_position;

    // 1) setup sky dome
    this._createSkyDome(name).then((root) => {
      this.domeRoot = root;
      parent.add_child(this.domeRoot);
    });
   

    // 2) setup world environment + procedural sky
    this.worldEnv = new WorldEnvironment();
    //parent.add_child(this.worldEnv);

    const env = new Environment();
    env.background_mode = RenderingServer.EnvironmentBG.ENV_BG_SKY;
    this.skyMat = new PhysicalSkyMaterial();
    // set your baseline sky parameters
    this.skyMat.turbidity = 10;
    this.skyMat.rayleigh_coefficient = 2;
    this.skyMat.rayleigh_color = new Color(0.3, 0.405, 0.6);
    this.skyMat.mie_coefficient = 0.005;
    this.skyMat.mie_color = new Color(0.69, 0.729, 0.812);
    this.skyMat.ground_color = new Color(0.1, 0.07, 0.034);
    this.skyMat.energy_multiplier = 1.0;
    // attach sky
    const sky = new Sky();
    sky.sky_material = this.skyMat;
    env.sky = sky;
    this.worldEnv.environment = env;

    // 3) setup sun
    this.sun = new DirectionalLight3D();
    parent.add_child(this.sun);
    //this.sun.shadow_enabled = true; // Shadows on
    this.sun.shadow_bias = 0.05; // Helps reduce acne
    this.sun.shadow_normal_bias = 0.8; // Smooths edges
    
    // Add these for softer shadows
    this.sun.directional_shadow_mode = DirectionalLight3D.ShadowMode.SHADOW_ORTHOGONAL; // Use PCSS for soft shadows
    //this.sun.directional_shadow_softness = 2.0; // Increase softness (adjust 1.0–5.0 for effect)
    this.sun.light_size = 0.1;
    this.sun.light_specular = 0;
  }

  worldTick() {
    this.timeOfDay += 0.01;
    if (this.timeOfDay > 24) this.timeOfDay = 0;
    this._updateSunAndSky();
  }

  dispose() {
    if (this.domeRoot) {
      this.domeRoot.queue_free();
    }
    if (this.worldEnv) {
      this.worldEnv.queue_free();
    }
    if (this.sun) {
      this.sun.queue_free();
    }
  }

  tick(delta: number): void {
    if (!this.domeRoot) {
      return;
    }
  
    // Move dome to camera
    this.domeRoot.global_position = this.cam.global_position;
  
    // Update offsets
    this.uvOffsetLayer1.x += 0.0001;
    this.uvOffsetLayer2.y += 0.0001;

    // Update pre-allocated vectors
    this.layer1OffsetVec.x = this.uvOffsetLayer1.x;
    this.layer1OffsetVec.y = this.uvOffsetLayer1.y;
    this.layer2OffsetVec.x = this.uvOffsetLayer2.x;
    this.layer2OffsetVec.y = this.uvOffsetLayer2.y;

    // Apply without allocation
    this.layer1Mat.uv1_offset = this.layer1OffsetVec;
    this.layer2Mat.uv1_offset = this.layer2OffsetVec;
  }

  public setTimeOfDay(time: number): void {
    this.timeOfDay = ((time % 24) + 24) % 24;
    this._updateSunAndSky();
    
  }

  private async _createSkyDome(name: string): Promise<Node3D> {
    const domeModel = new BaseGltfModel("sky", name);
    const rootNode = (await domeModel.instantiate())!;
    rootNode.scale = new Vector3(this.scale, this.scale, this.scale);

    // pull out the first two StandardMaterial3D’s we find
    const mats = this._findMaterials(rootNode)
      .filter((m) => m instanceof StandardMaterial3D) as StandardMaterial3D[];
    this.layer1Mat = mats[0];
    this.layer2Mat = mats[1];

    // configure their alpha/emission
    [this.layer1Mat, this.layer2Mat].forEach((mat, i) => {
      mat.transparency = BaseMaterial3D.Transparency.TRANSPARENCY_ALPHA;
      const c = mat.albedo_color;
      c.r = 1;
      c.g = 0.8;
      c.b = 0.7;
      c.a = 0.5;
      mat.albedo_color = c;
      mat.emission_enabled = true;
      mat.emission_energy_multiplier = 0.7;
      mat.shading_mode = BaseMaterial3D.ShadingMode.SHADING_MODE_UNSHADED;
      mat.cull_mode = BaseMaterial3D.CullMode.CULL_DISABLED;
      mat.depth_draw_mode = BaseMaterial3D.DepthDrawMode.DEPTH_DRAW_DISABLED;
      mat.render_priority = i;      // layer order
    });

    return rootNode;
  }

  private _findMaterials(node: Node3D): BaseMaterial3D[] {
    const out: BaseMaterial3D[] = [];
    if (node instanceof MeshInstance3D) {
      const mesh = node.mesh!;
      for (let i = 0; i < mesh.get_surface_count(); i++) {
        const m = node.get_surface_override_material(i) || mesh.surface_get_material(i);
        if (m) out.push(m as BaseMaterial3D);
      }
    }
    for (const ch of node.get_children())
      if (ch instanceof Node3D) out.push(...this._findMaterials(ch));
    return out;
  }


  // ── 2) Call this whenever timeOfDay changes ──────────────────
  private _updateSkyDomeColor(): void {

    // wrap into [0,24)
    const t = ((this.timeOfDay % 24) + 24) % 24;
  
    // integer and next hour
    const h0   = Math.floor(t);
    const h1   = (h0 + 1) % 24;
    const frac = t - h0;              // 0…1 blend factor
  
    // fetch the two table entries
    const e0 = this.domeGradientTable[h0];
    const e1 = this.domeGradientTable[h1];
  
    // lerp each stop color
    const low   = e0.low.lerp(e1.low,   frac);
    const mid   = e0.mid.lerp(e1.mid,   frac);
    const high  = e0.high.lerp(e1.high, frac);
    low.a = 0.5;
    mid.a = 0.5;
    high.a = 0.5;
    // apply to layer1 (horizon)
    this.layer1Mat.albedo_color         = low;
    this.layer1Mat.emission_enabled     = true;
    this.layer1Mat.emission             = low;
    this.layer1Mat.emission_energy_multiplier = 1.5;
    
    // apply to layer2 (mid‑sky)
    this.layer2Mat.albedo_color         = mid;
    this.layer2Mat.emission_enabled     = true;
    this.layer2Mat.emission             = mid;
    this.layer2Mat.emission_energy_multiplier = 1.8;
  
    // (optional) a little zenith glow
    this.layer2Mat.emission = mid.lerp(high, 0.7);

    // const nightFade = Math.max(0, Math.sin((this.timeOfDay/24)*Math.PI*2));
    // const baseAlpha = 0.5 * nightFade + 0.2;  // never goes fully invisible

    // low.a  = mid.a  = high.a  = baseAlpha;
    // this.layer1Mat.emission_energy_multiplier = 1.5 * nightFade + 0.3;
    // this.layer2Mat.emission_energy_multiplier = 1.8 * nightFade + 0.3;
  }

  private _updateSunAndSky(): void {
    const t = this.timeOfDay / 24.0;  // 0…1
    // elevation: -90°..90°
    const elev = Math.sin(t * Math.PI * 2 - Math.PI/2) * Math.PI/2;
    const az   = t * Math.PI * 2 + Math.PI/2;
    const dist = 1000;

    // position & orient
    const x = dist * Math.cos(elev) * Math.sin(az);
    const y = dist * Math.sin(elev);
    const z = dist * Math.cos(elev) * Math.cos(az);
    this.sun.position = new Vector3(x, y, z);
    this.sun.look_at(Vector3.ZERO, Vector3.UP);

    // brightness & color
    const heightNorm = Math.max(0, Math.sin(elev));
    const dawn = new Color(1,0.4,0.2), noon = new Color(1,1,0.9), dusk = new Color(1,0.3,0.1);
    let col: Color;
    if (heightNorm <= 0) col = dawn;
    else if (t < 0.5) col = dawn.lerp(noon, heightNorm);
    else col = noon.lerp(dusk, 1-heightNorm);

    this.sun.light_color = col;
    this.sun.light_energy = heightNorm + 0.2;

    // feed back into physical sky
    this.skyMat.energy_multiplier = this.sun.light_energy;
    this.skyMat.mie_color = col;

    // turbidity & scattering
    const turbNoon = 2, turbDawn = 20;
    this.skyMat.turbidity = turbDawn + (turbNoon - turbDawn) * heightNorm;
    const rayNoon = 1, rayDawn = 4;
    this.skyMat.rayleigh_coefficient = rayDawn + (rayNoon - rayDawn) * heightNorm;

    // ground fade
    const groundDay = new Color(0.2,0.2,0.2), groundNight = new Color(0.05,0.03,0.02);
    this.skyMat.ground_color = groundNight.lerp(groundDay, heightNorm);
    this._updateSkyDomeColor();  
  }
}

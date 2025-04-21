import { 
  DirectionalLight3D,
  BaseMaterial3D,
  Node3D,
  Vector3,
  WorldEnvironment,
  Environment,
  Sky,
  ProceduralSkyMaterial,
  RenderingServer,
  Color,
  Shader, ShaderMaterial, 
} from "godot";
import GameManager from "../Manager/game-manager";

export default class EnvironmentManager {
  private parent: GameManager;
  private worldEnvNode: WorldEnvironment;
  private skyMat: ProceduralSkyMaterial;
  private sun: DirectionalLight3D;
  public timeOfDay: number = 12.0; // 0 = midnight, 12 = noon
  private dayLengthMinutes: number = 24.0; // real minutes for a full cycle

  constructor(parent: GameManager) {
    this.parent = parent;

    // 1) Create and attach WorldEnvironment
    this.worldEnvNode = new WorldEnvironment();
    this.parent.add_child(this.worldEnvNode);

    const cloudShaderCode = `
    shader_type sky;
    render_mode use_half_res_pass;

    // tweak these to taste:
    uniform float cloud_speed : hint_range(0.0, 1.0) = 0.1;
    uniform float cloud_scale : hint_range(0.01, 1.0) = 0.3;

    // Classic 2D value noise
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    float noise2d(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f*f*(3.0 - 2.0*f);
      float a = hash(i + vec2(0.0,0.0));
      float b = hash(i + vec2(1.0,0.0));
      float c = hash(i + vec2(0.0,1.0));
      float d = hash(i + vec2(1.0,1.0));
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }

    // Fractal Brownian Motion (fbm)
    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 5; ++i) {
        v += a * noise2d(p);
        p *= 2.0;
        a *= 0.5;
      }
      return v;
    }

    void sky() {
      if (AT_HALF_RES_PASS) {
        // generate clouds at low res and store alpha in ALPHA for blending
        vec2 uv = SKY_COORDS * cloud_scale + vec2(TIME * cloud_speed, 0.0);
        float c = fbm(uv);
        COLOR = vec3(c);
        ALPHA = c;
      } else {
        // full‑res pass: blend base sky and the half‑res cloud pass
        vec3 base = mix(
          vec3(0.6, 0.8, 1.0),   // horizon color
          vec3(0.2, 0.5, 0.9),   // zenith color
          SKY_COORDS.y
        );
        vec3 clouds = HALF_RES_COLOR.rgb;
        COLOR = base + clouds * 0.5;
      }
    }
  `;
    const shader = new Shader();
    shader.code = cloudShaderCode;

    const mat = new ShaderMaterial();
    mat.shader = shader;
    mat.set_shader_parameter("cloud_speed", 0.1);
    mat.set_shader_parameter("cloud_scale", 0.3);
    // 2) Create Environment resource
    const env = new Environment();
    env.background_mode = RenderingServer.EnvironmentBG.ENV_BG_SKY;

    // 3) Create a Sky resource and assign a ProceduralSkyMaterial
    const sky = new Sky();
    this.skyMat = new ProceduralSkyMaterial();
    sky.sky_material = mat;

    // Sky settings
    this.skyMat.sky_energy_multiplier = 1.0;
    this.skyMat.ground_horizon_color = new Color(0.1, 0.07, 0.034, 1.0);
    this.skyMat.sky_top_color = new Color(0.0, 0.3, 0.6, 1.0); // Blue at zenith
    this.skyMat.sky_horizon_color = new Color(0.5, 0.6, 0.7, 1.0); // Light near horizon
    this.skyMat.sky_top_color = new Color(1.0, 0.9, 0.8, 1.0); // Initial sun color
    this.skyMat.sun_angle_max = 10.0; // Sun disk size
    this.skyMat.sun_curve = 0.05; // Soft sun edge

    sky.sky_material = this.skyMat;
    env.sky = sky;

    

    // 4) Optional fog for depth-fade (commented out)
    // env.fog_enabled = true;
    // env.fog_light_color = new Color(0.8, 0.9, 1.0);
    // env.fog_depth_begin = 100;
    // env.fog_depth_end = 2000;

    // 5) Post-processing: tone, bloom, SSAO
    env.adjustment_enabled = true;
    env.adjustment_contrast = 1.1;
    env.glow_bloom = 1;
    env.ssao_enabled = true;
    env.ssao_radius = 0.3;
    env.ssao_intensity = 1.0;

    this.worldEnvNode.environment = env;

    // 6) Create and attach sun (DirectionalLight)
    this.sun = new DirectionalLight3D();
    this.parent.add_child(this.sun);

    this.updateSunPosition();
  }

  private updateSunPosition(): void {
    const t = this.timeOfDay / 24.0; // 0…1 over 24h

    // Linear elevation: 0° at 6:00 (t=0.25), 90° at 12:00 (t=0.5), 0° at 18:00 (t=0.75)
    let elevationRad: number;
    if (t < 0.25) {
      // Before 6:00, sun is below horizon
      elevationRad = 0.0;
    } else if (t < 0.5) {
      // 6:00 to 12:00: linear rise from 0° to 90°
      elevationRad = ((t - 0.25) / 0.25) * (Math.PI / 2.0); // 0 to 90°
    } else if (t < 0.75) {
      // 12:00 to 18:00: linear fall from 90° to 0°
      elevationRad = ((0.75 - t) / 0.25) * (Math.PI / 2.0); // 90° to 0
    } else {
      // After 18:00, sun is below horizon
      elevationRad = 0.0;
    }

    // Linear azimuth: 90° (east) at 6:00 (t=0.25), 180° (south) at 12:00 (t=0.5), 270° (west) at 18:00 (t=0.75)
    let azimuthRad: number;
    if (t < 0.25 || t >= 0.75) {
      // Before 6:00 or after 18:00: sun is below horizon, use east for continuity
      azimuthRad = Math.PI / 2.0; // Default to east
    } else {
      // 6:00 to 18:00: linear from 90° to 270°
      azimuthRad = Math.PI / 2.0 + ((t - 0.25) / 0.5) * Math.PI; // 90° to 270°
    }

    // Sun position at a large distance (500 units)
    const distance = 500.0;
    const x = distance * Math.cos(elevationRad) * Math.sin(azimuthRad); // East-west
    const y = distance * Math.sin(elevationRad); // Up-down
    const z = distance * Math.cos(elevationRad) * Math.cos(azimuthRad); // North-south

    this.sun.position = new Vector3(x, y, z);
    this.sun.look_at(Vector3.ZERO, Vector3.UP); // Light points toward origin

    // heightNorm goes 0 at horizon, 1 at zenith
    const heightNorm = Math.sin(elevationRad); // Smooth color/energy scaling

    // Pick sunrise/sunset color, noon color, and interpolate
    const dawnColor = new Color(1.0, 0.4, 0.2);
    const noonColor = new Color(1.0, 1.0, 0.9);
    const duskColor = new Color(1.0, 0.3, 0.1);

    // Blend between dawn & noon for morning, noon & dusk for afternoon
    let sunCol: Color;
    if (heightNorm <= 0.0) {
      // Night: use a fixed warm glow
      sunCol = dawnColor;
    } else if (t < 0.5) {
      // Morning: dawn → noon
      sunCol = dawnColor.lerp(noonColor, heightNorm);
    } else {
      // Afternoon: noon → dusk
      sunCol = noonColor.lerp(duskColor, 1.0 - heightNorm);
    }

    // Update the actual light
    this.sun.light_color = sunCol;
    this.sun.light_energy = heightNorm + 0.2;

    // ---- Drive the sky material ----
    this.skyMat.energy_multiplier = this.sun.light_energy;
    //this.skyMat.sun_color = sunCol;

    // Animate sky colors: bluer at noon, warmer at dawn/dusk
    const skyTopNoon = new Color(0.0, 0.3, 0.6);
    const skyTopDawn = new Color(0.5, 0.4, 0.3);
    this.skyMat.sky_top_color = skyTopDawn.lerp(skyTopNoon, heightNorm);

    const skyHorizonNoon = new Color(0.5, 0.6, 0.7);
    const skyHorizonDawn = new Color(0.7, 0.5, 0.4);
    this.skyMat.sky_horizon_color = skyHorizonDawn.lerp(skyHorizonNoon, heightNorm);

    // Ground color: dark at night, subtle at day
    const groundNoon = new Color(0.2, 0.2, 0.2);
    const groundNight = new Color(0.05, 0.03, 0.02);
    this.skyMat.ground_horizon_color = groundNight.lerp(groundNoon, heightNorm);
  }

  public setTimeOfDay(time: number): void {
    this.timeOfDay = ((time % 24) + 24) % 24;
    this.updateSunPosition();
  }

  public dispose(): void {
    this.worldEnvNode.queue_free();
    this.sun.queue_free();
  }
}
import {
  Node3D,
  Vector3,
  MeshInstance3D,
  StandardMaterial3D,
  Vector2,
  BaseMaterial3D,
  Color,
  Shader,
  ShaderMaterial,
  Camera3D,
} from "godot";
import { BaseGltfModel } from "../GLTF/base";
import { Extensions } from "../Util/extensions";
export default class SkyManager {
  parent: Node3D;
  name = "";
  scale = 5000;
  interval = 0;
  camera: Camera3D | null = null;
  layer1Material: StandardMaterial3D | null = null;
  layer2Material: StandardMaterial3D | null = null;
  uvOffsetLayer1: Vector2 = new Vector2(0, 0);
  uvOffsetLayer2: Vector2 = new Vector2(0, 0);
  camOrigin: Vector3 | null = null;
  emissiveColor: Color = new Color(1.0, 0.5, 0.4, 1.0); // Soft warm orange

  // Pre-allocate Vector3 objects
  private layer1OffsetVec: Vector3 = new Vector3(0, 0, 0);
  private layer2OffsetVec: Vector3 = new Vector3(0, 0, 0);

  constructor(parent: Node3D, name: string, camera: Camera3D) {
    this.parent = parent;
    this.name = name;
    this.createSkyDome();
    this.camera = camera;
    this.camOrigin = camera?.global_position;
  }

  public dispose() {
    clearInterval(this.interval);
  }

  private async createSkyDome() {
    const zoneModel = new BaseGltfModel("sky", this.name);
    const rootNode = await zoneModel.instantiate();
    if (rootNode) {
      this.parent.add_child(rootNode);
      rootNode.scale = new Vector3(this.scale, this.scale, this.scale);
      const materials = this.traverseForMaterials(rootNode);

      if (materials.length >= 2) {
        this.layer1Material = materials[0] as StandardMaterial3D;
        this.layer2Material = materials[1] as StandardMaterial3D;
        this.configureMaterial(this.layer1Material, 0.5, 1);
        this.configureMaterial(this.layer2Material, 0.5, 0);

        // Initial setup of offsets
        this.layer1OffsetVec.set(
          this.uvOffsetLayer1.x,
          this.uvOffsetLayer1.y,
          0
        );
        this.layer2OffsetVec.set(
          this.uvOffsetLayer2.x,
          this.uvOffsetLayer2.y,
          0
        );

        this.interval = setInterval(() => {
          rootNode.position = Extensions.GetPosition(this.camera!);

          if (this.layer1Material && this.layer2Material) {
            // Update offsets
            this.uvOffsetLayer1.x += 0.0001;
            this.uvOffsetLayer2.y += 0.0001;

            // Update pre-allocated vectors
            this.layer1OffsetVec.x = this.uvOffsetLayer1.x;
            this.layer1OffsetVec.y = this.uvOffsetLayer1.y;
            this.layer2OffsetVec.x = this.uvOffsetLayer2.x;
            this.layer2OffsetVec.y = this.uvOffsetLayer2.y;

            // Apply without allocation
            this.layer1Material.uv1_offset = this.layer1OffsetVec;
            this.layer2Material.uv1_offset = this.layer2OffsetVec;
          }
        }, 16) as unknown as number;
      }
    }
  }
  private createGradientMaterial(
    alpha: number,
    renderPriority: number
  ): ShaderMaterial {
    const material = new ShaderMaterial();

    // Define the shader code (see below)
    material.shader = this.createGradientShader();

    // Set initial parameters
    material.set_shader_parameter("top_color", new Color(1.0, 0.5, 0.2, alpha)); // Orange at top
    material.set_shader_parameter(
      "bottom_color",
      new Color(0.2, 0.5, 1.0, alpha)
    ); // Blue at bottom
    material.set_shader_parameter("uv_offset", new Vector3(0, 0, 0));

    // Match your original material settings
    material.render_priority = renderPriority;
    return material;
  }
  private createGradientShader() {
    const shader = new Shader();
    shader.code = `
      shader_type spatial;
      render_mode unshaded, cull_disabled, depth_draw_never;

      uniform vec4 top_color : source_color = vec4(1.0, 0.5, 0.2, 1.0);
      uniform vec4 bottom_color : source_color = vec4(0.2, 0.5, 1.0, 1.0);
      uniform vec3 uv_offset = vec3(0.0, 0.0, 0.0);

      void fragment() {
        // Use VERTEX.y (local Y position) to create the gradient
        float t = (VERTEX.y + 1.0) * 0.5; // Normalize Y from -1..1 to 0..1 (assuming hemisphere centered at origin)
        vec4 gradient_color = mix(bottom_color, top_color, t);
        ALBEDO = gradient_color.rgb;
        ALPHA = gradient_color.a;
      }
    `;
    return shader;
  }

  private configureMaterial(
    material: StandardMaterial3D,
    alpha = 0.5,
    renderPriority = 1
  ) {
    // Set transparency mode to alpha
    material.transparency = BaseMaterial3D.Transparency.TRANSPARENCY_ALPHA;

    // Get current albedo color and set alpha to 0.5 (50% transparent)
    const albedo = material.albedo_color;
    albedo.a = alpha;
    albedo.r = this.emissiveColor.r;
    albedo.g = this.emissiveColor.g;
    albedo.b = this.emissiveColor.b;
    material.albedo_color = albedo;
    material.emission_enabled = true;
    // material.emission = this.emissiveColor; // Use class property
    material.emission_energy_multiplier = 0.7; // Default intensity, adjust as needed
    material.shading_mode = BaseMaterial3D.ShadingMode.SHADING_MODE_UNSHADED;
    material.cull_mode = BaseMaterial3D.CullMode.CULL_DISABLED; // Disable backface culling
    material.render_priority = renderPriority; // Set rendering order
    material.depth_draw_mode = BaseMaterial3D.DepthDrawMode.DEPTH_DRAW_DISABLED; // Ensure depth doesn't hide it
  }

  private traverseForMaterials(node: Node3D): BaseMaterial3D[] {
    const materials: BaseMaterial3D[] = [];
    if (node instanceof MeshInstance3D) {
      const mesh = node.mesh;
      if (mesh) {
        const surfaceCount = mesh.get_surface_count();
        for (let i = 0; i < surfaceCount; i++) {
          let material =
            node.get_surface_override_material(i) ||
            mesh.surface_get_material(i);
          if (material) {
            materials.push(material as BaseMaterial3D);
          }
        }
      }
    }

    for (const child of node.get_children()) {
      if (child instanceof Node3D) {
        materials.push(...this.traverseForMaterials(child));
      }
    }
    return materials;
  }
}

import {
  GError,
  GLTFDocument,
  GLTFState,
  Image,
  ImageTexture,
  MeshInstance3D,
  Node,
  Node3D,
  PackedScene,
  StandardMaterial3D,
  Vector3,
  AnimationPlayer,
  Animation,
  Resource,
  Texture2D,
  Color,
} from "godot";
import { FileSystem } from "../FileSystem/filesystem";
import { TextureCache } from "../Util/texture-cache";
import "../Util/extensions";

type AnimatedTextureMeta = {
  animationDelay: number;
  frames: string[];
  eqShader: string;
};

export enum ShaderType {
  Diffuse = 0,
  Transparent25 = 1,
  Transparent50 = 2,
  Transparent75 = 3,
  TransparentAdditive = 4,
  TransparentAdditiveUnlit = 5,
  TransparentMasked = 6,
  DiffuseSkydome = 7,
  TransparentSkydome = 8,
  TransparentAdditiveUnlitSkydome = 9,
  Invisible = 10,
  Boundary = 11,
}

export const AlphaShaderMap: Partial<Record<ShaderType, number>> = {
  [ShaderType.Transparent25]: 64,
  [ShaderType.Transparent50]: 128,
  [ShaderType.TransparentSkydome]: 64,
  [ShaderType.DiffuseSkydome]: 128,
  [ShaderType.Transparent75]: 192,
  [ShaderType.TransparentAdditive]: 192,
  [ShaderType.TransparentAdditiveUnlit]: 192,
};

export class BaseGltfModel {
  private model: string = "";
  private folder: string = "";
  private node: Node3D | undefined;
  private packedScene: PackedScene | undefined;
  private animationPlayer: AnimationPlayer | undefined;
  private animationIntervals: number[] = [];

  constructor(folder: string, model: string) {
    this.folder = folder;
    this.model = model;
  }

  public dispose() {
    this.animationIntervals.forEach(clearInterval);
  }

  public getNode() {
    return this.node;
  }

  public getMesh(): MeshInstance3D | undefined {
    if (!this.node) {
      return;
    }
    const traverseChildren = (rootNode: Node): MeshInstance3D | undefined => {
      for (const child of rootNode.get_children()) {
        if (child instanceof MeshInstance3D) {
          return child;
        }
        const result = traverseChildren(child);
        if (result) return result;
      }
    };
    return traverseChildren(this.node);
  }

  public async instantiate(): Promise<Node3D | undefined> {
    const buffer = await FileSystem.getFileBytes(
      `eqrequiem/${this.folder}/${this.model}.glb`
    );
    if (!buffer) {
      console.log("Buffer not found!");
      return;
    }
    const gltfState = new GLTFState();
    const gltfDocument = new GLTFDocument();
    const result = gltfDocument.append_from_buffer(buffer, "/", gltfState);
    if (result === GError.OK) {
      // Print material extras if they exist
      this.parseMaterials(gltfState);

      const rootNode = gltfDocument.generate_scene(gltfState) as Node3D;
      if (rootNode) {
        this.traverseAndSwapTextures(rootNode as Node3D);
        this.node = rootNode as Node3D;
        this.setupAnimations(rootNode as Node3D);
        return rootNode;
      } else {
        console.log("Error with rootNode");
      }
    } else {
      console.log("Error appending buffer");
    }
  }

  private async parseMaterials(gltfState: GLTFState): Promise<void> {
    const materials = gltfState.materials;
    const animatedMaterials = [];

    for (let i = 0; i < materials.size(); i++) {
      const material = materials.get(i) as StandardMaterial3D;
      const meta = material
        .get_meta("extras")
        ?.toObject() as AnimatedTextureMeta;
      if (meta?.animationDelay) {
        animatedMaterials.push(material);
      }
      material.eqShader = +meta?.eqShader as ShaderType;
      const forceAlpha = AlphaShaderMap[material.eqShader as ShaderType];
      if (forceAlpha !== undefined) {
        // Convert from 0-255 to 0.0-1.0
        const enforcedAlpha = forceAlpha / 255;
        // Get the current albedo color
        const currentColor = material.albedo_color;
        // Set the alpha channel to the enforced value
        currentColor.a = enforcedAlpha;
        material.albedo_color = currentColor;

        // Ensure the material renders as transparent
        material.transparency = 1; //StandardMaterial3D.Transparency.TRANSPARENCY_ALPHA_SCISSOR;
        // Optionally, you might need to adjust blend mode
        // material.blend_mode = StandardMaterial3D.Transparency.TRANSPARENCY_DISABLED;
      }
      switch (material.eqShader) {
        case ShaderType.Transparent25:
          material.alpha_scissor_threshold = 64;
          break;
        case ShaderType.Transparent50:
          material.alpha_scissor_threshold = 128;
          break;
        case ShaderType.Transparent75:
          material.alpha_scissor_threshold = 192;
          break;
        case ShaderType.TransparentAdditive:
          material.alpha_scissor_threshold = 192;
          break;
        case ShaderType.TransparentAdditiveUnlit:
          material.alpha_scissor_threshold = 192;
          break;
        case ShaderType.TransparentMasked:
          material.alpha_scissor_threshold = 1;
          break;
        case ShaderType.DiffuseSkydome:
        case ShaderType.TransparentSkydome:
          material.shading_mode =
            StandardMaterial3D.ShadingMode.SHADING_MODE_UNSHADED; // Already set, ensures no lighting
          material.transparency = 1; // Ensure transparency is enabled
          material.blend_mode = StandardMaterial3D.BlendMode.BLEND_MODE_MIX; // Ensure transparency is enabled
          material.alpha_scissor_threshold = 128 / 255; // Consistent with your AlphaShaderMap
          material.distance_fade_mode =
            StandardMaterial3D.DistanceFadeMode.DISTANCE_FADE_DISABLED; // Disable distance fading
          material.no_depth_test = true; // Render on top, ignoring depth (optional, for skydome visibility)
          //material.albedo_color = new Color(1, 1, 1, 128 / 255); // Ensure full brightness with your desired alpha
          break;
      }
    }
    if (animatedMaterials.length) {
      this.animateTextures(animatedMaterials);
    }
  }

  private async animateTextures(
    materials: StandardMaterial3D[]
  ): Promise<void> {
    interface AnimationMaterial {
      frames: string[];
      currentFrame: number;
      material: StandardMaterial3D;
    }

    interface AnimationTimerEntry {
      animatedMaterials: AnimationMaterial[];
    }

    type AnimationTimerMap = {
      [animationDelay: number]: AnimationTimerEntry;
    };

    const animationTimerMap: AnimationTimerMap = {};
    for (const material of materials) {
      const meta = material
        .get_meta("extras")
        .toObject() as AnimatedTextureMeta;
      if (!animationTimerMap[meta.animationDelay]) {
        animationTimerMap[meta.animationDelay] = { animatedMaterials: [] };
      }
      animationTimerMap[meta.animationDelay].animatedMaterials.push({
        frames: meta.frames,
        currentFrame: 0,
        material,
      });
    }
    for (const [delay, entry] of Object.entries(animationTimerMap)) {
      this.animationIntervals.push(
        setInterval(async () => {
          for (const animatedMaterial of entry.animatedMaterials) {
            const newTexture = await this.loadNewTexture(
              animatedMaterial.frames[animatedMaterial.currentFrame]
            );
            if (newTexture instanceof Texture2D) {
              animatedMaterial.material.albedo_texture = newTexture;
            }
            animatedMaterial.currentFrame =
              animatedMaterial.currentFrame + 1 ===
              animatedMaterial.frames.length
                ? 0
                : animatedMaterial.currentFrame + 1;
          }
        }, +delay * 2) as unknown as number
      );
    }
  }

  private setupAnimations(rootNode: Node3D): void {
    const findAnimationPlayer = (node: Node): AnimationPlayer | undefined => {
      if (node instanceof AnimationPlayer) {
        return node;
      }
      for (const child of node.get_children()) {
        const result = findAnimationPlayer(child);
        if (result) return result;
      }
    };

    this.animationPlayer = findAnimationPlayer(rootNode);
    if (this.animationPlayer) {
      const animations = this.animationPlayer.get_animation_list();
      if (animations.size() > 0) {
        const animationName = animations.get(0);
        const animation = this.animationPlayer.get_animation(animationName);
        if (animation) {
          animation.loop_mode = Animation.LoopMode.LOOP_LINEAR;
        }
        this.animationPlayer.play(animationName);
      }
    }
  }

  private traverseAndSwapTextures(node: Node3D): void {
    if (node instanceof MeshInstance3D) {
      const mesh = node.mesh;
      if (mesh) {
        const surfaceCount = mesh.get_surface_count();
        for (let i = 0; i < surfaceCount; i++) {
          let material =
            node.get_surface_override_material(i) ||
            mesh.surface_get_material(i);
          if (material) {
            this.swapTextureForMaterial(material, node, i);
          }
        }
      }
    }

    for (const child of node.get_children()) {
      if (child instanceof Node3D) {
        this.traverseAndSwapTextures(child);
      }
    }
  }

  private async swapTextureForMaterial(
    material: any,
    meshInstance: MeshInstance3D,
    surfaceIdx: number
  ): Promise<void> {
    try {
      const newTexture = await this.loadNewTexture(material.resource_name);
      if (
        material instanceof StandardMaterial3D &&
        newTexture instanceof Texture2D
      ) {
        material.albedo_texture = newTexture;

        if (!meshInstance.get_surface_override_material(surfaceIdx)) {
          meshInstance.set_surface_override_material(surfaceIdx, material);
        }
        if (newTexture.flip_y) {
          material.uv1_scale = new Vector3(1, -1, 1);
        }
      } else {
        console.log(
          "Material is not a StandardMaterial3D or missing texture. Skipping texture swap.",
          material.resource_name
        );
      }
    } catch (err) {
      console.error("Failed to swap texture:", err);
    }
  }

  private async loadNewTexture(
    name: string
  ): Promise<Resource | undefined | null> {
    const cached = TextureCache.get(name);
    if (cached) {
      return cached;
    }
    const buffer = await FileSystem.getFileBytes(
      `eqrequiem/textures/${name}.dds`
    );
    if (!buffer) {
      return null;
    }
    const image = new Image();
    let err;
    let needFlip = false;
    if (new DataView(buffer).getUint16(0, true) === 0x4d42) {
      console.log("Load name as bmp`", name);

      err = image.load_bmp_from_buffer(buffer);
      needFlip = true;
    } else {
      console.log("Load name as dds`", name);

      err = image.load_dds_from_buffer(buffer);
    }
    if (err !== 0) {
      console.error("Error loading image from buffer:", err);
      return null;
    }
    const img = ImageTexture.create_from_image(
      image
    ) as unknown as Texture2D & { flip_y: boolean };
    TextureCache.set(name, img);
    img.flip_y = needFlip;
    return img;
  }

  public async createPackedScene(): Promise<PackedScene | undefined> {
    if (!this.node) {
      await this.instantiate();
    }
    if (this.node) {
      const ps = new PackedScene();
      ps.pack(this.node);
      this.packedScene = ps;
      return ps;
    }
    return undefined;
  }

  public instancePackedScene(): Node | undefined {
    if (this.packedScene) {
      const instance = this.packedScene.instantiate();
      this.setupAnimations(instance as Node3D);
      return instance;
    } else {
      console.log("PackedScene not available. Call createPackedScene() first.");
      return undefined;
    }
  }
}

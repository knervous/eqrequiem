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
  CharacterBody3D,
  CollisionShape3D,
  CapsuleShape3D,
  Skeleton3D,
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

export type LoaderOptions = {
  flipTextureY: boolean;
  secondaryMeshIndex: number;
  shadow: boolean;
};

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
  protected model: string = "";
  protected folder: string = "";
  protected node: Node3D | undefined; // This will now be the CharacterBody3D root
  protected gltfNode: Node3D | undefined; // The GLTF scene node
  protected packedScene: PackedScene | undefined;
  protected animationPlayer: AnimationPlayer | undefined;
  protected animationIntervals: number[] = [];

  protected LoaderOptions = {
    flipTextureY: false,
    secondaryMeshIndex: 0,
  } as LoaderOptions;

  constructor(folder: string, model: string, usePhysics: boolean = false) {
    this.folder = folder;
    this.model = model;
    if (usePhysics) {
      this.node = new CharacterBody3D(); // Root is now a CharacterBody3D
    }
  }

  public dispose() {
    this.animationIntervals.forEach(clearInterval);
  }

  public getNode() {
    return this.node;
  }

  public getGltfNode() {
    return this.gltfNode; // Access the GLTF visual node
  }

  public getMesh(): MeshInstance3D | undefined {
    if (!this.gltfNode) return;
    const traverseChildren = (rootNode: Node): MeshInstance3D | undefined => {
      for (const child of rootNode.get_children()) {
        if (child instanceof MeshInstance3D) return child;
        const result = traverseChildren(child);
        if (result) return result;
      }
    };
    return traverseChildren(this.gltfNode);
  }

  public async instantiateSecondaryMesh(): Promise<void> {
    if (!this.gltfNode) {
      console.log("No gltfNode available for secondary mesh instantiation");
      return;
    }

    const secondaryMeshes = (this.gltfNode
      .get_child(0)
      ?.get_meta("extras")
      ?.toObject()?.secondaryMeshes ?? 0) as number;

    if (secondaryMeshes <= 0) {
      return;
    }

    const path = `eqrequiem/${this.folder}/${this.model.slice(0, 3)}he${(
      this.LoaderOptions.secondaryMeshIndex ?? 0
    )
      .toString()
      .padStart(2, "0")}.glb`;
    console.log("Loading secondary mesh from", path);

    const buffer = await FileSystem.getFileBytes(path);
    if (!buffer) {
      console.log("Failed to load buffer for", path);
      return;
    }

    const gltfState = new GLTFState();
    const gltfDocument = new GLTFDocument();
    const result = gltfDocument.append_from_buffer(buffer, "/", gltfState);

    if (result !== GError.OK) {
      console.log("Error appending secondary GLTF buffer:", result);
      return;
    }

    const secondaryRootNode = gltfDocument.generate_scene(gltfState) as Node3D;
    if (!secondaryRootNode) {
      console.log("Failed to generate secondary scene");
      return;
    }

    this.traverseAndSwapTextures(secondaryRootNode);

    const targetParent = this.gltfNode.getNodesOfType(Node3D)[0];
    if (!targetParent) {
      console.log("No target parent (first child) found in gltfNode");
      secondaryRootNode.queue_free();
      return;
    }
    const primarySkeleton = this.gltfNode.getNodesOfType(Skeleton3D)[0];
    if (!primarySkeleton) {
      console.log("No Skeleton3D found in primary model");
      secondaryRootNode.queue_free();
      return;
    }
    console.log(
      "Primary skeleton found:",
      primarySkeleton.get_path().get_concatenated_names()
    );
    const meshes = secondaryRootNode.getNodesOfType(MeshInstance3D);
    if (meshes.length === 0) {
      console.log("No MeshInstance3D nodes found in secondary model");
    } else {
      console.log(`Found ${meshes.length} meshes to reparent`);
      for (const mesh of meshes) {
        console.log(`Reparenting mesh: ${mesh.get_name()}`);
        mesh.skeleton = '..';
        mesh.reparent(primarySkeleton, false);
        mesh.owner = primarySkeleton;
      }
    }

    secondaryRootNode.queue_free();
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
      this.parseMaterials(gltfState);
      const rootNode = gltfDocument.generate_scene(gltfState) as Node3D;
      if (rootNode) {
        this.traverseAndSwapTextures(rootNode);
        this.gltfNode = rootNode;
        await this.instantiateSecondaryMesh();
        if (this.node instanceof CharacterBody3D) {
          this.node.add_child(this.gltfNode);
          this.gltfNode.position = Vector3.ZERO;
        } else {
          this.node = rootNode;
        }
        if (this.node instanceof CharacterBody3D) {
          const collisionShape = new CollisionShape3D();
          const capsule = new CapsuleShape3D();
          capsule.height = 2.0;
          capsule.radius = 0.5;
          collisionShape.shape = capsule;
          this.node.add_child(collisionShape);
        }
        this.setupAnimations(rootNode);
        // rootNode.getNodesOfType(MeshInstance3D).forEach((mesh) => {
        //   mesh.cast_shadow = MeshInstance3D.ShadowCastingSetting.SHADOW_CASTING_SETTING_OFF;
        // });
        return this.node;
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
        const enforcedAlpha = forceAlpha / 255;
        const currentColor = material.albedo_color;
        currentColor.a = enforcedAlpha;
        material.albedo_color = currentColor;

        material.transparency = 1;
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

      // material.shading_mode = StandardMaterial3D.ShadingMode.SHAD_;

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
    if (!rootNode) {
      return;
    }
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
      err = image.load_bmp_from_buffer(buffer);
      needFlip = true;
    } else {
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
    if (this.LoaderOptions.flipTextureY) {
      img.flip_y = !img.flip_y;
    }
    return img;
  }

  public async createPackedScene(): Promise<PackedScene | undefined> {
    if (!this.node) {
      await this.instantiate();
    }
    if (this.node) {
      const ps = new PackedScene();
      ps.pack(this.node); // Pack the root (CharacterBody3D or GLTF Node3D)
      this.packedScene = ps;
      return ps;
    }
    return undefined;
  }

  public instancePackedScene(): Node | undefined {
    if (this.packedScene) {
      const instance = this.packedScene.instantiate();
      if (instance instanceof CharacterBody3D) {
        this.node = instance;
        this.gltfNode = instance.get_children().get(0) as Node3D; // Assume first child is GLTF node
      } else {
        this.node = instance as Node3D;
        this.gltfNode = this.node;
      }
      this.setupAnimations(this.gltfNode);
      return instance;
    } else {
      console.log("PackedScene not available. Call createPackedScene() first.");
      return undefined;
    }
  }
}

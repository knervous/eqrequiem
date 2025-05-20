import {
  GLTFDocument,
  GLTFState,
  MeshInstance3D,
  Node,
  Node3D,
  PackedScene,
  StandardMaterial3D,
  Vector3,
  AnimationPlayer,
  Animation,
  Texture2D,
  CharacterBody3D,
  CollisionShape3D,
  CapsuleShape3D,
  Skeleton3D,
  GeometryInstance3D,
  BaseMaterial3D,
  StaticBody3D,
  Color,
} from "godot";
import { FileSystem } from "../FileSystem/filesystem";
import {
  createConcaveShapeFromMesh,
  getMeshAABB,
} from "./gltf-utilities";
import { getMaterialsByName, loadNewTexture } from "./image-utilities";
import "../Util/extensions";

type AnimatedTextureMeta = {
  animationDelay: number;
  frames: string[];
  eqShader: string;
  file: string;
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
  cullRange: number;
  doCull: boolean;
  useStaticPhysics: boolean;
  useCapsulePhysics: boolean;
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
  protected secondaryNode: Node3D | undefined; // This will now be the CharacterBody3D root
  protected gltfNode: Node3D | undefined; // The GLTF scene node
  public packedScene: PackedScene | undefined;
  protected animationPlayer: AnimationPlayer | undefined;
  protected animationIntervals: number[] = [];

  public LoaderOptions = {
    flipTextureY: false,
    secondaryMeshIndex: 0,
    shadow: false,
    cullRange: 750,
    doCull: true,
    useStaticPhysics: false,
    useCapsulePhysics: false,
  } as Partial<LoaderOptions>;

  constructor(
    folder: string,
    model: string,
    options: Partial<LoaderOptions> | undefined,
  ) {
    this.folder = folder;
    this.model = model;
    if (options) {
      this.LoaderOptions = options;
    }
    if (this.LoaderOptions.useStaticPhysics) {
      this.node = new StaticBody3D();
    } else if (this.LoaderOptions.useCapsulePhysics) {
      this.node = new CharacterBody3D(); // Root is now a CharacterBody3D
    }
  }

  public dispose() {
    // if (is_instance_valid(this.node)) {
    this.node?.queue_free();
    // }
    // if (is_instance_valid(this.gltfNode)) {
    this.gltfNode?.queue_free();
    // }
    this.animationIntervals.forEach(clearInterval);
  }

  public getHead() {
    return this.secondaryNode;
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

  // New method to apply visibility range to all MeshInstance3D nodes
  private applyVisibilityRange(node: Node3D): void {
    if (node instanceof MeshInstance3D && this.LoaderOptions.doCull) {
      node.visibility_range_end = this.LoaderOptions.cullRange; // Cull beyond this distance
      node.visibility_range_end_margin = 25.0; // Optional: buffer for smoother culling
      // Optional: Add fade-out effect
      node.visibility_range_fade_mode =
        GeometryInstance3D.VisibilityRangeFadeMode.VISIBILITY_RANGE_FADE_SELF;
      node.visibility_range_begin = 25.0; // Start fading 10m before end
      node.visibility_range_begin_margin = 20.0; // Start fading 10m before end
    }

    for (const child of node.get_children()) {
      if (child instanceof Node3D) {
        this.applyVisibilityRange(child);
      }
    }
  }

  private getExtras(node: any): object {
    if (!node.has_meta("extras")) {
      return {};
    }
    const extras = node.get_meta("extras");
    if (extras) {
      return extras.toObject();
    } else {
      return {};
    }
  }

  public async instantiateSecondaryMesh(): Promise<void> {
    if (!this.gltfNode) {
      console.log("No gltfNode available for secondary mesh instantiation");
      return;
    }

    const secondaryMeshes = (this.getExtras(this.gltfNode.get_child(0))
      ?.secondaryMeshes ?? 0) as number;

    if (secondaryMeshes <= 0) {
      return;
    }

    const path = `eqrequiem/${this.folder}`;
    const fileName = `${this.model.slice(0, 3)}he${(
      this.LoaderOptions.secondaryMeshIndex ?? 0
    )
      .toString()
      .padStart(2, "0")}.glb`.toLowerCase();
    console.log("Loading secondary mesh from", path, fileName);

    const buffer = await FileSystem.getFileBytes(path, fileName);
    if (!buffer) {
      console.log("Failed to load buffer for", path, fileName);
      return;
    }

    const gltfState = new GLTFState();
    const gltfDocument = new GLTFDocument();
    try {
      const result = gltfDocument.append_from_buffer(buffer, "/", gltfState);

      if (result !== 0) {
        console.log("Error appending secondary GLTF buffer:", result);
        return;
      }
  
    } catch(e) {
      console.error("Error creating secondary GLTFDocument:", e);
    }

    const secondaryRootNode = gltfDocument.generate_scene(gltfState) as Node3D;
    if (!secondaryRootNode) {
      console.log("Failed to generate secondary scene");
      return;
    }
    await this.traverseAndSwapTextures(secondaryRootNode);

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

    const meshes = secondaryRootNode.getNodesOfType(MeshInstance3D);
    if (meshes.length === 0) {
      console.log("No MeshInstance3D nodes found in secondary model");
    } else {
      for (const mesh of meshes) {
        this.secondaryNode = this.secondaryNode || mesh;
        mesh.skeleton = "..";
        mesh.reparent(primarySkeleton, false);
        mesh.owner = this.gltfNode;      // <-- make the root the owner
      }
    }

    secondaryRootNode.queue_free();
  }

  public async instantiate(): Promise<Node3D | undefined> {
    const buffer = await FileSystem.getFileBytes(
      `eqrequiem/${this.folder}`,
      `${this.model.toLowerCase()}.glb`,
    );
    if (!buffer) {
      console.warn("Buffer not found!");
      return;
    }

    const gltfState = new GLTFState();
    const gltfDocument = new GLTFDocument();
    const result = gltfDocument.append_from_buffer(buffer, "/", gltfState);
    if (result === 0) {
      this.parseMaterials(gltfState);
      const rootNode = gltfDocument.generate_scene(gltfState) as Node3D;
      if (rootNode) {
        await this.traverseAndSwapTextures(rootNode).catch((e) => {
          console.log("Error traversing and swapping textures:", e);
        });
        this.gltfNode = rootNode;
        await this.instantiateSecondaryMesh();
        if (this.node instanceof CharacterBody3D) {
          this.node.add_child(this.gltfNode);
          this.gltfNode.position = Vector3.ZERO;
        } else if (this.node instanceof StaticBody3D) {
          this.node.add_child(this.gltfNode);
          this.gltfNode.position = Vector3.ZERO;
          // Find all MeshInstance3D nodes to generate collision shapes
          const meshInstances = this.gltfNode.getNodesOfType(MeshInstance3D);
          for (const meshInstance of meshInstances) {
            const concaveShape = createConcaveShapeFromMesh(meshInstance);
            if (concaveShape) {
              const collisionShape = new CollisionShape3D();
              collisionShape.shape = concaveShape;
              this.node.add_child(collisionShape);
            }
          }
        } else {
          this.node = rootNode;
        }
        
        if (this.node instanceof CharacterBody3D) {
          const aabb = getMeshAABB(this.gltfNode);
          const collisionShape = new CollisionShape3D();
          const capsule = new CapsuleShape3D();

          if (aabb) {
            const size = aabb.size;
            capsule.height = size.y;
            capsule.radius = Math.max(size.x, size.z) / 2;
            const aabbCenter = aabb.position.add(aabb.size.multiplyScalar(0.5));
            collisionShape.position = new Vector3(0, aabbCenter.y - 1, 0);
          } else {
            // Fallback to default values if AABB calculation fails
            capsule.height = 3.0;
            capsule.radius = 0.5;
            console.log(
              "Failed to compute AABB, using default capsule dimensions",
            );
          }
          collisionShape.shape = capsule;
          this.node.add_child(collisionShape);
        }
        this.setupAnimations(rootNode);
        // rootNode.getNodesOfType(MeshInstance3D).forEach((mesh) => {
        //   mesh.cast_shadow = MeshInstance3D.ShadowCastingSetting.SHADOW_CASTING_SETTING_OFF;
        // });
        this.applyVisibilityRange(rootNode);
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
    const animatedMaterials: StandardMaterial3D[] = [];

    for (let i = 0; i < materials.size(); i++) {
      const material = materials.get(i) as StandardMaterial3D;
      const meta = this.getExtras(material) as AnimatedTextureMeta;
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
      material.shading_mode = BaseMaterial3D.ShadingMode.SHADING_MODE_PER_PIXEL;
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
          material.shading_mode = 0;
          material.transparency = 1; // Ensure transparency is enabled
          material.blend_mode = 0; // Ensure transparency is enabled
          material.alpha_scissor_threshold = 128 / 255; // Consistent with your AlphaShaderMap
          material.distance_fade_mode = 0;// Disable distance fading
          //material.no_depth_test = true; // Render on top, ignoring depth (optional, for skydome visibility)
          material.albedo_color = new Color(1, 1, 1, 128 / 255); // Ensure full brightness with your desired alpha
          break;
      }

      // material.shading_mode = StandardMaterial3D.ShadingMode.SHAD_;
    }
    if (animatedMaterials.length) {
      this.animateTextures(animatedMaterials);
    }
  }

  public attachToExistingNode(node: Node3D): void {
    // Set the root node
    this.node = node;

    // Assume the first child of `node` is the GLTF visual root
    const gltfChild = node.get_child(0);
    if (gltfChild instanceof Node3D) {
      this.gltfNode = gltfChild;
    }

    // Re-apply visibility culling on all MeshInstance3D children
    if (this.gltfNode) {
      this.applyVisibilityRange(this.gltfNode);
    }

    // Re-setup animations so playIdle, etc. work
    this.setupAnimations(this.gltfNode ?? node, true);

    // (Optional) if you had a nameplate or other UI-subnodes, reattach or recreate
    // e.g., this.setNameplate(currentNameplateText);
  }

  private async animateTextures(
    materials: StandardMaterial3D[],
  ): Promise<void> {
    interface AnimationMaterial {
      frames: string[];
      currentFrame: number;
      material: StandardMaterial3D;
      file: string;
    }

    interface AnimationTimerEntry {
      animatedMaterials: AnimationMaterial[];
    }

    type AnimationTimerMap = {
      [animationDelay: number]: AnimationTimerEntry;
    };

    const animationTimerMap: AnimationTimerMap = {};
    for (const material of materials) {
      const meta = this.getExtras(material) as AnimatedTextureMeta;
      if (!animationTimerMap[meta.animationDelay]) {
        animationTimerMap[meta.animationDelay] = { animatedMaterials: [] };
      }
      animationTimerMap[meta.animationDelay].animatedMaterials.push({
        frames: meta.frames,
        currentFrame: 0,
        material,
        file: meta.file,
      });
    }
    for (const [delay, entry] of Object.entries(animationTimerMap)) {
      this.animationIntervals.push(
        setInterval(async () => {
          for (const animatedMaterial of entry.animatedMaterials) {
            const newTexture = await loadNewTexture(
              animatedMaterial.file,
              animatedMaterial.frames[animatedMaterial.currentFrame],
              this.LoaderOptions.flipTextureY,
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
        }, +delay * 2) as unknown as number,
      );
    }
  }

  protected findAnimationPlayer = (node: Node): AnimationPlayer | undefined => {
    if (node instanceof AnimationPlayer) {
      return node;
    }
    for (const child of node.get_children()) {
      const result = this.findAnimationPlayer(child);
      if (result) return result;
    }
  };

  private setupAnimations(rootNode: Node3D, forInstance: boolean = false, autoplay = true): void {
    if (!rootNode) {
      return;
    }

    this.animationPlayer = this.animationPlayer || this.findAnimationPlayer(rootNode);
    let animPlayer = this.animationPlayer;
    if (animPlayer) {
      if (forInstance) {
        animPlayer = animPlayer.duplicate()!;
        const parent = rootNode.get_parent() ?? rootNode;
        parent.add_child(animPlayer!);
      }
      const animation = animPlayer?.has_animation('pos') && animPlayer?.get_animation('pos');
      if (autoplay && animation && animPlayer !== undefined) {
        animation.loop_mode = Animation.LoopMode.LOOP_LINEAR;
        animPlayer.play('pos');
      }
    }
  }

  getMaterialsByName(regex: RegExp) {
    return getMaterialsByName(this.node as MeshInstance3D, regex);
  }

  private async traverseAndSwapTextures(node: Node3D): Promise<void> {
    if (node instanceof MeshInstance3D) {
      const mesh = node.mesh;
      if (mesh) {
        const surfaceCount = mesh.get_surface_count();
        for (let i = 0; i < surfaceCount; i++) {
          const material =
            node.get_surface_override_material(i) ||
            mesh.surface_get_material(i);
          if (material) {
            await this.swapTextureForMaterial(material);
          }
        }
      }
    }
    for (const child of node.get_children()) {
      if (child instanceof Node3D) {
        await this.traverseAndSwapTextures(child);
      }
    }
  }

  public async swapTextureForMaterial(
    material: any,
    file: string = "",
  ): Promise<void> {
    try {
      const meta = this.getExtras(material) as AnimatedTextureMeta;
      const newTexture = await loadNewTexture(
        meta.file,
        file || material.resource_name,
        this.LoaderOptions.flipTextureY,
      );
      if (
        material instanceof StandardMaterial3D &&
        newTexture instanceof Texture2D
      ) {
        material.albedo_texture = newTexture;

        if (newTexture.flip_y) {
          material.uv1_scale = new Vector3(1, -1, 1);
        }
      } else {
        console.warn(
          "Material is not a StandardMaterial3D or missing texture. Skipping texture swap.",
          material.resource_name,
        );
      }
    } catch (err) {
      console.error("Failed to swap texture:", err);
    }
  }

  public async createPackedEntityScene(): Promise<PackedScene | undefined> {
    await this.instantiate();
    const ps = new PackedScene();
    if (!this.node) {
      return;
    }
    // Verify AnimationPlayer presence
    const animationPlayer = this.node.getNodesOfType(AnimationPlayer)[0];
    this.animationPlayer = animationPlayer;

    ps.pack(this.node);
    this.packedScene = ps;
    return ps;
  }

  public async createPackedScene(): Promise<PackedScene | undefined> {
    await this.instantiate();
    const ps = new PackedScene();
    if (!this.gltfNode) {
      //console.log("No gltfNode to pack");
      return;
    }
    // Verify AnimationPlayer presence
    const animationPlayer = this.gltfNode.getNodesOfType(AnimationPlayer)[0];
    if (!animationPlayer) {
    //  console.log("Warning: No AnimationPlayer found in gltfNode before packing");
    } else {
      //console.log("AnimationPlayer present in gltfNode:",  animationPlayer.get_path().get_concatenated_names());
      this.animationPlayer = animationPlayer;

    }
    ps.pack(this.gltfNode);
    this.packedScene = ps;
    return ps;
  }

  public instancePackedActorScene(): Node | undefined {
    if (this.packedScene) {
      const instance = this.packedScene.instantiate() as Node3D;

      this.setupAnimations(instance, true, false);
      return instance;
    } else {
      console.log("PackedScene not available. Call createPackedScene() first.");
      return undefined;
    }
  }
  public instancePackedScene(rootNode: Node3D, usePhysics: boolean): Node | undefined {
    if (this.packedScene) {
      const instance = this.packedScene.instantiate().get_child(0) as Node3D;
      if (usePhysics) {
        const staticBody = new StaticBody3D();
        rootNode.add_child(staticBody);
        instance.reparent(staticBody, false);
      } else {
        instance.reparent(rootNode, false);
      }
      this.setupAnimations(instance, true);
      return instance;
    } else {
      console.log("PackedScene not available. Call createPackedScene() first.");
      return undefined;
    }
  }
}

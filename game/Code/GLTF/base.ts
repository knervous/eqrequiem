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
} from "godot";
import { FileSystem } from "../FileSystem/filesystem";
import { TextureCache } from "../Util/texture-cache";
import "../Util/extensions";

type AnimatedTextureMeta = {
  animationDelay: number;
  frames: string[];
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

  public async instantiate(): Promise<Node | undefined> {
    const buffer = await FileSystem.getFileBytes(
      `eqsage/${this.folder}/${this.model}.glb`
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

      const rootNode = gltfDocument.generate_scene(gltfState);
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
      const material = materials.get(i);
      const meta = material
        .get_meta("extras")
        ?.toObject() as AnimatedTextureMeta;
      if (meta?.animationDelay) {
        animatedMaterials.push(material);
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
        material.uv1_scale = new Vector3(1, -1, 1);
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
    const buffer = await FileSystem.getFileBytes(`eqsage/textures/${name}.png`);
    if (!buffer) {
      return null;
    }
    const image = new Image();
    const err = image.load_png_from_buffer(buffer);
    if (err !== 0) {
      console.error("Error loading image from buffer:", err);
      return null;
    }
    const img = ImageTexture.create_from_image(image);
    TextureCache.set(name, img);
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

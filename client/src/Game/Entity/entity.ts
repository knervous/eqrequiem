import { Animation, Callable, Label3D, Vector3, Color, Node3D, MeshInstance3D, StandardMaterial3D, Material, Texture2D } from "godot";
import { AnimationDefinitions } from "../Animation/animation-constants";
import { Spawn } from "@game/Net/internal/api/capnp/common";
import EntityBase from "./entity-base";
import { loadNewTexture } from "@game/GLTF/image-utilities";

const prefixes = {
  Face: 'he',
  Chest: 'ch',
  Arms: 'ua',
  Wrists: 'fa',
  Legs: 'lg',
  Hands: 'hn',
  Feet: 'ft',
  Helm: 'he',
};

// Material cache to store cloned materials by texture name
const materialCache: Map<string, Material> = new Map();

export default class Entity extends EntityBase {
  public animations: string[] = [];
  public currentAnimation: string = "";
  public currentPlayToEnd: boolean = false;
  public data: Spawn | null = null;
  private nameplate: Label3D | null = null;

  constructor(folder: string, model: string) {
    super(folder, model);
  }

  public clone(instance: Node3D, data: Spawn): Entity {
    const clone = new Entity(this.folder, this.model);
    clone.animationPlayer = this.findAnimationPlayer(instance);
    clone.animations = clone.animationPlayer?.get_animation_list().toArray() ?? [];
    clone.data = data;
    clone.node = instance;
    return clone;
  }

  public swapFace(index: number) {
    const mats = this.getMaterialsByName(/he00/);
    mats.forEach((m) => {
      this.swapTextureForMaterial(m, m.resource_name.replace(/he00\d{1}/, `${prefixes.Face}00${index}`));
    });
  }

  public setNameplate(text: string): void {
    if (!this.nameplate) {
      this.nameplate = new Label3D();
      this.nameplate.billboard = 1;
      this.getNode()?.add_child(this.nameplate);
      this.nameplate.position = new Vector3(0, 4, 0);
      this.nameplate.font_size = 50.5;
      this.nameplate.modulate = new Color(0.5, 0.5, 1, 1);
    }
    this.nameplate.text = text;
  }

  public async setNPCTexture() {
    if (!this.data?.isNpc) {
      return;
    }
    const textureType = this.data?.equipChest.toString().padStart(2, "0");
    const node = this.getNode();
    if (!node) return;

    // Traverse MeshInstance3D nodes to find and update materials
    await this.traverseAndUpdateMaterials(node, textureType);
  }

  // Traverse node hierarchy to find MeshInstance3D nodes and update their materials
  private async traverseAndUpdateMaterials(node: Node3D, textureType: string): Promise<void> {
    if (node instanceof MeshInstance3D) {
      const mesh = node.mesh;
      if (mesh) {
        const surfaceCount = mesh.get_surface_count();
        for (let i = 0; i < surfaceCount; i++) {
          const material =
            node.get_surface_override_material(i) ||
            mesh.surface_get_material(i);
          if (material && material.resource_name.startsWith(this.model.toLowerCase())) {
            const name = material.resource_name;
            const suffix = name.slice(name.length - 4, name.length);
            if (!suffix.startsWith(textureType)) {
              // Generate the desired texture name
              const newTextureName = `${name.slice(0, -4)}${textureType}${suffix.slice(2)}`;

              // Check if we have a cached material for this texture
              let newMaterial = materialCache.get(newTextureName);
              if (!newMaterial) {
                // Clone the material to avoid modifying the shared one
                newMaterial = material.duplicate() as Material;
                // Swap the texture for the cloned material
                await this.swapTextureForMaterial(newMaterial, newTextureName);
                // Cache the cloned material
                materialCache.set(newTextureName, newMaterial);
              }

              // Apply the cloned or cached material as an override
              node.set_surface_override_material(i, newMaterial);
            }
          }
        }
      }
    }

    // Recursively traverse children
    for (const child of node.get_children()) {
      if (child instanceof Node3D) {
        await this.traverseAndUpdateMaterials(child, textureType);
      }
    }
  }

  // Adapted from BaseGltfModel's swapTextureForMaterial
  public async swapTextureForMaterial(material: any, file: string = ""): Promise<void> {
    try {
      const meta = material.has_meta("extras") ? material.get_meta("extras").toObject() : {};
      const newTexture = await loadNewTexture(
        meta.file || `eqrequiem/${this.folder}`,
        file || material.resource_name,
        true,
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

  public playAnimation(
    animationName: string,
    loop_mode: Animation.LoopMode = Animation.LoopMode.LOOP_LINEAR,
    playToEnd: boolean = false,
  ) {
    if (
      !this.animationPlayer ||
      !this.animations.includes(animationName) ||
      animationName === this.currentAnimation ||
      this.currentPlayToEnd
    ) {
      return;
    }
    const animation = this.animationPlayer.get_animation(animationName);
    if (animation) {
      if (playToEnd) {
        this.currentPlayToEnd = true;
      }
      animation.loop_mode = loop_mode;
      this.animationPlayer.stop();
      this.animationPlayer.play(animationName);
      this.currentAnimation = animationName;
      if (this.currentPlayToEnd) {
        this.animationPlayer.connect(
          "animation_finished",
          Callable.create(() => {
            this.currentPlayToEnd = false;
          }),
        );
      }
    }
  }

  public playStationaryJump() {
    this.playAnimation(AnimationDefinitions.StationaryJump, Animation.LoopMode.LOOP_NONE, true);
  }
  public playJump() {
    this.playAnimation(AnimationDefinitions.RunningJump, Animation.LoopMode.LOOP_NONE, true);
  }
  public playWalk() {
    this.playAnimation(AnimationDefinitions.Walking);
  }
  public playRun() {
    this.playAnimation(AnimationDefinitions.Running);
  }
  public playDuckWalk() {
    this.playAnimation(AnimationDefinitions.DuckWalking, Animation.LoopMode.LOOP_NONE);
  }
  public playShuffle() {
    this.playAnimation(
      AnimationDefinitions.ShuffleRotate,
      Animation.LoopMode.LOOP_NONE,
    );
  }
  public playIdle() {
    this.playAnimation(AnimationDefinitions.Idle2);
  }
  public Load() {
    this.animations =
      this.animationPlayer?.get_animation_list().toArray() ?? [];
    this.playIdle();
  }

  public setPosition(position: Vector3) {
    const node = this.getNode();
    if (node) {
      node.global_position = position;
    }
  }
  public setRotation(rotation: Vector3) {
    const node = this.getNode();
    if (node) {
      node.rotation_degrees = rotation;
    }
  }
  public setScale(scale: Vector3) {
    const node = this.getNode();
    if (node) {
      node.scale = scale;
    }
  }
}
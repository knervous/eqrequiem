import { Animation, Callable, Label3D, Vector3, Color } from "godot";
import { BaseGltfModel, LoaderOptions } from "../GLTF/base";
import { AnimationDefinitions } from "../Animation/animation-constants";
import { EntityAnimation, Spawn } from "@game/Net/internal/api/capnp/common";
import { WorldSocket } from "@ui/net/instances";
import { OpCodes } from "@game/Net/opcodes";
import { PlayerProfile } from "@game/Net/internal/api/capnp/player";


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


export default class Actor extends BaseGltfModel {
  public animations: string[] = [];
  public currentAnimation: string = ""; 
  public currentPlayToEnd: boolean = false;
  public data: Spawn | PlayerProfile | null = null;
  static actorOptions: Partial<LoaderOptions> = {
    flipTextureY: true,
    shadow: false, 
    cullRange: 250,
    doCull: true,
    useCapsulePhysics: true,
  };

  // Nameplate node (a Label3D) and its backing string.
  private nameplate: Label3D | null = null;
  
  constructor(folder: string, model: string, options: Partial<LoaderOptions> = Actor.actorOptions) {
    super(folder, model, options);
  }

  public swapFace(index: number) {
    const mats = this.getMaterialsByName(/he00/);
    mats.forEach((m) => {
      this.swapTextureForMaterial(m, m.resource_name.replace(/he00\d{1}/, `${prefixes.Face}00${index}`));
    });
  }

  // Public setter to update the nameplate text.
  public setNameplate(text: string): void {
    if (!this.nameplate) {
      // Create the Label3D node for the nameplate if it doesn't exist.
      this.nameplate = new Label3D();
      this.nameplate.billboard = 1;
      this.getNode()?.add_child(this.nameplate);
      // Position the nameplate above the actor (adjust offset as needed).
      this.nameplate.position = new Vector3(0, 4, 0);
      this.nameplate.font_size = 50.5; // Set the font size for the nameplate.
      this.nameplate.modulate = new Color(0.5, 0.5, 1, 1);

      // Optionally, configure additional Label3D properties (font size, color, etc.)
    }
    this.nameplate.text = text;
  }

  public playAnimation(
    animationName: string,
    loop_mode: Animation.LoopMode = Animation.LoopMode.LOOP_LINEAR,
    playToEnd: boolean = false,
  ) {
    if (
      !this.animationPlayer ||
      animationName === this.currentAnimation ||
      this.currentPlayToEnd
    ) {
      return;
    }
    const animation = this.animationPlayer.has_animation(animationName) && this.animationPlayer.get_animation(animationName);
    if (animation) {
      if (playToEnd) {
        this.currentPlayToEnd = true;
      }
      animation.loop_mode = loop_mode;
      this.animationPlayer.stop();
      this.animationPlayer.play(animationName);
      this.currentAnimation = animationName;
      if (this.data) {
        WorldSocket.sendMessage(OpCodes.Animation, EntityAnimation, {
          spawnId: this.data?.spawnId,
          animation: animationName,
        });
      }
      if (this.currentPlayToEnd) {
        this.animationPlayer.connect(
          "animation_finished",
          Callable.create((event) => {
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

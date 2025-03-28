import { Animation, Callable, PackedByteArray } from "godot";
import { BaseGltfModel, LoaderOptions } from "../GLTF/base";
import { AnimationDefinitions } from "../Animation/animation-constants";

export default class Actor extends BaseGltfModel {
  protected animations: string[] = [];
  private currentAnimation: string = "";
  private currentPlayToEnd: boolean = false;
  static actorOptions: LoaderOptions = {
    flipTextureY: true,
    shadow: false,
  };
  constructor(folder: string, model: string) {
    super(folder, model, true);
    this.LoaderOptions = Actor.actorOptions;
  }

  protected playAnimation(
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
      console.log("Playing animation", animationName);
      if (playToEnd) {
        this.currentPlayToEnd = true;
      }
      animation.loop_mode = loop_mode;
      this.animationPlayer.stop();
      this.animationPlayer.play(animationName);
      this.currentAnimation = animationName;
      //animation.time
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

  protected playStationaryJump() {
    this.playAnimation(AnimationDefinitions.StationaryJump, Animation.LoopMode.LOOP_NONE, true);
  }
  protected playJump() {
    this.playAnimation(AnimationDefinitions.RunningJump, Animation.LoopMode.LOOP_NONE, true);
  }
  protected playWalk() {
    this.playAnimation(AnimationDefinitions.Walking);
  }
  protected playRun() {
    this.playAnimation(AnimationDefinitions.Running);
  }
  protected playDuckWalk() {
    this.playAnimation(AnimationDefinitions.DuckWalking, Animation.LoopMode.LOOP_NONE);
  }
  protected playShuffle() {
    this.playAnimation(
      AnimationDefinitions.ShuffleRotate,
      Animation.LoopMode.LOOP_NONE,
    );
  }

  protected playIdle() {
    this.playAnimation(AnimationDefinitions.Idle2);
  }
  public Load(name: string) {
    this.animations =
      this.animationPlayer?.get_animation_list().toArray() ?? [];
  }
}

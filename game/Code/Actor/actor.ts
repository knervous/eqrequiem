import { Animation, Callable, PackedByteArray, Label3D, Vector3, Color } from "godot";
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

  // Nameplate node (a Label3D) and its backing string.
  private nameplate: Label3D | null = null;
  
  constructor(folder: string, model: string) {
    super(folder, model, true);
    this.LoaderOptions = Actor.actorOptions;
  }

  // Public setter to update the nameplate text.
  public setNameplate(text: string): void {
    if (!this.nameplate) {
      // Create the Label3D node for the nameplate if it doesn't exist.
      this.nameplate = new Label3D();
      this.nameplate.billboard = 1;
      this.getNode().add_child(this.nameplate);
      // Position the nameplate above the actor (adjust offset as needed).
      this.nameplate.position = new Vector3(0, 4, 0);
      this.nameplate.font_size = 50.5; // Set the font size for the nameplate.
      this.nameplate.modulate = new Color(0.5, 0.5, 1, 1);

      // Optionally, configure additional Label3D properties (font size, color, etc.)
    }
    this.nameplate.text = text;
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
    this.playIdle();
  }
}

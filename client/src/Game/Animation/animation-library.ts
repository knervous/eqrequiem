import { AnimationPlayer, GLTFDocument, GLTFState, Node, Node3D } from "godot";
import { FileSystem } from "../FileSystem/filesystem";

export default class AnimationCache {
  static Cache: Record<string, AnimationPlayer> = {};

  static async getOrCreateAnimation(
    name: string,
  ): Promise<AnimationPlayer | undefined> {
    // let i = 0;
    // while (i === 0) {
    //   await new Promise(res => setTimeout(res, 500))
    // }
    await new Promise((res) => setTimeout(res, 2500));
    if (this.Cache[name]) {
      return this.Cache[name];
    }
    const animBuffer = await FileSystem.getFileBytes(
      `eqrequiem/animations`, `${name.toLowerCase()}.glb`,
    );
    if (animBuffer) {
      const gltfState = new GLTFState();
      const gltfDocument = new GLTFDocument();
      const result = gltfDocument.append_from_buffer(
        animBuffer,
        "/",
        gltfState,
      );
      if (result !== 0) {
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
      const rootNode = gltfDocument.generate_scene(gltfState) as Node3D;
      if (rootNode) {
        const animationPlayer = findAnimationPlayer(rootNode);
        console.log("++++ QUEUE FREE ++++", +rootNode.get_path());
        rootNode.queue_free();

        if (animationPlayer) {
          const targetParent = globalThis.sceneRoot?.get_node("Animations");

          if (animationPlayer.get_parent()) {
            animationPlayer.get_parent().remove_child(animationPlayer);
          }

          targetParent?.add_child(animationPlayer);
          this.Cache[name] = animationPlayer;
          return animationPlayer;
        } else {
          console.log("No animation player found");
        }
      } else {
        console.log("Error with rootNode");
      }
    }

    return;
  }
}

import godot from "godot";
import GameManager from './Manager/game-manager';

window.GameController = GameManager;

export const initializeGame = (rootNode: godot.Node3D): void => { 
  const newNode = new godot.Node();
  newNode.set_script(godot.ResourceLoader.load("res://_JS/Code/binder.js"));
  rootNode.add_child(newNode);
};
export default initializeGame;
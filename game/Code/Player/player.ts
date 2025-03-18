import Actor from "../Actor/actor";
import {
  InputMap,
  InputEventKey,
  Input,
  Vector3,
  Key
} from "godot";

export default class Player extends Actor {
move_speed: number;
  constructor(folder: string, model: string) {
    super(folder, model);
    this.move_speed = 10; // movement speed in units per second
    this.bindKeys();
  }

  // Set up key bindings for WASD
  bindKeys() {
    const actions = [
      { name: "move_forward", key: Key.KEY_UP },
      { name: "move_left", key:  Key.KEY_LEFT },
      { name: "move_backward", key:  Key.KEY_BACK },
      { name: "move_right", key:  Key.KEY_RIGHT },
    ];

    actions.forEach(({ name, key }) => {
      // Only add the action if it doesn't exist yet.
      if (!InputMap.has_action(name)) {
        InputMap.add_action(name);
        const keyEvent = new InputEventKey();
        keyEvent.keycode = key;
        InputMap.action_add_event(name, keyEvent);
      }
    });
  }

  // Called automatically every physics frame.
  _physics_process(delta: number) {
    const node = this.getNode();
    if (!node) return;

    // Build a movement vector based on key presses.
    let movement = new Vector3(0, 0, 0);
    if (Input.is_action_pressed("move_forward")) {
      movement.z -= 1;
    }
    if (Input.is_action_pressed("move_backward")) {
      movement.z += 1;
    }
    if (Input.is_action_pressed("move_left")) {
      movement.x -= 1;
    }
    if (Input.is_action_pressed("move_right")) {
      movement.x += 1;
    }

    // Normalize the vector and scale by move_speed and delta time.
    if (movement.length() > 0) {
      movement = movement.normalized().multiplyScalar(this.move_speed * delta);
      node.translate(movement);
    }
  }

  // Optional: Route _process to _physics_process for simplicity.
  _process(delta: number) {
    this._physics_process(delta);
  }

  // The Load method can start instantiation.
  public async Load(name: string) {
    await super.Load(name);
    if (!this.node) {
        return;
    }
    this.node.set_process(true);
    this.node.set_physics_process(true);
    this.node.set_process_input(true);

    // Bind lifecycle methods from this instance to the node
    this.node._physics_process = this._physics_process.bind(this);
    this.node._process = this._process.bind(this);
    this.node._input = function() {
        console.log('Called input!', arguments)
    };
  }
}
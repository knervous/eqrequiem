import { Camera3D, Color, Node3D, OmniLight3D, SphereShape3D, Vector3, Area3D, Callable, CollisionShape3D, MeshInstance3D, SphereMesh, StandardMaterial3D } from "godot";
import Player from "@game/Player/player";
import { MusicPlayer } from "./music-player";

export default class MusicManager {
  private parent: Node3D;
  private sounds: object[] = [];
  private musicAreas = new Map();
  private activeRegions: Set<number> = new Set();
  private musicContainer: Node3D;

  public constructor(parent: Node3D, sounds: object[]) {
    this.parent = parent;
    this.musicContainer = new Node3D();
    this.musicContainer.set_name("MusicContainer");
    this.parent.add_child(this.musicContainer);

    let idx = 0;
    for (const sound of sounds) {
      if (sound?.soundFile?.endsWith('.xmi')) {
        this.sounds.push(sound);
            
        const position = new Vector3(
          -sound.x,
          sound.z,
          sound.y,
        );
        
        // Create Area3D for collision detection
        const area = new Area3D();
        const collisionShape = new CollisionShape3D();
        const sphereShape = new SphereShape3D();
        sphereShape.radius = sound.activationRange; // sound.activationRange;
        sphereShape.height =  sound.activationRange; // sound.activationRange;
        collisionShape.shape = sphereShape;
        area.add_child(collisionShape);
        area.position = position;
        console.log('Area position', position);
        
        // Add visual sphere for debugging
        const meshInstance = new MeshInstance3D();
        const sphereMesh = new SphereMesh();
        sphereMesh.radius = sound.activationRange; // Match the collision sphere radius
        sphereMesh.height = sound.activationRange * 2;
        //sphereMesh.height = 1000; // Diameter = 2 * radius
        meshInstance.mesh = sphereMesh;
        
        // Create semi-transparent red material
        const material = new StandardMaterial3D();
        material.albedo_color = new Color(1, 0, 0, 0.5); // Red with 50% transparency
        //material.trans = true; // Enable transparency
        sphereMesh.material = material;
        
        meshInstance.name = `DebugSphere_${idx}`; // Name for easier identification
        area.add_child(meshInstance);
        area.collision_layer = 1; // Adjust based on your setup
        area.collision_mask = 1; // Ensure this includes the player's layer
        area.monitoring = true;
        this.musicContainer?.add_child(area);
        this.musicAreas.set(idx, area);
        
        // Connect signals for intersection detection
        const copiedIdx = idx;
        area.body_entered.connect(
          Callable.create(this.parent, (body) => this.onAreaEntered(copiedIdx, body)),
        );
        area.body_exited.connect(
          Callable.create(this.parent, (body) => this.onAreaExited(copiedIdx, body)),
        );
        idx++;
      }
    }
    console.log('sounds', this.sounds);
  }

  public dispose() {
    this.musicContainer.queue_free();
    this.musicAreas.clear();
    this.activeRegions.clear();
  }

  private onAreaEntered(musicIndex: number, body: Node) {
    if (body === Player.instance?.getNode()) {
      this.activeRegions.add(musicIndex);
      const area = this.musicAreas.get(musicIndex);
      if (area) {
        const sound = this.sounds[musicIndex];

        if (!MusicPlayer.getIsPlaying() && sound.whenActive === 2) {

          MusicPlayer.play(`${sound.soundFile}(${sound.xmiIndex})`);
        }
        console.log(`Entered region ${musicIndex} of type`, this.sounds[musicIndex]);
      }
    }
  }

  private onAreaExited(musicIndex: number, body: Node) {
    if (body === Player.instance?.getNode()) {
      this.activeRegions.delete(musicIndex);
      const area = this.musicAreas.get(musicIndex);
      if (area) {
        console.log(`Exited region ${musicIndex}`);
      }
    }
  }
}
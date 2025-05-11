import {
  Node3D,
  Vector3,
  MeshInstance3D,
  SphereMesh,
  StandardMaterial3D,
  Color,
  Label3D,
  InputEventMouseButton,
  MouseButton,
  PhysicsRayQueryParameters3D,
  AABB,
  CollisionShape3D,
  StaticBody3D,
  GArray,
  GDictionary,
  GeometryInstance3D,
} from "godot";
import ObjectMesh from "@game/Object/object-geometry";
import { EntityPositionUpdate, Spawn } from "@game/Net/internal/api/capnp/common";
import { SphereShape3D } from "@/godot-module";
import { traverseForMaterials } from "@game/GLTF/image-utilities";
import Player from "@game/Player/player";

export default class EntityPool {
  parent: Node3D;
  entities: Record<number, Spawn> = {};
  nodes : Record<number, Node3D> = {};
  entityContainer: Record<string, Promise<ObjectMesh>> = {};
  entityObjectContainer: Node3D | null = null;
  loadedPromise: Promise<void> | null = null;
  loadedPromiseResolve: () => void = () => {};
  private spawnQueue: Spawn[] = [];
  constructor(parent: Node3D) {
    this.parent = parent;
    this.loadedPromise = new Promise((res) => {
      this.loadedPromiseResolve = res;
    });
  }

  dispose() {
    if (this.entityObjectContainer) {
      this.entityObjectContainer.queue_free();
      this.entityObjectContainer = null;
    }
  }

  UpdateSpawnPosition(spawnUpdate: EntityPositionUpdate) {
    const spawnId = spawnUpdate.spawnId;
    const spawn = this.entities[spawnId];
    if (!spawn) {
      return;
    }
    spawn.x = spawnUpdate.position.x;
    spawn.y = spawnUpdate.position.y;
    spawn.z = spawnUpdate.position.z;

    const node = this.nodes[spawnId];
    if (!node) {
      return;
    }
    const staticBody = node as StaticBody3D;
    staticBody.global_position = new Vector3(-spawnUpdate.position.y, spawnUpdate.position.z, spawnUpdate.position.x);
    
    ;// = new Vector3(-spawn.y, spawn.z, spawn.x);
  }

  async Load(): Promise<void> {
    try {
      this.entityObjectContainer = new Node3D();
      this.entityObjectContainer.set_name("EntityPool");
      this.parent.add_child(this.entityObjectContainer);
      // Set the script to process input
      this.parent.set_process_input(true);
      // Bind the input handler
      this.loadedPromiseResolve();
    } catch (e) {
      console.log("Error loading objects", e);
    }
  }
  accumulatedDelta: number = 0;
  async process(delta: number) {
    this.accumulatedDelta += delta;
    if (this.accumulatedDelta < 0.1) {
      return;
    }
    this.accumulatedDelta = 0;
    const spawn = this.spawnQueue.shift();
    if (!spawn) {
      return;
    }

    this.entities[spawn.spawnId] = spawn;
  
    const staticBody = new StaticBody3D();
    staticBody.set_name(`${spawn.name}_${spawn.spawnId}`);
    staticBody.set_meta("spawnId", spawn.spawnId);
    const instance = new MeshInstance3D();
    const sphereMesh = new SphereMesh();
    sphereMesh.radius = 2.0;
    sphereMesh.height = 4.0;
    instance.mesh = sphereMesh;
  
    const material = new StandardMaterial3D();
    material.albedo_color = new Color(0, 0.5, 0.5);
    sphereMesh.material = material;
  
    instance.scale = new Vector3(2, 2, 2);
  
    const shape = new CollisionShape3D();
    const sphereShape = new SphereShape3D();
    sphereShape.radius = 2.0;
    shape.shape = sphereShape;
    shape.disabled = false; // Explicitly enable
  
    staticBody.collision_layer = 1 << 1; // Layer 2
    staticBody.collision_mask = 1 << 0; // Sees layer 1 (world)
    staticBody.add_child(instance);
    staticBody.add_child(shape);
    instance.visibility_range_end = 500; // Cull beyond this distance
    instance.visibility_range_end_margin = 25.0; // Optional: buffer for smoother culling
    // Optional: Add fade-out effect
    instance.visibility_range_fade_mode =
      GeometryInstance3D.VisibilityRangeFadeMode.VISIBILITY_RANGE_FADE_SELF;
    instance.visibility_range_begin = 25.0; // Start fading 10m before end
    instance.visibility_range_begin_margin = 20.0; // Start fading 10m before end
    
    this.entityObjectContainer?.add_child(staticBody);
    
  
    staticBody.global_position = new Vector3(-spawn.y, spawn.z, spawn.x);

    const nameplate = new Label3D();
    nameplate.billboard = 1;
    nameplate.position = new Vector3(0, 4, 0);
    nameplate.font_size = 150.5;
    nameplate.modulate = new Color(0.5, 0.5, 1, 1);
    nameplate.text = spawn.name;
    instance.add_child(nameplate);

    this.nodes[spawn.spawnId] = staticBody;
  }

  async AddSpawn(spawn: Spawn) {
    console.log('Want to add spawn');
    if (!this.entityObjectContainer) {
      await this.loadedPromise;
    }
    if (!this.entityObjectContainer) {
      console.error("Entity object container is null");
      return;
    }
    this.spawnQueue.push(spawn);
   
  }
  mouseEvent(event: InputEvent) {
    if (
      event instanceof InputEventMouseButton &&
      event.button_index === MouseButton.MOUSE_BUTTON_LEFT &&
      event.pressed
    ) {
      const cam = this.parent.get_viewport().get_camera_3d();
      if (!cam) return;

        
      const mousePos = this.parent.get_viewport().get_mouse_position();
      const from = cam.project_ray_origin(mousePos);
      const dir  = cam.project_ray_normal(mousePos).normalized();
      const dirScaled = dir.multiplyScalar(1000);
      const to   = from.addNoMutate(dirScaled); // long enough to hit anything
  
      const params = new PhysicsRayQueryParameters3D();
      params.from           = from;
      params.to             = to;
      params.collision_mask = (1 << 1) /* entities */ | (1 << 0) /* world */;
      params.collide_with_bodies = true;
      params.collide_with_areas  = false;
      //params.collision_mask = (1<<0) | (1<<1); // world + entities
      // exclude camera so it doesn’t self-hit:
      const hit = this.parent
        .get_world_3d()
        .direct_space_state
        .intersect_ray(params);
      if (!hit) return;
      const collider = hit.get("collider") as StaticBody3D | undefined;
      if (!collider) return;
      if (
        collider.get_parent() === this.entityObjectContainer
      ) {
        console.log(`Clicked entity: ${collider.get_name()}`);
        this.handleEntityClick(collider);
      }
    }
  }
  
  handleEntityClick(entity: StaticBody3D | undefined) {
    if (!entity) return;
    const spawnId = entity.get_meta("spawnId");
    console.log('Spawn id', spawnId);
    console.log('Entity', this.entities[spawnId]);
    if (!Player.instance) {
      return;
    }
    Player.instance.Target = this.entities[spawnId];

  }
}

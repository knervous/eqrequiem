import type * as godotNS from "godot";

// Type alias for the module's contents
type GodotModule = typeof godotNS;

declare global {
  interface Window extends Global {
    require: (module: string) => GodotModule;
  }
}

declare const window: Window;

const godot = window.require("godot");

export const {
  Animation,
  Callable,
  Label3D,
  Vector3,
  Color,
  AnimationPlayer,
  GLTFDocument,
  GLTFState,
  Node,
  Node3D,
  Image,
  ImageTexture,
  MeshInstance3D,
  PackedScene,
  StandardMaterial3D,
  Resource,
  Texture2D,
  CharacterBody3D,
  CollisionShape3D,
  CapsuleShape3D,
  Skeleton3D,
  GeometryInstance3D,
  BaseMaterial3D,
  InputMap,
  InputEventKey,
  Input,
  Key,
  MouseButton,
  Camera3D,
  OmniLight3D,
  DisplayServer,
  Vector2,
  Shader,
  ShaderMaterial,
  JSON,
  GDictionary,
  PackedStringArray,
  GArray,
  deg_to_rad,
  Area3D,
  BoxShape3D,
  InputEventMouseButton,
  InputEvent,
  InputEventPanGesture,
  InputEventMouseMotion,
  DirectionalLight3D,
  WorldEnvironment,
  Environment,
  Sky,
  ProceduralSkyMaterial,
  RenderingServer,
  PhysicalSkyMaterial,
  QuadMesh,
  PanoramaSkyMaterial,
  ResourceLoader,
  GradientTexture2D,
  Gradient,
  PackedColorArray,
  SphereShape3D,
  SphereMesh,
  StaticBody3D,
  ConcavePolygonShape3D,
  Mesh,
  PackedVector3Array,
  ArrayMesh,
  PackedInt32Array,
  ConvexPolygonShape3D,
  AABB,
  BoxMesh,
} = godot;

export default godot;

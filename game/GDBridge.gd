extends Node

# This node will cache the camera's global position.
var cached_camera_pos: Vector3 = Vector3()

func get_position_x(node: Node3D) -> float:
	return node.global_position.x;

func get_position_y(node: Node3D) -> float:
	return node.global_position.y;

func get_position_z(node: Node3D) -> float:
	return node.global_position.z;

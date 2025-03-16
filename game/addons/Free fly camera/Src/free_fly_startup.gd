extends CharacterBody3D

# Movement Settings
@export_subgroup("Movement settings")
@export var movement_speed : float = 10.0 # Default movement speed
@export var sprint_multiplier: float = 2.0 # Sprint speed multiplier

# Key Bindings
@export_subgroup("Movement keybinds")
@export var KEY_FORWARD: String = "move_forward"
@export var KEY_BACKWARD: String = "move_backward"
@export var KEY_LEFT: String = "move_left"
@export var KEY_RIGHT: String = "move_right"
@export var KEY_UP: String = "move_up"
@export var KEY_DOWN: String = "move_down"
@export var KEY_SPRINT: String = "sprint"

# Mouse Settings
@export_subgroup("Mouse")
@export var MOUSE_ACCEL_STATE := true # Enable mouse acceleration
@export var MOUSE_SENS := 0.005 # Mouse sensitivity
@export var MOUSE_ACCEL := 50 # Mouse acceleration factor

# Head Rotation Clamping
@export_subgroup("Clamp Head Rotation")
@export var CLAMP_HEAD_ROTATION := true # Enable head rotation clamping
@export var CLAMP_HEAD_ROTATION_MIN := -90.0 # Min head rotation
@export var CLAMP_HEAD_ROTATION_MAX := 90.0 # Max head rotation

# Camera Node
@export_subgroup("Camera node")
@export var camera: Camera3D # Camera attached to the character

# Collision Settings (Optional)
@export_subgroup("Collision (Optional)")
@export var collision_state := true # Enable or disable collision
@export var collision: CollisionShape3D # Collision shape for the character

# Advanced Settings
@export_category("Advanced")
@export var UPDATE_ON_PHYSICS := true # Should the update happen on physics ticks?
@export var KEY_ESCAPE: String = "KEY_ESCAPE" # Escape key for toggling mouse capture

# Internal variables for rotation and mouse capture
var rotation_target_player : float
var rotation_target_head : float
var mouse_captured: bool = true

# Called when the node enters the scene tree for the first time
func _ready():
	# Toggle collision state if set
	if collision != null:
		collision.disabled = !collision_state

	# If no camera is assigned, create a new one and add it to the node
	if camera == null:
		camera = Camera3D.new()
		add_child(camera)
		
	# Capture the mouse at the start
	Input.set_mouse_mode(Input.MOUSE_MODE_CAPTURED)

# Process the input every frame if not using physics
func _process(delta: float) -> void:
	if !UPDATE_ON_PHYSICS:
		handle_input() # Handle player input
		rotate_player(delta) # Apply player and camera rotation

# Process input and rotation on physics ticks
func _physics_process(delta: float) -> void:
	if UPDATE_ON_PHYSICS:
		handle_input()
		rotate_player(delta)

# Handle player movement input and apply to the character
func handle_input():
	var move_direction = Vector3.ZERO # Initial movement direction is zero

	# Toggle mouse capture when the escape key is pressed
	if Input.is_action_just_pressed(KEY_ESCAPE):
		mouse_captured = not mouse_captured
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED if mouse_captured else Input.MOUSE_MODE_VISIBLE

	if mouse_captured:
		# Movement input for each direction
		if Input.is_action_pressed(KEY_FORWARD):
			move_direction.z += 1
		if Input.is_action_pressed(KEY_BACKWARD):
			move_direction.z -= 1
		if Input.is_action_pressed(KEY_LEFT):
			move_direction.x -= 1
		if Input.is_action_pressed(KEY_RIGHT):
			move_direction.x += 1
		if Input.is_action_pressed(KEY_UP):
			move_direction.y += 1
		if Input.is_action_pressed(KEY_DOWN):
			move_direction.y -= 1

		# Normalize the movement vector to ensure consistent speed
		move_direction = move_direction.normalized()

		# Get the direction relative to the camera orientation
		var forward = -camera.global_transform.basis.z
		var right = camera.global_transform.basis.x
		var up = camera.global_transform.basis.y

		# Sprinting multiplier if sprint key is pressed
		var speed_mod = sprint_multiplier if Input.is_action_pressed(KEY_SPRINT) else 1.0
		velocity = (forward * move_direction.z + right * move_direction.x + up * move_direction.y) * movement_speed * speed_mod

		# Move the character
		move_and_slide()

# Capture mouse motion input and update rotations
func _input(event):
	if Engine.is_editor_hint():
		return

	# Process mouse motion when the mouse is captured
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		set_rotation_target(event.relative)

# Update the target rotations for the player and camera based on mouse motion
func set_rotation_target(mouse_motion: Vector2):
	# Update player rotation based on mouse X movement
	rotation_target_player += -mouse_motion.x * MOUSE_SENS
	# Update head rotation based on mouse Y movement
	rotation_target_head += -mouse_motion.y * MOUSE_SENS

	# Clamp the head rotation if enabled
	if CLAMP_HEAD_ROTATION:
		rotation_target_head = clamp(rotation_target_head, deg_to_rad(CLAMP_HEAD_ROTATION_MIN), deg_to_rad(CLAMP_HEAD_ROTATION_MAX))

# Rotate the player and camera smoothly based on target rotation
func rotate_player(delta):
	if MOUSE_ACCEL_STATE:
		# Apply spherical interpolation (slerp) for smooth rotation
		quaternion = quaternion.slerp(Quaternion(Vector3.UP, rotation_target_player), MOUSE_ACCEL * delta)
		camera.quaternion = camera.quaternion.slerp(Quaternion(Vector3.RIGHT, rotation_target_head), MOUSE_ACCEL * delta)
	else:
		# If mouse acceleration is off, directly set to target rotation
		quaternion = Quaternion(Vector3.UP, rotation_target_player)
		camera.quaternion = Quaternion(Vector3.RIGHT, rotation_target_head)

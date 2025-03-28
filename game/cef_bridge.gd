extends Node

var webview_has_focus = false
var gd_cef: GDCef = null
var browser: GDBrowserView = null;
var texture: TextureRect = null
var mouse_pressed: Dictionary = {}  # Track mouse button states per browser

# Initialize CEF and create the initial browser
func instantiate_webview() -> void:
	if not OS.has_feature('editor'):
		return
	
	gd_cef = GDCef.new()
	if !gd_cef.initialize({"locale": "en-US", "remote_debugging_port": 7777, "remote_allow_origin": "*"}):
		push_error("Failed initializing CEF")
		get_tree().quit()
		return
	else:
		push_warning("CEF version: " + gd_cef.get_full_version())
	
	add_child(gd_cef)
	
	# Create a container panel for layout
	var panel = Panel.new()
	panel.anchor_right = 1.0
	panel.anchor_bottom = 1.0
	var style = StyleBoxEmpty.new()
	panel.add_theme_stylebox_override("panel", style)
	add_child(panel)
	
	# Create the TextureRect dynamically
	texture = TextureRect.new()
	texture.anchor_right = 1.0
	texture.anchor_bottom = 1.0
	texture.offset_left = 0
	texture.offset_top = 0
	texture.offset_right = 0
	texture.offset_bottom = 0
	texture.expand_mode = TextureRect.EXPAND_FIT_WIDTH
	texture.stretch_mode = TextureRect.STRETCH_SCALE
	panel.add_child(texture)
	
	texture.connect("resized", _on_texture_rect_resized)
	texture.connect("gui_input", _on_texture_gui_input)  # Add GUI input handling
	
	await get_tree().process_frame
	create_browser("http://localhost:4100")
	gd_cef.connect("postMessage", _on_post_message)

func create_browser(url: String) -> void:
	if not gd_cef:
		return
	
	await get_tree().process_frame
	var config = {
		"enable_ad_block": false,
		"javascript": true,
		"webgl": true
	}
	browser = gd_cef.create_browser(url, texture, config)
	if browser:
		browser.enable_ad_block(false)
		mouse_pressed = {"left": false, "right": false, "middle": false}
		browser.resize(texture.get_size())
		texture.texture = browser.get_texture()

func _on_texture_rect_resized():
	if browser:
		var new_size = texture.get_size()
		var min_size = Vector2(200, 150)
		var cef_size = new_size.clamp(min_size, Vector2.INF)
		browser.resize(cef_size)
		if new_size.x < cef_size.x or new_size.y < cef_size.y:
			texture.scale = new_size / cef_size
		else:
			texture.scale = Vector2(1.0, 1.0)


# Handle GUI input events (mouse clicks and wheel)
func _on_texture_gui_input(event):
	if not browser or not texture:
		return
	
	if event is InputEventMouseButton:
		var mouse_states = mouse_pressed
		var local_pos = texture.get_local_mouse_position()
		
		if event.button_index == MOUSE_BUTTON_LEFT:
			mouse_states["left"] = event.pressed
			if event.pressed:
				browser.set_mouse_left_down()
			else:
				browser.set_mouse_left_up()
		elif event.button_index == MOUSE_BUTTON_RIGHT:
			mouse_states["right"] = event.pressed
			if event.pressed:
				browser.set_mouse_right_down()
			else:
				browser.set_mouse_right_up()
		elif event.button_index == MOUSE_BUTTON_MIDDLE:
			mouse_states["middle"] = event.pressed
			if event.pressed:
				browser.set_mouse_middle_down()
			else:
				browser.set_mouse_middle_up()
		elif event.button_index == MOUSE_BUTTON_WHEEL_UP:
			browser.set_mouse_wheel_vertical(2)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			browser.set_mouse_wheel_vertical(-2)

# Handle global input events (keyboard and mouse motion)
func _input(event):
	if not browser or not texture:
		return
	
	if event is InputEventMouseMotion and texture.get_rect().has_point(event.position):
		var local_pos = texture.get_local_mouse_position()
		browser.set_mouse_moved(local_pos.x, local_pos.y)
		var mouse_states = mouse_pressed
		if mouse_states["left"]:
			browser.set_mouse_left_down()
		elif mouse_states["right"]:
			browser.set_mouse_right_down()
		elif mouse_states["middle"]:
			browser.set_mouse_middle_down()
	
	elif event is InputEventKey:
		# Use the keycode directly for special keys
		# Map Godot keycodes to CEF-compatible codes
		var key = event.keycode

		print("Key: ", key, " Pressed: ", event.pressed, " Shift: ", event.shift_pressed, " Alt: ", event.alt_pressed, " Ctrl: ", event.is_command_or_control_pressed())
		browser.set_key_pressed(
			key,
			event.pressed,
			event.shift_pressed,
			event.alt_pressed,
			event.is_command_or_control_pressed()
		)
		# Prevent Godot from consuming the event
		if event.pressed:
			get_viewport().set_input_as_handled()

func _on_post_message(data):
	if typeof(data) != TYPE_DICTIONARY:
		return
	
	var event_type = data.get("type", "")
	var x = data.get("x", 0)
	var y = data.get("y", 0)
	var button = data.get("button", 0)
	
	if not browser:
		return
	
	match event_type:
		"mousemove":
			browser.set_mouse_moved(x, y)
		"mousedown":
			match button:
				0: browser.set_mouse_left_down()
				1: browser.set_mouse_middle_down()
				2: browser.set_mouse_right_down()
		"mouseup":
			match button:
				0: browser.set_mouse_left_up()
				1: browser.set_mouse_middle_up()
				2: browser.set_mouse_right_up()
		"wheel":
			var delta = data.get("deltaY", 0)
			browser.set_mouse_wheel_vertical(2 if delta < 0 else -2)
		"webview_focus":
			webview_has_focus = data.get("payload", true)
			if webview_has_focus:
				gd_cef.allow_interactions_without_focus = false
				gd_cef.grab_focus()
			else:
				gd_cef.allow_interactions_without_focus = true
				gd_cef.release_focus()
		_:
			var node = get_node_or_null("/root/Zone/JSBridge")
			if node:
				node.call("postMessage", data)

func _ready():
	instantiate_webview()

func _invoke_js_callback(val):
	if gd_cef:
		gd_cef.invoke_js_callback(val)

func _process(_delta):
	pass

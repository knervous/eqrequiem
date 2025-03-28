extends Node
var webview_has_focus = false
var webview_instance: WebView = null
func instantiate_webview() -> void:
	if not OS.has_feature('editor'):
		return
	
	webview_instance = WebView.new()
	if webview_instance:
		webview_instance.url = "http://localhost:4100"
		webview_instance.transparent = true
		webview_instance.full_window_size = true
		webview_instance.allow_interactions_without_focus = false
		webview_instance.connect("ipc_message", self._on_web_view_ipc_message)
		add_child(webview_instance)
		print("WRY WebView instantiated: ", webview_instance.name)
	else:
		print("Failed to instantiate WRY WebView")
		
func _on_web_view_ipc_message(message):
	var json_parser = JSON.new()
	var err = json_parser.parse(message)
	if err != OK:
		print("Error parsing JSON: ", err)
		return
	
	var data = json_parser.data
	if typeof(data) != TYPE_DICTIONARY:
		return
	
	var event_type = data.get("type", "")
	var x = data.get("x", 0)
	var y = data.get("y", 0)
	var relative_x = data.get("relativeX", 0)
	var relative_y = data.get("relativeY", 0)
	var button = data.get("button", 0)
	
	# Create an appropriate InputEvent based on the event type
	var input_event : InputEvent = null
	match event_type:
		"mousemove":
			input_event = InputEventMouseMotion.new()
			input_event.position = Vector2(x, y)
			input_event.relative = Vector2(relative_x, relative_y)
		"mousedown":
			input_event = InputEventMouseButton.new()
			input_event.position = Vector2(x, y)
			input_event.button_index = button  # or data["button"] if provided
			input_event.pressed = true
		"mouseup":
			input_event = InputEventMouseButton.new()
			input_event.position = Vector2(x, y)
			input_event.button_index = button  # or data["button"]
			input_event.pressed = false
		"wheel":
			var wheel_event = InputEventPanGesture.new()
			wheel_event.position = Vector2(x, y)
			if data.get("deltaY", 0) < 0:
				wheel_event.delta = Vector2(0, -1)
			else:
				wheel_event.delta = Vector2(0, 1)
			Input.parse_input_event(wheel_event)
		"webview_focus":
			webview_has_focus = data.get("payload", true)
			if webview_has_focus:
				webview_instance.allow_interactions_without_focus = false
				webview_instance.grab_focus()
			else:
				webview_instance.allow_interactions_without_focus = true
				webview_instance.release_focus()
		"data":
			var node = get_node("/root/Zone/JSBridge")
			if node == null:
				return
			node.call("postMessage", json_parser.stringify(data.get("action")));
		_:
			print("Unhandled event type: ", event_type)
	
	if input_event:
		Input.parse_input_event(input_event)

#func _post_message(msg):
	#webview_instance.post_message(msg)
		
#func _ready():
	#instantiate_webview()

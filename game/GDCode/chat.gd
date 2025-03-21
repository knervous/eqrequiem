extends LineEdit
var last_text = []
var idx = 0
func _input(event):
	if event is InputEventKey:
		# Handle Enter/Return key events
		if event.pressed and (event.keycode == KEY_ENTER or event.keycode == KEY_KP_ENTER):
			var message = text.strip_edges()
			if message != "":
				var js_bridge = get_node("/root/Zone/JSBridge")
				if js_bridge:
					js_bridge.chatLine(message)
			last_text.append(text)
			idx = last_text.size() - 1
			text = ""
			release_focus()  # Lose focus on Enter
			get_viewport().set_input_as_handled()
		# Handle Escape key event
		elif event.pressed and event.keycode == KEY_SLASH:
			grab_focus()
			text = "/"
			caret_column = text.length()
			get_viewport().set_input_as_handled()
		elif event.pressed and event.keycode == KEY_UP:
			var new_text = last_text[idx]
			if new_text:
				text = new_text
				idx = max(0, idx - 1)
		elif event.pressed and event.keycode == KEY_DOWN:
			var new_text = last_text[idx]
			if new_text:
				text = new_text
				idx = min(last_text.size() - 1, idx + 1)
		elif event.pressed and event.keycode == KEY_ESCAPE:
			release_focus()  # Lose focus on Escape
			get_viewport().set_input_as_handled()

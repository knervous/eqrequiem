extends BoxContainer

var dragging = false
var drag_offset = Vector2()
@onready var text_edit = $Edit

func _input(event):
	if event is InputEventMouseButton or event is InputEventMouseMotion:
		if text_edit.get_global_rect().has_point(event.global_position) or !get_global_rect().has_point(event.global_position):
			return
	
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			dragging = true
			drag_offset = event.position
		else:
			dragging = false

	elif event is InputEventMouseMotion and dragging:
		position += event.relative
		get_viewport().set_input_as_handled()

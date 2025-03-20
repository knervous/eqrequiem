extends Node

var _expr_cache := {}

func eval_plain(expr_str: String, node: Node3D) -> Variant:
	var expression: Expression
	if _expr_cache.has(expr_str):
		expression = _expr_cache[expr_str]
	else:
		expression = Expression.new()
		var err = expression.parse(expr_str, ["node"])
		if err != OK:
			push_error("Parse error in expression: %s" % expr_str)
			return null
		_expr_cache[expr_str] = expression

	var result = expression.execute([node])
	if expression.has_execute_failed():
		push_error("Execution error in expression: %s" % expr_str)
		return null
	return result

func _input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var node = get_node("/root/Zone")
		node.call("input", event.button_index);
	elif event is InputEventPanGesture:
		var node = get_node("/root/Zone")
		node.call("input_pan", event.delta_y);

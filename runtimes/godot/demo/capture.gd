# Capture d'écran de la démo (vérification visuelle) : godot --path . --script res://capture.gd
extends SceneTree

var frames := 0


func _init() -> void:
	var scene = load("res://demo.tscn").instantiate()
	root.add_child(scene)


func _process(_delta: float) -> bool:
	frames += 1
	if frames == 20:
		root.get_texture().get_image().save_png("res://capture.png")
		return true
	return false

# Exécute un scénario sur un squelette exporté et écrit les poses obtenues (comparées au modèle JavaScript).
# Usage : godot --headless --path . --script res://runner.gd
extends SceneTree


func _init() -> void:
	var scenario = JSON.parse_string(FileAccess.get_file_as_string("res://data/scenario.json"))
	var sk = WN2DModel.load_skeleton(FileAccess.get_file_as_string("res://data/skeleton.json"))
	sk.active_skins = scenario.activeSkins
	var state = WN2DModel.AnimationState.new(sk)
	state.default_mix = scenario.defaultMix
	var events: Array = []
	state.on_event = func(track, k): events.push_back("%d:%s@%.4f" % [track, k.name, k.time])
	var snaps: Array = []
	var first := true
	for step in scenario.steps:
		match step.op:
			"set":
				state.set_animation(int(step.track), sk.animations[step.anim], step.loop)
			"add":
				state.add_animation(int(step.track), sk.animations[step.anim], step.loop, step.delay)
			"empty":
				state.set_empty_animation(int(step.track), step.mix)
			"update":
				state.update(step.dt)
				sk.time += step.dt
				state.apply(sk)
				sk.update_world_transform("reset" if first else "update")
				first = false
			"snapshot":
				snaps.push_back(_snapshot(sk))
	var out := {"snapshots": snaps, "events": events}
	var f := FileAccess.open("res://data/actual.json", FileAccess.WRITE)
	f.store_string(JSON.stringify(out))
	f.close()
	quit()


func _snapshot(sk) -> Dictionary:
	var bones := {}
	for b in sk.bones:
		bones[b.name] = [b.a, b.b, b.c, b.d, b.world_x, b.world_y, b.active]
	var slots := {}
	for s in sk.slots:
		var att = sk.current_attachment(s)
		var verts: Array = []
		if att != null and att.type in ["region", "mesh", "boundingbox", "clipping"]:
			for v in sk.attachment_vertices(s, att):
				verts.push_back(v.x)
				verts.push_back(v.y)
		slots[s.name] = {"attachment": att.name if att != null else null, "color": s.pose.color.to_lower(), "verts": verts}
	var order: Array = []
	for s in sk.draw_order:
		order.push_back(s.name)
	return {"bones": bones, "slots": slots, "order": order}

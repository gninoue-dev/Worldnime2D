# Nœud Godot qui affiche et anime un squelette exporté par Worldnime2D.
#
#   var perso = $Worldnime2DSkeleton
#   perso.set_animation(0, "marche", true)
#   perso.add_animation(0, "saut", false)
#   perso.event_triggered.connect(func(track, name, data): print(name))
#
# Fichiers : <nom>.json (squelette) et <nom>.atlas.json + pages .png dans le même dossier.
@icon("res://addons/worldnime2d/icon.svg")
class_name Worldnime2DSkeleton
extends Node2D

## Événement d'animation (pas, coup qui touche, son…). data : { int, float, string, audio, volume, balance }.
signal event_triggered(track: int, event_name: String, data: Dictionary)
## Une animation non bouclée vient de se terminer sur une piste.
signal animation_completed(track: int, animation_name: String)

## Fichier du squelette exporté (.json).
@export_file("*.json") var skeleton_file := "":
	set(v):
		skeleton_file = v
		if is_inside_tree():
			_load()
## Animation lancée au démarrage (piste 0).
@export var animation := ""
@export var loop := true
@export var playing := true
@export var speed := 1.0
## Durée des fondus entre animations (secondes).
@export var default_mix := 0.2
## Skins actives (en plus de « default »).
@export var skins: PackedStringArray = []:
	set(v):
		skins = v
		if skeleton != null:
			skeleton.active_skins = Array(v)
## Afficher les boîtes de collision (débogage).
@export var debug_bounding_boxes := false

var skeleton = null
var state = null
var _pages: Array = []
var _regions := {}
var _items: Array = []
var _materials := {}
var _completed := {}

const SHADER_CODE := """
shader_type canvas_item;
render_mode %s;
uniform vec4 dark_color = vec4(0.0, 0.0, 0.0, 1.0);
%s
void fragment() {
	vec4 t = texture(TEXTURE, UV);
	vec3 rgb = t.rgb * COLOR.rgb + (1.0 - t.rgb) * dark_color.rgb;
	float a = t.a * COLOR.a;
	%s
}
"""


func _ready() -> void:
	_load()


func _load() -> void:
	_clear_items()
	skeleton = null
	if skeleton_file == "":
		return
	var text = FileAccess.get_file_as_string(skeleton_file)
	if text == "":
		push_error("Worldnime2D : fichier introuvable : %s" % skeleton_file)
		return
	skeleton = WN2DModel.load_skeleton(text)
	if skeleton == null:
		return
	skeleton.active_skins = Array(skins)
	_load_atlas()
	state = WN2DModel.AnimationState.new(skeleton)
	state.default_mix = default_mix
	state.on_event = _on_event
	if animation != "" and skeleton.animations.has(animation):
		set_animation(0, animation, loop)
	_update_pose(0.0)
	queue_redraw()


func _load_atlas() -> void:
	_pages.clear()
	_regions.clear()
	var dir = skeleton_file.get_base_dir()
	var atlas_name = skeleton.data.get("export", {}).get("atlas", skeleton_file.get_file().get_basename() + ".atlas.json")
	var atlas = JSON.parse_string(FileAccess.get_file_as_string(dir.path_join(atlas_name)))
	if not (atlas is Dictionary):
		push_error("Worldnime2D : atlas introuvable : %s" % atlas_name)
		return
	for p in atlas.pages:
		var path = dir.path_join(p.file)
		var tex: Texture2D = load(path) if ResourceLoader.exists(path) else ImageTexture.create_from_image(Image.load_from_file(path))
		_pages.push_back(tex)
	_regions = atlas.regions


# --- Pistes ------------------------------------------------------------------------------------------

func set_animation(track: int, anim_name: String, loop_anim := true) -> void:
	if skeleton == null or not skeleton.animations.has(anim_name):
		push_error("Worldnime2D : animation inconnue : %s" % anim_name)
		return
	_completed.erase(track)
	state.set_animation(track, skeleton.animations[anim_name], loop_anim)


func add_animation(track: int, anim_name: String, loop_anim := true, delay := 0.0) -> void:
	if skeleton == null or not skeleton.animations.has(anim_name):
		push_error("Worldnime2D : animation inconnue : %s" % anim_name)
		return
	state.add_animation(track, skeleton.animations[anim_name], loop_anim, delay)


func set_empty_animation(track: int, mix := -1.0) -> void:
	state.set_empty_animation(track, mix)


func set_mix(from: String, to: String, duration: float) -> void:
	state.set_mix(from, to, duration)


func get_animation_names() -> PackedStringArray:
	return PackedStringArray(skeleton.animations.keys()) if skeleton != null else PackedStringArray()


func get_current_animation(track := 0) -> String:
	if state == null or track >= state.tracks.size() or state.tracks[track] == null or state.tracks[track].animation == null:
		return ""
	return state.tracks[track].animation.name


# --- Positions utiles en jeu (repère du nœud, Y vers le bas) -------------------------------------------

func get_bone_position(bone_name: String) -> Vector2:
	var b = skeleton.find_bone(bone_name) if skeleton != null else null
	return Vector2(b.world_x, -b.world_y) if b != null else Vector2.ZERO


func get_bone_rotation_degrees(bone_name: String) -> float:
	var b = skeleton.find_bone(bone_name) if skeleton != null else null
	return -b.world_rotation_x() if b != null else 0.0


## Boîtes de collision visibles : { nom du slot : PackedVector2Array }.
func get_bounding_boxes() -> Dictionary:
	var out := {}
	if skeleton == null:
		return out
	for slot in skeleton.slots:
		var att = skeleton.current_attachment(slot)
		if att != null and att.type == "boundingbox" and slot.bone.active:
			out[slot.name] = _flip(skeleton.attachment_vertices(slot, att))
	return out


## Point (pièce jointe « point ») : Transform2D dans le repère du nœud.
func get_point(slot_name: String) -> Transform2D:
	var slot = skeleton.find_slot(slot_name) if skeleton != null else null
	var att = skeleton.current_attachment(slot) if slot != null else null
	if att == null or att.type != "point":
		return Transform2D.IDENTITY
	var b = slot.bone
	var p = b.local_to_world(att.x, att.y)
	var cs = cos(att.rotation * WN2DModel.DEG)
	var sn = sin(att.rotation * WN2DModel.DEG)
	var rot = atan2(b.c * cs + b.d * sn, b.a * cs + b.b * sn)
	return Transform2D(-rot, Vector2(p.x, -p.y))


# --- Mise à jour et affichage ------------------------------------------------------------------------

func _process(delta: float) -> void:
	if skeleton == null or not playing:
		return
	_update_pose(delta * speed)
	queue_redraw()


func _update_pose(dt: float) -> void:
	state.update(dt)
	skeleton.time += dt
	state.apply(skeleton)
	skeleton.update_world_transform("update" if dt > 0.0 else "reset")
	for i in state.tracks.size():
		var e = state.tracks[i]
		if e != null and e.animation != null and not e.loop and e.time >= e.animation.duration and not _completed.has(i):
			_completed[i] = true
			animation_completed.emit(i, e.animation.name)


func _on_event(track: int, key: Dictionary) -> void:
	var def: Dictionary = skeleton.events.get(key.name, {})
	var data := {
		"int": key.get("int", def.get("int", 0)), "float": key.get("float", def.get("float", 0.0)),
		"string": key.get("string", def.get("string", "")), "audio": def.get("audio", ""),
		"volume": key.get("volume", def.get("volume", 1.0)), "balance": key.get("balance", def.get("balance", 0.0)),
	}
	event_triggered.emit(track, key.name, data)


func _flip(points: PackedVector2Array) -> PackedVector2Array:
	var out = PackedVector2Array()
	out.resize(points.size())
	for i in points.size():
		out[i] = Vector2(points[i].x, -points[i].y)
	return out


func _clear_items() -> void:
	for rid in _items:
		RenderingServer.free_rid(rid)
	_items.clear()


func _item(i: int) -> RID:
	while _items.size() <= i:
		var rid = RenderingServer.canvas_item_create()
		RenderingServer.canvas_item_set_parent(rid, get_canvas_item())
		_items.push_back(rid)
	return _items[i]


# Matériau du slot : partagé par mode de fusion, sauf avec une couleur sombre (un par position d'affichage).
func _material(blend: String, dark: bool, index: int) -> ShaderMaterial:
	var key = "%s/%d" % [blend, index] if dark else blend
	if _materials.has(key):
		return _materials[key]
	var mode = {"additive": "blend_add", "multiply": "blend_mul"}.get(blend, "blend_mix")
	var extra = ""
	var body = "COLOR = vec4(rgb, a);"
	if blend == "multiply":
		# Produit : les zones transparentes valent blanc (neutre), pas noir.
		body = "COLOR = vec4(mix(vec3(1.0), rgb, a), 1.0);"
	elif blend == "screen":
		# Écran : 1 − (1 − source)(1 − destination), mélangé selon l'opacité.
		extra = "uniform sampler2D screen_tex : hint_screen_texture, filter_linear;"
		body = "vec3 dst = texture(screen_tex, SCREEN_UV).rgb; COLOR = vec4(mix(dst, 1.0 - (1.0 - rgb) * (1.0 - dst), a), 1.0);"
	var shader = Shader.new()
	shader.code = SHADER_CODE % [mode, extra, body]
	var mat = ShaderMaterial.new()
	mat.shader = shader
	_materials[key] = mat
	return mat


# Coordonnées dans la page de l'atlas pour un point (u, v) de l'image d'origine.
func _atlas_uv(region: Dictionary, u: float, v: float) -> Vector2:
	var rx = (u * region.originalWidth - region.offsetX) / region.trimmedWidth
	var ry = (v * region.originalHeight - region.offsetY) / region.trimmedHeight
	var page: Texture2D = _pages[region.page]
	var px: float
	var py: float
	if region.rotated:
		px = region.x + (1.0 - ry) * region.height
		py = region.y + rx * region.width
	else:
		px = region.x + rx * region.width
		py = region.y + ry * region.height
	return Vector2(px / page.get_width(), py / page.get_height())


func _draw() -> void:
	if skeleton == null:
		return
	var clip = null
	var index = 0
	for slot in skeleton.draw_order:
		if not slot.bone.active:
			if clip != null and clip.end == slot.name:
				clip = null
			continue
		var att = skeleton.current_attachment(slot)
		if att != null and att.type == "clipping":
			clip = {"end": att.end, "poly": _flip(skeleton.attachment_vertices(slot, att))}
			continue
		if att != null and (att.type == "region" or att.type == "mesh") and _regions.has(att.path):
			_draw_attachment(_item(index), index, slot, att, clip)
			index += 1
		if clip != null and clip.end == slot.name:
			clip = null
	for i in range(index, _items.size()):
		RenderingServer.canvas_item_clear(_items[i])
	if debug_bounding_boxes:
		for poly in get_bounding_boxes().values():
			var closed = poly.duplicate()
			closed.push_back(poly[0])
			draw_polyline(closed, Color(0.4, 1.0, 0.2), 1.5)


func _draw_attachment(item: RID, index: int, slot, att: Dictionary, clip) -> void:
	RenderingServer.canvas_item_clear(item)
	var region: Dictionary = _regions[att.path]
	var page: Texture2D = _pages[region.page]
	var light = WN2DModel.hex_color(slot.pose.color) * WN2DModel.hex_color(att.color)
	var points = PackedVector2Array()
	var uvs = PackedVector2Array()
	var indices = PackedInt32Array()
	if att.type == "region":
		# Seule la zone rognée de l'image est dessinée : on rétrécit le quadrilatère en conséquence.
		var u0 = region.offsetX / region.originalWidth
		var v0 = region.offsetY / region.originalHeight
		var u1 = (region.offsetX + region.trimmedWidth) / region.originalWidth
		var v1 = (region.offsetY + region.trimmedHeight) / region.originalHeight
		var corners = WN2DModel.region_corners(att)
		var bl: Vector2 = corners[0]
		var br: Vector2 = corners[1]
		var tl: Vector2 = corners[3]
		var ux = br - bl
		var vy = bl - tl
		for uv in [Vector2(u0, v1), Vector2(u1, v1), Vector2(u1, v0), Vector2(u0, v0)]:
			var lp = tl + ux * uv.x + vy * uv.y
			var wp = slot.bone.local_to_world(lp.x, lp.y)
			points.push_back(Vector2(wp.x, -wp.y))
			uvs.push_back(_atlas_uv(region, uv.x, uv.y))
		indices = PackedInt32Array([0, 1, 2, 0, 2, 3])
	else:
		var src = skeleton.mesh_source(slot, att)
		points = _flip(skeleton.attachment_vertices(slot, att))
		for uv in src.uvs:
			uvs.push_back(_atlas_uv(region, uv.x, uv.y))
		indices = src.triangles
	if clip != null:
		var clipped = _clip(points, uvs, indices, clip.poly)
		points = clipped[0]
		uvs = clipped[1]
		indices = clipped[2]
	if indices.is_empty():
		return
	var colors = PackedColorArray()
	colors.resize(points.size())
	colors.fill(light)
	var dark = slot.pose.dark
	var needs_material = dark != null or slot.blend != "normal"
	if needs_material:
		var mat = _material(slot.blend, dark != null, index)
		if dark != null:
			mat.set_shader_parameter("dark_color", WN2DModel.hex_color(dark))
		RenderingServer.canvas_item_set_material(item, mat.get_rid())
	else:
		RenderingServer.canvas_item_set_material(item, RID())
	RenderingServer.canvas_item_add_triangle_array(item, indices, points, colors, uvs, PackedInt32Array(), PackedFloat32Array(), page.get_rid())


# Découpe des triangles par le polygone : les morceaux sont re-triangulés, leurs UV interpolées.
func _clip(points: PackedVector2Array, uvs: PackedVector2Array, indices: PackedInt32Array, poly: PackedVector2Array) -> Array:
	var out_p = PackedVector2Array()
	var out_uv = PackedVector2Array()
	var out_i = PackedInt32Array()
	for t in range(0, indices.size(), 3):
		var a = points[indices[t]]
		var b = points[indices[t + 1]]
		var c = points[indices[t + 2]]
		var tri = PackedVector2Array([a, b, c])
		for piece in Geometry2D.intersect_polygons(tri, poly):
			var tris = Geometry2D.triangulate_polygon(piece)
			var base = out_p.size()
			for p in piece:
				out_p.push_back(p)
				var bc = _barycentric(a, b, c, p)
				out_uv.push_back(uvs[indices[t]] * bc.x + uvs[indices[t + 1]] * bc.y + uvs[indices[t + 2]] * bc.z)
			for k in tris:
				out_i.push_back(base + k)
	return [out_p, out_uv, out_i]


func _barycentric(a: Vector2, b: Vector2, c: Vector2, p: Vector2) -> Vector3:
	var d = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y)
	if absf(d) < 1e-9:
		return Vector3(1, 0, 0)
	var l1 = ((b.y - c.y) * (p.x - c.x) + (c.x - b.x) * (p.y - c.y)) / d
	var l2 = ((c.y - a.y) * (p.x - c.x) + (a.x - c.x) * (p.y - c.y)) / d
	return Vector3(l1, l2, 1.0 - l1 - l2)


func _exit_tree() -> void:
	_clear_items()

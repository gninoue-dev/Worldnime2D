# Runtime Worldnime2D pour Godot 4 : modèle (sans affichage).
# Lit les fichiers exportés par l'éditeur (squelette .json + atlas .atlas.json) et calcule les poses :
# os, slots, skins, pièces jointes, animations (toutes les timelines), contraintes, fondus entre pistes.
# C'est une traduction fidèle du modèle JavaScript de l'éditeur (src/renderer/js/model/).
# Repère : X vers la droite, Y vers le haut, angles en degrés (le nœud d'affichage retourne Y).
class_name WN2DModel
extends RefCounted

const TIME_EPSILON := 0.0001
const DEG := PI / 180.0


static func wrap_deg(d: float) -> float:
	var r = fmod(d, 360.0)
	if r > 180.0:
		r -= 360.0
	if r <= -180.0:
		r += 360.0
	return r


static func wrap_rad(r: float) -> float:
	return r - ceil(r / TAU - 0.5) * TAU


# Couleur « #rrggbb » ou « #rrggbbaa » → Color.
static func hex_color(h: String) -> Color:
	if h.length() == 7:
		return Color.html(h)
	return Color(h.substr(1, 2).hex_to_int() / 255.0, h.substr(3, 2).hex_to_int() / 255.0, h.substr(5, 2).hex_to_int() / 255.0, h.substr(7, 2).hex_to_int() / 255.0)


# --- Courbes ---------------------------------------------------------------------------------------

static func _bez1(p1: float, p2: float, t: float) -> float:
	var u = 1.0 - t
	return 3.0 * u * u * t * p1 + 3.0 * u * t * t * p2 + t * t * t


static func _bez_slope(p1: float, p2: float, t: float) -> float:
	var u = 1.0 - t
	return 3.0 * u * u * p1 + 6.0 * u * t * (p2 - p1) + 3.0 * t * t * (1.0 - p2)


static func evaluate_curve(curve, p: float) -> float:
	if curve is String and curve == "stepped":
		return 0.0
	if not (curve is Array) or curve.size() != 4:
		return p
	if p <= 0.0:
		return 0.0
	if p >= 1.0:
		return 1.0
	var x1: float = curve[0]
	var y1: float = curve[1]
	var x2: float = curve[2]
	var y2: float = curve[3]
	var t = p
	for i in 8:
		var x = _bez1(x1, x2, t) - p
		if absf(x) < 1e-6:
			return _bez1(y1, y2, t)
		var d = _bez_slope(x1, x2, t)
		if absf(d) < 1e-6:
			break
		t -= x / d
	var lo = 0.0
	var hi = 1.0
	t = p
	for i in 40:
		var x = _bez1(x1, x2, t)
		if absf(x - p) < 1e-7:
			break
		if x < p:
			lo = t
		else:
			hi = t
		t = (lo + hi) / 2.0
	return _bez1(y1, y2, t)


# --- Os ----------------------------------------------------------------------------------------------

class Bone:
	var name: String
	var parent: Bone = null
	var children: Array = []
	var length = 0.0
	var x = 0.0
	var y = 0.0
	var rotation = 0.0
	var scale_x = 1.0
	var scale_y = 1.0
	var shear_x = 0.0
	var shear_y = 0.0
	var inherit = "normal"
	var active = true
	# Pose courante (animation) et valeurs appliquées (après contraintes).
	var pose = {}
	var ap = {}
	var a = 1.0
	var b = 0.0
	var c = 0.0
	var d = 1.0
	var world_x = 0.0
	var world_y = 0.0

	func setup_pose() -> void:
		pose = {"x": x, "y": y, "rotation": rotation, "scaleX": scale_x, "scaleY": scale_y, "shearX": shear_x, "shearY": shear_y}

	func reset_applied() -> void:
		ap = pose.duplicate()

	func update_world_transform() -> void:
		var rx: float
		var ry: float
		var px: float = ap.x
		var py: float = ap.y
		var rot: float = ap.rotation
		var sx: float = ap.scaleX
		var sy: float = ap.scaleY
		var shx: float = ap.shearX
		var shy: float = ap.shearY
		if parent == null:
			rx = (rot + shx) * DEG
			ry = (rot + 90.0 + shy) * DEG
			a = cos(rx) * sx
			b = cos(ry) * sy
			c = sin(rx) * sx
			d = sin(ry) * sy
			world_x = px
			world_y = py
			return
		var pa = parent.a
		var pb = parent.b
		var pc = parent.c
		var pd = parent.d
		world_x = pa * px + pb * py + parent.world_x
		world_y = pc * px + pd * py + parent.world_y
		match inherit:
			"onlyTranslation":
				rx = (rot + shx) * DEG
				ry = (rot + 90.0 + shy) * DEG
				a = cos(rx) * sx
				b = cos(ry) * sy
				c = sin(rx) * sx
				d = sin(ry) * sy
			"noRotationOrReflection":
				var s = pa * pa + pc * pc
				var prx: float
				if s > 0.0001:
					s = absf(pa * pd - pb * pc) / s
					pb = pc * s
					pd = pa * s
					prx = atan2(pc, pa) / DEG
				else:
					pa = 0.0
					pc = 0.0
					prx = 90.0 - atan2(pd, pb) / DEG
				rx = (rot + shx - prx) * DEG
				ry = (rot + shy - prx + 90.0) * DEG
				var la = cos(rx) * sx
				var lb = cos(ry) * sy
				var lc = sin(rx) * sx
				var ld = sin(ry) * sy
				a = pa * la - pb * lc
				b = pa * lb - pb * ld
				c = pc * la + pd * lc
				d = pc * lb + pd * ld
			"noScale", "noScaleOrReflection":
				var cs = cos(rot * DEG)
				var sn = sin(rot * DEG)
				var za = pa * cs + pb * sn
				var zc = pc * cs + pd * sn
				var s = sqrt(za * za + zc * zc)
				if s > 0.00001:
					s = 1.0 / s
				za *= s
				zc *= s
				s = sqrt(za * za + zc * zc)
				if inherit == "noScale" and pa * pd - pb * pc < 0.0:
					s = -s
				var r = PI / 2.0 + atan2(zc, za)
				var zb = cos(r) * s
				var zd = sin(r) * s
				var la = cos(shx * DEG) * sx
				var lb = cos((90.0 + shy) * DEG) * sy
				var lc = sin(shx * DEG) * sx
				var ld = sin((90.0 + shy) * DEG) * sy
				a = za * la + zb * lc
				b = za * lb + zb * ld
				c = zc * la + zd * lc
				d = zc * lb + zd * ld
			_:
				rx = (rot + shx) * DEG
				ry = (rot + 90.0 + shy) * DEG
				var la = cos(rx) * sx
				var lb = cos(ry) * sy
				var lc = sin(rx) * sx
				var ld = sin(ry) * sy
				a = pa * la + pb * lc
				b = pa * lb + pb * ld
				c = pc * la + pd * lc
				d = pc * lb + pd * ld

	func world_rotation_x() -> float:
		return atan2(c, a) / DEG

	func world_scale_x() -> float:
		return sqrt(a * a + c * c)

	func tip() -> Vector2:
		return Vector2(world_x + a * length, world_y + c * length)

	func local_to_world(lx: float, ly: float) -> Vector2:
		return Vector2(lx * a + ly * b + world_x, lx * c + ly * d + world_y)

	func world_to_local(wx: float, wy: float) -> Vector2:
		var det = a * d - b * c
		if absf(det) < 1e-9:
			return Vector2.ZERO
		var px = wx - world_x
		var py = wy - world_y
		return Vector2((px * d - py * b) / det, (py * a - px * c) / det)

	func is_ancestor_of(other: Bone) -> bool:
		var p = other.parent
		while p != null:
			if p == self:
				return true
			p = p.parent
		return false

	func update_applied_from_world() -> void:
		var ra = a
		var rb = b
		var rc = c
		var rd = d
		if parent == null:
			ap.x = world_x
			ap.y = world_y
		else:
			var p = parent
			var det = p.a * p.d - p.b * p.c
			var pid = 1.0 / det if absf(det) > 1e-9 else 0.0
			var dx = world_x - p.world_x
			var dy = world_y - p.world_y
			ap.x = (dx * p.d - dy * p.b) * pid
			ap.y = (dy * p.a - dx * p.c) * pid
			var ia = pid * p.d
			var id = pid * p.a
			var ib = pid * p.b
			var ic = pid * p.c
			ra = ia * a - ib * c
			rb = ia * b - ib * d
			rc = id * c - ic * a
			rd = id * d - ic * b
		ap.shearX = 0.0
		ap.scaleX = sqrt(ra * ra + rc * rc)
		if ap.scaleX > 0.0001:
			var det2 = ra * rd - rb * rc
			ap.scaleY = det2 / ap.scaleX
			ap.shearY = -atan2(ra * rb + rc * rd, det2) / DEG
			ap.rotation = atan2(rc, ra) / DEG
		else:
			ap.scaleX = 0.0
			ap.scaleY = sqrt(rb * rb + rd * rd)
			ap.shearY = 0.0
			ap.rotation = 90.0 - atan2(rd, rb) / DEG


# --- Slots, skins, pièces jointes -------------------------------------------------------------

class Slot:
	var name: String
	var bone: Bone
	var color = "#ffffffff"
	var dark = null
	var attachment = null
	var blend = "normal"
	var pose = {}

	func setup_pose() -> void:
		pose = {"color": color, "dark": dark, "attachment": attachment, "deform": null, "deformFor": null}


class WSkin:
	var name: String
	# nom du slot → { nom de pièce jointe → Dictionary (données de la pièce jointe) }
	var attachments = {}
	var bones = {}
	var constraints = {}

	func get_attachment(slot_name: String, att_name: String):
		if not attachments.has(slot_name):
			return null
		return attachments[slot_name].get(att_name, null)


# --- Squelette -------------------------------------------------------------------------------------

class Skeleton:
	var data = {}
	var name = ""
	var bones: Array = []
	var bones_by_name = {}
	var slots: Array = []
	var slots_by_name = {}
	var draw_order: Array = []
	var skins: Array = []
	var active_skins: Array = []
	var constraints: Array = []
	var animations = {}
	var events = {}
	var time = 0.0
	var reference_scale = 100.0

	func find_bone(n) -> Bone:
		if n == null:
			return null
		return bones_by_name.get(n, null)

	func find_slot(n) -> Slot:
		if n == null:
			return null
		return slots_by_name.get(n, null)

	func find_skin(n):
		for s in skins:
			if s.name == n:
				return s
		return null

	func find_constraint(n):
		for c in constraints:
			if c.name == n:
				return c
		return null

	func default_skin() -> WSkin:
		return skins[0]

	func lookup_skins() -> Array:
		var list: Array = []
		for n in active_skins:
			var s = find_skin(n)
			if s != null:
				list.push_front(s)
		list.push_back(default_skin())
		return list

	func get_attachment(slot: Slot, att_name):
		if att_name == null:
			return null
		for skin in lookup_skins():
			var a = skin.get_attachment(slot.name, att_name)
			if a != null:
				return a
		return null

	func current_attachment(slot: Slot):
		return get_attachment(slot, slot.pose.attachment)

	func skin_of(slot: Slot, att) -> String:
		for skin in skins:
			if skin.attachments.has(slot.name):
				for a in skin.attachments[slot.name].values():
					if is_same(a, att):
						return skin.name
		return "default"

	func mesh_source(slot: Slot, att: Dictionary) -> Dictionary:
		if att.type != "mesh" or att.get("parent", null) == null:
			return att
		var skin = find_skin(skin_of(slot, att))
		var p = skin.get_attachment(slot.name, att.parent) if skin != null else null
		if p == null:
			p = get_attachment(slot, att.parent)
		if p != null and p.type == "mesh" and p.get("parent", null) == null:
			return p
		return att

	func deform_key_for(slot: Slot, att: Dictionary) -> String:
		var target: Dictionary = att
		if att.get("parent", null) != null and att.get("timelines", true):
			target = mesh_source(slot, att)
		return JSON.stringify([skin_of(slot, target), slot.name, target.name])

	func setup_pose() -> void:
		for b in bones:
			b.setup_pose()
		for s in slots:
			s.setup_pose()
		for c in constraints:
			c.setup_pose()
		draw_order = slots.duplicate()

	func update_active() -> void:
		var active = {"default": true}
		for n in active_skins:
			active[n] = true
		var req_b = {}
		var req_c = {}
		for skin in skins:
			for bn in skin.bones:
				req_b[bn] = req_b.get(bn, false) or active.has(skin.name)
			for cn in skin.constraints:
				req_c[cn] = req_c.get(cn, false) or active.has(skin.name)
		for b in bones:
			b.active = (not req_b.has(b.name) or req_b[b.name]) and (b.parent == null or b.parent.active)
		for c in constraints:
			var ok: bool = not req_c.has(c.name) or req_c[c.name]
			for bn in c.bones:
				var bb = find_bone(bn)
				if bb != null and not bb.active:
					ok = false
			c.active = ok

	func sorted_constraints() -> Array:
		var list = constraints.duplicate()
		list.sort_custom(func(x, y): return x.order < y.order)
		return list

	# physics : "pose", "update", "reset" ou "none".
	func update_world_transform(physics := "pose") -> void:
		update_active()
		for b in bones:
			b.reset_applied()
			b.update_world_transform()
		for c in sorted_constraints():
			if not c.active:
				continue
			for b in c.apply(self, physics):
				update_descendants(b)

	func update_descendants(bone: Bone, include_self := false) -> void:
		if include_self:
			bone.update_world_transform()
		for b in bones:
			if bone.is_ancestor_of(b):
				b.update_world_transform()

	func reset_physics(n = null) -> void:
		for c in constraints:
			if c.kind == "physics" and (n == null or c.name == n):
				c.reset_state()

	# Positions monde des sommets d'une pièce jointe (région, maillage, polygone).
	func attachment_vertices(slot: Slot, att: Dictionary) -> PackedVector2Array:
		var bone = slot.bone
		var out = PackedVector2Array()
		match att.type:
			"region":
				for p in WN2DModel.region_corners(att):
					out.push_back(bone.local_to_world(p.x, p.y))
			"boundingbox", "clipping":
				for p in att.verts:
					out.push_back(bone.local_to_world(p.x, p.y))
			"mesh":
				var src = mesh_source(slot, att)
				var deform = slot.pose.deform if slot.pose.deformFor == deform_key_for(slot, att) else null
				if deform != null and deform.size() != WN2DModel.deform_length(src):
					deform = null
				if src.get("weights", null) == null:
					var i = 0
					for p in src.verts:
						var dx: float = deform[i * 2] if deform != null else 0.0
						var dy: float = deform[i * 2 + 1] if deform != null else 0.0
						out.push_back(bone.local_to_world(p.x + dx, p.y + dy))
						i += 1
				else:
					var f = 0
					for list in src.weights:
						var w = Vector2.ZERO
						for e in list:
							var bb = find_bone(e.bone)
							var lx: float = e.x + (deform[f] if deform != null else 0.0)
							var ly: float = e.y + (deform[f + 1] if deform != null else 0.0)
							f += 2
							if bb == null:
								continue
							w += bb.local_to_world(lx, ly) * e.w
						out.push_back(w)
		return out


# Coins (repère de l'os) d'une région : bas-gauche, bas-droite, haut-droite, haut-gauche.
static func region_corners(att: Dictionary) -> Array:
	var hw: float = att.width / 2.0
	var hh: float = att.height / 2.0
	var cs = cos(att.rotation * DEG)
	var sn = sin(att.rotation * DEG)
	var out: Array = []
	for p in [Vector2(-hw, -hh), Vector2(hw, -hh), Vector2(hw, hh), Vector2(-hw, hh)]:
		var sx: float = p.x * att.scaleX
		var sy: float = p.y * att.scaleY
		out.push_back(Vector2(att.x + sx * cs - sy * sn, att.y + sx * sn + sy * cs))
	return out


static func deform_length(src: Dictionary) -> int:
	if src.get("weights", null) == null:
		return src.verts.size() * 2
	var n = 0
	for list in src.weights:
		n += list.size()
	return n * 2


# --- Animations ------------------------------------------------------------------------------------

static func frame_index(keys: Array, t: float) -> int:
	var lo = 0
	var hi = keys.size() - 1
	var found = -1
	while lo <= hi:
		var mid = (lo + hi) >> 1
		if keys[mid].time <= t + TIME_EPSILON:
			found = mid
			lo = mid + 1
		else:
			hi = mid - 1
	return found


# Valeurs interpolées des champs (null avant la première clé).
static func sample(keys: Array, t: float, fields: Array):
	var i = frame_index(keys, t)
	if i < 0:
		return null
	var k: Dictionary = keys[i]
	var out: Array = []
	if i + 1 >= keys.size():
		for f in fields:
			out.push_back(float(k.get(f, 0.0)))
		return out
	var n: Dictionary = keys[i + 1]
	var e = evaluate_curve(k.get("curve", null), (t - k.time) / (n.time - k.time))
	for f in fields:
		var a = float(k.get(f, 0.0))
		out.push_back(a + (float(n.get(f, 0.0)) - a) * e)
	return out


static func mix_color(from: Color, to: Color, alpha: float) -> Color:
	return from.lerp(to, alpha) if alpha < 1.0 else to


static func sample_color(keys: Array, t: float, field: String):
	var i = frame_index(keys, t)
	if i < 0:
		return null
	var k: Dictionary = keys[i]
	if i + 1 >= keys.size():
		return hex_color(k[field])
	var n: Dictionary = keys[i + 1]
	var e = evaluate_curve(k.get("curve", null), (t - k.time) / (n.time - k.time))
	return hex_color(k[field]).lerp(hex_color(n[field]), e)


static func collect_events(keys: Array, from: float, to: float, out: Array) -> void:
	for k in keys:
		if k.time > from + TIME_EPSILON / 2.0 and k.time <= to + TIME_EPSILON:
			out.push_back(k)


const CONSTRAINT_TIMELINES := {
	"ik": {"ik": [["mix", "softness"], ["bendPositive", "compress", "stretch"]]},
	"transform": {"transform": [["mixRotate", "mixX", "mixY", "mixScaleX", "mixScaleY", "mixShearY"], []]},
	"path": {"position": [["position"], []], "spacing": [["spacing"], []], "mix": [["mixRotate", "mixX", "mixY"], []]},
	"physics": {"physics": [["inertia", "strength", "damping", "mass", "wind", "gravity", "mix"], []]},
}


class WAnimation:
	var name: String
	var data = {}
	var duration = 0.0

	func _init(n: String, d: Dictionary) -> void:
		name = n
		data = d
		duration = 0.0
		var lists: Array = []
		for bt in d.get("bones", {}).values():
			lists.append_array(bt.values())
		for st in d.get("slots", {}).values():
			lists.append_array(st.values())
		for skin in d.get("deform", {}).values():
			for sl in skin.values():
				lists.append_array(sl.values())
		for kind in ["ik", "transform", "physics"]:
			lists.append_array(d.get(kind, {}).values())
		for pt in d.get("path", {}).values():
			lists.append_array(pt.values())
		for k in ["drawOrder", "events", "physicsReset"]:
			lists.push_back(d.get(k, []))
		for keys in lists:
			if keys.size() > 0:
				duration = maxf(duration, keys[keys.size() - 1].time)

	func apply(sk: Skeleton, t: float, alpha := 1.0, loop := false, last_time := -1.0, events = null) -> void:
		var resets_from = null
		if loop and duration > 0.0:
			if events != null:
				var lt = t
				var tt = fmod(t, duration)
				if last_time < 0.0:
					WN2DModel.collect_events(data.get("events", []), -1.0, tt, events)
				elif floor(t / duration) > floor(last_time / duration):
					WN2DModel.collect_events(data.get("events", []), fmod(last_time, duration), duration, events)
					WN2DModel.collect_events(data.get("events", []), -1.0, tt, events)
				else:
					WN2DModel.collect_events(data.get("events", []), fmod(last_time, duration), tt, events)
				resets_from = fmod(last_time, duration) if last_time >= 0.0 else last_time
				events = null
			t = fmod(t, duration)
		elif events != null:
			resets_from = last_time
		if events != null:
			WN2DModel.collect_events(data.get("events", []), last_time, t, events)

		for bone_name in data.get("bones", {}):
			var bone = sk.find_bone(bone_name)
			if bone == null:
				continue
			var tls: Dictionary = data.bones[bone_name]
			var p = bone.pose
			if tls.has("rotate"):
				var v = WN2DModel.sample(tls.rotate, t, ["value"])
				var target = bone.rotation + (v[0] if v != null else 0.0)
				if alpha >= 1.0:
					p.rotation = target
				else:
					p.rotation += WN2DModel.wrap_deg(target - p.rotation) * alpha
			if tls.has("translate"):
				var v = WN2DModel.sample(tls.translate, t, ["x", "y"])
				p.x += (bone.x + (v[0] if v != null else 0.0) - p.x) * alpha
				p.y += (bone.y + (v[1] if v != null else 0.0) - p.y) * alpha
			if tls.has("scale"):
				var v = WN2DModel.sample(tls.scale, t, ["x", "y"])
				p.scaleX += (bone.scale_x * (v[0] if v != null else 1.0) - p.scaleX) * alpha
				p.scaleY += (bone.scale_y * (v[1] if v != null else 1.0) - p.scaleY) * alpha
			if tls.has("shear"):
				var v = WN2DModel.sample(tls.shear, t, ["x", "y"])
				p.shearX += (bone.shear_x + (v[0] if v != null else 0.0) - p.shearX) * alpha
				p.shearY += (bone.shear_y + (v[1] if v != null else 0.0) - p.shearY) * alpha

		for slot_name in data.get("slots", {}):
			var slot = sk.find_slot(slot_name)
			if slot == null:
				continue
			var tls: Dictionary = data.slots[slot_name]
			var p = slot.pose
			if tls.has("attachment") and alpha >= 0.5:
				var i = WN2DModel.frame_index(tls.attachment, t)
				p.attachment = slot.attachment if i < 0 else tls.attachment[i].get("name", null)
			if tls.has("rgba"):
				var col = WN2DModel.sample_color(tls.rgba, t, "color")
				if col == null:
					col = WN2DModel.hex_color(slot.color)
				p.color = WN2DModel.mix_color(WN2DModel.hex_color(p.color), col, alpha).to_html(true)
				p.color = "#" + p.color
			if tls.has("rgba2"):
				var light = WN2DModel.sample_color(tls.rgba2, t, "light")
				var dark = WN2DModel.sample_color(tls.rgba2, t, "dark")
				if light == null:
					light = WN2DModel.hex_color(slot.color)
				if dark == null:
					dark = WN2DModel.hex_color(slot.dark if slot.dark != null else "#000000")
				p.color = "#" + WN2DModel.mix_color(WN2DModel.hex_color(p.color), light, alpha).to_html(true)
				var cur_dark = WN2DModel.hex_color(p.dark if p.dark != null else "#000000")
				p.dark = "#" + WN2DModel.mix_color(cur_dark, dark, alpha).to_html(false)

		for skin_name in data.get("deform", {}):
			for slot_name in data.deform[skin_name]:
				var slot = sk.find_slot(slot_name)
				if slot == null:
					continue
				for att_name in data.deform[skin_name][slot_name]:
					var key = JSON.stringify([skin_name, slot_name, att_name])
					var cur = sk.current_attachment(slot)
					if cur == null or cur.type != "mesh" or sk.deform_key_for(slot, cur) != key:
						continue
					var keys: Array = data.deform[skin_name][slot_name][att_name]
					var v = WN2DModel.sample_array(keys, t)
					if v == null:
						continue
					var p = slot.pose
					var base = p.deform if p.deformFor == key and p.deform != null and p.deform.size() == v.size() else PackedFloat32Array()
					if base.size() != v.size():
						base.resize(v.size())
					var out = PackedFloat32Array()
					out.resize(v.size())
					for i in v.size():
						out[i] = base[i] + (v[i] - base[i]) * alpha
					p.deform = out
					p.deformFor = key

		for kind in WN2DModel.CONSTRAINT_TIMELINES:
			for cname in data.get(kind, {}):
				var c = sk.find_constraint(cname)
				if c == null or c.kind != kind:
					continue
				var by_type: Dictionary = data[kind][cname] if kind == "path" else {kind: data[kind][cname]}
				for type in by_type:
					var spec: Array = WN2DModel.CONSTRAINT_TIMELINES[kind][type]
					var keys: Array = by_type[type]
					var i = WN2DModel.frame_index(keys, t)
					if i < 0:
						continue
					var v = WN2DModel.sample(keys, t, spec[0])
					for j in spec[0].size():
						var f: String = spec[0][j]
						c.pose[f] += (v[j] - c.pose[f]) * alpha
					if alpha >= 0.5:
						for f in spec[1]:
							if keys[i].has(f):
								c.pose[f] = keys[i][f]

		if resets_from != null and data.has("physicsReset"):
			var resets: Array = []
			WN2DModel.collect_events(data.physicsReset, resets_from, t, resets)
			for r in resets:
				sk.reset_physics(r.get("name", null))

		if data.has("drawOrder") and data.drawOrder.size() > 0 and alpha >= 0.5:
			var i = WN2DModel.frame_index(data.drawOrder, t)
			var order = data.drawOrder[i].get("order", null) if i >= 0 else null
			sk.draw_order = WN2DModel.order_slots(sk, order) if order != null else sk.slots.duplicate()


static func sample_array(keys: Array, t: float):
	var i = frame_index(keys, t)
	if i < 0:
		return null
	var k: Dictionary = keys[i]
	var kv: Array = k.get("vertices", [])
	var out = PackedFloat32Array()
	if i + 1 >= keys.size():
		for x in kv:
			out.push_back(x)
		return out
	var n: Dictionary = keys[i + 1]
	var nv: Array = n.get("vertices", [])
	var len = maxi(kv.size(), nv.size())
	var e = evaluate_curve(k.get("curve", null), (t - k.time) / (n.time - k.time))
	out.resize(len)
	for j in len:
		var a: float = kv[j] if j < kv.size() else 0.0
		var b: float = nv[j] if j < nv.size() else 0.0
		out[j] = a + (b - a) * e
	return out


static func order_slots(sk: Skeleton, order: Array) -> Array:
	var out: Array = []
	var seen = {}
	for n in order:
		var s = sk.find_slot(n)
		if s != null:
			out.push_back(s)
			seen[s] = true
	for i in sk.slots.size():
		var s: Slot = sk.slots[i]
		if seen.has(s):
			continue
		var pos = 0
		for j in i:
			pos = maxi(pos, out.find(sk.slots[j]) + 1)
		out.insert(pos, s)
	return out


# --- Chemins ----------------------------------------------------------------------------------------

static func path_curves(att: Dictionary, bone: Bone) -> Array:
	var w: Array = []
	for p in att.verts:
		w.push_back(bone.local_to_world(p.x, p.y))
	var n = w.size() / 3
	var curves: Array = []
	var last = n if att.get("closed", false) else n - 1
	for k in last:
		var j = (k + 1) % n
		curves.push_back([w[k * 3 + 1], w[k * 3 + 2], w[j * 3], w[j * 3 + 1]])
	return curves


static func bezier_point(cv: Array, t: float) -> Vector2:
	var u = 1.0 - t
	return cv[0] * (u * u * u) + cv[1] * (3.0 * u * u * t) + cv[2] * (3.0 * u * t * t) + cv[3] * (t * t * t)


static func bezier_tangent(cv: Array, t: float) -> float:
	var u = 1.0 - t
	var dv: Vector2 = (cv[1] - cv[0]) * (3.0 * u * u) + (cv[2] - cv[1]) * (6.0 * u * t) + (cv[3] - cv[2]) * (3.0 * t * t)
	return atan2(dv.y, dv.x)


static func arc_table(curves: Array, samples := 24) -> Dictionary:
	var table: Array = []
	var total = 0.0
	for ci in curves.size():
		var prev = bezier_point(curves[ci], 0.0)
		if ci == 0:
			table.push_back([ci, 0.0, 0.0])
		for i in range(1, samples + 1):
			var t = float(i) / samples
			var p = bezier_point(curves[ci], t)
			total += p.distance_to(prev)
			table.push_back([ci, t, total])
			prev = p
	return {"table": table, "total": total}


static func point_at_distance(curves: Array, arc: Dictionary, dist: float, closed: bool) -> Dictionary:
	var table: Array = arc.table
	var total: float = arc.total
	if curves.is_empty():
		return {"x": 0.0, "y": 0.0, "angle": 0.0}
	if closed and total > 0.0:
		dist = fposmod(dist, total)
	if not closed and dist < 0.0:
		var a = bezier_tangent(curves[0], 0.0)
		var p: Vector2 = curves[0][0]
		return {"x": p.x + cos(a) * dist, "y": p.y + sin(a) * dist, "angle": a}
	if not closed and dist > total:
		var lc: Array = curves[curves.size() - 1]
		var a = bezier_tangent(lc, 1.0)
		var p: Vector2 = lc[3]
		return {"x": p.x + cos(a) * (dist - total), "y": p.y + sin(a) * (dist - total), "angle": a}
	var lo = 0
	var hi = table.size() - 1
	while lo < hi - 1:
		var mid = (lo + hi) >> 1
		if table[mid][2] < dist:
			lo = mid
		else:
			hi = mid
	var ta: Array = table[lo]
	var tb: Array = table[hi]
	var f: float = (dist - ta[2]) / (tb[2] - ta[2]) if tb[2] > ta[2] else 0.0
	var ci: int = tb[0]
	var t0: float = ta[1] if ta[0] == ci else 0.0
	var t: float = t0 + (tb[1] - t0) * f
	var pt = bezier_point(curves[ci], t)
	return {"x": pt.x, "y": pt.y, "angle": bezier_tangent(curves[ci], t)}


static func rotate_world(bone: Bone, r: float) -> void:
	if r == 0.0:
		return
	var cs = cos(r)
	var sn = sin(r)
	var a = bone.a
	var b = bone.b
	var c = bone.c
	var d = bone.d
	bone.a = cs * a - sn * c
	bone.b = cs * b - sn * d
	bone.c = sn * a + cs * c
	bone.d = sn * b + cs * d


# --- Contraintes -----------------------------------------------------------------------------------

class Constraint:
	var kind = ""
	var name = ""
	var order = 0.0
	var bones: Array = []
	var target = null
	var active = true
	var settings = {}
	var pose = {}
	var pose_fields: Array = []

	func setup_pose() -> void:
		for f in pose_fields:
			pose[f] = settings[f]

	func reset_state() -> void:
		pass

	func apply(_sk, _physics) -> Array:
		return []


class IkConstraint extends Constraint:
	func _init() -> void:
		kind = "ik"
		pose_fields = ["mix", "softness", "bendPositive", "compress", "stretch"]

	func apply(sk, _physics) -> Array:
		var t: Bone = sk.find_bone(target)
		var list: Array = []
		for n in bones:
			var b: Bone = sk.find_bone(n)
			if b != null:
				list.push_back(b)
		if t == null or list.is_empty() or pose.mix == 0.0:
			return []
		if list.size() == 1:
			_ik1(list[0], t.world_x, t.world_y, pose.compress, pose.stretch, settings.get("uniform", false), pose.mix)
			return [list[0]]
		_ik2(sk, list[0], list[1], t.world_x, t.world_y, 1.0 if pose.bendPositive else -1.0, pose.stretch, settings.get("uniform", false), pose.softness, pose.mix)
		return [list[0]]

	static func _ik1(bone: Bone, tx: float, ty: float, compress: bool, stretch: bool, uniform: bool, alpha: float) -> void:
		var p = bone.parent
		var pa = p.a if p != null else 1.0
		var pb = p.b if p != null else 0.0
		var pc = p.c if p != null else 0.0
		var pd = p.d if p != null else 1.0
		var ap = bone.ap
		var x = tx - (p.world_x if p != null else 0.0)
		var y = ty - (p.world_y if p != null else 0.0)
		var det = pa * pd - pb * pc
		var lx = 0.0
		var ly = 0.0
		if absf(det) > 1e-4:
			lx = (x * pd - y * pb) / det - ap.x
			ly = (y * pa - x * pc) / det - ap.y
		var rot: float = atan2(ly, lx) / WN2DModel.DEG - ap.shearX - ap.rotation
		if ap.scaleX < 0.0:
			rot += 180.0
		rot = WN2DModel.wrap_deg(rot)
		var sx: float = ap.scaleX
		var sy: float = ap.scaleY
		if compress or stretch:
			var b = bone.length * sx
			if b > 1e-4:
				var dd = lx * lx + ly * ly
				if (compress and dd < b * b) or (stretch and dd > b * b):
					var s = (sqrt(dd) / b - 1.0) * alpha + 1.0
					sx *= s
					if uniform:
						sy *= s
		ap.rotation += rot * alpha
		ap.scaleX = sx
		ap.scaleY = sy
		bone.update_world_transform()

	static func _ik2(sk, parent: Bone, child: Bone, tx: float, ty: float, bend_dir: float, stretch: bool, uniform: bool, softness: float, alpha: float) -> void:
		var px = parent.world_x
		var py = parent.world_y
		var l1 = Vector2(child.world_x - px, child.world_y - py).length()
		var l2 = child.length * child.world_scale_x()
		var dx = tx - px
		var dy = ty - py
		var dist = sqrt(dx * dx + dy * dy)
		if l1 < 1e-4 or dist < 1e-4:
			_ik1(child, tx, ty, false, stretch, uniform, alpha)
			return
		if stretch and dist > l1 + l2 and l1 + l2 > 0.0:
			var s = (dist / (l1 + l2) - 1.0) * alpha + 1.0
			parent.ap.scaleX *= s
			if uniform:
				parent.ap.scaleY *= s
			parent.update_world_transform()
			sk.update_descendants(parent)
			l1 = Vector2(child.world_x - px, child.world_y - py).length()
			l2 = child.length * child.world_scale_x()
		var total = l1 + l2
		if softness > 0.0 and dist > total - softness:
			var xx = (dist - (total - softness)) / softness
			var nd = total - softness + softness * (1.0 - exp(-xx))
			dx *= nd / dist
			dy *= nd / dist
			dist = nd
		var dc = clampf(dist, absf(l1 - l2) + 1e-4, total - 1e-4)
		var cos_a = clampf((l1 * l1 + dc * dc - l2 * l2) / (2.0 * l1 * dc), -1.0, 1.0)
		var flip = signf(parent.a * parent.d - parent.b * parent.c)
		if flip == 0.0:
			flip = 1.0
		var desired = atan2(dy, dx) + acos(cos_a) * bend_dir * flip
		var current = atan2(child.world_y - py, child.world_x - px)
		var p_flip = 1.0
		if parent.parent != null:
			p_flip = signf(parent.parent.a * parent.parent.d - parent.parent.b * parent.parent.c)
			if p_flip == 0.0:
				p_flip = 1.0
		parent.ap.rotation += WN2DModel.wrap_rad(desired - current) / WN2DModel.DEG * alpha * p_flip
		parent.update_world_transform()
		sk.update_descendants(parent)
		var c_desired = atan2(py + dy - child.world_y, px + dx - child.world_x)
		var c_current = atan2(child.c, child.a)
		child.ap.rotation += WN2DModel.wrap_rad(c_desired - c_current) / WN2DModel.DEG * alpha * flip
		child.update_world_transform()


class TransformConstraint extends Constraint:
	func _init() -> void:
		kind = "transform"
		pose_fields = ["mixRotate", "mixX", "mixY", "mixScaleX", "mixScaleY", "mixShearY"]

	func apply(sk, _physics) -> Array:
		var t: Bone = sk.find_bone(target)
		var list: Array = []
		for n in bones:
			var b: Bone = sk.find_bone(n)
			if b != null and b != t:
				list.push_back(b)
		if t == null or list.is_empty():
			return []
		for bone in list:
			if settings.get("local", false):
				_apply_local(bone, t)
			else:
				_apply_world(bone, t)
				bone.update_applied_from_world()
		return list

	func _apply_world(bone: Bone, t: Bone) -> void:
		var s = settings
		var m = pose
		var rel: bool = s.get("relative", false)
		var off_r: float = s.offsetRotation * WN2DModel.DEG
		if m.mixRotate != 0.0:
			var r: float = atan2(t.c, t.a) + off_r if rel else atan2(t.c, t.a) - atan2(bone.c, bone.a) + off_r
			WN2DModel.rotate_world(bone, WN2DModel.wrap_rad(r) * m.mixRotate)
		if m.mixX != 0.0 or m.mixY != 0.0:
			var w = t.local_to_world(s.offsetX, s.offsetY)
			if rel:
				bone.world_x += w.x * m.mixX
				bone.world_y += w.y * m.mixY
			else:
				bone.world_x += (w.x - bone.world_x) * m.mixX
				bone.world_y += (w.y - bone.world_y) * m.mixY
		if m.mixScaleX != 0.0:
			var sc = sqrt(bone.a * bone.a + bone.c * bone.c)
			var ts = sqrt(t.a * t.a + t.c * t.c)
			var f = 1.0
			if rel:
				f = (ts - 1.0 + s.offsetScaleX) * m.mixScaleX + 1.0
			elif sc > 1e-5:
				f = (sc + (ts - sc + s.offsetScaleX) * m.mixScaleX) / sc
			bone.a *= f
			bone.c *= f
		if m.mixScaleY != 0.0:
			var sc = sqrt(bone.b * bone.b + bone.d * bone.d)
			var ts = sqrt(t.b * t.b + t.d * t.d)
			var f = 1.0
			if rel:
				f = (ts - 1.0 + s.offsetScaleY) * m.mixScaleY + 1.0
			elif sc > 1e-5:
				f = (sc + (ts - sc + s.offsetScaleY) * m.mixScaleY) / sc
			bone.b *= f
			bone.d *= f
		if m.mixShearY != 0.0:
			var sc = sqrt(bone.b * bone.b + bone.d * bone.d)
			var by = atan2(bone.d, bone.b)
			var t_shear = atan2(t.d, t.b) - atan2(t.c, t.a)
			var r: float
			if rel:
				r = by + WN2DModel.wrap_rad(t_shear - PI / 2.0 + s.offsetShearY * WN2DModel.DEG) * m.mixShearY
			else:
				r = by + WN2DModel.wrap_rad(t_shear - (by - atan2(bone.c, bone.a)) + s.offsetShearY * WN2DModel.DEG) * m.mixShearY
			bone.b = cos(r) * sc
			bone.d = sin(r) * sc

	func _apply_local(bone: Bone, t: Bone) -> void:
		var s = settings
		var m = pose
		var ap = bone.ap
		var ta = t.ap
		if s.get("relative", false):
			ap.rotation += (ta.rotation + s.offsetRotation) * m.mixRotate
			ap.x += (ta.x + s.offsetX) * m.mixX
			ap.y += (ta.y + s.offsetY) * m.mixY
			ap.scaleX *= (ta.scaleX - 1.0 + s.offsetScaleX) * m.mixScaleX + 1.0
			ap.scaleY *= (ta.scaleY - 1.0 + s.offsetScaleY) * m.mixScaleY + 1.0
			ap.shearY += (ta.shearY + s.offsetShearY) * m.mixShearY
		else:
			ap.rotation += WN2DModel.wrap_deg(ta.rotation - ap.rotation + s.offsetRotation) * m.mixRotate
			ap.x += (ta.x - ap.x + s.offsetX) * m.mixX
			ap.y += (ta.y - ap.y + s.offsetY) * m.mixY
			if ap.scaleX != 0.0:
				ap.scaleX += (ta.scaleX - ap.scaleX + s.offsetScaleX) * m.mixScaleX
			if ap.scaleY != 0.0:
				ap.scaleY += (ta.scaleY - ap.scaleY + s.offsetScaleY) * m.mixScaleY
			ap.shearY += WN2DModel.wrap_deg(ta.shearY - ap.shearY + s.offsetShearY) * m.mixShearY
		bone.update_world_transform()


class PathConstraint extends Constraint:
	func _init() -> void:
		kind = "path"
		pose_fields = ["position", "spacing", "mixRotate", "mixX", "mixY"]

	func apply(sk, _physics) -> Array:
		var slot: Slot = sk.find_slot(target)
		if slot == null:
			return []
		var att = sk.current_attachment(slot)
		if att == null or att.type != "path" or att.verts.size() < 6:
			return []
		var list: Array = []
		for n in bones:
			var b: Bone = sk.find_bone(n)
			if b != null:
				list.push_back(b)
		if list.is_empty():
			return []
		var s = settings
		var m = pose
		var curves = WN2DModel.path_curves(att, slot.bone)
		var arc = WN2DModel.arc_table(curves)
		var total: float = arc.total
		var lengths: Array = []
		var sum_l = 0.0
		for b in list:
			var l: float = b.length * b.world_scale_x()
			lengths.push_back(l)
			sum_l += l
		if sum_l == 0.0:
			sum_l = 1.0
		var dist: float = m.position * total if s.positionMode == "percent" else m.position
		var dists: Array = [dist]
		for i in list.size():
			var sp: float
			match s.spacingMode:
				"length":
					sp = lengths[i] + m.spacing
				"fixed":
					sp = m.spacing
				"percent":
					sp = m.spacing * total
				_:
					sp = lengths[i] / sum_l * total * (m.spacing if m.spacing != 0.0 else 1.0)
			dist += sp
			dists.push_back(dist)
		var off_r: float = s.offsetRotation * WN2DModel.DEG
		var closed: bool = att.get("closed", false)
		for i in list.size():
			var bone: Bone = list[i]
			var pt = WN2DModel.point_at_distance(curves, arc, dists[i], closed)
			var nx = WN2DModel.point_at_distance(curves, arc, dists[i + 1], closed)
			bone.world_x += (pt.x - bone.world_x) * m.mixX
			bone.world_y += (pt.y - bone.world_y) * m.mixY
			if m.mixRotate != 0.0:
				var angle: float = pt.angle if s.rotateMode == "tangent" else atan2(nx.y - pt.y, nx.x - pt.x)
				if s.rotateMode == "chainScale" and lengths[i] > 1e-4:
					var sc: float = 1.0 + (Vector2(nx.x - pt.x, nx.y - pt.y).length() / lengths[i] - 1.0) * m.mixRotate
					bone.a *= sc
					bone.c *= sc
				WN2DModel.rotate_world(bone, WN2DModel.wrap_rad(angle - atan2(bone.c, bone.a) + off_r) * m.mixRotate)
			bone.update_applied_from_world()
			sk.update_descendants(bone, true)
		return []


class PhysicsConstraint extends Constraint:
	var st = {}

	func _init() -> void:
		kind = "physics"
		pose_fields = ["inertia", "strength", "damping", "mass", "wind", "gravity", "mix"]
		reset_state()

	func reset_state() -> void:
		st = {"reset": true, "ux": 0.0, "uy": 0.0, "cx": 0.0, "cy": 0.0, "tx": 0.0, "ty": 0.0,
			"xOffset": 0.0, "xVelocity": 0.0, "yOffset": 0.0, "yVelocity": 0.0, "rotateOffset": 0.0,
			"rotateVelocity": 0.0, "scaleOffset": 0.0, "scaleVelocity": 0.0, "remaining": 0.0, "lastTime": 0.0}

	func apply(sk, physics) -> Array:
		var bone: Bone = sk.find_bone(bones[0] if bones.size() > 0 else null)
		var p = pose
		var s = settings
		if bone == null or p.mix == 0.0 or physics == "none":
			return []
		if physics == "reset":
			reset_state()
			st.lastTime = sk.time
		var do_x: bool = s.x > 0.0
		var do_y: bool = s.y > 0.0
		var rot_or_shear: bool = s.rotate > 0.0 or s.shearX > 0.0
		var do_scale: bool = s.scaleX > 0.0
		var l = bone.length
		var ref: float = sk.reference_scale
		var mass: float = 1.0 / p.mass if p.mass > 0.0 else 1.0
		var limit: float = s.limit
		if physics == "update" or physics == "reset":
			var delta = maxf(sk.time - st.lastTime, 0.0)
			st.remaining += delta
			st.lastTime = sk.time
			var bx = bone.world_x
			var by = bone.world_y
			if st.reset:
				st.reset = false
				st.ux = bx
				st.uy = by
			else:
				var a: float = st.remaining
				var i: float = p.inertia
				var t: float = s.step
				var dmp = -1.0
				var mm = 0.0
				if do_x or do_y:
					if do_x:
						st.xOffset += clampf((st.ux - bx) * i, -limit, limit)
						st.ux = bx
					if do_y:
						st.yOffset += clampf((st.uy - by) * i, -limit, limit)
						st.uy = by
					if a >= t:
						dmp = pow(p.damping, 60.0 * t)
						mm = mass * t
						var e: float = p.strength
						var w: float = p.wind * ref
						var g: float = p.gravity * ref
						while a >= t:
							if do_x:
								st.xVelocity += (w - st.xOffset * e) * mm
								st.xOffset += st.xVelocity * t
								st.xVelocity *= dmp
							if do_y:
								st.yVelocity -= (g + st.yOffset * e) * mm
								st.yOffset += st.yVelocity * t
								st.yVelocity *= dmp
							a -= t
					if do_x:
						bone.world_x += st.xOffset * p.mix * s.x
					if do_y:
						bone.world_y += st.yOffset * p.mix * s.y
				if rot_or_shear or do_scale:
					var ca = atan2(bone.c, bone.a)
					var cs: float
					var sn: float
					var dx = clampf(st.cx - bone.world_x, -limit, limit)
					var dy = clampf(st.cy - bone.world_y, -limit, limit)
					if rot_or_shear:
						var mr: float = (s.rotate + s.shearX) * p.mix
						var r: float = atan2(dy + st.ty, dx + st.tx) - ca - st.rotateOffset * mr
						st.rotateOffset += WN2DModel.wrap_rad(r) * i
						r = st.rotateOffset * mr + ca
						cs = cos(r)
						sn = sin(r)
						if do_scale:
							var len = l * bone.world_scale_x()
							if len > 0.0:
								st.scaleOffset += (dx * cs + dy * sn) * i / len
					else:
						cs = cos(ca)
						sn = sin(ca)
						var len = l * bone.world_scale_x()
						if len > 0.0:
							st.scaleOffset += (dx * cs + dy * sn) * i / len
					a = st.remaining
					if a >= t:
						if dmp == -1.0:
							dmp = pow(p.damping, 60.0 * t)
							mm = mass * t
						var e: float = p.strength
						var w: float = p.wind * ref
						var g: float = p.gravity * ref
						var h: float = l / ref
						while true:
							a -= t
							if do_scale:
								st.scaleVelocity += (w * cs - g * sn - st.scaleOffset * e) * mm
								st.scaleOffset += st.scaleVelocity * t
								st.scaleVelocity *= dmp
							if rot_or_shear:
								st.rotateVelocity -= ((w * sn + g * cs) * h + st.rotateOffset * e) * mm
								st.rotateOffset += st.rotateVelocity * t
								st.rotateVelocity *= dmp
							if a < t:
								break
				st.remaining = a
			st.cx = bone.world_x
			st.cy = bone.world_y
		else:
			if do_x:
				bone.world_x += st.xOffset * p.mix * s.x
			if do_y:
				bone.world_y += st.yOffset * p.mix * s.y
		if rot_or_shear:
			var o: float = st.rotateOffset * p.mix
			if s.shearX > 0.0:
				var r = 0.0
				if s.rotate > 0.0:
					r = o * s.rotate
					var sn2 = sin(r)
					var cs2 = cos(r)
					var bb = bone.b
					bone.b = cs2 * bb - sn2 * bone.d
					bone.d = sn2 * bb + cs2 * bone.d
				r += o * s.shearX
				var sn3 = sin(r)
				var cs3 = cos(r)
				var aa = bone.a
				bone.a = cs3 * aa - sn3 * bone.c
				bone.c = sn3 * aa + cs3 * bone.c
			else:
				WN2DModel.rotate_world(bone, o * s.rotate)
		if do_scale:
			var scl: float = 1.0 + st.scaleOffset * p.mix * s.scaleX
			bone.a *= scl
			bone.c *= scl
		if physics != "pose":
			st.tx = l * bone.a
			st.ty = l * bone.c
		bone.update_applied_from_world()
		return [bone]


# --- Pistes et fondus ---------------------------------------------------------------------------

class TrackEntry:
	var animation: WAnimation
	var loop = true
	var time = 0.0
	var last_time = -1.0
	var time_scale = 1.0
	var alpha = 1.0
	var delay = 0.0
	var mix_duration = 0.0
	var mix_time = 0.0
	var from: TrackEntry = null
	var next: TrackEntry = null

	func mix() -> float:
		return minf(1.0, mix_time / mix_duration) if mix_duration > 0.0 else 1.0


class AnimationState:
	var skeleton: Skeleton
	var default_mix = 0.2
	var mixes = {}
	var tracks: Array = []
	# Appelé pour chaque événement déclenché : func(piste: int, clé: Dictionary).
	var on_event: Callable

	func _init(sk: Skeleton) -> void:
		skeleton = sk

	func set_mix(from: String, to: String, duration: float) -> void:
		mixes[from + "|" + to] = duration

	func get_mix(from: String, to: String) -> float:
		return mixes.get(from + "|" + to, default_mix)

	func _track(i: int) -> TrackEntry:
		return tracks[i] if i < tracks.size() else null

	func set_animation(track: int, anim: WAnimation, loop := true) -> TrackEntry:
		var e = TrackEntry.new()
		e.animation = anim
		e.loop = loop
		var cur = _track(track)
		if cur != null:
			e.from = cur if cur.animation != null else cur.from
			if e.from != null:
				e.from.next = null
			e.mix_duration = get_mix(e.from.animation.name, anim.name) if e.from != null and e.from.animation != null and anim != null else default_mix
		while tracks.size() <= track:
			tracks.push_back(null)
		tracks[track] = e
		return e

	func set_empty_animation(track: int, mix_duration := -1.0) -> TrackEntry:
		var e = set_animation(track, null, false)
		e.mix_duration = mix_duration if mix_duration >= 0.0 else default_mix
		return e

	func add_animation(track: int, anim: WAnimation, loop := true, delay := 0.0) -> TrackEntry:
		var last = _track(track)
		if last == null:
			return set_animation(track, anim, loop)
		while last.next != null:
			last = last.next
		var e = TrackEntry.new()
		e.animation = anim
		e.loop = loop
		e.mix_duration = get_mix(last.animation.name, anim.name) if last.animation != null and anim != null else default_mix
		var d: float = last.animation.duration if last.animation != null else 0.0
		e.delay = delay if last.loop else maxf(0.0, d + delay - (e.mix_duration if delay <= 0.0 else 0.0))
		last.next = e
		return e

	func update(dt: float) -> void:
		for i in tracks.size():
			var e: TrackEntry = tracks[i]
			if e == null:
				continue
			e.last_time = e.time
			e.time += dt * e.time_scale
			if e.from != null:
				e.from.last_time = e.from.time
				e.from.time += dt * e.from.time_scale
				e.mix_time += dt
				if e.mix_time >= e.mix_duration:
					e.from = null
			if e.next != null and e.time >= e.next.delay:
				var nx = e.next
				nx.from = e
				nx.time = e.time - nx.delay
				nx.last_time = -1.0
				e.next = null
				tracks[i] = nx
			var cur: TrackEntry = tracks[i]
			if cur.animation == null and cur.from == null:
				tracks[i] = null

	func apply(sk: Skeleton = null) -> void:
		if sk == null:
			sk = skeleton
		sk.setup_pose()
		for i in tracks.size():
			var e: TrackEntry = tracks[i]
			if e == null:
				continue
			var base = 1.0 if i == 0 else e.alpha
			var events: Array = []
			if e.from != null and e.from.animation != null:
				var from_base = 1.0 if i == 0 else e.from.alpha
				var from_alpha = 1.0 if i == 0 and e.animation != null else from_base * (1.0 - e.mix())
				e.from.animation.apply(sk, e.from.time, from_alpha, e.from.loop, e.from.last_time, events if e.mix() < 0.5 else null)
			if e.animation != null:
				e.animation.apply(sk, e.time, base * e.mix(), e.loop, e.last_time, events)
			if on_event.is_valid():
				for k in events:
					on_event.call(i, k)


# --- Chargement ---------------------------------------------------------------------------------------

static func _v(d: Dictionary, k: String, def):
	return d[k] if d.has(k) else def


static func _pairs(flat: Array) -> Array:
	var out: Array = []
	for i in range(0, flat.size(), 2):
		out.push_back(Vector2(flat[i], flat[i + 1]))
	return out


static func _parse_attachment(name: String, ad: Dictionary) -> Dictionary:
	var type: String = _v(ad, "type", "region")
	var att = {"type": type, "name": name, "color": _v(ad, "color", "#ffffffff")}
	match type:
		"region":
			att.path = _v(ad, "path", name)
			for k in ["x", "y", "rotation"]:
				att[k] = float(_v(ad, k, 0.0))
			att.scaleX = float(_v(ad, "scaleX", 1.0))
			att.scaleY = float(_v(ad, "scaleY", 1.0))
			att.width = float(_v(ad, "width", 32.0))
			att.height = float(_v(ad, "height", 32.0))
		"mesh", "linkedmesh":
			att.type = "mesh"
			att.path = _v(ad, "path", name)
			att.width = float(_v(ad, "width", 32.0))
			att.height = float(_v(ad, "height", 32.0))
			if type == "linkedmesh":
				att.parent = ad.parent
				att.timelines = _v(ad, "timelines", true)
			else:
				att.parent = null
				att.uvs = _pairs(ad.uvs)
				att.triangles = PackedInt32Array(ad.triangles)
				att.hull = int(_v(ad, "hull", att.uvs.size()))
				if ad.has("weights"):
					var weights: Array = []
					for flat in ad.weights:
						var list: Array = []
						for i in range(0, flat.size(), 4):
							list.push_back({"bone": flat[i], "x": float(flat[i + 1]), "y": float(flat[i + 2]), "w": float(flat[i + 3])})
						weights.push_back(list)
					att.weights = weights
					att.verts = []
				else:
					att.weights = null
					att.verts = _pairs(ad.vertices)
		"path":
			att.verts = _pairs(ad.vertices)
			att.closed = _v(ad, "closed", false)
			att.color = _v(ad, "color", "#ff7f00ff")
		"boundingbox", "clipping":
			att.verts = _pairs(ad.vertices)
			att.end = _v(ad, "end", null)
		"point":
			for k in ["x", "y", "rotation"]:
				att[k] = float(_v(ad, k, 0.0))
	return att


const CONSTRAINT_DEFAULTS := {
	"ik": {"mix": 1.0, "softness": 0.0, "bendPositive": true, "compress": false, "stretch": false, "uniform": false},
	"transform": {"mixRotate": 1.0, "mixX": 1.0, "mixY": 1.0, "mixScaleX": 1.0, "mixScaleY": 1.0, "mixShearY": 1.0,
		"offsetRotation": 0.0, "offsetX": 0.0, "offsetY": 0.0, "offsetScaleX": 0.0, "offsetScaleY": 0.0, "offsetShearY": 0.0,
		"local": false, "relative": false},
	"path": {"positionMode": "percent", "spacingMode": "length", "rotateMode": "tangent", "offsetRotation": 0.0,
		"position": 0.0, "spacing": 0.0, "mixRotate": 1.0, "mixX": 1.0, "mixY": 1.0},
	"physics": {"x": 0.0, "y": 0.0, "rotate": 1.0, "scaleX": 0.0, "shearX": 0.0, "limit": 5000.0, "step": 1.0 / 60.0,
		"inertia": 1.0, "strength": 100.0, "damping": 1.0, "mass": 1.0, "wind": 0.0, "gravity": 0.0, "mix": 1.0},
}


# Lit les données d'un squelette (texte JSON exporté par l'éditeur).
static func load_skeleton(text: String) -> Skeleton:
	var data = JSON.parse_string(text)
	if not (data is Dictionary) or data.get("format", "") != "worldnime2d":
		push_error("Worldnime2D : ce fichier n'est pas un squelette Worldnime2D.")
		return null
	var sk = Skeleton.new()
	sk.data = data
	sk.name = data.get("skeleton", {}).get("name", "")
	for bd in data.bones:
		var b = Bone.new()
		b.name = bd.name
		b.parent = sk.find_bone(bd.get("parent", null))
		if b.parent != null:
			b.parent.children.push_back(b)
		b.length = float(_v(bd, "length", 0.0))
		b.x = float(_v(bd, "x", 0.0))
		b.y = float(_v(bd, "y", 0.0))
		b.rotation = float(_v(bd, "rotation", 0.0))
		b.scale_x = float(_v(bd, "scaleX", 1.0))
		b.scale_y = float(_v(bd, "scaleY", 1.0))
		b.shear_x = float(_v(bd, "shearX", 0.0))
		b.shear_y = float(_v(bd, "shearY", 0.0))
		b.inherit = _v(bd, "inherit", "normal")
		sk.bones.push_back(b)
		sk.bones_by_name[b.name] = b
	for sd in data.get("slots", []):
		var s = Slot.new()
		s.name = sd.name
		s.bone = sk.find_bone(sd.bone)
		s.color = _v(sd, "color", "#ffffffff")
		s.dark = _v(sd, "dark", null)
		s.attachment = _v(sd, "attachment", null)
		s.blend = _v(sd, "blend", "normal")
		sk.slots.push_back(s)
		sk.slots_by_name[s.name] = s
	for skd in data.get("skins", []):
		var skin = WSkin.new()
		skin.name = skd.name
		for bn in skd.get("bones", []):
			skin.bones[bn] = true
		for cn in skd.get("constraints", []):
			skin.constraints[cn] = true
		for slot_name in skd.get("attachments", {}):
			skin.attachments[slot_name] = {}
			for an in skd.attachments[slot_name]:
				skin.attachments[slot_name][an] = _parse_attachment(an, skd.attachments[slot_name][an])
		sk.skins.push_back(skin)
	if sk.skins.is_empty() or sk.skins[0].name != "default":
		var def = WSkin.new()
		def.name = "default"
		sk.skins.push_front(def)
	var classes = {"ik": IkConstraint, "transform": TransformConstraint, "path": PathConstraint, "physics": PhysicsConstraint}
	for kind in classes:
		for cd in data.get(kind, []):
			var c = classes[kind].new()
			c.name = cd.name
			c.order = float(_v(cd, "order", 0.0))
			c.bones = cd.get("bones", [])
			c.target = _v(cd, "target", null)
			var settings: Dictionary = CONSTRAINT_DEFAULTS[kind].duplicate()
			for k in settings:
				if cd.has(k):
					settings[k] = cd[k]
			c.settings = settings
			sk.constraints.push_back(c)
	for an in data.get("animations", {}):
		sk.animations[an] = WAnimation.new(an, data.animations[an])
	sk.events = data.get("events", {})
	sk.setup_pose()
	sk.update_world_transform("reset")
	return sk

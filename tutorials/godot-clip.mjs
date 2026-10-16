// Fabrique le court extrait « Ama dans Godot » montré dans la leçon 22 :
// un projet Godot 4 temporaire (runtime runtimes/godot + export de la leçon 21) est joué
// avec le Movie Maker de Godot, puis converti en WebP animé.
//
//   node tutorials/godot-clip.mjs [chemin de godot]
//
// Prérequis : la leçon 21 doit avoir été jouée (son export sert de personnage).
// Godot ouvre brièvement une fenêtre pendant l'enregistrement.

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const godot = process.argv[2] || 'godot-4';
const exportDir = join(here, 'output/travail/21-export/export');
const project = join(here, 'output/travail/godot-ama');
const out = join(here, 'output/travail/godot-ama.webp');
const FPS = 30;
const SECONDS = 9;

if (!existsSync(join(exportDir, 'ama.json'))) {
  console.error(`Export introuvable (${exportDir}) : jouez d'abord la leçon 21 (node tutorials/make.mjs --rapide 21).`);
  process.exit(1);
}

rmSync(project, { recursive: true, force: true });
mkdirSync(join(project, 'ama'), { recursive: true });
cpSync(join(root, 'runtimes/godot/addons'), join(project, 'addons'), { recursive: true });
for (const f of readdirSync(exportDir)) if (/^ama(\.json|\.atlas\.json|(_\d+)?\.png)$/.test(f)) cpSync(join(exportDir, f), join(project, 'ama', f));

writeFileSync(join(project, 'project.godot'), `config_version=5

[application]
config/name="Ama dans Godot"
run/main_scene="res://main.tscn"

[display]
window/size/viewport_width=1280
window/size/viewport_height=720
window/stretch/mode="canvas_items"
window/stretch/aspect="keep"

[rendering]
environment/defaults/default_clear_color=Color(0.16, 0.2, 0.28, 1)
`);

writeFileSync(join(project, 'main.tscn'), `[gd_scene load_steps=3 format=3]

[ext_resource type="Script" path="res://main.gd" id="1"]
[ext_resource type="Script" path="res://addons/worldnime2d/worldnime2d_skeleton.gd" id="2"]

[node name="Main" type="Node2D"]
script = ExtResource("1")

[node name="Sol" type="ColorRect" parent="."]
offset_top = 600.0
offset_right = 1280.0
offset_bottom = 720.0
color = Color(0.36, 0.18, 0.16, 1)

[node name="Perso" type="Node2D" parent="."]
position = Vector2(640, 610)
scale = Vector2(0.95, 0.95)
script = ExtResource("2")
skeleton_file = "res://ama/ama.json"
animation = "repos"

[node name="Titre" type="Label" parent="."]
offset_left = 30.0
offset_top = 24.0
theme_override_font_sizes/font_size = 30
text = "Godot 4 · runtime Worldnime2D"

[node name="Etat" type="Label" parent="."]
offset_left = 30.0
offset_top = 70.0
theme_override_font_sizes/font_size = 24
text = ""
`);

// Scénario : repos en boucle, salut par-dessus (piste 1), puis un saut qui revient au repos.
writeFileSync(join(project, 'main.gd'), `extends Node2D

@onready var perso: Worldnime2DSkeleton = $Perso
@onready var etat: Label = $Etat
var t := 0.0
var step := 0


func _ready() -> void:
	perso.default_mix = 0.25
	etat.text = 'set_animation(0, "repos", true)'


func _process(delta: float) -> void:
	t += delta
	if step == 0 and t > 1.5:
		step = 1
		perso.set_animation(1, "salut", true)
		etat.text = 'set_animation(1, "salut", true)  # par-dessus le repos'
	elif step == 1 and t > 4.2:
		step = 2
		perso.set_empty_animation(1, 0.4)
		etat.text = 'set_empty_animation(1, 0.4)  # fin du salut, en fondu'
	elif step == 2 and t > 5.5:
		step = 3
		perso.set_animation(0, "saut", false)
		perso.add_animation(0, "repos", true)
		etat.text = 'set_animation(0, "saut", false) puis add_animation(0, "repos")'
`);

const run = (args) => {
  const r = spawnSync(godot, args, { cwd: project, stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`godot ${args.join(' ')} : code ${r.status}`);
};
run(['--headless', '--path', project, '--import']);
mkdirSync(join(project, 'frames'), { recursive: true });
run(['--path', project, '--write-movie', join(project, 'frames/f.png'), '--fixed-fps', String(FPS), '--quit-after', String(FPS * SECONDS)]);
const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(project, 'frames/f%08d.png'),
  '-vf', 'scale=960:-1', '-c:v', 'libwebp_anim', '-lossless', '0', '-q:v', '72', '-loop', '0', out], { stdio: 'inherit' });
if (r.status !== 0) process.exit(1);
console.log(`✔ ${out}`);

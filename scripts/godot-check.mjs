// Vérifie le runtime Godot : le même scénario est joué par le modèle JavaScript de l'éditeur et par
// le runtime GDScript (Godot en mode sans fenêtre), puis les poses sont comparées.
// Usage : node scripts/godot-check.mjs [chemin de godot]
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Skeleton } from '../src/renderer/js/model/skeleton.js';
import { RegionAttachment } from '../src/renderer/js/model/attachment.js';
import { MeshAttachment, meshFromRegion } from '../src/renderer/js/model/mesh.js';
import { triangulate } from '../src/renderer/js/model/geometry.js';
import { bindAuto } from '../src/renderer/js/model/weights.js';
import { straightPath } from '../src/renderer/js/model/path.js';
import { ClippingAttachment, BoundingBoxAttachment, squarePolygon } from '../src/renderer/js/model/special.js';
import { deformKey } from '../src/renderer/js/model/animation.js';
import { serializeProject, parseProject } from '../src/renderer/js/model/format.js';
import { AnimationState } from '../src/renderer/js/model/animationstate.js';
import { INHERIT } from '../src/renderer/js/model/bone.js';

const godot = process.argv[2] || 'godot-4';
const project = resolve('runtimes/godot/test_project');

// --- Squelette de test qui utilise tout ce que le runtime doit gérer -------------------------------
function buildSkeleton() {
  const sk = new Skeleton();
  sk.name = 'banc';
  const hips = sk.addBone('hanches', sk.root);
  hips.y = 100;
  hips.rotation = 90;
  hips.length = 60;
  hips.shearY = 5;
  const torse = sk.addBone('torse', hips);
  torse.x = 60;
  torse.length = 80;
  torse.scaleX = 1.1;
  const epaule = sk.addBone('epaule', torse);
  epaule.x = 70;
  epaule.y = -10;
  epaule.rotation = 180;
  epaule.length = 50;
  const coude = sk.addBone('coude', epaule);
  coude.x = 50;
  coude.length = 50;
  const cible = sk.addBone('cible', sk.root);
  cible.x = -80;
  cible.y = 150;
  const tete = sk.addBone('tete', torse);
  tete.x = 80;
  tete.length = 40;
  tete.inherit = INHERIT.noRotationOrReflection;
  const chapeau = sk.addBone('chapeau', tete);
  chapeau.x = 40;
  chapeau.length = 20;
  chapeau.inherit = INHERIT.noScale;
  const flotte = sk.addBone('flotte', torse);
  flotte.x = 40;
  flotte.y = 30;
  flotte.length = 30;
  flotte.inherit = INHERIT.onlyTranslation;
  const queue = sk.addBone('queue', hips);
  queue.rotation = 180;
  queue.length = 70;
  const c1 = sk.addBone('c1', sk.root);
  c1.x = 100;
  c1.length = 30;
  const c2 = sk.addBone('c2', c1);
  c2.x = 30;
  c2.length = 30;
  const copie = sk.addBone('copie', sk.root);
  copie.x = 50;
  copie.y = -50;
  copie.length = 20;
  sk.updateWorldTransform();

  // Slots et pièces jointes.
  const sTorse = sk.addSlot('torse', torse);
  const reg = new RegionAttachment('torse');
  Object.assign(reg, { x: 40, y: 3, rotation: 7, scaleX: 1.2, scaleY: 0.9, width: 90, height: 60 });
  sk.addAttachment(sTorse, reg);
  sTorse.attachment = 'torse';
  const sBras = sk.addSlot('bras', epaule);
  const r2 = new RegionAttachment('bras');
  Object.assign(r2, { x: 50, width: 110, height: 24 });
  const mesh = meshFromRegion(r2);
  // Contour en bande avec points intérieurs, puis poids sur 2 os.
  const pts = [];
  for (let i = 0; i <= 4; i++) pts.push([i * 27.5 - 5, -12]);
  for (let i = 4; i >= 0; i--) pts.push([i * 27.5 - 5, 12]);
  pts.push([25, 0], [70, 0]);
  mesh.vertices = pts;
  mesh.uvs = pts.map(([x, y]) => [(x + 5) / 110, (12 - y) / 24]);
  mesh.hull = 10;
  mesh.triangles = triangulate(pts, 10);
  sk.addAttachment(sBras, mesh);
  sBras.attachment = 'bras';
  sk.updateWorldTransform();
  const w = [];
  const v = MeshAttachment.worldVertices(mesh, epaule, sk);
  for (let i = 0; i < v.length; i += 2) w.push([v[i], v[i + 1]]);
  bindAuto(mesh, sk, ['epaule', 'coude'], w);
  const linked = new MeshAttachment('bras_tatoue');
  linked.parent = 'bras';
  linked.path = 'bras_tatoue';
  sk.addAttachment(sBras, linked);
  const sClip = sk.addSlot('masque', hips, 0);
  const clip = new ClippingAttachment('masque');
  clip.vertices = squarePolygon(300);
  clip.end = 'torse';
  sk.addAttachment(sClip, clip);
  sClip.attachment = 'masque';
  const sZone = sk.addSlot('zone', tete);
  const box = new BoundingBoxAttachment('zone');
  box.vertices = squarePolygon(30);
  sk.addAttachment(sZone, box);
  sZone.attachment = 'zone';
  const sChemin = sk.addSlot('chemin', sk.root);
  const p = straightPath('chemin', 160, 3);
  p.vertices[4] = [80, 60];
  sk.addAttachment(sChemin, p);
  sChemin.attachment = 'chemin';

  // Skins : une version dorée du torse, un os réservé.
  const or = sk.addSkin('or');
  const regOr = reg.copy('torse');
  regOr.scaleX = 1.5;
  sk.addAttachment(sTorse, regOr, or);
  or.bones.add('chapeau');

  // Contraintes.
  const ik = sk.addConstraint('ik', 'bras_ik');
  ik.bones = ['epaule', 'coude'];
  ik.target = 'cible';
  ik.softness = 5;
  const ik1 = sk.addConstraint('ik', 'tete_ik');
  ik1.bones = ['tete'];
  ik1.target = 'cible';
  ik1.mix = 0.3;
  ik1.stretch = true;
  for (const [name, local, relative] of [['copie_monde', false, false], ['copie_rel', false, true], ['copie_loc', true, false], ['copie_locrel', true, true]]) {
    const tc = sk.addConstraint('transform', name);
    tc.bones = ['copie'];
    tc.target = 'flotte';
    tc.local = local;
    tc.relative = relative;
    tc.mixRotate = 0.4;
    tc.mixX = 0.3;
    tc.mixY = 0.2;
    tc.mixScaleX = 0.5;
    tc.mixScaleY = 0.25;
    tc.mixShearY = 0.6;
    tc.offsetRotation = 10;
    tc.offsetX = 5;
  }
  const pc = sk.addConstraint('path', 'suivi');
  pc.bones = ['c1', 'c2'];
  pc.target = 'chemin';
  pc.position = 0.1;
  pc.rotateMode = 'chainScale';
  const ph = sk.addConstraint('physics', 'queue_phys');
  ph.bones = ['queue'];
  ph.rotate = 1;
  ph.x = 0.5;
  ph.scaleX = 0.3;
  ph.gravity = 2;
  ph.wind = 1;
  ph.strength = 80;
  ph.damping = 0.95;

  // Animations.
  const marche = sk.addAnimation('marche');
  marche.setKey('bone', 'hanches', 'translate', { time: 0, x: 0, y: 0, curve: [0.42, 0, 0.58, 1] });
  marche.setKey('bone', 'hanches', 'translate', { time: 0.5, x: 30, y: 10 });
  marche.setKey('bone', 'hanches', 'translate', { time: 1, x: 0, y: 0 });
  marche.setKey('bone', 'torse', 'rotate', { time: 0, value: -10, curve: [0.1, 0.8, 0.3, 1.2] });
  marche.setKey('bone', 'torse', 'rotate', { time: 1, value: 15 });
  marche.setKey('bone', 'torse', 'scale', { time: 0.25, x: 1.2, y: 0.9, curve: 'stepped' });
  marche.setKey('bone', 'torse', 'scale', { time: 0.75, x: 0.8, y: 1.1 });
  marche.setKey('bone', 'tete', 'shear', { time: 0, x: 0, y: 0 });
  marche.setKey('bone', 'tete', 'shear', { time: 1, x: 10, y: -5 });
  marche.setKey('slot', 'torse', 'rgba', { time: 0, color: '#ffffffff' });
  marche.setKey('slot', 'torse', 'rgba', { time: 1, color: '#ff804080' });
  marche.setKey('slot', 'bras', 'attachment', { time: 0.6, name: 'bras_tatoue' });
  marche.setKey('drawOrder', '', 'drawOrder', { time: 0.4, order: ['bras', 'torse', 'masque', 'zone', 'chemin'] });
  marche.setKey('events', '', 'events', { time: 0.25, name: 'pas' });
  marche.setKey('events', '', 'events', { time: 0.75, name: 'pas' });
  const n = mesh.deformLength;
  const def = Array.from({ length: n }, (_, i) => Math.sin(i) * 4);
  marche.setKey('deform', deformKey('bras', 'bras'), 'deform', { time: 0.2, vertices: def, curve: [0.3, 0, 0.7, 1] });
  marche.setKey('deform', deformKey('bras', 'bras'), 'deform', { time: 0.8 });
  marche.setKey('ik', 'bras_ik', 'ik', { time: 0, mix: 1, softness: 5, bendPositive: true });
  marche.setKey('ik', 'bras_ik', 'ik', { time: 0.5, mix: 0.5, softness: 0, bendPositive: false });
  marche.setKey('path', 'suivi', 'position', { time: 0, position: 0.1 });
  marche.setKey('path', 'suivi', 'position', { time: 1, position: 0.4 });
  marche.setKey('physics', 'queue_phys', 'physics', { time: 0.5, inertia: 1, strength: 40, damping: 0.9, mass: 1.5, wind: 0, gravity: 3, mix: 1 });
  const salut = sk.addAnimation('salut');
  salut.setKey('bone', 'cible', 'translate', { time: 0, x: 0, y: 0 });
  salut.setKey('bone', 'cible', 'translate', { time: 0.6, x: 40, y: 60 });
  salut.setKey('bone', 'tete', 'rotate', { time: 0, value: 0 });
  salut.setKey('bone', 'tete', 'rotate', { time: 0.6, value: 340 });
  salut.setKey('events', '', 'events', { time: 0.3, name: 'coucou' });
  sk.addEvent('pas');
  sk.addEvent('coucou');
  return sk;
}

const scenario = {
  activeSkins: ['or'],
  defaultMix: 0.3,
  steps: [
    { op: 'set', track: 0, anim: 'marche', loop: true },
    ...Array.from({ length: 30 }, () => [{ op: 'update', dt: 1 / 30 }, { op: 'snapshot' }]).flat(),
    { op: 'set', track: 0, anim: 'salut', loop: false },
    { op: 'add', track: 0, anim: 'marche', loop: true, delay: 0 },
    { op: 'set', track: 1, anim: 'salut', loop: true },
    ...Array.from({ length: 40 }, () => [{ op: 'update', dt: 1 / 30 }, { op: 'snapshot' }]).flat(),
    { op: 'empty', track: 1, mix: 0.2 },
    ...Array.from({ length: 10 }, () => [{ op: 'update', dt: 1 / 30 }, { op: 'snapshot' }]).flat(),
  ],
};

// --- Côté JavaScript (référence) -------------------------------------------------------------------
const built = buildSkeleton();
const exported = serializeProject(built, { appVersion: 'test' });
const sk = parseProject(JSON.stringify(exported));
sk.activeSkins = scenario.activeSkins;
sk.posed = true;
const state = new AnimationState(sk, { defaultMix: scenario.defaultMix });
const events = [];
state.onEvent = (track, k) => events.push(`${track}:${k.name}@${k.time.toFixed(4)}`);
const snapshots = [];
let first = true;
for (const step of scenario.steps) {
  if (step.op === 'set') state.setAnimation(step.track, sk.findAnimation(step.anim), step.loop);
  else if (step.op === 'add') state.addAnimation(step.track, sk.findAnimation(step.anim), step.loop, step.delay);
  else if (step.op === 'empty') state.setEmptyAnimation(step.track, step.mix);
  else if (step.op === 'update') {
    state.update(step.dt);
    sk.time += step.dt;
    state.apply(sk);
    sk.updateWorldTransform(first ? 'reset' : 'update');
    first = false;
  } else if (step.op === 'snapshot') {
    const bones = {};
    for (const b of sk.bones) bones[b.name] = [b.a, b.b, b.c, b.d, b.worldX, b.worldY, b.active];
    const slots = {};
    for (const s of sk.slots) {
      const att = sk.currentAttachment(s);
      const verts = att && ['region', 'mesh', 'boundingbox', 'clipping'].includes(att.type) ? Array.from(sk.attachmentVertices(s, att)) : [];
      slots[s.name] = { attachment: att ? att.name : null, color: s.pose.color, verts };
    }
    snapshots.push({ bones, slots, order: sk.drawOrder.map((s) => s.name) });
  }
}

// --- Côté Godot ----------------------------------------------------------------------------------------
rmSync(resolve(project, 'addons'), { recursive: true, force: true });
cpSync(resolve('runtimes/godot/addons'), resolve(project, 'addons'), { recursive: true });
mkdirSync(resolve(project, 'data'), { recursive: true });
writeFileSync(resolve(project, 'data/skeleton.json'), JSON.stringify(exported));
writeFileSync(resolve(project, 'data/scenario.json'), JSON.stringify(scenario));
rmSync(resolve(project, 'data/actual.json'), { force: true });
// Première ouverture : Godot enregistre les classes (class_name) du projet.
spawnSync(godot, ['--headless', '--path', project, '--import'], { stdio: 'ignore', timeout: 180000 });
const run = spawnSync(godot, ['--headless', '--path', project, '--script', 'res://runner.gd'], { encoding: 'utf8', timeout: 180000 });
const errors = `${run.stdout}\n${run.stderr}`.split('\n').filter((l) => /SCRIPT ERROR|Parse Error|ERROR:/.test(l));
let actual;
try {
  actual = JSON.parse(readFileSync(resolve(project, 'data/actual.json'), 'utf8'));
} catch {
  console.error(`${run.stdout}\n${run.stderr}`);
  console.error('ÉCHEC : Godot n\'a pas produit de résultat.');
  process.exit(1);
}

// --- Comparaison ------------------------------------------------------------------------------------------
const EPS = 2e-3;
let worst = 0;
const problems = [];
const cmp = (a, b, where) => {
  const d = Math.abs(a - b);
  if (d > worst) worst = d;
  if (d > EPS && problems.length < 15) problems.push(`${where} : JS ${a} / Godot ${b}`);
};
if (actual.snapshots.length !== snapshots.length) problems.push(`nombre d'instantanés : ${snapshots.length} / ${actual.snapshots.length}`);
snapshots.forEach((s, i) => {
  const g = actual.snapshots[i];
  if (!g) return;
  for (const [name, v] of Object.entries(s.bones)) {
    v.slice(0, 6).forEach((x, k) => cmp(x, g.bones[name][k], `#${i} os ${name}[${k}]`));
    if (v[6] !== g.bones[name][6]) problems.push(`#${i} os ${name} actif : ${v[6]} / ${g.bones[name][6]}`);
  }
  for (const [name, v] of Object.entries(s.slots)) {
    const gs = g.slots[name];
    if (v.attachment !== gs.attachment) problems.push(`#${i} slot ${name} pièce jointe : ${v.attachment} / ${gs.attachment}`);
    if (v.color !== gs.color) problems.push(`#${i} slot ${name} couleur : ${v.color} / ${gs.color}`);
    if (v.verts.length !== gs.verts.length) problems.push(`#${i} slot ${name} sommets : ${v.verts.length} / ${gs.verts.length}`);
    else v.verts.forEach((x, k) => cmp(x, gs.verts[k], `#${i} slot ${name} sommet[${k}]`));
  }
  if (s.order.join() !== g.order.join()) problems.push(`#${i} ordre : ${s.order} / ${g.order}`);
});
if (events.join() !== actual.events.join()) problems.push(`événements : ${events.join(' ')} / ${actual.events.join(' ')}`);

console.log(`${snapshots.length} instantanés comparés, écart maximal ${worst.toExponential(2)}, ${events.length} événements.`);
if (errors.length) console.log(errors.slice(0, 10).join('\n'));
if (problems.length) {
  console.log(problems.join('\n'));
  console.log('ÉCHEC');
  process.exit(1);
}
console.log('OK : le runtime Godot donne les mêmes poses que l\'éditeur.');

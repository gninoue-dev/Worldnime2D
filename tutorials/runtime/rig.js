// Préparation hors caméra : projets de départ des leçons (dossier d'images, personnage monté…).

import { BODY, writeCharacter, writeBackdrop, writeOra } from './character.js';

const deg = (r) => (r * 180) / Math.PI;

// Os d'Ama : nom, parent, origine et bout dans le monde (Y vers le haut, pieds en 0).
export const AMA_BONES = [
  ['hanches', 'root', [0, 128], [0, 176]],
  ['torse', 'hanches', [0, 176], [0, 296]],
  ['tete', 'torse', [0, 300], [0, 420]],
  ['bras_gauche', 'torse', [-50, 284], [-61, 216]],
  ['avant_bras_gauche', 'bras_gauche', [-61, 216], [-67, 152]],
  ['bras_droit', 'torse', [50, 284], [61, 216]],
  ['avant_bras_droit', 'bras_droit', [61, 216], [67, 152]],
  ['cuisse_gauche', 'hanches', [-24, 126], [-26, 70]],
  ['jambe_gauche', 'cuisse_gauche', [-26, 70], [-27, 18]],
  ['cuisse_droite', 'hanches', [24, 126], [26, 70]],
  ['jambe_droite', 'cuisse_droite', [26, 70], [27, 18]],
  ['echarpe', 'torse', [18, 296], [42, 240]],
  ['echarpe2', 'echarpe', [42, 240], [49, 180]],
];

// Os de chaque image.
export const AMA_SLOTS = {
  ombre: 'root',
  echarpe: 'echarpe',
  bras_droit: 'bras_droit',
  avant_bras_droit: 'avant_bras_droit',
  cuisse_gauche: 'cuisse_gauche',
  cuisse_droite: 'cuisse_droite',
  jambe_gauche: 'jambe_gauche',
  jambe_droite: 'jambe_droite',
  bassin: 'hanches',
  torse: 'torse',
  tete: 'tete',
  yeux_ouverts: 'tete',
  bouche_sourire: 'tete',
  bras_gauche: 'bras_gauche',
  avant_bras_gauche: 'avant_bras_gauche',
};

// Noms de slot plus parlants pour les morceaux qui changent d'image.
const SLOT_NAMES = { yeux_ouverts: 'yeux', bouche_sourire: 'bouche' };

// Ajoute un os défini par son origine et son bout dans le monde.
export function addBoneWorld(sk, name, parentName, [x0, y0], [x1, y1]) {
  sk.updateWorldTransform();
  const parent = sk.findBone(parentName);
  const bone = sk.addBone(name, parent);
  const l = parent.worldToLocal(x0, y0);
  bone.x = l.x;
  bone.y = l.y;
  sk.updateWorldTransform();
  bone.rotation = bone.worldToLocalRotation(deg(Math.atan2(y1 - y0, x1 - x0)));
  sk.updateWorldTransform();
  bone.length = Math.hypot(x1 - x0, y1 - y0);
  return bone;
}

export function workDir(d, sub) {
  return `${d.job.work}/${sub}`;
}

// Projet vide dont le dossier d'images contient le personnage (sans rien d'attaché).
export async function prepareImages(d, { backdrop = false } = {}) {
  const dir = workDir(d, 'ama/images');
  const placed = await writeCharacter(d.api, dir);
  if (backdrop) await writeBackdrop(d.api, workDir(d, 'ama'));
  await d.ctx.command('new');
  await d.ctx.library.setDir(dir);
  d.editor.apply(() => {
    d.editor.skeleton.images = dir;
  });
  d.placed = placed;
  return { dir, placed };
}

// Ama monté : os, slots et images à leur place. options.bones : os à créer (tous par défaut).
export async function prepareAma(d, { slots = true, extraBones = true } = {}) {
  const { dir, placed } = await prepareImages(d);
  const ed = d.editor;
  ed.apply(() => {
    const sk = ed.skeleton;
    for (const [name, parent, a, b] of AMA_BONES) {
      if (!extraBones && name.startsWith('echarpe')) continue;
      addBoneWorld(sk, name, parent, a, b);
    }
    sk.updateWorldTransform();
  });
  if (slots) {
    for (const part of BODY) {
      const boneName = AMA_SLOTS[part];
      const bone = ed.skeleton.findBone(boneName) ?? ed.skeleton.findBone('torse');
      d.ctx.actions.attachImage(part, bone, null, { x: placed[part].cx, y: placed[part].cy });
      const slot = ed.skeleton.findSlot(part);
      if (slot && SLOT_NAMES[part]) ed.apply(() => ed.skeleton.renameSlot(slot, SLOT_NAMES[part]));
    }
  }
  ed.select(ed.skeleton.root);
  d.viewport.frameAll();
  return { dir, placed };
}

// Enregistre le projet en cours (hors caméra) dans le dossier de travail.
export async function saveAs(d, file = 'ama/ama.wn2d') {
  await d.answerNext(workDir(d, file));
  await d.ctx.command('save-as');
  // Le message « Projet enregistré » ne doit pas apparaître au début de la vidéo.
  document.getElementById('toast').className = 'toast';
  return workDir(d, file);
}

// Pose des clés hors caméra (mode Animation) : keys = [[image, valeur], …].
// type 'rotate' : angle relatif à la pose de base ; 'translate' : [x, y] relatifs ; 'scale' : [sx, sy].
export function setKeys(d, boneName, type, keys) {
  const ed = d.editor;
  ed.apply(() => {
    for (const [frame, v] of keys) {
      const time = frame / ed.fps;
      if (type === 'rotate') ed.animation.setKey('bone', boneName, type, { time, value: v });
      else ed.animation.setKey('bone', boneName, type, { time, x: v[0], y: v[1] });
    }
  });
}

// Projet de la leçon 2 : Ama importée depuis son fichier ORA, toutes les images sur l'os racine.
export async function importAma(d) {
  await writeOra(d.api, workDir(d, 'dessins'), 'ama.ora');
  await d.ctx.command('new');
  await d.ctx.importLayers(workDir(d, 'dessins/ama.ora'), workDir(d, 'ama/images'));
  d.editor.select(d.editor.skeleton.root);
  d.viewport.frameAll();
}

// Os d'Ama créés hors caméra (sans toucher aux images). skip : os à ne pas créer ;
// parents : parent à utiliser à la place du bon (pour montrer comment corriger une erreur).
export function addAmaBones(d, { skip = [], parents = {} } = {}) {
  const ed = d.editor;
  ed.apply(() => {
    for (const [name, parent, a, b] of AMA_BONES) {
      if (skip.includes(name) || skip.some((s) => s.endsWith('*') && name.startsWith(s.slice(0, -1)))) continue;
      addBoneWorld(ed.skeleton, name, parents[name] ?? parent, a, b);
    }
    ed.skeleton.updateWorldTransform();
  });
}

// Chemin (points du monde) en arc de cercle autour de l'origine d'un os, de sa direction actuelle
// jusqu'à l'angle monde voulu : pour un geste de rotation qui tourne dans le bon sens.
export function arcTo(d, boneName, toDeg, { r = null, steps = 6 } = {}) {
  const b = d.editor.skeleton.findBone(boneName);
  const from = Math.atan2(b.tipY - b.worldY, b.tipX - b.worldX);
  let to = (toDeg * Math.PI) / 180;
  while (to - from > Math.PI) to -= 2 * Math.PI;
  while (from - to > Math.PI) to += 2 * Math.PI;
  const rad = r ?? Math.max(20, Math.hypot(b.tipX - b.worldX, b.tipY - b.worldY) * 0.6);
  const pts = [];
  for (let i = 1; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    pts.push([b.worldX + Math.cos(a) * rad, b.worldY + Math.sin(a) * rad]);
  }
  return { start: [b.worldX + Math.cos(from) * rad, b.worldY + Math.sin(from) * rad], path: pts };
}

// Tourne un os à la souris (outil Rotation déjà choisi) jusqu'à un angle monde.
export async function rotateTo(d, boneName, toDeg, { duration = 1.2, mods = {} } = {}) {
  const { start, path } = arcTo(d, boneName, toDeg);
  await d.drag(start, path.at(-1), { duration, path, mods });
}

// Scène des maillages : un mât (os) et le drapeau accroché à son sommet, sur l'os « mat ».
// chain : crée aussi les os du drapeau (drapeau1 → drapeau3, du mât vers le bout).
// mesh : le drapeau est déjà un maillage (contour + grille) ; bind : lié aux os par poids automatiques.
export const FLAG_BONES = [
  ['mat', 'root', [40, 150], [40, 440]],
  ['drapeau1', 'mat', [40, 372], [-15, 372]],
  ['drapeau2', 'drapeau1', [-15, 372], [-80, 372]],
  ['drapeau3', 'drapeau2', [-80, 372], [-150, 372]],
];

export async function prepareFlag(d, { chain = true, mesh = false, bind = false, extra = [] } = {}) {
  const dir = workDir(d, 'drapeau/images');
  const placed = await writeCharacter(d.api, dir, ['drapeau', 'drapeau_nuit', 'mat', ...extra]);
  await d.ctx.command('new');
  await d.ctx.library.setDir(dir);
  const ed = d.editor;
  ed.apply(() => {
    ed.skeleton.images = dir;
    ed.skeleton.name = 'drapeau';
    for (const [name, parent, a, b] of FLAG_BONES) {
      if (!chain && name !== 'mat') continue;
      addBoneWorld(ed.skeleton, name, parent, a, b);
    }
    ed.skeleton.updateWorldTransform();
  });
  const sk = ed.skeleton;
  d.ctx.actions.attachImage('drapeau', sk.findBone('mat'), null, { x: placed.drapeau.cx, y: placed.drapeau.cy });
  d.ctx.actions.attachImage('mat', sk.findBone('mat'), null, { x: placed.mat.cx, y: placed.mat.cy });
  if (mesh) {
    // Hors caméra, avec les boutons de l'application (ses propres classes de maillage).
    const slot = sk.findSlot('drapeau');
    ed.selectAttachment(slot, 'drapeau');
    clickProp(d, 'Convertir en maillage');
    clickProp(d, 'Ajouter des points intérieurs');
    if (bind) {
      for (const box of document.querySelectorAll('#props .checklist input')) {
        if (FLAG_BONES.some(([n]) => n === box.value) !== box.checked) box.click();
      }
      clickProp(d, 'Lier aux os cochés');
    }
  }
  d.placed = placed;
  ed.select(sk.root);
  d.viewport.frameAll();
  // Le cadrage inclut l'origine, loin sous le drapeau : on se rapproche du drapeau.
  const s = d.viewport.toScreen(10, 330);
  d.viewport.zoomAt(s.x, s.y, 1.5);
  return { dir, placed };
}

// Clic direct (hors caméra) sur un bouton du panneau Propriétés.
export function clickProp(d, text) {
  const b = [...document.querySelectorAll('#props .prop-button')].find((e) => e.textContent.includes(text));
  if (!b) throw new Error(`Bouton introuvable : ${text}`);
  b.click();
}

// Coordonnées monde des sommets d'un maillage (tableau de [x, y]).
export function meshVerts(d, slotName, attName = slotName) {
  const sk = d.editor.skeleton;
  const slot = sk.findSlot(slotName);
  const att = d.editor.animating ? sk.currentAttachment(slot) : sk.getAttachment(slot, attName);
  const v = sk.attachmentVertices(slot, att);
  const out = [];
  for (let i = 0; i < v.length; i += 2) out.push([v[i], v[i + 1]]);
  return out;
}

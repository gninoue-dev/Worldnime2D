// Lecture et écriture des projets Worldnime2D (fichiers .wn2d, au format JSON).
//
// Les sections slots, skins, contraintes, événements et animations sont déjà réservées
// pour les prochaines versions : un fichier v0.1 restera lisible plus tard.

import { Skeleton } from './skeleton.js';
import { INHERIT, DEFAULT_BONE_COLOR } from './bone.js';
import { round } from './math.js';

export const FORMAT_NAME = 'worldnime2d';
export const FORMAT_VERSION = 1;
export const FILE_EXTENSION = 'wn2d';

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function serializeProject(skeleton, meta = {}) {
  return {
    format: FORMAT_NAME,
    formatVersion: FORMAT_VERSION,
    app: meta.appVersion ?? null,
    skeleton: { name: skeleton.name },
    bones: skeleton.bones.map((b) => {
      const out = { name: b.name };
      if (b.parent) out.parent = b.parent.name;
      if (b.length) out.length = round(b.length, 3);
      if (b.x) out.x = round(b.x, 3);
      if (b.y) out.y = round(b.y, 3);
      if (b.rotation) out.rotation = round(b.rotation, 3);
      if (b.scaleX !== 1) out.scaleX = round(b.scaleX, 4);
      if (b.scaleY !== 1) out.scaleY = round(b.scaleY, 4);
      if (b.shearX) out.shearX = round(b.shearX, 3);
      if (b.shearY) out.shearY = round(b.shearY, 3);
      if (b.inherit !== INHERIT.normal) out.inherit = b.inherit;
      if (b.color !== DEFAULT_BONE_COLOR) out.color = b.color;
      return out;
    }),
    slots: [],
    skins: [],
    ik: [],
    transform: [],
    path: [],
    physics: [],
    events: {},
    animations: {},
  };
}

export function projectToText(skeleton, meta) {
  return JSON.stringify(serializeProject(skeleton, meta), null, 2) + '\n';
}

function num(value, fallback, label) {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Valeur invalide pour ${label} : ${JSON.stringify(value)}`);
  }
  return value;
}

export function parseProject(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`Le fichier n'est pas un JSON valide (${e.message}).`);
  }
  if (!data || data.format !== FORMAT_NAME) {
    throw new Error('Ce fichier n\'est pas un projet Worldnime2D.');
  }
  if (typeof data.formatVersion !== 'number' || data.formatVersion > FORMAT_VERSION) {
    throw new Error('Ce projet a été créé avec une version plus récente de Worldnime2D.');
  }
  if (!Array.isArray(data.bones) || data.bones.length === 0) {
    throw new Error('Le projet ne contient aucun os.');
  }

  const skeleton = new Skeleton();
  skeleton.name = typeof data.skeleton?.name === 'string' ? data.skeleton.name : 'squelette';

  const [rootData, ...rest] = data.bones;
  if (rootData.parent) throw new Error('Le premier os doit être la racine.');
  const root = skeleton.root;
  root.name = String(rootData.name);
  applyBoneData(root, rootData);

  for (const bd of rest) {
    if (typeof bd.name !== 'string' || !bd.name) throw new Error('Un os n\'a pas de nom.');
    const parent = skeleton.findBone(bd.parent);
    if (!parent) throw new Error(`Parent introuvable pour l'os « ${bd.name} » : « ${bd.parent} ».`);
    const bone = skeleton.addBone(bd.name, parent);
    applyBoneData(bone, bd);
  }
  skeleton.updateWorldTransform();
  return skeleton;
}

function applyBoneData(bone, bd) {
  const where = `l'os « ${bd.name} »`;
  bone.length = num(bd.length, 0, `length (${where})`);
  bone.x = num(bd.x, 0, `x (${where})`);
  bone.y = num(bd.y, 0, `y (${where})`);
  bone.rotation = num(bd.rotation, 0, `rotation (${where})`);
  bone.scaleX = num(bd.scaleX, 1, `scaleX (${where})`);
  bone.scaleY = num(bd.scaleY, 1, `scaleY (${where})`);
  bone.shearX = num(bd.shearX, 0, `shearX (${where})`);
  bone.shearY = num(bd.shearY, 0, `shearY (${where})`);
  if (bd.inherit !== undefined) {
    if (!Object.values(INHERIT).includes(bd.inherit)) throw new Error(`Héritage inconnu pour ${where}.`);
    bone.inherit = bd.inherit;
  }
  if (bd.color !== undefined) {
    if (!COLOR_RE.test(bd.color)) throw new Error(`Couleur invalide pour ${where}.`);
    bone.color = bd.color.toLowerCase();
  }
}

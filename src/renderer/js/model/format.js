// Lecture et écriture des projets Worldnime2D (fichiers .wn2d, au format JSON).
//
// Version 1 (v0.1) : os seulement. Version 2 (v0.2) : slots, skins, images, image de référence.
// Les sections de contraintes, d'événements et d'animations sont réservées pour la suite.

import { Skeleton } from './skeleton.js';
import { INHERIT, DEFAULT_BONE_COLOR } from './bone.js';
import { BLEND_MODES } from './slot.js';
import { RegionAttachment, ATTACHMENT_TYPES } from './attachment.js';
import { WHITE, isRgb, isRgba } from './color.js';
import { round } from './math.js';

export const FORMAT_NAME = 'worldnime2d';
export const FORMAT_VERSION = 2;
export const FILE_EXTENSION = 'wn2d';

export function serializeProject(skeleton, meta = {}) {
  const skel = { name: skeleton.name };
  if (skeleton.images) skel.images = skeleton.images;
  if (skeleton.reference) {
    const r = skeleton.reference;
    skel.reference = {
      path: r.path, x: round(r.x, 3), y: round(r.y, 3), scale: round(r.scale, 4), alpha: round(r.alpha, 3), visible: r.visible,
    };
  }

  return {
    format: FORMAT_NAME,
    formatVersion: FORMAT_VERSION,
    app: meta.appVersion ?? null,
    skeleton: skel,
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
    slots: skeleton.slots.map((s) => {
      const out = { name: s.name, bone: s.bone.name };
      if (s.color !== WHITE) out.color = s.color;
      if (s.dark) out.dark = s.dark;
      if (s.attachment) out.attachment = s.attachment;
      if (s.blend !== BLEND_MODES.normal) out.blend = s.blend;
      return out;
    }),
    skins: skeleton.skins.map((skin) => {
      const attachments = {};
      // Les slots sont écrits dans l'ordre d'affichage pour un fichier stable.
      for (const slot of skeleton.slots) {
        const m = skin.attachmentsOf(slot.name);
        if (m.size === 0) continue;
        attachments[slot.name] = {};
        for (const [name, att] of m) attachments[slot.name][name] = serializeAttachment(att);
      }
      return { name: skin.name, attachments };
    }),
    ik: [],
    transform: [],
    path: [],
    physics: [],
    events: {},
    animations: {},
  };
}

function serializeAttachment(att) {
  const out = {};
  if (att.type !== ATTACHMENT_TYPES.region) out.type = att.type;
  if (att.path !== null) out.path = att.path;
  if (att.x) out.x = round(att.x, 3);
  if (att.y) out.y = round(att.y, 3);
  if (att.rotation) out.rotation = round(att.rotation, 3);
  if (att.scaleX !== 1) out.scaleX = round(att.scaleX, 4);
  if (att.scaleY !== 1) out.scaleY = round(att.scaleY, 4);
  out.width = round(att.width, 3);
  out.height = round(att.height, 3);
  if (att.color !== WHITE) out.color = att.color;
  return out;
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

function str(value, fallback, label) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') throw new Error(`Texte attendu pour ${label}.`);
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
  skeleton.images = str(data.skeleton?.images, '', 'skeleton.images');
  const ref = data.skeleton?.reference;
  if (ref) {
    skeleton.reference = {
      path: str(ref.path, '', 'reference.path'),
      x: num(ref.x, 0, 'reference.x'),
      y: num(ref.y, 0, 'reference.y'),
      scale: num(ref.scale, 1, 'reference.scale'),
      alpha: num(ref.alpha, 0.5, 'reference.alpha'),
      visible: ref.visible !== false,
    };
  }

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

  for (const sd of data.slots ?? []) {
    if (typeof sd.name !== 'string' || !sd.name) throw new Error('Un slot n\'a pas de nom.');
    const bone = skeleton.findBone(sd.bone);
    if (!bone) throw new Error(`Os introuvable pour le slot « ${sd.name} » : « ${sd.bone} ».`);
    const slot = skeleton.addSlot(sd.name, bone);
    const where = `le slot « ${sd.name} »`;
    if (sd.color !== undefined) {
      if (!isRgba(sd.color)) throw new Error(`Couleur invalide pour ${where}.`);
      slot.color = sd.color.toLowerCase();
    }
    if (sd.dark !== undefined && sd.dark !== null) {
      if (!isRgb(sd.dark)) throw new Error(`Couleur sombre invalide pour ${where}.`);
      slot.dark = sd.dark.toLowerCase();
    }
    if (sd.blend !== undefined) {
      if (!Object.values(BLEND_MODES).includes(sd.blend)) throw new Error(`Mode de fusion inconnu pour ${where}.`);
      slot.blend = sd.blend;
    }
    slot.attachment = str(sd.attachment, null, `attachment (${where})`);
  }

  for (const skd of data.skins ?? []) {
    if (skd.name !== 'default') continue; // Les autres skins arriveront en v0.7.
    for (const [slotName, atts] of Object.entries(skd.attachments ?? {})) {
      const slot = skeleton.findSlot(slotName);
      if (!slot) throw new Error(`Slot introuvable dans la skin : « ${slotName} ».`);
      for (const [name, ad] of Object.entries(atts)) {
        skeleton.addAttachment(slot, parseAttachment(name, ad, `« ${slotName}/${name} »`));
      }
    }
  }
  for (const slot of skeleton.slots) {
    if (slot.attachment && !skeleton.getAttachment(slot, slot.attachment)) slot.attachment = null;
  }

  skeleton.updateWorldTransform();
  return skeleton;
}

function parseAttachment(name, ad, where) {
  const type = ad.type ?? ATTACHMENT_TYPES.region;
  if (type !== ATTACHMENT_TYPES.region) throw new Error(`Type de pièce jointe non géré : ${type} (${where}).`);
  const att = new RegionAttachment(name);
  att.path = str(ad.path, null, `path (${where})`);
  att.x = num(ad.x, 0, `x (${where})`);
  att.y = num(ad.y, 0, `y (${where})`);
  att.rotation = num(ad.rotation, 0, `rotation (${where})`);
  att.scaleX = num(ad.scaleX, 1, `scaleX (${where})`);
  att.scaleY = num(ad.scaleY, 1, `scaleY (${where})`);
  att.width = num(ad.width, 32, `width (${where})`);
  att.height = num(ad.height, 32, `height (${where})`);
  if (ad.color !== undefined) {
    if (!isRgba(ad.color)) throw new Error(`Couleur invalide pour ${where}.`);
    att.color = ad.color.toLowerCase();
  }
  return att;
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
    if (!isRgb(bd.color)) throw new Error(`Couleur invalide pour ${where}.`);
    bone.color = bd.color.toLowerCase();
  }
}

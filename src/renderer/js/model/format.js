// Lecture et écriture des projets Worldnime2D (fichiers .wn2d, au format JSON).
//
// Version 1 (v0.1) : os seulement. Version 2 (v0.2) : slots, skins, images, image de référence.
// Les sections de contraintes, d'événements et d'animations sont réservées pour la suite.

import { Skeleton } from './skeleton.js';
import { INHERIT, DEFAULT_BONE_COLOR } from './bone.js';
import { BLEND_MODES } from './slot.js';
import { RegionAttachment, ATTACHMENT_TYPES } from './attachment.js';
import { MeshAttachment } from './mesh.js';
import { PathAttachment } from './path.js';
import { CONSTRAINT_CLASSES, CONSTRAINT_FIELDS } from './constraints.js';
import { WHITE, isRgb, isRgba } from './color.js';
import { round } from './math.js';
import { animationToJSON, animationFromJSON, EventData } from './animation.js';

export const FORMAT_NAME = 'worldnime2d';
export const FORMAT_VERSION = 5;
export const FILE_EXTENSION = 'wn2d';

export function serializeProject(skeleton, meta = {}) {
  const skel = { name: skeleton.name };
  if (skeleton.fps !== 30) skel.fps = skeleton.fps;
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
    ...serializeConstraints(skeleton),
    events: Object.fromEntries([...skeleton.events.values()].map((e) => {
      const out = {};
      if (e.int) out.int = e.int;
      if (e.float) out.float = e.float;
      if (e.string) out.string = e.string;
      if (e.audio) {
        out.audio = e.audio;
        out.volume = e.volume;
        out.balance = e.balance;
      }
      return [e.name, out];
    })),
    animations: Object.fromEntries(skeleton.animations.map((a) => [a.name, animationToJSON(a)])),
  };
}

function serializeConstraints(skeleton) {
  const out = { ik: [], transform: [], path: [], physics: [] };
  for (const c of skeleton.sortedConstraints()) {
    const o = { name: c.name, order: c.order, bones: [...c.bones] };
    if (c.kind !== 'physics') o.target = c.target;
    for (const f of CONSTRAINT_FIELDS[c.kind]) o[f] = typeof c[f] === 'number' ? round(c[f], 5) : c[f];
    out[c.kind].push(o);
  }
  return out;
}

function serializeAttachment(att) {
  if (att instanceof MeshAttachment) return serializeMesh(att);
  if (att instanceof PathAttachment) {
    const o = { type: 'path' };
    if (att.closed) o.closed = true;
    if (!att.constantSpeed) o.constantSpeed = false;
    if (att.color !== '#ff7f00ff') o.color = att.color;
    o.vertices = att.vertices.flatMap(([x, y]) => [round(x, 3), round(y, 3)]);
    return o;
  }
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

function serializeMesh(m) {
  const out = { type: m.parent ? 'linkedmesh' : 'mesh' };
  if (m.path !== null) out.path = m.path;
  if (m.color !== WHITE) out.color = m.color;
  out.width = round(m.width, 3);
  out.height = round(m.height, 3);
  if (m.parent) {
    out.parent = m.parent;
    if (!m.timelines) out.timelines = false;
    return out;
  }
  out.uvs = m.uvs.flatMap(([u, v]) => [round(u, 5), round(v, 5)]);
  out.triangles = [...m.triangles];
  out.hull = m.hull;
  if (m.edges.length) out.edges = m.edges.flat();
  if (m.weights) {
    out.weights = m.weights.map((list) => list.flatMap((e) => [e.bone, round(e.x, 3), round(e.y, 3), round(e.w, 5)]));
  } else out.vertices = m.vertices.flatMap(([x, y]) => [round(x, 3), round(y, 3)]);
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
        skeleton.addAttachment(slot, parseAttachment(name, ad, `« ${slotName}/${name} »`, skeleton));
      }
    }
  }
  for (const slot of skeleton.slots) {
    if (slot.attachment && !skeleton.getAttachment(slot, slot.attachment)) slot.attachment = null;
  }
  for (const { slotName, att } of skeleton.meshes()) {
    if (!att.parent) continue;
    const p = skeleton.defaultSkin.get(slotName, att.parent);
    if (!(p instanceof MeshAttachment) || p.parent) throw new Error(`Maillage parent introuvable pour « ${slotName}/${att.name} ».`);
  }

  for (const kind of Object.keys(CONSTRAINT_CLASSES)) {
    for (const cd of data[kind] ?? []) {
      const where = `la contrainte « ${cd.name} »`;
      if (typeof cd.name !== 'string' || !cd.name) throw new Error('Une contrainte n\'a pas de nom.');
      const c = skeleton.addConstraint(kind, cd.name);
      c.order = num(cd.order, c.order, `order (${where})`);
      if (!Array.isArray(cd.bones) || cd.bones.some((b) => !skeleton.findBone(b))) throw new Error(`Os inconnu dans ${where}.`);
      c.bones = [...cd.bones];
      if (kind === 'path') {
        if (!skeleton.findSlot(cd.target)) throw new Error(`Slot cible inconnu dans ${where}.`);
        c.target = cd.target;
      } else if (kind !== 'physics') {
        if (!skeleton.findBone(cd.target)) throw new Error(`Os cible inconnu dans ${where}.`);
        c.target = cd.target;
      }
      for (const f of CONSTRAINT_FIELDS[kind]) {
        if (cd[f] === undefined) continue;
        if (typeof c[f] === 'number') c[f] = num(cd[f], c[f], `${f} (${where})`);
        else if (typeof c[f] === 'boolean') c[f] = Boolean(cd[f]);
        else c[f] = String(cd[f]);
      }
    }
  }

  const fps = data.skeleton?.fps;
  if (fps !== undefined) {
    if (typeof fps !== 'number' || !(fps > 0 && fps <= 240)) throw new Error('Cadence (fps) invalide.');
    skeleton.fps = fps;
  }
  for (const [name, ed] of Object.entries(data.events ?? {})) {
    const e = new EventData(name);
    e.int = num(ed.int, 0, `int (événement « ${name} »)`);
    e.float = num(ed.float, 0, `float (événement « ${name} »)`);
    e.string = str(ed.string, '', `string (événement « ${name} »)`);
    e.audio = str(ed.audio, '', `audio (événement « ${name} »)`);
    e.volume = num(ed.volume, 1, `volume (événement « ${name} »)`);
    e.balance = num(ed.balance, 0, `balance (événement « ${name} »)`);
    skeleton.events.set(name, e);
  }
  for (const [name, ad] of Object.entries(data.animations ?? {})) {
    skeleton.animations.push(animationFromJSON(name, ad));
  }

  skeleton.updateWorldTransform();
  return skeleton;
}

function intArray(v, label, max) {
  if (!Array.isArray(v) || !v.every((x) => Number.isInteger(x) && x >= 0 && x < max)) throw new Error(`Indices invalides pour ${label}.`);
  return v;
}

function parseMesh(name, ad, where, skeleton) {
  const m = new MeshAttachment(name);
  m.path = str(ad.path, null, `path (${where})`);
  m.width = num(ad.width, 32, `width (${where})`);
  m.height = num(ad.height, 32, `height (${where})`);
  if (ad.color !== undefined) {
    if (!isRgba(ad.color)) throw new Error(`Couleur invalide pour ${where}.`);
    m.color = ad.color.toLowerCase();
  }
  if (ad.type === 'linkedmesh') {
    m.parent = str(ad.parent, null, `parent (${where})`);
    if (!m.parent) throw new Error(`Maillage lié sans parent (${where}).`);
    m.timelines = ad.timelines !== false;
    return m;
  }
  if (!Array.isArray(ad.uvs) || ad.uvs.length % 2) throw new Error(`UV invalides (${where}).`);
  const n = ad.uvs.length / 2;
  for (let i = 0; i < n; i++) m.uvs.push([num(ad.uvs[i * 2], 0, where), num(ad.uvs[i * 2 + 1], 0, where)]);
  m.triangles = intArray(ad.triangles ?? [], `triangles (${where})`, n);
  if (m.triangles.length % 3) throw new Error(`Triangles invalides (${where}).`);
  m.hull = num(ad.hull, n, `hull (${where})`);
  const edges = intArray(ad.edges ?? [], `edges (${where})`, n);
  for (let i = 0; i + 1 < edges.length; i += 2) m.edges.push([edges[i], edges[i + 1]]);
  if (ad.weights) {
    if (!Array.isArray(ad.weights) || ad.weights.length !== n) throw new Error(`Poids invalides (${where}).`);
    m.weights = ad.weights.map((flat) => {
      if (!Array.isArray(flat) || flat.length % 4 || flat.length === 0) throw new Error(`Poids invalides (${where}).`);
      const list = [];
      for (let i = 0; i < flat.length; i += 4) {
        const bone = flat[i];
        if (!skeleton.findBone(bone)) throw new Error(`Os inconnu dans les poids de ${where} : ${bone}.`);
        list.push({ bone, x: num(flat[i + 1], 0, where), y: num(flat[i + 2], 0, where), w: num(flat[i + 3], 0, where) });
      }
      return list;
    });
  } else {
    if (!Array.isArray(ad.vertices) || ad.vertices.length !== n * 2) throw new Error(`Sommets invalides (${where}).`);
    for (let i = 0; i < n; i++) m.vertices.push([num(ad.vertices[i * 2], 0, where), num(ad.vertices[i * 2 + 1], 0, where)]);
  }
  return m;
}

function parseAttachment(name, ad, where, skeleton) {
  const type = ad.type ?? ATTACHMENT_TYPES.region;
  if (type === 'path') {
    const p = new PathAttachment(name);
    p.closed = ad.closed === true;
    p.constantSpeed = ad.constantSpeed !== false;
    if (ad.color !== undefined) {
      if (!isRgba(ad.color)) throw new Error(`Couleur invalide pour ${where}.`);
      p.color = ad.color.toLowerCase();
    }
    if (!Array.isArray(ad.vertices) || ad.vertices.length % 6) throw new Error(`Chemin invalide (${where}).`);
    for (let i = 0; i < ad.vertices.length; i += 2) p.vertices.push([num(ad.vertices[i], 0, where), num(ad.vertices[i + 1], 0, where)]);
    return p;
  }
  if (type === 'mesh' || type === 'linkedmesh') return parseMesh(name, ad, where, skeleton);
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

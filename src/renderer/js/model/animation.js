// Animations : des timelines de clés, appliquées à la pose courante du squelette.
//
// Comme dans Spine, les clés des os sont relatives à la pose de base :
//   rotate : angle ajouté à la rotation de base ;
//   translate : décalage ajouté à la position de base ;
//   scale : facteur multiplié par l'échelle de base ;
//   shear : angle ajouté au cisaillement de base.
// Ainsi, retoucher la pose de base se répercute sur toutes les animations.
// Le temps est en secondes.

import { evaluateCurve, isValidCurve } from './curve.js';
import { hexToRgba, rgbaToHex, isRgb, isRgba } from './color.js';
import { round } from './math.js';

export const BONE_TIMELINES = ['rotate', 'translate', 'scale', 'shear'];
export const SLOT_TIMELINES = ['attachment', 'rgba', 'rgba2'];

// Timelines des contraintes : propriétaire (type de contrainte) → types de timeline → champs.
// Les champs numériques sont interpolés ; les booléens (IK) changent à la clé (palier).
export const CONSTRAINT_TIMELINES = {
  ik: { ik: { numbers: ['mix', 'softness'], flags: ['bendPositive', 'compress', 'stretch'] } },
  transform: { transform: { numbers: ['mixRotate', 'mixX', 'mixY', 'mixScaleX', 'mixScaleY', 'mixShearY'], flags: [] } },
  path: {
    position: { numbers: ['position'], flags: [] },
    spacing: { numbers: ['spacing'], flags: [] },
    mix: { numbers: ['mixRotate', 'mixX', 'mixY'], flags: [] },
  },
  physics: { physics: { numbers: ['inertia', 'strength', 'damping', 'mass', 'wind', 'gravity', 'mix'], flags: [] } },
};

function constraintKey(owner, name, type) {
  return JSON.stringify([owner, name, type]);
}

// Clé interne d'une timeline de déformation : skin, slot et pièce jointe.
export function deformKey(slot, attachment, skin = 'default') {
  return JSON.stringify([skin, slot, attachment]);
}

export const TIMELINE_LABELS = {
  rotate: 'Rotation',
  translate: 'Position',
  scale: 'Échelle',
  shear: 'Cisaillement',
  attachment: 'Pièce jointe',
  rgba: 'Couleur',
  rgba2: 'Couleur + sombre',
  ik: 'IK',
  transform: 'Transformation',
  position: 'Position sur le chemin',
  spacing: 'Espacement',
  mix: 'Mélanges du chemin',
  physics: 'Physique',
  physicsReset: 'Physique : remise à zéro',
  drawOrder: 'Ordre d\'affichage',
  deform: 'Déformation',
  events: 'Événements',
};

// Écart de temps en dessous duquel deux clés sont considérées au même instant.
export const TIME_EPSILON = 1e-4;

export class EventData {
  constructor(name) {
    this.name = name;
    this.int = 0;
    this.float = 0;
    this.string = '';
    this.audio = '';
    this.volume = 1;
    this.balance = 0;
  }
}

export class Animation {
  constructor(name) {
    this.name = name;
    // nomDeLOs → { rotate: [clés], translate: [...], scale: [...], shear: [...] }
    this.bones = new Map();
    // nomDuSlot → { attachment: [...], rgba: [...], rgba2: [...] }
    this.slots = new Map();
    // Clés { time, order: [noms des slots du fond vers l'avant] | null (= ordre de base) }
    this.drawOrder = [];
    // deformKey(slot, pièce jointe, skin) → clés { time, vertices: [décalages] }
    this.deform = new Map();
    // constraintKey(type de contrainte, nom, type de timeline) → clés { time, champs… }
    this.constraints = new Map();
    // Clés { time, name } : remise à zéro de la physique (name = null : toutes les contraintes).
    this.physicsReset = [];
    // Clés { time, name, int, float, string, volume, balance }
    this.events = [];
  }

  // Toutes les timelines, sous la forme { owner: 'bone'|'slot'|'drawOrder'|'events', name, type, keys }.
  *timelines() {
    for (const [name, tls] of this.bones) for (const [type, keys] of Object.entries(tls)) yield { owner: 'bone', name, type, keys };
    for (const [name, tls] of this.slots) for (const [type, keys] of Object.entries(tls)) yield { owner: 'slot', name, type, keys };
    for (const [name, keys] of this.deform) yield { owner: 'deform', name, type: 'deform', keys };
    for (const [k, keys] of this.constraints) {
      const [owner, name, type] = JSON.parse(k);
      yield { owner, name, type, keys };
    }
    if (this.physicsReset.length) yield { owner: 'physicsReset', name: '', type: 'physicsReset', keys: this.physicsReset };
    if (this.drawOrder.length) yield { owner: 'drawOrder', name: '', type: 'drawOrder', keys: this.drawOrder };
    if (this.events.length) yield { owner: 'events', name: '', type: 'events', keys: this.events };
  }

  get duration() {
    let d = 0;
    for (const tl of this.timelines()) {
      const last = tl.keys.at(-1);
      if (last && last.time > d) d = last.time;
    }
    return d;
  }

  get keyCount() {
    let n = 0;
    for (const tl of this.timelines()) n += tl.keys.length;
    return n;
  }

  // Tableau de clés d'une timeline (créé si create est vrai, sinon null s'il n'existe pas).
  timeline(owner, name, type, create = false) {
    if (owner === 'drawOrder') return this.drawOrder;
    if (owner === 'events') return this.events;
    if (owner === 'physicsReset') return this.physicsReset;
    if (CONSTRAINT_TIMELINES[owner]) {
      const k = constraintKey(owner, name, type);
      if (!this.constraints.has(k)) {
        if (!create) return null;
        this.constraints.set(k, []);
      }
      return this.constraints.get(k);
    }
    if (owner === 'deform') {
      if (!this.deform.has(name)) {
        if (!create) return null;
        this.deform.set(name, []);
      }
      return this.deform.get(name);
    }
    const map = owner === 'bone' ? this.bones : this.slots;
    let tls = map.get(name);
    if (!tls) {
      if (!create) return null;
      tls = {};
      map.set(name, tls);
    }
    if (!tls[type]) {
      if (!create) return null;
      tls[type] = [];
    }
    return tls[type];
  }

  // Ajoute ou remplace la clé au même instant. Renvoie la clé enregistrée.
  setKey(owner, name, type, key) {
    const keys = this.timeline(owner, name, type, true);
    const i = keys.findIndex((k) => Math.abs(k.time - key.time) < TIME_EPSILON);
    if (i >= 0) {
      // On garde la courbe de la clé remplacée si la nouvelle n'en précise pas.
      if (key.curve === undefined && keys[i].curve !== undefined) key.curve = keys[i].curve;
      keys[i] = key;
    } else {
      keys.push(key);
      keys.sort((a, b) => a.time - b.time);
    }
    return key;
  }

  keyAt(owner, name, type, time) {
    const keys = this.timeline(owner, name, type);
    return keys?.find((k) => Math.abs(k.time - time) < TIME_EPSILON) ?? null;
  }

  removeKey(owner, name, type, key) {
    const keys = this.timeline(owner, name, type);
    if (!keys) return;
    const i = keys.indexOf(key);
    if (i >= 0) keys.splice(i, 1);
    this.prune();
  }

  // Retire les timelines vides.
  prune() {
    for (const [name, keys] of this.deform) if (keys.length === 0) this.deform.delete(name);
    for (const [name, keys] of this.constraints) if (keys.length === 0) this.constraints.delete(name);
    for (const map of [this.bones, this.slots]) {
      for (const [name, tls] of map) {
        for (const type of Object.keys(tls)) if (tls[type].length === 0) delete tls[type];
        if (Object.keys(tls).length === 0) map.delete(name);
      }
    }
  }

  sortAll() {
    for (const tl of this.timelines()) tl.keys.sort((a, b) => a.time - b.time);
  }

  renameBone(oldName, newName) {
    renameKey(this.bones, oldName, newName);
  }

  removeBone(name) {
    this.bones.delete(name);
  }

  renameSlot(oldName, newName) {
    renameKey(this.slots, oldName, newName);
    this.remapDeform(([skin, slot, att]) => (slot === oldName ? [skin, newName, att] : [skin, slot, att]));
    for (const k of this.drawOrder) if (k.order) k.order = k.order.map((n) => (n === oldName ? newName : n));
  }

  removeSlot(name) {
    this.slots.delete(name);
    this.remapDeform(([skin, slot, att]) => (slot === name ? null : [skin, slot, att]));
    for (const k of this.drawOrder) if (k.order) k.order = k.order.filter((n) => n !== name);
  }

  // Une pièce jointe renommée : les clés qui l'affichent suivent.
  renameAttachment(slotName, oldName, newName) {
    for (const k of this.slots.get(slotName)?.attachment ?? []) if (k.name === oldName) k.name = newName;
    this.remapDeform(([skin, slot, att]) => (slot === slotName && att === oldName ? [skin, slot, newName] : [skin, slot, att]));
  }

  removeConstraint(kind, name) {
    for (const k of [...this.constraints.keys()]) {
      const [owner, n] = JSON.parse(k);
      if (owner === kind && n === name) this.constraints.delete(k);
    }
    this.physicsReset = this.physicsReset.filter((k) => k.name !== name);
  }

  renameConstraint(kind, oldName, newName) {
    const next = new Map();
    for (const [k, keys] of this.constraints) {
      const [owner, n, type] = JSON.parse(k);
      next.set(owner === kind && n === oldName ? constraintKey(owner, newName, type) : k, keys);
    }
    this.constraints = next;
    for (const k of this.physicsReset) if (k.name === oldName) k.name = newName;
  }

  removeDeform(slotName, attName) {
    this.remapDeform(([skin, slot, att]) => (slot === slotName && att === attName ? null : [skin, slot, att]));
  }

  // Renomme ou supprime (null) des timelines de déformation.
  remapDeform(fn) {
    const next = new Map();
    for (const [k, keys] of this.deform) {
      const r = fn(JSON.parse(k));
      if (r) next.set(deformKey(r[1], r[2], r[0]), keys);
    }
    this.deform = next;
  }

  renameEvent(oldName, newName) {
    for (const k of this.events) if (k.name === oldName) k.name = newName;
  }

  removeEvent(name) {
    this.events = this.events.filter((k) => k.name !== name);
  }

  copy(name) {
    const a = animationFromJSON(name, animationToJSON(this));
    return a;
  }

  // Applique l'animation à l'instant time sur la pose courante du squelette.
  // alpha : mélange avec la pose actuelle (1 = l'animation remplace la pose).
  // events : tableau qui reçoit les événements entre lastTime (exclu) et time (inclus).
  apply(skeleton, time, { alpha = 1, loop = false, lastTime = -1, events = null } = {}) {
    const duration = this.duration;
    // Les remises à zéro de la physique ne se déclenchent que pendant la lecture (comme les événements).
    const physicsResets = events ? { lastTime: loop && duration > 0 && lastTime >= 0 ? lastTime % duration : lastTime } : null;
    if (loop && duration > 0) {
      // time et lastTime peuvent dépasser la durée : on compte les tours de boucle.
      if (events) {
        const t = time % duration;
        if (lastTime < 0) collectEvents(this.events, -1, t, events);
        else if (Math.floor(time / duration) > Math.floor(lastTime / duration)) {
          collectEvents(this.events, lastTime % duration, duration, events);
          collectEvents(this.events, -1, t, events);
        } else collectEvents(this.events, lastTime % duration, t, events);
        events = null;
      }
      time %= duration;
    }
    if (events) collectEvents(this.events, lastTime, time, events);

    for (const [name, tls] of this.bones) {
      const bone = skeleton.findBone(name);
      if (!bone) continue;
      const p = bone.pose;
      if (tls.rotate) {
        const v = sample(tls.rotate, time, ['value']);
        const target = bone.rotation + (v ? v[0] : 0);
        p.rotation += (target - p.rotation) * alpha;
      }
      if (tls.translate) {
        const v = sample(tls.translate, time, ['x', 'y']);
        p.x += (bone.x + (v ? v[0] : 0) - p.x) * alpha;
        p.y += (bone.y + (v ? v[1] : 0) - p.y) * alpha;
      }
      if (tls.scale) {
        const v = sample(tls.scale, time, ['x', 'y']);
        p.scaleX += (bone.scaleX * (v ? v[0] : 1) - p.scaleX) * alpha;
        p.scaleY += (bone.scaleY * (v ? v[1] : 1) - p.scaleY) * alpha;
      }
      if (tls.shear) {
        const v = sample(tls.shear, time, ['x', 'y']);
        p.shearX += (bone.shearX + (v ? v[0] : 0) - p.shearX) * alpha;
        p.shearY += (bone.shearY + (v ? v[1] : 0) - p.shearY) * alpha;
      }
    }

    for (const [name, tls] of this.slots) {
      const slot = skeleton.findSlot(name);
      if (!slot) continue;
      const p = slot.pose;
      if (tls.attachment && alpha >= 0.5) {
        const i = frameIndex(tls.attachment, time);
        p.attachment = i < 0 ? slot.attachment : tls.attachment[i].name;
      }
      if (tls.rgba) {
        const c = sampleColor(tls.rgba, time, 'color') ?? slot.color;
        p.color = mixColor(p.color, c, alpha);
      }
      if (tls.rgba2) {
        const light = sampleColor(tls.rgba2, time, 'light') ?? slot.color;
        const dark = sampleColor(tls.rgba2, time, 'dark') ?? slot.dark ?? '#000000';
        p.color = mixColor(p.color, light, alpha);
        p.dark = mixColor(p.dark ?? '#000000', dark, alpha).slice(0, 7);
      }
    }

    for (const [k, keys] of this.deform) {
      const [, slotName] = JSON.parse(k);
      const slot = skeleton.findSlot(slotName);
      if (!slot) continue;
      // La déformation ne s'applique que si la pièce jointe affichée est celle de la timeline (dans sa skin).
      const cur = skeleton.currentAttachment(slot);
      if (!cur || cur.type !== 'mesh' || skeleton.deformKeyFor(slot, cur) !== k) continue;
      const v = sampleArray(keys, time);
      if (!v) continue;
      const p = slot.pose;
      if (p.deformFor !== k || !p.deform || p.deform.length !== v.length || alpha >= 1) {
        const base = p.deformFor === k && p.deform && p.deform.length === v.length ? p.deform : new Float32Array(v.length);
        p.deform = Float32Array.from(v, (x, i) => base[i] + (x - base[i]) * alpha);
      } else {
        for (let i = 0; i < v.length; i++) p.deform[i] += (v[i] - p.deform[i]) * alpha;
      }
      p.deformFor = k;
    }

    for (const [k, keys] of this.constraints) {
      const [owner, name, type] = JSON.parse(k);
      const c = skeleton.findConstraint(name);
      if (!c || c.kind !== owner) continue;
      const spec = CONSTRAINT_TIMELINES[owner][type];
      const i = frameIndex(keys, time);
      if (i < 0) continue;
      const v = sample(keys, time, spec.numbers);
      spec.numbers.forEach((f, j) => {
        c.pose[f] += (v[j] - c.pose[f]) * alpha;
      });
      if (alpha >= 0.5) for (const f of spec.flags) if (keys[i][f] !== undefined) c.pose[f] = keys[i][f];
    }

    if (physicsResets && this.physicsReset.length) {
      const resets = [];
      collectEvents(this.physicsReset, physicsResets.lastTime, time, resets);
      for (const r of resets) skeleton.resetPhysics(r.name ?? null);
    }

    if (this.drawOrder.length && alpha >= 0.5) {
      const i = frameIndex(this.drawOrder, time);
      const order = i < 0 ? null : this.drawOrder[i].order;
      skeleton.drawOrder = order ? orderSlots(skeleton, order) : [...skeleton.slots];
    }
  }
}

function renameKey(map, oldName, newName) {
  if (!map.has(oldName)) return;
  const v = map.get(oldName);
  map.delete(oldName);
  map.set(newName, v);
}

// Index de la dernière clé dont le temps est <= time (-1 si avant la première).
export function frameIndex(keys, time) {
  let lo = 0;
  let hi = keys.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (keys[mid].time <= time + TIME_EPSILON) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

// Valeurs interpolées des champs à l'instant time (null avant la première clé : pose de base).
export function sample(keys, time, fields) {
  const i = frameIndex(keys, time);
  if (i < 0) return null;
  const k = keys[i];
  const n = keys[i + 1];
  if (!n) return fields.map((f) => k[f]);
  const e = evaluateCurve(k.curve, (time - k.time) / (n.time - k.time));
  return fields.map((f) => k[f] + (n[f] - k[f]) * e);
}

// Tableau de décalages interpolé (une clé sans « vertices » vaut zéro partout).
function sampleArray(keys, time) {
  const i = frameIndex(keys, time);
  if (i < 0) return null;
  const k = keys[i];
  const n = keys[i + 1];
  const len = Math.max(k.vertices?.length ?? 0, n?.vertices?.length ?? 0);
  const a = (j) => k.vertices?.[j] ?? 0;
  if (!n) return Float32Array.from({ length: len }, (_, j) => a(j));
  const e = evaluateCurve(k.curve, (time - k.time) / (n.time - k.time));
  return Float32Array.from({ length: len }, (_, j) => a(j) + ((n.vertices?.[j] ?? 0) - a(j)) * e);
}

function sampleColor(keys, time, field) {
  const i = frameIndex(keys, time);
  if (i < 0) return null;
  const k = keys[i];
  const n = keys[i + 1];
  if (!n || !k[field] || !n[field]) return k[field] ?? null;
  const e = evaluateCurve(k.curve, (time - k.time) / (n.time - k.time));
  const a = hexToRgba(k[field]);
  const b = hexToRgba(n[field]);
  return rgbaToHex(...a.map((v, j) => v + (b[j] - v) * e));
}

function mixColor(from, to, alpha) {
  if (alpha >= 1) return to.length === 7 ? `${to}ff` : to;
  const a = hexToRgba(from);
  const b = hexToRgba(to);
  return rgbaToHex(...a.map((v, j) => v + (b[j] - v) * alpha));
}

function collectEvents(keys, from, to, out) {
  for (const k of keys) if (k.time > from + TIME_EPSILON / 2 && k.time <= to + TIME_EPSILON) out.push(k);
}

// Ordre d'affichage d'une clé : les slots nommés, puis ceux absents de la clé
// (ajoutés après coup), placés devant tous les slots qui les précèdent dans la pose de base.
function orderSlots(skeleton, order) {
  const named = order.map((n) => skeleton.findSlot(n)).filter(Boolean);
  const set = new Set(named);
  const out = [...named];
  for (const s of skeleton.slots) {
    if (set.has(s)) continue;
    const i = skeleton.slots.indexOf(s);
    // Après tous les slots qui le précèdent dans la pose de base.
    let pos = 0;
    for (let j = 0; j < i; j++) pos = Math.max(pos, out.indexOf(skeleton.slots[j]) + 1);
    out.splice(pos, 0, s);
  }
  return out;
}

// --- Lecture / écriture JSON -------------------------------------------------------------

function curveOut(out, k) {
  if (k.curve !== undefined && k.curve !== 'linear') out.curve = Array.isArray(k.curve) ? k.curve.map((v) => round(v, 4)) : k.curve;
  return out;
}

export function animationToJSON(anim) {
  const out = {};
  if (anim.bones.size) {
    out.bones = {};
    for (const [name, tls] of anim.bones) {
      out.bones[name] = {};
      for (const [type, keys] of Object.entries(tls)) {
        out.bones[name][type] = keys.map((k) => curveOut(type === 'rotate'
          ? { time: round(k.time, 6), value: round(k.value, 3) }
          : { time: round(k.time, 6), x: round(k.x, 4), y: round(k.y, 4) }, k));
      }
    }
  }
  if (anim.slots.size) {
    out.slots = {};
    for (const [name, tls] of anim.slots) {
      out.slots[name] = {};
      for (const [type, keys] of Object.entries(tls)) {
        out.slots[name][type] = keys.map((k) => {
          if (type === 'attachment') return { time: round(k.time, 6), name: k.name };
          if (type === 'rgba') return curveOut({ time: round(k.time, 6), color: k.color }, k);
          return curveOut({ time: round(k.time, 6), light: k.light, dark: k.dark }, k);
        });
      }
    }
  }
  if (anim.deform.size) {
    out.deform = {};
    for (const [k, keys] of anim.deform) {
      const [skin, slot, att] = JSON.parse(k);
      out.deform[skin] ??= {};
      out.deform[skin][slot] ??= {};
      out.deform[skin][slot][att] = keys.map((key) => {
        const o = { time: round(key.time, 6) };
        if (key.vertices?.some((v) => v !== 0)) o.vertices = key.vertices.map((v) => round(v, 3));
        return curveOut(o, key);
      });
    }
  }
  for (const [k, keys] of anim.constraints) {
    const [owner, name, type] = JSON.parse(k);
    const spec = CONSTRAINT_TIMELINES[owner][type];
    out[owner] ??= {};
    const list = keys.map((key) => {
      const o = { time: round(key.time, 6) };
      for (const f of spec.numbers) o[f] = round(key[f], 4);
      for (const f of spec.flags) if (key[f] !== undefined) o[f] = key[f];
      return curveOut(o, key);
    });
    if (owner === 'path') {
      out.path[name] ??= {};
      out.path[name][type] = list;
    } else out[owner][name] = list;
  }
  if (anim.physicsReset.length) out.physicsReset = anim.physicsReset.map((k) => ({ time: round(k.time, 6), name: k.name ?? null }));
  if (anim.drawOrder.length) out.drawOrder = anim.drawOrder.map((k) => ({ time: round(k.time, 6), order: k.order }));
  if (anim.events.length) {
    out.events = anim.events.map((k) => {
      const e = { time: round(k.time, 6), name: k.name };
      for (const f of ['int', 'float', 'string', 'volume', 'balance']) if (k[f] !== undefined) e[f] = k[f];
      return e;
    });
  }
  return out;
}

function num(v, label) {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`Valeur invalide pour ${label}.`);
  return v;
}

function keyBase(k, where) {
  const time = num(k.time, `time (${where})`);
  if (time < 0) throw new Error(`Temps négatif (${where}).`);
  if (!isValidCurve(k.curve)) throw new Error(`Courbe invalide (${where}).`);
  const out = { time };
  if (k.curve !== undefined && k.curve !== 'linear') out.curve = k.curve;
  return out;
}

export function animationFromJSON(name, data) {
  const anim = new Animation(name);
  for (const [bone, tls] of Object.entries(data.bones ?? {})) {
    const out = {};
    for (const [type, keys] of Object.entries(tls)) {
      if (!BONE_TIMELINES.includes(type)) throw new Error(`Timeline d'os inconnue : ${type}.`);
      const where = `${name}/${bone}/${type}`;
      out[type] = keys.map((k) => (type === 'rotate'
        ? { ...keyBase(k, where), value: num(k.value ?? 0, where) }
        : { ...keyBase(k, where), x: num(k.x ?? (type === 'scale' ? 1 : 0), where), y: num(k.y ?? (type === 'scale' ? 1 : 0), where) }));
    }
    anim.bones.set(bone, out);
  }
  for (const [slot, tls] of Object.entries(data.slots ?? {})) {
    const out = {};
    for (const [type, keys] of Object.entries(tls)) {
      if (!SLOT_TIMELINES.includes(type)) throw new Error(`Timeline de slot inconnue : ${type}.`);
      const where = `${name}/${slot}/${type}`;
      out[type] = keys.map((k) => {
        if (type === 'attachment') {
          if (k.name !== null && typeof k.name !== 'string') throw new Error(`Nom de pièce jointe invalide (${where}).`);
          return { time: keyBase(k, where).time, name: k.name ?? null };
        }
        if (type === 'rgba') {
          if (!isRgba(k.color)) throw new Error(`Couleur invalide (${where}).`);
          return { ...keyBase(k, where), color: k.color };
        }
        if (!isRgba(k.light) || !isRgb(k.dark)) throw new Error(`Couleurs invalides (${where}).`);
        return { ...keyBase(k, where), light: k.light, dark: k.dark };
      });
    }
    anim.slots.set(slot, out);
  }
  for (const [skin, slots] of Object.entries(data.deform ?? {})) {
    for (const [slot, atts] of Object.entries(slots)) {
      for (const [att, keys] of Object.entries(atts)) {
        const where = `${name}/deform/${slot}/${att}`;
        anim.deform.set(deformKey(slot, att, skin), keys.map((k) => {
          const out = keyBase(k, where);
          if (k.vertices !== undefined) {
            if (!Array.isArray(k.vertices)) throw new Error(`Déformation invalide (${where}).`);
            out.vertices = k.vertices.map((v) => num(v, where));
          }
          return out;
        }));
      }
    }
  }
  for (const owner of Object.keys(CONSTRAINT_TIMELINES)) {
    for (const [cname, value] of Object.entries(data[owner] ?? {})) {
      const byType = owner === 'path' ? value : { [owner]: value };
      for (const [type, keys] of Object.entries(byType)) {
        const spec = CONSTRAINT_TIMELINES[owner][type];
        if (!spec || !Array.isArray(keys)) throw new Error(`Timeline de contrainte inconnue : ${owner}/${type} (${name}).`);
        const where = `${name}/${owner}/${cname}`;
        anim.constraints.set(constraintKey(owner, cname, type), keys.map((k) => {
          const o = keyBase(k, where);
          for (const f of spec.numbers) o[f] = num(k[f] ?? 0, `${f} (${where})`);
          for (const f of spec.flags) if (k[f] !== undefined) o[f] = Boolean(k[f]);
          return o;
        }));
      }
    }
  }
  anim.physicsReset = (data.physicsReset ?? []).map((k) => ({ time: keyBase(k, `${name}/physicsReset`).time, name: k.name ?? null }));
  anim.drawOrder = (data.drawOrder ?? []).map((k) => {
    if (k.order !== null && !(Array.isArray(k.order) && k.order.every((n) => typeof n === 'string'))) {
      throw new Error(`Ordre d'affichage invalide (${name}).`);
    }
    return { time: keyBase(k, `${name}/drawOrder`).time, order: k.order ?? null };
  });
  anim.events = (data.events ?? []).map((k) => {
    if (typeof k.name !== 'string') throw new Error(`Événement sans nom (${name}).`);
    const e = { time: keyBase(k, `${name}/events`).time, name: k.name };
    for (const f of ['int', 'float', 'volume', 'balance']) if (k[f] !== undefined) e[f] = num(k[f], `${f} (${name}/events)`);
    if (k.string !== undefined) e.string = String(k.string);
    return e;
  });
  anim.sortAll();
  return anim;
}

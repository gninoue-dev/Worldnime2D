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

export const TIMELINE_LABELS = {
  rotate: 'Rotation',
  translate: 'Position',
  scale: 'Échelle',
  shear: 'Cisaillement',
  attachment: 'Pièce jointe',
  rgba: 'Couleur',
  rgba2: 'Couleur + sombre',
  drawOrder: 'Ordre d\'affichage',
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
    // Clés { time, name, int, float, string, volume, balance }
    this.events = [];
  }

  // Toutes les timelines, sous la forme { owner: 'bone'|'slot'|'drawOrder'|'events', name, type, keys }.
  *timelines() {
    for (const [name, tls] of this.bones) for (const [type, keys] of Object.entries(tls)) yield { owner: 'bone', name, type, keys };
    for (const [name, tls] of this.slots) for (const [type, keys] of Object.entries(tls)) yield { owner: 'slot', name, type, keys };
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
    for (const k of this.drawOrder) if (k.order) k.order = k.order.map((n) => (n === oldName ? newName : n));
  }

  removeSlot(name) {
    this.slots.delete(name);
    for (const k of this.drawOrder) if (k.order) k.order = k.order.filter((n) => n !== name);
  }

  // Une pièce jointe renommée : les clés qui l'affichent suivent.
  renameAttachment(slotName, oldName, newName) {
    for (const k of this.slots.get(slotName)?.attachment ?? []) if (k.name === oldName) k.name = newName;
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

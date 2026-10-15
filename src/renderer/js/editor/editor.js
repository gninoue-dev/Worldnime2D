// État central de l'éditeur : le squelette, la sélection, l'outil actif et l'historique.
// Les vues (viewport, arbre, propriétés) écoutent l'événement « change » pour se redessiner.

import { Skeleton } from '../model/skeleton.js';
import { serializeProject, parseProject, projectToText } from '../model/format.js';
import { TIME_EPSILON, CONSTRAINT_TIMELINES } from '../model/animation.js';

const HISTORY_LIMIT = 200;

export const TOOLS = Object.freeze({
  select: 'select',
  create: 'create',
  rotate: 'rotate',
  translate: 'translate',
  scale: 'scale',
  shear: 'shear',
});

export const TOOL_INFO = {
  select: { label: 'Sélection', key: 'V' },
  create: { label: 'Créer un os', key: 'C' },
  rotate: { label: 'Rotation', key: 'R' },
  translate: { label: 'Déplacement', key: 'T' },
  scale: { label: 'Échelle', key: 'S' },
  shear: { label: 'Cisaillement', key: 'H' },
};

export class Editor extends EventTarget {
  constructor(appVersion = '0.0.0') {
    super();
    this.appVersion = appVersion;
    this.tool = TOOLS.select;
    this.filePath = null;
    // Mode Configuration ('setup') ou Animation ('animate').
    this.mode = 'setup';
    this.animationName = null;
    this.time = 0;
    this.playing = false;
    this.loop = true;
    this.speed = 1;
    // Clé automatique : en mode Animation, transformer un os crée la clé tout de suite.
    this.autoKey = true;
    this.onion = false;
    // Plage de lecture { start, end } en images (null = toute l'animation).
    this.range = null;
    // Outil de maillage : null, 'edit', 'weights' (Configuration) ou 'deform' (Animation).
    this.meshTool = null;
    // Pinceau de poids : rayon en pixels écran, force par passage, os peint.
    this.brush = { radius: 40, strength: 0.25, bone: null };
    // Rayon doux (pixels écran) : les sommets voisins suivent le sommet déplacé.
    this.softRadius = 0;
    // Simulation physique en continu dans la vue (contraintes physiques).
    this.physicsLive = true;
    this.selectedConstraint = null;
    // Clés sélectionnées dans la timeline : { owner, name, type, key }.
    this.selectedKeys = [];
    this.reset(new Skeleton());
  }

  reset(skeleton, filePath = null) {
    this.skeleton = skeleton;
    this.animationName = skeleton.animations[0]?.name ?? null;
    this.time = 0;
    this.playing = false;
    this.selectedKeys = [];
    if (this.mode === 'animate' && !this.animationName) this.mode = 'setup';
    this.refreshPose();
    this.selected = skeleton.root;
    this.selectedSlot = null;
    this.selectedAttachment = null;
    this.selectedConstraint = null;
    this.filePath = filePath;
    this.undoStack = [];
    this.redoStack = [];
    this.savedState = this.projectState();
    this.pending = null;
    this.emit('reset');
  }

  emit(reason) {
    this.dispatchEvent(new CustomEvent('change', { detail: { reason } }));
  }

  get dirty() {
    return this.projectState() !== this.savedState;
  }

  projectState() {
    return JSON.stringify(serializeProject(this.skeleton));
  }

  get title() {
    const name = this.filePath ? this.filePath.split(/[\\/]/).pop() : 'Sans titre';
    return `${this.dirty ? '● ' : ''}${name} — Worldnime2D`;
  }

  // --- Historique -----------------------------------------------------------

  snapshot() {
    return JSON.stringify({
      project: serializeProject(this.skeleton),
      selected: this.selected?.name ?? null,
      slot: this.selectedSlot?.name ?? null,
      attachment: this.selectedAttachment,
      animation: this.animationName,
      constraint: this.selectedConstraint,
    });
  }

  restore(state) {
    const { project, selected, slot, attachment, animation, constraint } = JSON.parse(state);
    this.skeleton = parseProject(JSON.stringify(project));
    this.selected = (selected && this.skeleton.findBone(selected)) || this.skeleton.root;
    this.selectedSlot = (slot && this.skeleton.findSlot(slot)) || null;
    this.selectedAttachment = this.selectedSlot && attachment && this.skeleton.getAttachment(this.selectedSlot, attachment)
      ? attachment
      : null;
    if (this.selectedSlot) this.selected = this.selectedSlot.bone;
    const sk = this.skeleton;
    this.selectedConstraint = constraint && sk.findConstraint(constraint) ? constraint : null;
    this.animationName = (animation && sk.findAnimation(animation) && animation) || sk.animations[0]?.name || null;
    if (this.mode === 'animate' && !this.animationName) this.mode = 'setup';
    this.selectedKeys = [];
    this.refreshPose();
  }

  // Les modifications continues (glisser à la souris) ouvrent une transaction :
  // une seule étape d'historique est enregistrée quand on relâche.
  begin() {
    if (!this.pending) this.pending = this.snapshot();
  }

  commit() {
    if (!this.pending) return;
    const before = this.pending;
    this.pending = null;
    if (before === this.snapshot()) return;
    this.undoStack.push(before);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    this.emit('commit');
  }

  cancel() {
    if (!this.pending) return;
    this.restore(this.pending);
    this.pending = null;
    this.emit('cancel');
  }

  // Applique une modification ponctuelle avec une étape d'historique.
  apply(fn) {
    this.begin();
    try {
      fn();
    } catch (e) {
      this.cancel();
      throw e;
    }
    this.refreshPose();
    this.commit();
    this.emit('edit');
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  undo() {
    if (!this.canUndo) return;
    this.redoStack.push(this.snapshot());
    this.restore(this.undoStack.pop());
    this.emit('undo');
  }

  redo() {
    if (!this.canRedo) return;
    this.undoStack.push(this.snapshot());
    this.restore(this.redoStack.pop());
    this.emit('redo');
  }

  // --- Sélection et outils ---------------------------------------------------

  // Ce qui est sélectionné : 'bone', 'slot', 'attachment' ou 'constraint'.
  get selectionKind() {
    if (this.selectedConstraint) return 'constraint';
    if (this.selectedSlot && this.selectedAttachment) return 'attachment';
    if (this.selectedSlot) return 'slot';
    return 'bone';
  }

  // La pièce jointe sélectionnée (objet), ou null.
  get attachment() {
    if (!this.selectedSlot || !this.selectedAttachment) return null;
    return this.skeleton.getAttachment(this.selectedSlot, this.selectedAttachment);
  }

  get constraint() {
    return this.selectedConstraint ? this.skeleton.findConstraint(this.selectedConstraint) : null;
  }

  select(bone) {
    if (this.selected === bone && !this.selectedSlot && !this.selectedConstraint) return;
    this.selected = bone;
    this.selectedSlot = null;
    this.selectedAttachment = null;
    this.selectedConstraint = null;
    this.emit('select');
  }

  selectConstraint(name) {
    this.selectedConstraint = name;
    this.selectedSlot = null;
    this.selectedAttachment = null;
    this.emit('select');
  }

  selectSlot(slot) {
    this.selectedConstraint = null;
    this.selected = slot.bone;
    this.selectedSlot = slot;
    this.selectedAttachment = null;
    this.emit('select');
  }

  selectAttachment(slot, name) {
    this.selectedConstraint = null;
    this.selected = slot.bone;
    this.selectedSlot = slot;
    this.selectedAttachment = name;
    this.emit('select');
  }

  // --- Animation ------------------------------------------------------------------

  get animation() {
    return this.animationName ? this.skeleton.findAnimation(this.animationName) : null;
  }

  get animating() {
    return this.mode === 'animate';
  }

  get fps() {
    return this.skeleton.fps;
  }

  get frame() {
    return Math.round(this.time * this.fps);
  }

  // Recalcule la pose courante : pose de base (Configuration) ou animation au temps courant.
  // physics : 'pose' (appliquer la simulation sans l'avancer), 'update' (l'avancer) ou 'reset'.
  refreshPose(applyOptions = undefined, physics = 'pose') {
    const sk = this.skeleton;
    if (this.mode === 'animate') {
      sk.posed = true;
      sk.setToSetupPose();
      this.animation?.apply(sk, this.time, applyOptions);
    } else {
      sk.posed = false;
    }
    sk.updateWorldTransform(physics);
  }

  get hasPhysics() {
    return this.skeleton.constraints.some((c) => c.kind === 'physics');
  }

  // Avance la simulation physique de dt secondes (hors lecture).
  stepPhysics(dt) {
    this.skeleton.time += dt;
    this.refreshPose(undefined, 'update');
    this.emit('physics');
  }

  resetPhysics() {
    this.skeleton.resetPhysics();
    this.refreshPose(undefined, 'reset');
    this.emit('physics');
  }

  // Écrit les clés d'une contrainte à partir de sa pose courante.
  keyConstraint(c, types = Object.keys(CONSTRAINT_TIMELINES[c.kind])) {
    const anim = this.animation;
    if (!anim) return;
    for (const type of types) {
      const spec = CONSTRAINT_TIMELINES[c.kind][type];
      const key = { time: this.time };
      for (const f of [...spec.numbers, ...spec.flags]) key[f] = c.pose[f];
      anim.setKey(c.kind, c.name, type, key);
    }
  }

  setMeshTool(tool) {
    this.meshTool = this.meshTool === tool ? null : tool;
    this.emit('meshtool');
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.playing = false;
    this.meshTool = null;
    if (mode === 'animate' && !this.animation) {
      if (this.skeleton.animations.length === 0) {
        this.apply(() => {
          this.skeleton.addAnimation('animation');
        });
      }
      this.animationName = this.skeleton.animations[0].name;
    }
    this.mode = mode;
    if (mode === 'animate' && this.tool === TOOLS.create) this.tool = TOOLS.select;
    this.selectedKeys = [];
    this.refreshPose();
    this.emit('mode');
  }

  setAnimation(name) {
    if (name === this.animationName) return;
    this.animationName = name;
    this.time = 0;
    this.selectedKeys = [];
    this.refreshPose();
    this.emit('animation');
  }

  setTime(time) {
    const t = Math.max(0, time);
    if (Math.abs(t - this.time) < 1e-9) return;
    this.time = t;
    this.refreshPose();
    this.emit('time');
  }

  setFrame(frame) {
    this.setTime(Math.max(0, Math.round(frame)) / this.fps);
  }

  // Avance la lecture de dt secondes. Renvoie les événements déclenchés.
  step(dt) {
    const anim = this.animation;
    const duration = anim?.duration ?? 0;
    if (!this.playing || duration <= 0) {
      this.playing = false;
      return [];
    }
    if (this.range) return this.stepRange(dt);
    const last = this.time;
    let raw = last + dt * this.speed;
    const events = [];
    if (!this.loop && raw >= duration) {
      raw = duration;
      this.playing = false;
    }
    this.skeleton.time += dt * this.speed;
    this.refreshPoseAt(raw, { loop: this.loop, lastTime: last, events });
    this.time = this.loop ? raw % duration : raw;
    this.emit('time');
    if (events.length) this.dispatchEvent(new CustomEvent('events', { detail: events }));
    return events;
  }

  // Lecture limitée à la plage : on reboucle au début de la plage (ou on s'arrête à sa fin).
  stepRange(dt) {
    const start = this.range.start / this.fps;
    const end = this.range.end / this.fps;
    const last = Math.min(Math.max(this.time, start), end);
    let t = last + dt * this.speed;
    this.skeleton.time += dt * this.speed;
    const events = [];
    if (t > end) {
      if (this.loop && end > start) t = start + ((t - end) % (end - start));
      else {
        t = end;
        this.playing = false;
      }
      this.time = t;
      this.refreshPose(undefined, 'update');
    } else {
      this.time = t;
      this.refreshPose({ lastTime: last, events }, 'update');
    }
    this.emit('time');
    if (events.length) this.dispatchEvent(new CustomEvent('events', { detail: events }));
    return events;
  }

  setRange(start, end) {
    if (start === null) this.range = null;
    else {
      const a = Math.max(0, Math.min(start, end));
      const b = Math.max(start, end);
      this.range = b > a ? { start: a, end: b } : null;
    }
    this.emit('range');
  }

  refreshPoseAt(rawTime, opts) {
    const keep = this.time;
    this.time = rawTime;
    this.refreshPose(opts, 'update');
    this.time = keep;
  }

  togglePlay() {
    const anim = this.animation;
    if (!this.animating || !anim) return;
    if (!this.playing && !this.loop && this.time >= anim.duration - TIME_EPSILON) this.time = 0;
    this.playing = !this.playing;
    this.emit('play');
  }

  // Temps des clés de l'animation (triés, sans doublons), pour aller à la clé précédente/suivante.
  keyTimes() {
    const set = new Set();
    for (const tl of this.animation?.timelines() ?? []) for (const k of tl.keys) set.add(Math.round(k.time * 1e4) / 1e4);
    return [...set].sort((a, b) => a - b);
  }

  // --- Clés -------------------------------------------------------------------------------

  // Écrit les clés d'un os à partir de sa pose courante, au temps courant.
  keyBone(bone, types = ['rotate', 'translate', 'scale']) {
    const anim = this.animation;
    if (!anim) return;
    const p = bone.pose;
    const time = this.time;
    const ratio = (v, base) => (base !== 0 ? v / base : v);
    for (const type of types) {
      if (type === 'rotate') anim.setKey('bone', bone.name, type, { time, value: p.rotation - bone.rotation });
      if (type === 'translate') anim.setKey('bone', bone.name, type, { time, x: p.x - bone.x, y: p.y - bone.y });
      if (type === 'scale') {
        anim.setKey('bone', bone.name, type, { time, x: ratio(p.scaleX, bone.scaleX), y: ratio(p.scaleY, bone.scaleY) });
      }
      if (type === 'shear') anim.setKey('bone', bone.name, type, { time, x: p.shearX - bone.shearX, y: p.shearY - bone.shearY });
    }
  }

  // Écrit les clés d'un slot à partir de sa pose courante.
  keySlot(slot, types) {
    const anim = this.animation;
    if (!anim) return;
    const p = slot.pose;
    const time = this.time;
    for (const type of types) {
      if (type === 'attachment') anim.setKey('slot', slot.name, type, { time, name: p.attachment });
      if (type === 'rgba') anim.setKey('slot', slot.name, type, { time, color: p.color });
      if (type === 'rgba2') anim.setKey('slot', slot.name, type, { time, light: p.color, dark: p.dark ?? '#000000' });
    }
  }

  // Clé de couleur : avec couleur sombre si le slot en a une (dans la pose de base ou la pose courante).
  colorTimelineType(slot) {
    return slot.dark || slot.pose.dark || this.animation?.timeline('slot', slot.name, 'rgba2') ? 'rgba2' : 'rgba';
  }

  keyDrawOrder() {
    this.animation?.setKey('drawOrder', '', 'drawOrder', { time: this.time, order: this.skeleton.drawOrder.map((s) => s.name) });
  }

  // État de clé d'une timeline au temps courant : 'key' (clé ici), 'timeline' (animée ailleurs) ou null.
  keyState(owner, name, type) {
    const anim = this.animation;
    if (!anim) return null;
    const keys = anim.timeline(owner, name, type);
    if (!keys || keys.length === 0) return null;
    return keys.some((k) => Math.abs(k.time - this.time) < TIME_EPSILON) ? 'key' : 'timeline';
  }

  isKeySelected(key) {
    return this.selectedKeys.some((e) => e.key === key);
  }

  selectKeys(entries, add = false) {
    if (!add) this.selectedKeys = [];
    for (const e of entries) {
      const i = this.selectedKeys.findIndex((x) => x.key === e.key);
      if (i >= 0 && add) this.selectedKeys.splice(i, 1);
      else if (i < 0) this.selectedKeys.push(e);
    }
    this.emit('keys');
  }

  deleteSelectedKeys() {
    const anim = this.animation;
    if (!anim || this.selectedKeys.length === 0) return false;
    const entries = this.selectedKeys;
    this.apply(() => {
      for (const e of entries) {
        const keys = anim.timeline(e.owner, e.name, e.type);
        const i = keys ? keys.indexOf(e.key) : -1;
        if (i >= 0) keys.splice(i, 1);
      }
      anim.prune();
    });
    this.selectedKeys = [];
    this.emit('keys');
    return true;
  }

  // Décale les clés sélectionnées (en images). Les clés écrasées au même instant sont remplacées.
  moveSelectedKeys(frames) {
    const anim = this.animation;
    if (!anim || this.selectedKeys.length === 0 || frames === 0) return;
    const dt = frames / this.fps;
    if (this.selectedKeys.some((e) => e.key.time + dt < -TIME_EPSILON)) return;
    const moving = new Set(this.selectedKeys.map((e) => e.key));
    for (const e of this.selectedKeys) {
      const keys = anim.timeline(e.owner, e.name, e.type);
      const target = Math.round((e.key.time + dt) * this.fps) / this.fps;
      // Une clé immobile au point d'arrivée est remplacée.
      for (let i = keys.length - 1; i >= 0; i--) {
        if (!moving.has(keys[i]) && Math.abs(keys[i].time - target) < TIME_EPSILON) keys.splice(i, 1);
      }
      e.key.time = target;
    }
    anim.sortAll();
  }

  // Étire ou resserre les clés sélectionnées dans le temps autour de pivot (secondes).
  // originals : Map clé → temps d'origine (pour repartir de l'état initial à chaque mouvement).
  scaleSelectedKeys(factor, pivot, originals) {
    const anim = this.animation;
    if (!anim || this.selectedKeys.length === 0 || !(factor > 0)) return;
    const moving = new Set(this.selectedKeys.map((e) => e.key));
    for (const e of this.selectedKeys) {
      const t0 = originals.get(e.key) ?? e.key.time;
      e.key.time = Math.max(0, Math.round((pivot + (t0 - pivot) * factor) * this.fps) / this.fps);
    }
    // Deux clés d'une même timeline au même instant : on ne garde que la dernière déplacée.
    for (const e of this.selectedKeys) {
      const keys = anim.timeline(e.owner, e.name, e.type);
      for (let i = keys.length - 1; i >= 0; i--) {
        if (keys[i] !== e.key && !moving.has(keys[i]) && Math.abs(keys[i].time - e.key.time) < TIME_EPSILON) keys.splice(i, 1);
      }
    }
    anim.sortAll();
  }

  copySelectedKeys() {
    if (this.selectedKeys.length === 0) return null;
    const t0 = Math.min(...this.selectedKeys.map((e) => e.key.time));
    this.clipboard = this.selectedKeys.map((e) => ({
      owner: e.owner, name: e.name, type: e.type, key: { ...structuredClone(e.key), time: e.key.time - t0 },
    }));
    return this.clipboard.length;
  }

  pasteKeys() {
    const anim = this.animation;
    if (!anim || !this.clipboard?.length) return 0;
    const pasted = [];
    this.apply(() => {
      for (const c of this.clipboard) {
        const key = { ...structuredClone(c.key), time: Math.round((this.time + c.key.time) * this.fps) / this.fps };
        anim.setKey(c.owner, c.name, c.type, key);
        pasted.push({ owner: c.owner, name: c.name, type: c.type, key });
      }
    });
    this.selectedKeys = pasted;
    this.emit('keys');
    return pasted.length;
  }

  // Applique une courbe aux clés sélectionnées.
  setCurve(curve) {
    if (this.selectedKeys.length === 0) return;
    const entries = this.selectedKeys;
    this.apply(() => {
      for (const e of entries) {
        if (curve === 'linear') delete e.key.curve;
        else e.key.curve = Array.isArray(curve) ? [...curve] : curve;
      }
    });
    this.selectedKeys = entries;
  }

  setTool(tool) {
    if (!TOOLS[tool] || this.tool === tool) return;
    this.tool = tool;
    this.emit('tool');
  }

  // --- Opérations sur les os ---------------------------------------------------

  // Supprime ce qui est sélectionné (os avec ses descendants et ses slots, slot, ou pièce jointe).
  deleteSelected() {
    if (this.animating) return this.deleteSelectedKeys();
    const sk = this.skeleton;
    const kind = this.selectionKind;
    if (kind === 'attachment') {
      const slot = this.selectedSlot;
      const name = this.selectedAttachment;
      this.apply(() => {
        sk.removeAttachment(slot, name);
        this.selectedAttachment = null;
      });
      return true;
    }
    if (kind === 'slot') {
      const slot = this.selectedSlot;
      this.apply(() => {
        sk.removeSlot(slot);
        this.selectedSlot = null;
      });
      return true;
    }
    const bone = this.selected;
    if (!bone || !bone.parent) return false;
    const parent = bone.parent;
    this.apply(() => {
      sk.removeBone(bone);
      this.selected = parent;
    });
    return true;
  }

  // Copie un slot (et ses pièces jointes) sur un os, juste devant l'original dans l'ordre d'affichage.
  copySlot(src, bone) {
    const sk = this.skeleton;
    const slot = sk.addSlot(sk.uniqueSlotName(src.name), bone, sk.slots.indexOf(src) + 1);
    for (const k of ['color', 'dark', 'attachment', 'blend']) slot[k] = src[k];
    for (const [name, att] of sk.defaultSkin.attachmentsOf(src.name)) sk.addAttachment(slot, att.copy(name));
    return slot;
  }

  // Duplique la sélection : os (avec descendants et slots), slot, ou pièce jointe.
  duplicateSelected() {
    if (this.animating) return false;
    const sk = this.skeleton;
    const kind = this.selectionKind;
    if (kind === 'attachment') {
      const slot = this.selectedSlot;
      const att = this.attachment;
      this.apply(() => {
        let name = `${att.name}2`;
        for (let i = 3; sk.getAttachment(slot, name); i++) name = `${att.name}${i}`;
        const copy = att.copy(name);
        if (copy.path === null) copy.path = att.name;
        sk.addAttachment(slot, copy);
        this.selectedAttachment = name;
      });
      return true;
    }
    if (kind === 'slot') {
      const src = this.selectedSlot;
      this.apply(() => {
        this.selectedSlot = this.copySlot(src, src.bone);
      });
      return true;
    }
    const src = this.selected;
    if (!src || !src.parent) return false;
    this.apply(() => {
      const copy = (bone, parent) => {
        const b = sk.addBone(sk.uniqueBoneName(bone.name), parent);
        for (const k of ['length', 'x', 'y', 'rotation', 'scaleX', 'scaleY', 'shearX', 'shearY', 'inherit', 'color']) {
          b[k] = bone[k];
        }
        for (const slot of sk.slotsOf(bone)) this.copySlot(slot, b);
        for (const c of [...bone.children]) copy(c, b);
        return b;
      };
      this.selected = copy(src, src.parent);
    });
    return true;
  }

  // --- Fichiers -------------------------------------------------------------------

  toText() {
    return projectToText(this.skeleton, { appVersion: this.appVersion });
  }

  loadText(text, filePath) {
    this.reset(parseProject(text), filePath);
  }

  markSaved(filePath) {
    this.filePath = filePath;
    this.savedState = this.projectState();
    this.emit('saved');
  }
}

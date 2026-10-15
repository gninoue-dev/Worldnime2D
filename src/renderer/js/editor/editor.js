// État central de l'éditeur : le squelette, la sélection, l'outil actif et l'historique.
// Les vues (viewport, arbre, propriétés) écoutent l'événement « change » pour se redessiner.

import { Skeleton } from '../model/skeleton.js';
import { serializeProject, parseProject, projectToText } from '../model/format.js';

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
    this.reset(new Skeleton());
  }

  reset(skeleton, filePath = null) {
    this.skeleton = skeleton;
    this.skeleton.updateWorldTransform();
    this.selected = skeleton.root;
    this.selectedSlot = null;
    this.selectedAttachment = null;
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
    });
  }

  restore(state) {
    const { project, selected, slot, attachment } = JSON.parse(state);
    this.skeleton = parseProject(JSON.stringify(project));
    this.selected = (selected && this.skeleton.findBone(selected)) || this.skeleton.root;
    this.selectedSlot = (slot && this.skeleton.findSlot(slot)) || null;
    this.selectedAttachment = this.selectedSlot && attachment && this.skeleton.getAttachment(this.selectedSlot, attachment)
      ? attachment
      : null;
    if (this.selectedSlot) this.selected = this.selectedSlot.bone;
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
    this.skeleton.updateWorldTransform();
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

  // Ce qui est sélectionné : 'bone', 'slot' ou 'attachment'.
  get selectionKind() {
    if (this.selectedSlot && this.selectedAttachment) return 'attachment';
    if (this.selectedSlot) return 'slot';
    return 'bone';
  }

  // La pièce jointe sélectionnée (objet), ou null.
  get attachment() {
    if (!this.selectedSlot || !this.selectedAttachment) return null;
    return this.skeleton.getAttachment(this.selectedSlot, this.selectedAttachment);
  }

  select(bone) {
    if (this.selected === bone && !this.selectedSlot) return;
    this.selected = bone;
    this.selectedSlot = null;
    this.selectedAttachment = null;
    this.emit('select');
  }

  selectSlot(slot) {
    this.selected = slot.bone;
    this.selectedSlot = slot;
    this.selectedAttachment = null;
    this.emit('select');
  }

  selectAttachment(slot, name) {
    this.selected = slot.bone;
    this.selectedSlot = slot;
    this.selectedAttachment = name;
    this.emit('select');
  }

  setTool(tool) {
    if (!TOOLS[tool] || this.tool === tool) return;
    this.tool = tool;
    this.emit('tool');
  }

  // --- Opérations sur les os ---------------------------------------------------

  // Supprime ce qui est sélectionné (os avec ses descendants et ses slots, slot, ou pièce jointe).
  deleteSelected() {
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

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
    });
  }

  restore(state) {
    const { project, selected } = JSON.parse(state);
    this.skeleton = parseProject(JSON.stringify(project));
    this.selected = (selected && this.skeleton.findBone(selected)) || this.skeleton.root;
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

  select(bone) {
    if (this.selected === bone) return;
    this.selected = bone;
    this.emit('select');
  }

  setTool(tool) {
    if (!TOOLS[tool] || this.tool === tool) return;
    this.tool = tool;
    this.emit('tool');
  }

  // --- Opérations sur les os ---------------------------------------------------

  deleteSelected() {
    const bone = this.selected;
    if (!bone || !bone.parent) return false;
    const parent = bone.parent;
    this.apply(() => {
      this.skeleton.removeBone(bone);
      this.selected = parent;
    });
    return true;
  }

  // Duplique l'os sélectionné et ses descendants, sous le même parent.
  duplicateSelected() {
    const src = this.selected;
    if (!src || !src.parent) return false;
    this.apply(() => {
      const copy = (bone, parent) => {
        const b = this.skeleton.addBone(this.skeleton.uniqueBoneName(bone.name), parent);
        for (const k of ['length', 'x', 'y', 'rotation', 'scaleX', 'scaleY', 'shearX', 'shearY', 'inherit', 'color']) {
          b[k] = bone[k];
        }
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

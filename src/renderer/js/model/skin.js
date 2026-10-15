// Une skin : pour chaque slot, les pièces jointes disponibles (par nom).
// La v0.2 n'utilise que la skin « default » ; les skins multiples arrivent en v0.7.

export class Skin {
  constructor(name) {
    this.name = name;
    // Map nomDuSlot → Map nomDeLaPièceJointe → pièce jointe. L'ordre d'insertion est conservé.
    this.attachments = new Map();
    // Os et contraintes réservés à cette skin (actifs seulement quand elle est active).
    this.bones = new Set();
    this.constraints = new Set();
  }

  get(slotName, name) {
    return this.attachments.get(slotName)?.get(name) ?? null;
  }

  set(slotName, name, attachment) {
    if (!this.attachments.has(slotName)) this.attachments.set(slotName, new Map());
    this.attachments.get(slotName).set(name, attachment);
  }

  remove(slotName, name) {
    const m = this.attachments.get(slotName);
    if (!m) return;
    m.delete(name);
    if (m.size === 0) this.attachments.delete(slotName);
  }

  attachmentsOf(slotName) {
    return this.attachments.get(slotName) ?? new Map();
  }

  removeSlot(slotName) {
    this.attachments.delete(slotName);
  }

  renameSlot(oldName, newName) {
    const m = this.attachments.get(oldName);
    if (!m) return;
    this.attachments.delete(oldName);
    this.attachments.set(newName, m);
  }
}

// Le squelette : une liste d'os, toujours triée pour que chaque parent passe avant ses enfants.

import { Bone, INHERIT, DEFAULT_BONE_COLOR } from './bone.js';
import { Slot } from './slot.js';
import { Skin } from './skin.js';
import { Animation, EventData } from './animation.js';
import { MeshAttachment } from './mesh.js';

export const ROOT_NAME = 'root';

export class Skeleton {
  constructor() {
    this.name = 'squelette';
    // Dossier des images, tel qu'écrit dans le projet (relatif au fichier .wn2d, ou absolu).
    this.images = '';
    // Image de référence affichée derrière le squelette (aide au montage, non exportée).
    this.reference = null;
    this.bones = [];
    // Ordre d'affichage de la pose de base : le premier slot est dessiné au fond.
    this.slots = [];
    // Ordre d'affichage courant (modifié par les animations).
    this.drawOrder = [];
    // false : la pose courante est toujours la pose de base (mode Configuration).
    // true : la pose courante est calculée par une animation (mode Animation).
    this.posed = false;
    // Animations, définitions d'événements, et cadence de la timeline (images par seconde).
    this.animations = [];
    this.events = new Map();
    this.fps = 30;
    this.skins = [new Skin('default')];
    this.addBone(ROOT_NAME, null);
  }

  get defaultSkin() {
    return this.skins[0];
  }

  get root() {
    return this.bones[0];
  }

  findBone(name) {
    return this.bones.find((b) => b.name === name) ?? null;
  }

  // Donne un nom libre à partir d'une base : « bone », « bone2 », « bone3 »…
  uniqueBoneName(base = 'bone') {
    if (!this.findBone(base)) return base;
    let i = 2;
    while (this.findBone(`${base}${i}`)) i++;
    return `${base}${i}`;
  }

  addBone(name, parent) {
    if (this.findBone(name)) throw new Error(`Un os s'appelle déjà « ${name} ».`);
    if (!parent && this.bones.length > 0) throw new Error('Il ne peut y avoir qu\'un seul os racine.');
    const bone = new Bone(name, parent);
    if (parent) parent.children.push(bone);
    this.bones.push(bone);
    this.sortBones();
    return bone;
  }

  // Supprime l'os et tous ses descendants. La racine ne peut pas être supprimée.
  removeBone(bone) {
    if (!bone.parent) throw new Error('La racine ne peut pas être supprimée.');
    const doomed = new Set([bone, ...this.descendants(bone)]);
    this.dropInfluences(new Set([...doomed].map((b) => b.name)));
    bone.parent.children = bone.parent.children.filter((c) => c !== bone);
    this.bones = this.bones.filter((b) => !doomed.has(b));
    for (const slot of this.slots.filter((sl) => doomed.has(sl.bone))) this.removeSlot(slot);
    for (const anim of this.animations) for (const b of doomed) anim.removeBone(b.name);
    return [...doomed];
  }

  descendants(bone) {
    const out = [];
    const walk = (b) => {
      for (const c of b.children) {
        out.push(c);
        walk(c);
      }
    };
    walk(bone);
    return out;
  }

  renameBone(bone, newName) {
    const name = newName.trim();
    if (!name) throw new Error('Le nom ne peut pas être vide.');
    if (name === bone.name) return;
    if (this.findBone(name)) throw new Error(`Un os s'appelle déjà « ${name} ».`);
    for (const anim of this.animations) anim.renameBone(bone.name, name);
    for (const m of this.meshes()) for (const list of m.att.weights ?? []) for (const e of list) if (e.bone === bone.name) e.bone = name;
    bone.name = name;
  }

  // Change le parent d'un os en gardant sa position et sa rotation à l'écran.
  reparent(bone, newParent) {
    if (!bone.parent) throw new Error('La racine ne peut pas changer de parent.');
    if (bone === newParent || bone.isAncestorOf(newParent)) {
      throw new Error('Un os ne peut pas devenir l\'enfant de lui-même ou de ses descendants.');
    }
    if (bone.parent === newParent) return;
    this.updateWorldTransform();
    const worldRot = bone.worldRotationX;
    const local = newParent.worldToLocal(bone.worldX, bone.worldY);
    bone.parent.children = bone.parent.children.filter((c) => c !== bone);
    bone.parent = newParent;
    newParent.children.push(bone);
    bone.x = local.x;
    bone.y = local.y;
    this.sortBones();
    this.updateWorldTransform();
    bone.rotation = bone.worldToLocalRotation(worldRot);
    this.updateWorldTransform();
  }

  // Déplace un os parmi ses frères (ordre affiché dans l'arbre).
  moveAmongSiblings(bone, delta) {
    if (!bone.parent) return false;
    const list = bone.parent.children;
    const i = list.indexOf(bone);
    const j = i + delta;
    if (j < 0 || j >= list.length) return false;
    [list[i], list[j]] = [list[j], list[i]];
    this.sortBones();
    return true;
  }

  // Ordre en profondeur depuis la racine : parent avant enfants.
  sortBones() {
    const root = this.bones.find((b) => !b.parent);
    const out = [];
    const walk = (b) => {
      out.push(b);
      for (const c of b.children) walk(c);
    };
    if (root) walk(root);
    this.bones = out;
  }

  setToSetupPose() {
    for (const bone of this.bones) bone.setToSetupPose();
    for (const slot of this.slots) slot.setToSetupPose();
    this.drawOrder = [...this.slots];
  }

  updateWorldTransform() {
    if (!this.posed) this.setToSetupPose();
    for (const bone of this.bones) bone.updateWorldTransform();
  }

  // Pièce jointe affichée dans la pose courante.
  currentAttachment(slot) {
    return slot.pose.attachment ? this.getAttachment(slot, slot.pose.attachment) : null;
  }

  // --- Slots -------------------------------------------------------------------

  findSlot(name) {
    return this.slots.find((s) => s.name === name) ?? null;
  }

  uniqueSlotName(base = 'slot') {
    if (!this.findSlot(base)) return base;
    let i = 2;
    while (this.findSlot(`${base}${i}`)) i++;
    return `${base}${i}`;
  }

  slotsOf(bone) {
    return this.slots.filter((s) => s.bone === bone);
  }

  // Ajoute un slot devant tous les autres (ou à la position index de l'ordre d'affichage).
  addSlot(name, bone, index = this.slots.length) {
    const n = name.trim();
    if (!n) throw new Error('Le nom ne peut pas être vide.');
    if (this.findSlot(n)) throw new Error(`Un slot s'appelle déjà « ${n} ».`);
    const slot = new Slot(n, bone);
    this.slots.splice(index, 0, slot);
    return slot;
  }

  removeSlot(slot) {
    this.slots = this.slots.filter((s) => s !== slot);
    for (const skin of this.skins) skin.removeSlot(slot.name);
    for (const anim of this.animations) anim.removeSlot(slot.name);
  }

  renameSlot(slot, newName) {
    const name = newName.trim();
    if (!name) throw new Error('Le nom ne peut pas être vide.');
    if (name === slot.name) return;
    if (this.findSlot(name)) throw new Error(`Un slot s'appelle déjà « ${name} ».`);
    for (const skin of this.skins) skin.renameSlot(slot.name, name);
    for (const anim of this.animations) anim.renameSlot(slot.name, name);
    slot.name = name;
  }

  // Change l'os d'un slot en gardant ses images à la même place à l'écran.
  setSlotBone(slot, bone) {
    if (slot.bone === bone) return;
    this.updateWorldTransform();
    const from = slot.bone;
    for (const skin of this.skins) {
      for (const att of skin.attachmentsOf(slot.name).values()) {
        if (att.type !== 'region') continue;
        const w = from.localToWorld(att.x, att.y);
        const l = bone.worldToLocal(w.x, w.y);
        att.x = l.x;
        att.y = l.y;
        const worldRot = from.worldRotationX + att.rotation;
        att.rotation = worldRot - bone.worldRotationX;
        att.scaleX *= from.worldScaleX / (bone.worldScaleX || 1);
        att.scaleY *= from.worldScaleY / (bone.worldScaleY || 1);
      }
    }
    slot.bone = bone;
  }

  // Déplace un slot dans l'ordre d'affichage.
  moveSlot(slot, newIndex) {
    const i = this.slots.indexOf(slot);
    const j = Math.max(0, Math.min(this.slots.length - 1, newIndex));
    if (i < 0 || i === j) return false;
    this.slots.splice(i, 1);
    this.slots.splice(j, 0, slot);
    return true;
  }

  // --- Pièces jointes (skin par défaut) ---------------------------------------------

  getAttachment(slot, name) {
    return this.defaultSkin.get(slot.name, name);
  }

  // Pièce jointe visible dans la pose de base.
  visibleAttachment(slot) {
    return slot.attachment ? this.getAttachment(slot, slot.attachment) : null;
  }

  addAttachment(slot, attachment) {
    if (this.getAttachment(slot, attachment.name)) {
      throw new Error(`Le slot « ${slot.name} » a déjà une pièce jointe « ${attachment.name} ».`);
    }
    this.defaultSkin.set(slot.name, attachment.name, attachment);
    return attachment;
  }

  removeAttachment(slot, name) {
    const att = this.getAttachment(slot, name);
    // Les maillages liés à celui-ci deviennent indépendants (copie de sa géométrie).
    if (att instanceof MeshAttachment && !att.parent) {
      for (const other of this.defaultSkin.attachmentsOf(slot.name).values()) {
        if (other.parent !== name) continue;
        const copy = att.copy(other.name);
        Object.assign(other, { vertices: copy.vertices, weights: copy.weights, uvs: copy.uvs, triangles: copy.triangles, hull: copy.hull, edges: copy.edges, parent: null });
      }
    }
    this.defaultSkin.remove(slot.name, name);
    if (slot.attachment === name) slot.attachment = null;
    for (const anim of this.animations) anim.removeDeform(slot.name, name);
  }

  renameAttachment(slot, oldName, newName) {
    const name = newName.trim();
    if (!name) throw new Error('Le nom ne peut pas être vide.');
    if (name === oldName) return;
    if (this.getAttachment(slot, name)) throw new Error(`Le slot a déjà une pièce jointe « ${name} ».`);
    const att = this.getAttachment(slot, oldName);
    // Le chemin de l'image ne change pas quand on renomme.
    if (att.path === null) att.path = oldName;
    if (att.path === name) att.path = null;
    this.defaultSkin.remove(slot.name, oldName);
    att.name = name;
    this.defaultSkin.set(slot.name, name, att);
    if (slot.attachment === oldName) slot.attachment = name;
    for (const anim of this.animations) anim.renameAttachment(slot.name, oldName, name);
    // Les maillages liés à celui-ci suivent.
    for (const other of this.defaultSkin.attachmentsOf(slot.name).values()) if (other.parent === oldName) other.parent = name;
  }

  // --- Maillages ------------------------------------------------------------------------

  // Tous les maillages de toutes les skins : { skin, slotName, att }.
  *meshes() {
    for (const skin of this.skins) {
      for (const [slotName, map] of skin.attachments) {
        for (const att of map.values()) if (att instanceof MeshAttachment) yield { skin, slotName, att };
      }
    }
  }

  // Maillage qui porte la géométrie (le parent d'un maillage lié).
  meshSource(slot, att) {
    if (!(att instanceof MeshAttachment) || !att.parent) return att;
    const p = this.getAttachment(slot, att.parent);
    return p instanceof MeshAttachment && !p.parent ? p : att;
  }

  // Nom de la pièce jointe dont la déformation s'applique (le parent d'un maillage lié qui suit ses timelines).
  deformName(slot, att) {
    return att.parent && att.timelines ? att.parent : att.name;
  }

  // Positions monde des sommets d'une pièce jointe (image ou maillage) dans la pose courante.
  attachmentVertices(slot, att) {
    if (!(att instanceof MeshAttachment)) return att.worldVertices(slot.bone);
    const src = this.meshSource(slot, att);
    const deform = slot.pose.deformFor === this.deformName(slot, att) ? slot.pose.deform : null;
    const valid = deform && deform.length === src.deformLength ? deform : null;
    return MeshAttachment.worldVertices(src, slot.bone, this, valid);
  }

  // Avant de supprimer des os : leurs influences disparaissent des maillages (les autres sont renormalisées).
  // Un sommet qui n'a plus d'os est rattaché à l'os du slot, à sa position actuelle.
  dropInfluences(boneNames) {
    this.updateWorldTransform();
    for (const { slotName, att } of this.meshes()) {
      if (!att.weights || !att.weights.some((l) => l.some((e) => boneNames.has(e.bone)))) continue;
      const slot = this.findSlot(slotName);
      const world = MeshAttachment.worldVertices(att, slot.bone, this);
      att.weights = att.weights.map((list, i) => {
        const kept = list.filter((e) => !boneNames.has(e.bone));
        if (kept.length === 0) {
          if (boneNames.has(slot.bone.name)) return list;
          const l = slot.bone.worldToLocal(world[i * 2], world[i * 2 + 1]);
          return [{ bone: slot.bone.name, x: l.x, y: l.y, w: 1 }];
        }
        const total = kept.reduce((s, e) => s + e.w, 0);
        return kept.map((e) => ({ ...e, w: e.w / total }));
      });
      this.clearDeform(slotName, att.name);
    }
  }

  // Supprime les déformations animées d'une pièce jointe (après un changement de sommets ou de poids).
  clearDeform(slotName, attName) {
    for (const anim of this.animations) anim.removeDeform(slotName, attName);
  }

  // --- Animations -------------------------------------------------------------------

  findAnimation(name) {
    return this.animations.find((a) => a.name === name) ?? null;
  }

  uniqueAnimationName(base = 'animation') {
    if (!this.findAnimation(base)) return base;
    let i = 2;
    while (this.findAnimation(`${base}${i}`)) i++;
    return `${base}${i}`;
  }

  addAnimation(name, anim = new Animation(name)) {
    const n = name.trim();
    if (!n) throw new Error('Le nom ne peut pas être vide.');
    if (this.findAnimation(n)) throw new Error(`Une animation s'appelle déjà « ${n} ».`);
    anim.name = n;
    this.animations.push(anim);
    return anim;
  }

  removeAnimation(anim) {
    this.animations = this.animations.filter((a) => a !== anim);
  }

  renameAnimation(anim, newName) {
    const n = newName.trim();
    if (!n) throw new Error('Le nom ne peut pas être vide.');
    if (n === anim.name) return;
    if (this.findAnimation(n)) throw new Error(`Une animation s'appelle déjà « ${n} ».`);
    anim.name = n;
  }

  // --- Événements -----------------------------------------------------------------------

  addEvent(name) {
    const n = name.trim();
    if (!n) throw new Error('Le nom ne peut pas être vide.');
    if (this.events.has(n)) throw new Error(`Un événement s'appelle déjà « ${n} ».`);
    const e = new EventData(n);
    this.events.set(n, e);
    return e;
  }

  uniqueEventName(base = 'evenement') {
    if (!this.events.has(base)) return base;
    let i = 2;
    while (this.events.has(`${base}${i}`)) i++;
    return `${base}${i}`;
  }

  renameEvent(oldName, newName) {
    const n = newName.trim();
    if (!n) throw new Error('Le nom ne peut pas être vide.');
    if (n === oldName) return;
    if (this.events.has(n)) throw new Error(`Un événement s'appelle déjà « ${n} ».`);
    const e = this.events.get(oldName);
    this.events.delete(oldName);
    e.name = n;
    this.events.set(n, e);
    for (const anim of this.animations) anim.renameEvent(oldName, n);
  }

  removeEvent(name) {
    this.events.delete(name);
    for (const anim of this.animations) anim.removeEvent(name);
  }

  depthOf(bone) {
    let d = 0;
    for (let p = bone.parent; p; p = p.parent) d++;
    return d;
  }
}

export { INHERIT, DEFAULT_BONE_COLOR };

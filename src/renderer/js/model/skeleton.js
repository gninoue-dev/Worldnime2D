// Le squelette : une liste d'os, toujours triée pour que chaque parent passe avant ses enfants.

import { Bone, INHERIT, DEFAULT_BONE_COLOR } from './bone.js';
import { Slot } from './slot.js';
import { Skin } from './skin.js';
import { Animation, EventData, deformKey } from './animation.js';
import { MeshAttachment } from './mesh.js';
import { CONSTRAINT_CLASSES } from './constraints.js';

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
    // Contraintes (IK, transformation, chemin, physique), évaluées selon leur « order ».
    this.constraints = [];
    // Horloge de la physique (secondes) et échelle de référence (pixels par mètre).
    this.time = 0;
    this.referenceScale = 100;
    this.skins = [new Skin('default')];
    // Skins actives (en plus de « default ») : une pièce jointe se cherche dans les skins actives
    // (la dernière l'emporte), puis dans « default ».
    this.activeSkins = [];
    // Skin où l'on ajoute les nouvelles pièces jointes (null : « default »).
    this.editSkinName = null;
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
    const names = new Set([...doomed].map((b) => b.name));
    for (const skin of this.skins) for (const n of names) skin.bones.delete(n);
    for (const c of [...this.constraints]) {
      c.bones = c.bones.filter((n) => !names.has(n));
      if (c.bones.length === 0 || (c.kind !== 'path' && c.kind !== 'physics' && names.has(c.target))) this.removeConstraint(c);
    }
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

  renameBoneInSkins(oldName, newName) {
    for (const skin of this.skins) {
      if (skin.bones.delete(oldName)) skin.bones.add(newName);
    }
  }

  renameBone(bone, newName) {
    const name = newName.trim();
    if (!name) throw new Error('Le nom ne peut pas être vide.');
    if (name === bone.name) return;
    if (this.findBone(name)) throw new Error(`Un os s'appelle déjà « ${name} ».`);
    for (const anim of this.animations) anim.renameBone(bone.name, name);
    this.renameBoneInSkins(bone.name, name);
    for (const m of this.meshes()) for (const list of m.att.weights ?? []) for (const e of list) if (e.bone === bone.name) e.bone = name;
    for (const c of this.constraints) {
      c.bones = c.bones.map((n) => (n === bone.name ? name : n));
      if (c.kind !== 'path' && c.target === bone.name) c.target = name;
    }
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
    for (const c of this.constraints) c.setToSetupPose();
    this.drawOrder = [...this.slots];
  }

  // physics : 'pose' (par défaut : la physique est appliquée sans avancer), 'update' (avance jusqu'à
  // this.time), 'reset' (repart de zéro) ou 'none' (sans physique).
  updateWorldTransform(physics = 'pose') {
    if (!this.posed) this.setToSetupPose();
    this.updateActive();
    for (const bone of this.bones) {
      bone.resetApplied();
      bone.updateWorldTransform();
    }
    for (const c of this.sortedConstraints()) {
      if (c.active === false) continue;
      for (const b of c.apply(this, physics)) this.updateDescendants(b);
    }
  }

  // Recalcule la matrice monde des descendants d'un os (et de l'os lui-même si self est vrai).
  updateDescendants(bone, self = false) {
    if (self) bone.updateWorldTransform();
    for (const b of this.bones) if (bone.isAncestorOf(b)) b.updateWorldTransform();
  }

  sortedConstraints() {
    return [...this.constraints].sort((a, b) => a.order - b.order);
  }

  // --- Contraintes ------------------------------------------------------------------------

  findConstraint(name) {
    return this.constraints.find((c) => c.name === name) ?? null;
  }

  uniqueConstraintName(base) {
    if (!this.findConstraint(base)) return base;
    let i = 2;
    while (this.findConstraint(`${base}${i}`)) i++;
    return `${base}${i}`;
  }

  addConstraint(kind, name) {
    const n = name.trim();
    if (!n) throw new Error('Le nom ne peut pas être vide.');
    if (this.findConstraint(n)) throw new Error(`Une contrainte s'appelle déjà « ${n} ».`);
    const c = new CONSTRAINT_CLASSES[kind](n);
    c.order = this.constraints.length ? Math.max(...this.constraints.map((x) => x.order)) + 1 : 0;
    this.constraints.push(c);
    return c;
  }

  removeConstraint(c) {
    this.constraints = this.constraints.filter((x) => x !== c);
    for (const skin of this.skins) skin.constraints.delete(c.name);
    for (const anim of this.animations) anim.removeConstraint(c.kind, c.name);
  }

  renameConstraint(c, newName) {
    const n = newName.trim();
    if (!n) throw new Error('Le nom ne peut pas être vide.');
    if (n === c.name) return;
    if (this.findConstraint(n)) throw new Error(`Une contrainte s'appelle déjà « ${n} ».`);
    for (const anim of this.animations) anim.renameConstraint(c.kind, c.name, n);
    for (const skin of this.skins) if (skin.constraints.delete(c.name)) skin.constraints.add(n);
    c.name = n;
  }

  // Remet la physique à zéro (une contrainte, ou toutes avec name = null).
  resetPhysics(name = null) {
    for (const c of this.constraints) if (c.kind === 'physics' && (!name || c.name === name)) c.resetState();
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
    for (const c of [...this.constraints]) if (c.kind === 'path' && c.target === slot.name) this.removeConstraint(c);
    for (const skin of this.skins) {
      for (const map of skin.attachments.values()) for (const a of map.values()) if (a.type === 'clipping' && a.end === slot.name) a.end = null;
    }
  }

  renameSlot(slot, newName) {
    const name = newName.trim();
    if (!name) throw new Error('Le nom ne peut pas être vide.');
    if (name === slot.name) return;
    if (this.findSlot(name)) throw new Error(`Un slot s'appelle déjà « ${name} ».`);
    for (const skin of this.skins) skin.renameSlot(slot.name, name);
    for (const anim of this.animations) anim.renameSlot(slot.name, name);
    for (const c of this.constraints) if (c.kind === 'path' && c.target === slot.name) c.target = name;
    for (const skin of this.skins) {
      for (const map of skin.attachments.values()) for (const a of map.values()) if (a.type === 'clipping' && a.end === slot.name) a.end = name;
    }
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

  // --- Skins ------------------------------------------------------------------------------

  findSkin(name) {
    return this.skins.find((s) => s.name === name) ?? null;
  }

  uniqueSkinName(base = 'skin') {
    if (!this.findSkin(base)) return base;
    let i = 2;
    while (this.findSkin(`${base}${i}`)) i++;
    return `${base}${i}`;
  }

  // Skin où l'on ajoute les nouvelles pièces jointes.
  get editSkin() {
    return this.findSkin(this.editSkinName) ?? this.defaultSkin;
  }

  // Ordre de recherche : skins actives (la dernière d'abord), puis « default ».
  lookupSkins() {
    const list = this.activeSkins.map((n) => this.findSkin(n)).filter(Boolean).reverse();
    list.push(this.defaultSkin);
    return list;
  }

  addSkin(name) {
    const n = name.trim();
    if (!n) throw new Error('Le nom ne peut pas être vide.');
    if (this.findSkin(n)) throw new Error(`Une skin s'appelle déjà « ${n} ».`);
    const skin = new Skin(n);
    this.skins.push(skin);
    return skin;
  }

  removeSkin(skin) {
    if (skin === this.defaultSkin) throw new Error('La skin « default » ne peut pas être supprimée.');
    this.skins = this.skins.filter((s) => s !== skin);
    this.activeSkins = this.activeSkins.filter((n) => n !== skin.name);
    if (this.editSkinName === skin.name) this.editSkinName = null;
    for (const anim of this.animations) anim.remapDeform(([sk, slot, att]) => (sk === skin.name ? null : [sk, slot, att]));
  }

  renameSkin(skin, newName) {
    const n = newName.trim();
    if (!n) throw new Error('Le nom ne peut pas être vide.');
    if (skin === this.defaultSkin) throw new Error('La skin « default » ne peut pas être renommée.');
    if (n === skin.name) return;
    if (this.findSkin(n)) throw new Error(`Une skin s'appelle déjà « ${n} ».`);
    const old = skin.name;
    for (const anim of this.animations) anim.remapDeform(([sk, slot, att]) => [sk === old ? n : sk, slot, att]);
    this.activeSkins = this.activeSkins.map((x) => (x === old ? n : x));
    if (this.editSkinName === old) this.editSkinName = n;
    skin.name = n;
  }

  // Skin qui contient cet objet pièce jointe.
  skinOf(slot, att) {
    for (const skin of this.skins) for (const a of skin.attachmentsOf(slot.name).values()) if (a === att) return skin;
    return null;
  }

  // Pièces jointes visibles pour un slot (skins actives + default) : Map nom → { att, skin }.
  attachmentsOf(slot) {
    const out = new Map();
    for (const skin of [...this.lookupSkins()].reverse()) {
      for (const [name, att] of skin.attachmentsOf(slot.name)) out.set(name, { att, skin });
    }
    return out;
  }

  // Os et contraintes réservés à une skin : actifs seulement si l'une de leurs skins est active.
  updateActive() {
    const active = new Set(['default', ...this.activeSkins]);
    const requiredBones = new Map();
    const requiredConstraints = new Map();
    for (const skin of this.skins) {
      for (const b of skin.bones) requiredBones.set(b, (requiredBones.get(b) ?? false) || active.has(skin.name));
      for (const c of skin.constraints) requiredConstraints.set(c, (requiredConstraints.get(c) ?? false) || active.has(skin.name));
    }
    for (const bone of this.bones) {
      bone.active = (!requiredBones.has(bone.name) || requiredBones.get(bone.name)) && (!bone.parent || bone.parent.active);
    }
    for (const c of this.constraints) {
      c.active = (!requiredConstraints.has(c.name) || requiredConstraints.get(c.name))
        && c.bones.every((n) => this.findBone(n)?.active !== false);
    }
  }

  // --- Pièces jointes (selon les skins actives) -------------------------------------------

  getAttachment(slot, name) {
    for (const skin of this.lookupSkins()) {
      const a = skin.get(slot.name, name);
      if (a) return a;
    }
    return null;
  }

  // Remplace une pièce jointe par une autre (même nom), dans la skin qui la contient.
  replaceAttachment(slot, name, att) {
    const old = this.getAttachment(slot, name);
    const skin = (old && this.skinOf(slot, old)) ?? this.editSkin;
    skin.set(slot.name, name, att);
  }

  // Pièce jointe visible dans la pose de base.
  visibleAttachment(slot) {
    return slot.attachment ? this.getAttachment(slot, slot.attachment) : null;
  }

  // Ajoute dans la skin d'édition (ou celle donnée). Le même nom peut exister dans plusieurs skins :
  // c'est un emplacement de skin (chaque skin fournit sa version).
  addAttachment(slot, attachment, skin = this.editSkin) {
    if (skin.get(slot.name, attachment.name)) {
      throw new Error(`Le slot « ${slot.name} » a déjà une pièce jointe « ${attachment.name} » dans la skin « ${skin.name} ».`);
    }
    skin.set(slot.name, attachment.name, attachment);
    return attachment;
  }

  removeAttachment(slot, name) {
    const att = this.getAttachment(slot, name);
    if (!att) return;
    const skin = this.skinOf(slot, att);
    // Les maillages liés à celui-ci deviennent indépendants (copie de sa géométrie).
    if (att instanceof MeshAttachment && !att.parent) {
      for (const other of skin.attachmentsOf(slot.name).values()) {
        if (other.parent !== name) continue;
        const copy = att.copy(other.name);
        Object.assign(other, { vertices: copy.vertices, weights: copy.weights, uvs: copy.uvs, triangles: copy.triangles, hull: copy.hull, edges: copy.edges, parent: null });
      }
    }
    skin.remove(slot.name, name);
    if (slot.attachment === name && !this.getAttachment(slot, name)) slot.attachment = null;
    for (const anim of this.animations) {
      anim.remapDeform(([s, sl, a]) => (s === skin.name && sl === slot.name && a === name ? null : [s, sl, a]));
    }
  }

  // Renomme l'emplacement dans toutes les skins (les versions de chaque skin gardent leur image).
  renameAttachment(slot, oldName, newName) {
    const name = newName.trim();
    if (!name) throw new Error('Le nom ne peut pas être vide.');
    if (name === oldName) return;
    if (this.skins.some((s) => s.get(slot.name, name))) throw new Error(`Le slot a déjà une pièce jointe « ${name} ».`);
    for (const skin of this.skins) {
      const att = skin.get(slot.name, oldName);
      if (!att) continue;
      // Le chemin de l'image ne change pas quand on renomme.
      if ('path' in att && att.type !== 'path') {
        if (att.path === null) att.path = oldName;
        if (att.path === name) att.path = null;
      }
      skin.remove(slot.name, oldName);
      att.name = name;
      skin.set(slot.name, name, att);
      // Les maillages liés à celui-ci suivent.
      for (const other of skin.attachmentsOf(slot.name).values()) if (other.parent === oldName) other.parent = name;
    }
    if (slot.attachment === oldName) slot.attachment = name;
    for (const anim of this.animations) anim.renameAttachment(slot.name, oldName, name);
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
    // Le parent se cherche d'abord dans la skin du maillage lié.
    const p = this.skinOf(slot, att)?.get(slot.name, att.parent) ?? this.getAttachment(slot, att.parent);
    return p instanceof MeshAttachment && !p.parent ? p : att;
  }

  // Clé de la timeline de déformation qui s'applique à cette pièce jointe (skin, slot, nom).
  deformKeyFor(slot, att) {
    const target = att.parent && att.timelines ? this.meshSource(slot, att) : att;
    return deformKey(slot.name, target.name, this.skinOf(slot, target)?.name ?? 'default');
  }

  // Nom de la pièce jointe dont la déformation s'applique (le parent d'un maillage lié qui suit ses timelines).
  deformName(slot, att) {
    return att.parent && att.timelines ? att.parent : att.name;
  }

  // Positions monde des sommets d'une pièce jointe (image ou maillage) dans la pose courante.
  attachmentVertices(slot, att) {
    if (!(att instanceof MeshAttachment)) return att.worldVertices(slot.bone);
    const src = this.meshSource(slot, att);
    const deform = slot.pose.deformFor === this.deformKeyFor(slot, att) ? slot.pose.deform : null;
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

// Le squelette : une liste d'os, toujours triée pour que chaque parent passe avant ses enfants.

import { Bone, INHERIT, DEFAULT_BONE_COLOR } from './bone.js';

export const ROOT_NAME = 'root';

export class Skeleton {
  constructor() {
    this.name = 'squelette';
    this.bones = [];
    this.addBone(ROOT_NAME, null);
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
    bone.parent.children = bone.parent.children.filter((c) => c !== bone);
    this.bones = this.bones.filter((b) => !doomed.has(b));
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

  updateWorldTransform() {
    for (const bone of this.bones) bone.updateWorldTransform();
  }

  depthOf(bone) {
    let d = 0;
    for (let p = bone.parent; p; p = p.parent) d++;
    return d;
  }
}

export { INHERIT, DEFAULT_BONE_COLOR };

// Panneau « Propriétés » : les valeurs de l'élément sélectionné (os, slot ou pièce jointe),
// plus les réglages du squelette (nom, dossier d'images, image de référence).
//
// Chaque champ est décrit par un objet { type, label, get, set, … }. Le formulaire est reconstruit
// quand la sélection change de nature, et seulement rafraîchi sinon.

import { INHERIT_LABELS } from '../model/bone.js';
import { BLEND_LABELS } from '../model/slot.js';
import { splitAlpha, joinAlpha } from '../model/color.js';
import { round, atan2Deg } from '../model/math.js';
import { RegionAttachment } from '../model/attachment.js';
import { MeshAttachment, meshFromRegion, uvToLocalMapping } from '../model/mesh.js';
import { bindAuto, unbind, smoothWeights, pruneWeights, boundBones, DEFAULT_MAX_INFLUENCES } from '../model/weights.js';
import { generateContour, addInteriorGrid, retriangulateMesh, resetToRectangle, setupPositions, setupWorld } from '../editor/meshtools.js';
import { deformKey, CONSTRAINT_TIMELINES } from '../model/animation.js';
import { PathAttachment, straightPath } from '../model/path.js';
import { BoundingBoxAttachment, ClippingAttachment, PointAttachment, squarePolygon, isPolygonAttachment } from '../model/special.js';
import { CONSTRAINT_LABELS, POSITION_MODES, SPACING_MODES, ROTATE_MODES } from '../model/constraints.js';

export class PropertiesPanel {
  constructor(editor, host, notify, actions) {
    this.editor = editor;
    this.host = host;
    this.notify = notify;
    this.actions = actions;
    this.signature = null;
    this.rows = [];
    editor.addEventListener('change', (e) => {
      if (e.detail.reason !== 'physics') this.refresh();
    });
    this.refresh();
  }

  // Modifie le modèle avec une étape d'historique ; affiche l'erreur s'il y en a une.
  change(fn) {
    try {
      this.editor.apply(fn);
    } catch (err) {
      this.notify(err.message);
      this.refreshValues();
    }
  }

  sections() {
    const editor = this.editor;
    const sk = editor.skeleton;
    const kind = editor.selectionKind;
    const out = [];

    const skel = [
      { type: 'text', label: 'Nom', get: () => sk.name, set: (v) => this.change(() => { sk.name = v.trim() || 'squelette'; }) },
      {
        type: 'button', label: 'Images', text: () => (sk.images ? sk.images : 'Choisir le dossier…'),
        title: 'Dossier des images du personnage', onClick: () => this.actions.chooseImagesDir(),
      },
    ];
    if (sk.reference) {
      const ref = sk.reference;
      skel.push(
        { type: 'checkbox', label: 'Référence', get: () => ref.visible, set: (v) => this.change(() => { ref.visible = v; }) },
        { type: 'range', label: 'Opacité réf.', min: 0, max: 1, step: 0.05, get: () => ref.alpha, set: (v) => this.change(() => { ref.alpha = v; }) },
        { type: 'number', label: 'Échelle réf.', step: 0.05, get: () => ref.scale, set: (v) => this.change(() => { ref.scale = v; }) },
        { type: 'number', label: 'X réf.', step: 1, get: () => ref.x, set: (v) => this.change(() => { ref.x = v; }) },
        { type: 'number', label: 'Y réf.', step: 1, get: () => ref.y, set: (v) => this.change(() => { ref.y = v; }) },
        { type: 'button', label: '', text: () => 'Retirer l\'image de référence', onClick: () => this.change(() => { sk.reference = null; }) },
      );
    }
    out.push({ title: 'Squelette', rows: skel });

    if (kind === 'constraint' && editor.constraint) {
      const c = editor.constraint;
      out.push({
        title: `Contrainte ${CONSTRAINT_LABELS[c.kind]}${editor.animating ? ' — pose animée' : ''}`,
        rows: editor.animating ? this.animConstraintRows(c) : this.constraintRows(c),
      });
      return out;
    }
    if (editor.animating) {
      if (kind === 'bone') out.push({ title: 'Os — pose animée', rows: this.animBoneRows(editor.selected) });
      if (kind === 'slot') out.push({ title: 'Slot — pose animée', rows: this.animSlotRows(editor.selectedSlot) });
      if (kind === 'attachment') {
        out.push({ title: 'Image', rows: [{ type: 'info', text: () => 'En mode Animation, on anime l\'os et le slot, pas l\'image elle-même. Repassez en mode Configuration pour la placer.' }] });
      }
      const cur = editor.selectedSlot && sk.currentAttachment(editor.selectedSlot);
      if (cur instanceof MeshAttachment) out.push({ title: 'Déformation du maillage', rows: this.deformRows(editor.selectedSlot, cur) });
      return out;
    }
    if (kind === 'bone') out.push({ title: 'Os', rows: this.boneRows(editor.selected) });
    if (kind === 'slot') out.push({ title: 'Slot', rows: this.slotRows(editor.selectedSlot) });
    if (kind === 'attachment' && editor.attachment) {
      const skin = sk.skinOf(editor.selectedSlot, editor.attachment);
      const target = sk.editSkin;
      const rows = [{ type: 'info', text: () => `Skin : « ${skin?.name ?? '?'} »` }];
      if (target !== skin && !target.get(editor.selectedSlot.name, editor.attachment.name)) {
        rows.push({
          type: 'button', label: '', text: () => `Créer la version de la skin « ${target.name} »`,
          title: 'Copie cette pièce jointe sous le même nom dans la skin sélectionnée (onglet Skins) : changez ensuite son image.',
          onClick: () => this.change(() => {
            const slot = editor.selectedSlot;
            const copy = editor.attachment.copy(editor.attachment.name);
            sk.addAttachment(slot, copy, target);
          }),
        });
      }
      out.push({ title: 'Skin', rows });
    }
    if (kind === 'attachment' && (isPolygonAttachment(editor.attachment) || editor.attachment instanceof PointAttachment)) {
      out.push({ title: { boundingbox: 'Boîte de collision', clipping: 'Découpe (clipping)', point: 'Point' }[editor.attachment.type], rows: this.specialRows(editor.selectedSlot, editor.attachment) });
    } else if (kind === 'attachment' && editor.attachment instanceof PathAttachment) {
      out.push({ title: 'Chemin', rows: this.pathRows(editor.selectedSlot, editor.attachment) });
    } else if (kind === 'attachment' && editor.attachment instanceof MeshAttachment) {
      out.push(...this.meshSections(editor.selectedSlot, editor.attachment));
    } else if (kind === 'attachment') {
      out.push({ title: 'Image (pièce jointe région)', rows: this.attachmentRows(editor.selectedSlot, editor.attachment) });
    }
    return out;
  }

  // --- Maillages ---------------------------------------------------------------------------

  imageRow(att) {
    return {
      type: 'select', label: 'Image',
      options: () => {
        const list = this.actions.imagePaths().map((p) => [p, p]);
        if (!list.some(([p]) => p === att.imagePath)) list.unshift([att.imagePath, `${att.imagePath} (manquante)`]);
        return list;
      },
      get: () => att.imagePath,
      set: (v) => this.change(() => { att.path = v === att.name ? null : v; }),
    };
  }

  meshSections(slot, mesh) {
    const ed = this.editor;
    const sk = ed.skeleton;
    const nameRow = {
      type: 'text', label: 'Nom', get: () => mesh.name,
      set: (v) => this.change(() => {
        sk.renameAttachment(slot, mesh.name, v);
        ed.selectedAttachment = v.trim();
      }),
    };
    if (mesh.parent) {
      return [{
        title: 'Maillage lié',
        rows: [
          nameRow,
          this.imageRow(mesh),
          {
            type: 'select', label: 'Parent',
            options: () => [...sk.attachmentsOf(slot).values()].map((e) => e.att)
              .filter((a) => a instanceof MeshAttachment && !a.parent).map((a) => [a.name, a.name]),
            get: () => mesh.parent,
            set: (v) => this.change(() => { mesh.parent = v; }),
          },
          { type: 'checkbox', label: 'Suit les déform.', get: () => mesh.timelines, set: (v) => this.change(() => { mesh.timelines = v; }) },
          ...colorRows(mesh, 'color', (fn) => this.change(fn)),
          {
            type: 'button', label: '', text: () => 'Rendre indépendant (copier la géométrie)',
            onClick: () => this.change(() => {
              const p = sk.getAttachment(slot, mesh.parent);
              const c = p.copy(mesh.name);
              Object.assign(mesh, { vertices: c.vertices, weights: c.weights, uvs: c.uvs, triangles: c.triangles, hull: c.hull, edges: c.edges, parent: null });
            }),
          },
          { type: 'info', text: () => `Partage les sommets et les poids de « ${mesh.parent} », avec sa propre image.` },
        ],
      }];
    }

    const run = (fn) => () => this.change(() => fn());
    const meshRows = [
      nameRow,
      this.imageRow(mesh),
      {
        type: 'info',
        text: () => `${mesh.vertexCount} sommets (${mesh.hull} sur le contour), ${mesh.triangles.length / 3} triangles`
          + (mesh.weights ? `, ${boundBones(mesh).length} os liés` : ', sans poids'),
      },
      {
        type: 'button', label: '', text: () => '✎ Modifier le maillage', active: () => ed.meshTool === 'edit',
        title: 'Glisser les sommets ; clic dans le maillage = sommet intérieur ; clic sur le contour = sommet de contour ; Alt + clic = supprimer ; Ctrl + clic sur deux sommets = arête ; Suppr = supprimer la sélection',
        onClick: () => ed.setMeshTool('edit'),
      },
      { type: 'number', label: 'Rayon doux', step: 5, unit: 'px', get: () => ed.softRadius, set: (v) => { ed.softRadius = Math.max(0, v); } },
      {
        type: 'button', label: '', text: () => 'Contour automatique (d\'après l\'image)',
        onClick: () => {
          const info = this.actions.imageAlpha(mesh.imagePath);
          if (!info) {
            this.notify('Image introuvable dans le dossier d\'images.');
            return;
          }
          this.change(() => generateContour(sk, slot, mesh, info, { maxPoints: 24 }));
        },
      },
      { type: 'button', label: '', text: () => 'Ajouter des points intérieurs (grille)', onClick: run(() => addInteriorGrid(sk, slot, mesh, 0.2)) },
      { type: 'button', label: '', text: () => 'Recalculer les triangles', onClick: run(() => retriangulateMesh(sk, slot, mesh)) },
      { type: 'button', label: '', text: () => 'Revenir au rectangle', onClick: run(() => resetToRectangle(sk, slot, mesh)) },
      {
        type: 'button', label: '', text: () => 'Créer un maillage lié (même forme, autre image)',
        onClick: run(() => {
          let name = `${mesh.name}_lie`;
          for (let i = 2; sk.getAttachment(slot, name); i++) name = `${mesh.name}_lie${i}`;
          const l = new MeshAttachment(name);
          l.parent = mesh.name;
          l.path = mesh.imagePath;
          l.width = mesh.width;
          l.height = mesh.height;
          sk.addAttachment(slot, l);
          ed.selectedAttachment = name;
        }),
      },
      {
        type: 'button', label: '', text: () => 'Revenir à une image simple (région)',
        onClick: run(() => {
          if (mesh.weights) throw new Error('Déliez les os d\'abord.');
          const toLocal = uvToLocalMapping(mesh, setupPositions(sk, slot, mesh));
          const [bl, br, , tl] = [[0, 1], [1, 1], [1, 0], [0, 0]].map(([u, v]) => toLocal(u, v));
          const r = new RegionAttachment(mesh.name);
          Object.assign(r, { path: mesh.path, color: mesh.color, width: mesh.width, height: mesh.height });
          r.rotation = atan2Deg(br[1] - bl[1], br[0] - bl[0]);
          r.scaleX = Math.hypot(br[0] - bl[0], br[1] - bl[1]) / mesh.width;
          r.scaleY = Math.hypot(tl[0] - bl[0], tl[1] - bl[1]) / mesh.height;
          const c = toLocal(0.5, 0.5);
          r.x = c[0];
          r.y = c[1];
          sk.clearDeform(slot.name, mesh.name);
          sk.replaceAttachment(slot, mesh.name, r);
        }),
      },
      ...colorRows(mesh, 'color', (fn) => this.change(fn)),
    ];

    // Poids.
    if (!this.bindChoice || this.bindChoice.mesh !== mesh) {
      this.bindChoice = { mesh, bones: new Set(mesh.weights ? boundBones(mesh) : [slot.bone.name]) };
    }
    const choice = this.bindChoice.bones;
    const weightRows = [
      {
        type: 'checklist', label: 'Os à lier',
        options: () => sk.bones.map((b) => [b.name, `${'\u00a0\u00a0'.repeat(sk.depthOf(b))}${b.name}`]),
        get: () => [...choice],
        set: (name, on) => {
          if (on) choice.add(name);
          else choice.delete(name);
        },
      },
      {
        type: 'button', label: '', text: () => (mesh.weights ? 'Relier aux os cochés (poids automatiques)' : 'Lier aux os cochés (poids automatiques)'),
        onClick: run(() => {
          const world = setupWorld(sk, slot, mesh);
          bindAuto(mesh, sk, [...choice], world);
          sk.clearDeform(slot.name, mesh.name);
          if (!ed.brush.bone || !choice.has(ed.brush.bone)) ed.brush.bone = [...choice][0];
        }),
      },
    ];
    if (mesh.weights) {
      weightRows.push(
        { type: 'button', label: '', text: () => 'Délier (sommets fixés à l\'os du slot)', onClick: run(() => {
          unbind(mesh, slot.bone, setupWorld(sk, slot, mesh));
          sk.clearDeform(slot.name, mesh.name);
          if (ed.meshTool === 'weights') ed.meshTool = null;
        }) },
        {
          type: 'select', label: 'Os à peindre', options: () => boundBones(mesh).concat([...choice].filter((b) => !boundBones(mesh).includes(b))).map((b) => [b, b]),
          get: () => ed.brush.bone ?? '', set: (v) => { ed.brush.bone = v; ed.emit('brush'); },
        },
        {
          type: 'button', label: '', text: () => '🖌 Peindre les poids (Alt : retirer)', active: () => ed.meshTool === 'weights',
          onClick: () => {
            if (!ed.brush.bone) ed.brush.bone = boundBones(mesh)[0];
            ed.setMeshTool('weights');
          },
        },
        { type: 'number', label: 'Rayon pinceau', step: 5, unit: 'px', get: () => ed.brush.radius, set: (v) => { ed.brush.radius = Math.max(2, v); } },
        { type: 'range', label: 'Force', min: 0.02, max: 1, step: 0.01, get: () => ed.brush.strength, set: (v) => { ed.brush.strength = v; } },
        { type: 'button', label: '', text: () => 'Lisser les poids', onClick: run(() => {
          smoothWeights(mesh, sk, setupWorld(sk, slot, mesh), 0.5);
          sk.clearDeform(slot.name, mesh.name);
        }) },
        { type: 'button', label: '', text: () => 'Élaguer (retirer les poids < 5 %)', onClick: run(() => {
          pruneWeights(mesh, sk, setupWorld(sk, slot, mesh), 0.05);
          sk.clearDeform(slot.name, mesh.name);
        }) },
        {
          type: 'select', label: 'Os max / sommet', options: () => [1, 2, 3, 4, 5, 6, 8].map((n) => [String(n), String(n)]),
          get: () => String(this.maxInfluences ?? DEFAULT_MAX_INFLUENCES),
          set: (v) => {
            this.maxInfluences = Number(v);
            this.change(() => {
              pruneWeights(mesh, sk, setupWorld(sk, slot, mesh), 0, this.maxInfluences);
              sk.clearDeform(slot.name, mesh.name);
            });
          },
        },
      );
    }
    return [{ title: 'Maillage', rows: meshRows }, { title: 'Poids (skinning)', rows: weightRows }];
  }

  // Mode Animation : déformation libre du maillage affiché par le slot.
  deformRows(slot, mesh) {
    const ed = this.editor;
    const sk = ed.skeleton;
    const key = sk.deformKeyFor(slot, mesh);
    return [
      {
        type: 'button', label: '', text: () => '✥ Déformer le maillage (FFD)', active: () => ed.meshTool === 'deform',
        title: 'Glisser les sommets : une clé de déformation est posée à l\'image courante',
        onClick: () => {
          if (ed.selectionKind !== 'slot' && ed.selectionKind !== 'attachment') ed.selectSlot(slot);
          ed.setMeshTool('deform');
        },
      },
      { type: 'number', label: 'Rayon doux', step: 5, unit: 'px', get: () => ed.softRadius, set: (v) => { ed.softRadius = Math.max(0, v); } },
      {
        type: 'button', label: '', text: () => 'Remettre la forme d\'origine (clé à cette image)',
        onClick: () => this.change(() => {
          ed.animation?.setKey('deform', key, 'deform', { time: ed.time });
        }),
      },
      {
        type: 'info',
        text: () => (mesh.parent && mesh.timelines ? `Maillage lié : la déformation est celle de « ${mesh.parent} ».` : `Maillage « ${mesh.name} ».`),
      },
    ];
  }

  boneRows(bone) {
    const sk = this.editor.skeleton;
    const num = (key, label, step, unit, min) => ({
      type: 'number', label, step, unit,
      get: () => bone[key],
      set: (v) => this.change(() => { bone[key] = min !== undefined ? Math.max(min, v) : v; }),
    });
    const rows = [
      { type: 'text', label: 'Nom', get: () => bone.name, set: (v) => this.change(() => sk.renameBone(bone, v)) },
      {
        type: 'select', label: 'Parent', disabled: () => !bone.parent,
        options: () => (bone.parent
          ? sk.bones.filter((b) => b !== bone && !bone.isAncestorOf(b)).map((b) => [b.name, `${'  '.repeat(sk.depthOf(b))}${b.name}`])
          : [['', '(aucun : racine)']]),
        get: () => bone.parent?.name ?? '',
        set: (v) => this.change(() => sk.reparent(bone, sk.findBone(v))),
      },
      num('length', 'Longueur', 1, '', 0),
      num('x', 'X', 1),
      num('y', 'Y', 1),
      num('rotation', 'Rotation', 1, '°'),
      num('scaleX', 'Échelle X', 0.05),
      num('scaleY', 'Échelle Y', 0.05),
      num('shearX', 'Cisaillement X', 1, '°'),
      num('shearY', 'Cisaillement Y', 1, '°'),
      {
        type: 'select', label: 'Héritage', disabled: () => !bone.parent,
        options: () => Object.entries(INHERIT_LABELS),
        get: () => bone.inherit,
        set: (v) => this.change(() => { bone.inherit = v; }),
      },
      { type: 'color', label: 'Couleur', get: () => bone.color, set: (v) => this.change(() => { bone.color = v; }) },
      {
        type: 'info',
        text: () => `Monde : x ${round(bone.worldX)}, y ${round(bone.worldY)}, rotation ${round(bone.worldRotationX)}°, `
          + `échelle ${round(bone.worldScaleX, 3)} × ${round(bone.worldScaleY, 3)}`,
      },
    ];
    if (sk.slotsOf(bone).length === 0) {
      rows.push({ type: 'button', label: '', text: () => 'Ajouter un slot vide à cet os', onClick: () => this.actions.addSlot(bone) });
    }
    rows.push(
      { type: 'button', label: '', text: () => '＋ Contrainte IK (crée un os cible au bout)', onClick: () => this.createConstraint('ik', bone) },
      { type: 'button', label: '', text: () => '＋ Contrainte de transformation', onClick: () => this.createConstraint('transform', bone) },
      { type: 'button', label: '', text: () => '＋ Contrainte de chemin (crée un chemin)', onClick: () => this.createConstraint('path', bone) },
      { type: 'button', label: '', text: () => '＋ Contrainte physique', onClick: () => this.createConstraint('physics', bone) },
      { type: 'button', label: '', text: () => '＋ Boîte de collision sur cet os', onClick: () => this.createSpecial(bone, 'boundingbox') },
      { type: 'button', label: '', text: () => '＋ Découpe (clipping) sur cet os', onClick: () => this.createSpecial(bone, 'clipping') },
      { type: 'button', label: '', text: () => '＋ Point sur cet os', onClick: () => this.createSpecial(bone, 'point') },
      { type: 'button', label: '', text: () => '＋ Chemin (pièce jointe) sur cet os', onClick: () => this.change(() => {
        const sk2 = this.editor.skeleton;
        const slot = sk2.addSlot(sk2.uniqueSlotName(`${bone.name}_chemin`), bone);
        sk2.addAttachment(slot, straightPath(slot.name, Math.max(100, bone.length * 2), 3));
        slot.attachment = slot.name;
        this.editor.selectedSlot = slot;
        this.editor.selectedAttachment = slot.name;
      }) },
    );
    return rows;
  }

  // --- Pièces jointes spéciales ------------------------------------------------------------

  createSpecial(bone, type) {
    const ed = this.editor;
    const sk = ed.skeleton;
    const names = { boundingbox: 'collision', clipping: 'decoupe', point: 'point' };
    this.change(() => {
      const slot = sk.addSlot(sk.uniqueSlotName(`${bone.name}_${names[type]}`), bone);
      let att;
      if (type === 'point') att = new PointAttachment(slot.name);
      else {
        att = type === 'clipping' ? new ClippingAttachment(slot.name) : new BoundingBoxAttachment(slot.name);
        att.vertices = squarePolygon(Math.max(60, bone.length));
      }
      sk.addAttachment(slot, att);
      slot.attachment = att.name;
      ed.selectedSlot = slot;
      ed.selectedAttachment = att.name;
    });
  }

  specialRows(slot, att) {
    const ed = this.editor;
    const sk = ed.skeleton;
    const rows = [{
      type: 'text', label: 'Nom', get: () => att.name,
      set: (v) => this.change(() => {
        sk.renameAttachment(slot, att.name, v);
        ed.selectedAttachment = v.trim();
      }),
    }];
    if (att instanceof PointAttachment) {
      const num = (k, label, unit) => ({ type: 'number', label, step: 1, unit, get: () => att[k], set: (v) => this.change(() => { att[k] = v; }) });
      rows.push(num('x', 'X'), num('y', 'Y'), num('rotation', 'Rotation', '°'));
    } else {
      rows.push({ type: 'info', text: () => `${att.vertices.length} sommets. Dans la vue : glisser un sommet, clic sur une arête = nouveau sommet, Alt + clic = supprimer.` });
    }
    if (att instanceof ClippingAttachment) {
      rows.push({
        type: 'select', label: 'Dernier slot découpé',
        options: () => [['', '(jusqu\'à la fin)'], ...sk.slots.filter((s) => s !== slot).map((s) => [s.name, s.name])],
        get: () => att.end ?? '', set: (v) => this.change(() => { att.end = v || null; }),
      });
      rows.push({ type: 'info', text: () => 'Les slots dessinés après celui-ci (jusqu\'au dernier slot découpé) ne s\'affichent qu\'à l\'intérieur du polygone.' });
    }
    rows.push({ type: 'color', label: 'Couleur', get: () => att.color.slice(0, 7), set: (v) => this.change(() => { att.color = `${v}ff`; }) });
    return rows;
  }

  // --- Contraintes ---------------------------------------------------------------------------

  createConstraint(kind, bone) {
    const ed = this.editor;
    const sk = ed.skeleton;
    let created = null;
    this.change(() => {
      sk.updateWorldTransform();
      const c = sk.addConstraint(kind, sk.uniqueConstraintName(`${bone.name}_${kind}`));
      created = c.name;
      if (kind === 'ik') {
        // Os cible au bout de l'os, enfant de la racine ; chaîne de 2 os si l'os a un parent (hors racine).
        const t = sk.addBone(sk.uniqueBoneName(`${bone.name}_cible`), sk.root);
        const l = sk.root.worldToLocal(bone.tipX, bone.tipY);
        t.x = l.x;
        t.y = l.y;
        t.color = '#ffd54f';
        c.target = t.name;
        c.bones = bone.parent && bone.parent.parent ? [bone.parent.name, bone.name] : [bone.name];
      } else if (kind === 'transform') {
        c.target = (bone.parent ?? sk.root).name;
        c.bones = [bone.name];
        // Mélanges à zéro : rien ne bouge tant qu'on ne les augmente pas.
        for (const k of ['mixRotate', 'mixX', 'mixY', 'mixScaleX', 'mixScaleY', 'mixShearY']) c[k] = 0;
      } else if (kind === 'path') {
        // La chaîne : l'os puis son premier enfant, et ainsi de suite.
        const chain = [bone];
        while (chain.at(-1).children.length) chain.push(chain.at(-1).children[0]);
        const total = chain.reduce((s, b) => s + Math.max(b.length * Math.hypot(b.a, b.c), 1), 0) * 1.2 || 200;
        const slot = sk.addSlot(sk.uniqueSlotName(`${bone.name}_chemin`), sk.root, 0);
        const p = new PathAttachment(slot.name);
        const ang = Math.atan2(bone.c, bone.a);
        const step = total / 2;
        for (let i = 0; i < 3; i++) {
          const w = [bone.worldX + Math.cos(ang) * step * i, bone.worldY + Math.sin(ang) * step * i];
          const h = [Math.cos(ang) * step / 3, Math.sin(ang) * step / 3];
          for (const [x, y] of [[w[0] - h[0], w[1] - h[1]], w, [w[0] + h[0], w[1] + h[1]]]) {
            const loc = sk.root.worldToLocal(x, y);
            p.vertices.push([loc.x, loc.y]);
          }
        }
        sk.addAttachment(slot, p);
        slot.attachment = slot.name;
        c.target = slot.name;
        c.bones = chain.map((b) => b.name);
        c.rotateMode = 'chain';
      } else {
        c.bones = [bone.name];
      }
    });
    if (created) ed.selectConstraint(created);
  }

  constraintRows(c) {
    const ed = this.editor;
    const sk = ed.skeleton;
    const set = (f) => (v) => this.change(() => { c[f] = v; });
    const num = (f, label, step, unit) => ({ type: 'number', label, step, unit, get: () => c[f], set: set(f) });
    const mix = (f, label) => ({ type: 'range', label, min: 0, max: 1, step: 0.01, get: () => c[f], set: set(f) });
    const flag = (f, label) => ({ type: 'checkbox', label, get: () => c[f], set: set(f) });
    const choice = (f, label, map) => ({ type: 'select', label, options: () => Object.entries(map), get: () => c[f], set: set(f) });
    const rows = [
      {
        type: 'text', label: 'Nom', get: () => c.name,
        set: (v) => {
          this.change(() => sk.renameConstraint(c, v));
          ed.selectConstraint(c.name);
        },
      },
      { type: 'number', label: 'Ordre', step: 1, get: () => c.order, set: (v) => this.change(() => { c.order = Math.round(v); }) },
      {
        type: 'checklist', label: c.kind === 'ik' ? 'Os (1 ou 2)' : c.kind === 'physics' ? 'Os' : 'Os contraints',
        options: () => sk.bones.filter((b) => b.name !== c.target).map((b) => [b.name, `${'\u00a0\u00a0'.repeat(sk.depthOf(b))}${b.name}`]),
        get: () => c.bones,
        set: (name, on) => this.change(() => {
          let list = on ? [...c.bones, name] : c.bones.filter((n) => n !== name);
          list = sk.bones.filter((b) => list.includes(b.name)).map((b) => b.name);
          if (c.kind === 'physics' && list.length > 1) list = [name];
          if (c.kind === 'ik') {
            if (list.length > 2) throw new Error('Une contrainte IK porte sur 1 ou 2 os.');
            if (list.length === 2 && sk.findBone(list[1]).parent?.name !== list[0]) {
              throw new Error('Avec 2 os, le second doit être l\'enfant direct du premier.');
            }
          }
          if (list.length === 0) throw new Error('Il faut au moins un os.');
          c.bones = list;
        }),
      },
    ];
    if (c.kind === 'ik' || c.kind === 'transform') {
      rows.push({
        type: 'select', label: 'Cible',
        options: () => sk.bones.filter((b) => !c.bones.includes(b.name) && !c.bones.some((n) => sk.findBone(n)?.isAncestorOf(b)))
          .map((b) => [b.name, b.name]),
        get: () => c.target, set: set('target'),
      });
    }
    if (c.kind === 'path') {
      rows.push({
        type: 'select', label: 'Chemin (slot)',
        options: () => sk.slots.filter((s) => [...sk.attachmentsOf(s).values()].some((e) => e.att instanceof PathAttachment))
          .map((s) => [s.name, s.name]),
        get: () => c.target, set: set('target'),
      });
    }
    if (c.kind === 'ik') {
      rows.push(mix('mix', 'Mélange'), num('softness', 'Souplesse', 1), flag('bendPositive', 'Pliage positif'),
        flag('compress', 'Compression'), flag('stretch', 'Étirement'), flag('uniform', 'Uniforme'));
    } else if (c.kind === 'transform') {
      rows.push(mix('mixRotate', 'Rotation'), mix('mixX', 'X'), mix('mixY', 'Y'), mix('mixScaleX', 'Échelle X'),
        mix('mixScaleY', 'Échelle Y'), mix('mixShearY', 'Cisaillement Y'),
        num('offsetRotation', 'Décalage rot.', 1, '°'), num('offsetX', 'Décalage X', 1), num('offsetY', 'Décalage Y', 1),
        num('offsetScaleX', 'Décal. éch. X', 0.05), num('offsetScaleY', 'Décal. éch. Y', 0.05), num('offsetShearY', 'Décal. cis. Y', 1, '°'),
        flag('local', 'Local'), flag('relative', 'Relatif'));
    } else if (c.kind === 'path') {
      rows.push(choice('positionMode', 'Position', POSITION_MODES), choice('spacingMode', 'Espacement', SPACING_MODES),
        choice('rotateMode', 'Rotation', ROTATE_MODES),
        num('position', 'Position', c.positionMode === 'percent' ? 0.01 : 1), num('spacing', 'Espacement', 1),
        num('offsetRotation', 'Décalage rot.', 1, '°'),
        mix('mixRotate', 'Mélange rot.'), mix('mixX', 'Mélange X'), mix('mixY', 'Mélange Y'));
    } else if (c.kind === 'physics') {
      rows.push(mix('x', 'Position X'), mix('y', 'Position Y'), mix('rotate', 'Rotation'), mix('scaleX', 'Échelle X'),
        mix('shearX', 'Cisaillement X'),
        num('inertia', 'Inertie', 0.05), num('strength', 'Raideur', 5), num('damping', 'Amortissement', 0.01),
        num('mass', 'Masse', 0.1), num('wind', 'Vent', 0.5), num('gravity', 'Gravité', 0.5), mix('mix', 'Mélange'),
        num('limit', 'Limite', 100),
        {
          type: 'select', label: 'Pas (IPS)', options: () => [30, 60, 120, 240].map((f) => [String(1 / f), `${f} images/s`]),
          get: () => String(c.step), set: (v) => this.change(() => { c.step = Number(v); }),
        },
        { type: 'checkbox', label: 'En continu', get: () => ed.physicsLive, set: (v) => { ed.physicsLive = v; } },
        { type: 'button', label: '', text: () => 'Remettre la simulation à zéro', onClick: () => ed.resetPhysics() });
    }
    rows.push({
      type: 'button', label: '', text: () => '✕ Supprimer la contrainte',
      onClick: () => {
        this.change(() => sk.removeConstraint(c));
        ed.selectedConstraint = null;
        ed.emit('select');
      },
    });
    return rows;
  }

  // Mode Animation : valeurs animables de la contrainte, avec clés.
  animConstraintRows(c) {
    const ed = this.editor;
    const rows = [{ type: 'info', text: () => `« ${c.name} », image ${ed.frame} — ◆ clé ici, ◇ animée ailleurs.` }];
    for (const [type, spec] of Object.entries(CONSTRAINT_TIMELINES[c.kind])) {
      const key = { owner: c.kind, name: c.name, type };
      const setter = (f) => (v) => this.change(() => {
        c.pose[f] = v;
        ed.keyConstraint(c, [type]);
      });
      for (const f of spec.numbers) {
        const isMix = /^mix/.test(f) || f === 'mix';
        rows.push(isMix
          ? { type: 'range', label: f, min: 0, max: 1, step: 0.01, key, get: () => c.pose[f], set: setter(f) }
          : { type: 'number', label: f, step: f === 'position' ? 0.01 : 1, key, get: () => c.pose[f], set: setter(f) });
      }
      for (const f of spec.flags) rows.push({ type: 'checkbox', label: f, key, get: () => c.pose[f], set: setter(f) });
    }
    if (c.kind === 'physics') {
      rows.push({
        type: 'button', label: '', text: () => 'Clé : remise à zéro de la simulation ici',
        onClick: () => this.change(() => ed.animation.setKey('physicsReset', '', 'physicsReset', { time: ed.time, name: c.name })),
      });
    }
    return rows;
  }

  pathRows(slot, p) {
    const ed = this.editor;
    const sk = ed.skeleton;
    return [
      {
        type: 'text', label: 'Nom', get: () => p.name,
        set: (v) => this.change(() => {
          sk.renameAttachment(slot, p.name, v);
          ed.selectedAttachment = v.trim();
        }),
      },
      { type: 'info', text: () => `${p.pointCount} points. Glissez les points et les poignées dans la vue (Alt : poignées indépendantes).` },
      { type: 'checkbox', label: 'Fermé', get: () => p.closed, set: (v) => this.change(() => { p.closed = v; }) },
      { type: 'checkbox', label: 'Vitesse constante', get: () => p.constantSpeed, set: (v) => this.change(() => { p.constantSpeed = v; }) },
      {
        type: 'button', label: '', text: () => 'Ajouter un point à la fin',
        onClick: () => this.change(() => {
          const n = p.pointCount;
          const last = p.vertices.slice((n - 1) * 3, n * 3);
          const prev = n > 1 ? p.vertices[(n - 2) * 3 + 1] : [last[1][0] - 50, last[1][1]];
          const dx = last[1][0] - prev[0];
          const dy = last[1][1] - prev[1];
          const pt = [last[1][0] + dx, last[1][1] + dy];
          p.vertices.push([pt[0] - dx / 3, pt[1] - dy / 3], pt, [pt[0] + dx / 3, pt[1] + dy / 3]);
        }),
      },
      {
        type: 'button', label: '', text: () => 'Retirer le dernier point',
        onClick: () => this.change(() => {
          if (p.pointCount <= 2) throw new Error('Un chemin garde au moins 2 points.');
          p.vertices.splice(-3, 3);
        }),
      },
      ...colorRows(p, 'color', (fn) => this.change(fn)),
    ];
  }

  // Mode Animation : valeurs de la pose courante ; toute modification pose une clé.
  animBoneRows(bone) {
    const ed = this.editor;
    const p = bone.pose;
    const num = (key, label, step, type, unit) => ({
      type: 'number', label, step, unit,
      key: { owner: 'bone', name: bone.name, type },
      get: () => p[key],
      set: (v) => this.change(() => {
        p[key] = v;
        ed.keyBone(bone, [type]);
      }),
    });
    return [
      { type: 'info', text: () => `« ${bone.name} », image ${ed.frame} — ◆ clé ici, ◇ animée ailleurs. Cliquer le losange pose la clé.` },
      num('x', 'X', 1, 'translate'),
      num('y', 'Y', 1, 'translate'),
      num('rotation', 'Rotation', 1, 'rotate', '°'),
      num('scaleX', 'Échelle X', 0.05, 'scale'),
      num('scaleY', 'Échelle Y', 0.05, 'scale'),
      num('shearX', 'Cisaillement X', 1, 'shear', '°'),
      num('shearY', 'Cisaillement Y', 1, 'shear', '°'),
      {
        type: 'button', label: '', text: () => 'Poser une clé sur toute la transformation',
        onClick: () => this.change(() => ed.keyBone(bone, ['rotate', 'translate', 'scale', 'shear'])),
      },
      {
        type: 'button', label: '', text: () => 'Revenir à la pose de base (clés à cette image)',
        onClick: () => this.change(() => {
          bone.setToSetupPose();
          ed.keyBone(bone, ['rotate', 'translate', 'scale', 'shear'].filter((t) => ed.keyState('bone', bone.name, t)));
        }),
      },
    ];
  }

  animSlotRows(slot) {
    const ed = this.editor;
    const sk = ed.skeleton;
    const p = slot.pose;
    const colorType = () => ed.colorTimelineType(slot);
    const keyColor = () => ed.keySlot(slot, [colorType()]);
    return [
      { type: 'info', text: () => `Slot « ${slot.name} » (os « ${slot.bone.name} »), image ${ed.frame}.` },
      {
        type: 'select', label: 'Visible', key: { owner: 'slot', name: slot.name, type: 'attachment' },
        options: () => [['', '(aucune)'], ...[...sk.attachmentsOf(slot).keys()].map((n) => [n, n])],
        get: () => p.attachment ?? '',
        set: (v) => this.change(() => {
          p.attachment = v || null;
          ed.keySlot(slot, ['attachment']);
        }),
      },
      {
        type: 'color', label: 'Teinte', key: { owner: 'slot', name: slot.name, type: colorType },
        get: () => splitAlpha(p.color).rgb,
        set: (v) => this.change(() => {
          p.color = joinAlpha(v, splitAlpha(p.color).alpha);
          keyColor();
        }),
      },
      {
        type: 'range', label: 'Opacité', min: 0, max: 1, step: 0.01, key: { owner: 'slot', name: slot.name, type: colorType },
        get: () => splitAlpha(p.color).alpha,
        set: (v) => this.change(() => {
          p.color = joinAlpha(splitAlpha(p.color).rgb, v);
          keyColor();
        }),
      },
      {
        type: 'color', label: 'Couleur sombre', key: { owner: 'slot', name: slot.name, type: 'rgba2' },
        get: () => p.dark ?? '#000000',
        set: (v) => this.change(() => {
          p.dark = v;
          ed.keySlot(slot, ['rgba2']);
        }),
      },
    ];
  }

  slotRows(slot) {
    const sk = this.editor.skeleton;
    return [
      { type: 'text', label: 'Nom', get: () => slot.name, set: (v) => this.change(() => sk.renameSlot(slot, v)) },
      {
        type: 'select', label: 'Os',
        options: () => sk.bones.map((b) => [b.name, `${'  '.repeat(sk.depthOf(b))}${b.name}`]),
        get: () => slot.bone.name,
        set: (v) => this.change(() => sk.setSlotBone(slot, sk.findBone(v))),
      },
      {
        type: 'select', label: 'Visible',
        options: () => [['', '(aucune)'], ...[...sk.attachmentsOf(slot).keys()].map((n) => [n, n])],
        get: () => slot.attachment ?? '',
        set: (v) => this.change(() => { slot.attachment = v || null; }),
      },
      ...colorRows(slot, 'color', (fn) => this.change(fn)),
      {
        type: 'checkbox', label: 'Teinte sombre', get: () => Boolean(slot.dark),
        set: (v) => this.change(() => { slot.dark = v ? '#000000' : null; }),
      },
      {
        type: 'color', label: 'Couleur sombre', disabled: () => !slot.dark,
        get: () => slot.dark ?? '#000000', set: (v) => this.change(() => { slot.dark = v; }),
      },
      {
        type: 'select', label: 'Fusion', options: () => Object.entries(BLEND_LABELS),
        get: () => slot.blend, set: (v) => this.change(() => { slot.blend = v; }),
      },
      { type: 'button', label: '', text: () => 'Envoyer tout devant', onClick: () => this.change(() => sk.moveSlot(slot, sk.slots.length - 1)) },
      { type: 'button', label: '', text: () => 'Envoyer tout au fond', onClick: () => this.change(() => sk.moveSlot(slot, 0)) },
    ];
  }

  attachmentRows(slot, att) {
    const sk = this.editor.skeleton;
    const editor = this.editor;
    const toMesh = {
      type: 'button', label: '', text: () => '▦ Convertir en maillage (déformable)',
      onClick: () => this.change(() => {
        sk.replaceAttachment(slot, att.name, meshFromRegion(att));
      }),
    };
    const num = (key, label, step, unit, min) => ({
      type: 'number', label, step, unit,
      get: () => att[key],
      set: (v) => this.change(() => { att[key] = min !== undefined ? Math.max(min, v) : v; }),
    });
    return [
      {
        type: 'text', label: 'Nom', get: () => att.name,
        set: (v) => this.change(() => {
          sk.renameAttachment(slot, att.name, v);
          editor.selectedAttachment = v.trim();
        }),
      },
      {
        type: 'select', label: 'Image',
        options: () => {
          const list = this.actions.imagePaths().map((p) => [p, p]);
          if (!list.some(([p]) => p === att.imagePath)) list.unshift([att.imagePath, `${att.imagePath} (manquante)`]);
          return list;
        },
        get: () => att.imagePath,
        set: (v) => this.change(() => { att.path = v === att.name ? null : v; }),
      },
      num('x', 'X', 1),
      num('y', 'Y', 1),
      num('rotation', 'Rotation', 1, '°'),
      num('scaleX', 'Échelle X', 0.05),
      num('scaleY', 'Échelle Y', 0.05),
      num('width', 'Largeur', 1, 'px', 1),
      num('height', 'Hauteur', 1, 'px', 1),
      {
        type: 'button', label: '', text: () => 'Taille de l\'image d\'origine',
        onClick: () => {
          const size = this.actions.imageSize(att.imagePath);
          if (!size) {
            this.notify('Image introuvable dans le dossier d\'images.');
            return;
          }
          this.change(() => {
            att.width = size.width;
            att.height = size.height;
          });
        },
      },
      ...colorRows(att, 'color', (fn) => this.change(fn)),
      toMesh,
      { type: 'info', text: () => `Slot « ${slot.name} », os « ${slot.bone.name} »` },
    ];
  }

  // --- Construction et rafraîchissement du formulaire -----------------------------------

  refresh() {
    const editor = this.editor;
    const sk = editor.skeleton;
    const sig = [
      editor.selectionKind, editor.selected?.name, editor.selectedSlot?.name, editor.selectedAttachment,
      Boolean(sk.reference), sk.slotsOf(editor.selected).length === 0, sk, editor.mode,
      editor.attachment, editor.attachment?.type, Boolean(editor.attachment?.weights), editor.attachment?.parent,
      editor.selectedSlot && sk.currentAttachment(editor.selectedSlot)?.type, editor.selectedConstraint,
      editor.constraint?.kind, editor.constraint?.positionMode,
      sk.editSkin, editor.attachment && sk.skinOf(editor.selectedSlot, editor.attachment),
    ];
    const changed = !this.signature || sig.some((v, i) => v !== this.signature[i]);
    if (changed) this.build();
    this.signature = sig;
    this.refreshValues();
  }

  build() {
    const form = document.createElement('form');
    form.className = 'props';
    form.addEventListener('submit', (e) => e.preventDefault());
    this.rows = [];
    for (const section of this.sections()) {
      const h = document.createElement('h3');
      h.textContent = section.title;
      form.appendChild(h);
      for (const def of section.rows) this.rows.push(buildRow(form, def));
    }
    this.host.replaceChildren(form);
  }

  refreshValues() {
    const active = document.activeElement;
    for (const { def, input, extra, keyBtn } of this.rows) {
      if (keyBtn) {
        const k = def.key;
        const state = this.editor.keyState(k.owner, k.name, typeof k.type === 'function' ? k.type() : k.type);
        keyBtn.textContent = state === 'key' ? '◆' : '◇';
        keyBtn.classList.toggle('on', state === 'key');
        keyBtn.classList.toggle('animated', state === 'timeline');
      }
      if (def.disabled && input) input.disabled = def.disabled();
      if (def.type === 'info') {
        input.textContent = def.text();
        continue;
      }
      if (def.type === 'button') {
        input.textContent = def.text();
        if (def.active) input.classList.toggle('on', def.active());
        continue;
      }
      if (def.type === 'checklist') {
        const checked = new Set(def.get());
        const opts = def.options();
        if (input.childElementCount !== opts.length) {
          input.replaceChildren(...opts.map(([value, text]) => {
            const l = document.createElement('label');
            const c = document.createElement('input');
            c.type = 'checkbox';
            c.value = value;
            c.addEventListener('change', () => def.set(value, c.checked));
            l.append(c, text);
            return l;
          }));
        }
        for (const l of input.children) l.firstChild.checked = checked.has(l.firstChild.value);
        continue;
      }
      if (input === active) continue;
      const v = def.get();
      if (def.type === 'checkbox') input.checked = v;
      else if (def.type === 'number') input.value = round(v, def.step < 1 ? 4 : 2);
      else if (def.type === 'select') {
        input.replaceChildren(...def.options().map(([value, text]) => new Option(text, value)));
        input.value = v;
      } else if (def.type === 'range') {
        input.value = v;
        if (extra) extra.textContent = `${Math.round(v * 100)} %`;
      } else input.value = v;
    }
  }
}

// Deux lignes pour une couleur « #rrggbbaa » : la teinte et l'opacité.
function colorRows(obj, key, change) {
  return [
    {
      type: 'color', label: 'Teinte', get: () => splitAlpha(obj[key]).rgb,
      set: (v) => change(() => { obj[key] = joinAlpha(v, splitAlpha(obj[key]).alpha); }),
    },
    {
      type: 'range', label: 'Opacité', min: 0, max: 1, step: 0.01, get: () => splitAlpha(obj[key]).alpha,
      set: (v) => change(() => { obj[key] = joinAlpha(splitAlpha(obj[key]).rgb, v); }),
    },
  ];
}

function buildRow(form, def) {
  if (def.type === 'info') {
    const p = document.createElement('p');
    p.className = 'world-info';
    form.appendChild(p);
    return { def, input: p };
  }
  const lab = document.createElement(def.type === 'button' ? 'div' : 'label');
  lab.className = 'prop-row';
  const span = document.createElement('span');
  span.textContent = def.label;
  let keyBtn = null;
  if (def.key) {
    // Losange de clé : cliquer pose la clé avec la valeur actuelle.
    keyBtn = document.createElement('button');
    keyBtn.type = 'button';
    keyBtn.className = 'key-btn';
    keyBtn.title = 'Poser une clé à cette image';
    keyBtn.setAttribute('aria-label', `Clé : ${def.label}`);
    keyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      def.set(def.get());
    });
    span.prepend(keyBtn);
  }
  lab.appendChild(span);
  let input;
  let extra = null;

  switch (def.type) {
    case 'button':
      input = document.createElement('button');
      input.type = 'button';
      input.className = 'prop-button';
      if (def.title) input.title = def.title;
      input.addEventListener('click', def.onClick);
      break;
    case 'select':
      input = document.createElement('select');
      input.addEventListener('change', () => def.set(input.value));
      break;
    case 'checklist':
      input = document.createElement('div');
      input.className = 'checklist';
      break;
    case 'checkbox':
      input = document.createElement('input');
      input.type = 'checkbox';
      input.addEventListener('change', () => def.set(input.checked));
      break;
    case 'color':
      input = document.createElement('input');
      input.type = 'color';
      input.addEventListener('change', () => def.set(input.value));
      break;
    case 'range':
      input = document.createElement('input');
      input.type = 'range';
      input.min = String(def.min);
      input.max = String(def.max);
      input.step = String(def.step);
      extra = document.createElement('em');
      input.addEventListener('input', () => {
        extra.textContent = `${Math.round(Number(input.value) * 100)} %`;
      });
      input.addEventListener('change', () => def.set(Number(input.value)));
      break;
    case 'number':
      input = document.createElement('input');
      input.type = 'number';
      input.step = String(def.step);
      input.addEventListener('change', () => {
        const v = Number(input.value);
        if (input.value === '' || !Number.isFinite(v)) {
          input.value = round(def.get(), 2);
          return;
        }
        def.set(v);
      });
      if (def.unit) {
        extra = document.createElement('em');
        extra.textContent = def.unit;
      }
      break;
    default:
      input = document.createElement('input');
      input.type = 'text';
      input.addEventListener('change', () => def.set(input.value));
  }
  lab.appendChild(input);
  if (extra) lab.appendChild(extra);
  form.appendChild(lab);
  return { def, input, extra, keyBtn };
}

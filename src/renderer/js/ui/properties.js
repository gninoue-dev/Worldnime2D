// Panneau « Propriétés » : les valeurs de l'élément sélectionné (os, slot ou pièce jointe),
// plus les réglages du squelette (nom, dossier d'images, image de référence).
//
// Chaque champ est décrit par un objet { type, label, get, set, … }. Le formulaire est reconstruit
// quand la sélection change de nature, et seulement rafraîchi sinon.

import { INHERIT_LABELS } from '../model/bone.js';
import { BLEND_LABELS } from '../model/slot.js';
import { splitAlpha, joinAlpha } from '../model/color.js';
import { round } from '../model/math.js';

export class PropertiesPanel {
  constructor(editor, host, notify, actions) {
    this.editor = editor;
    this.host = host;
    this.notify = notify;
    this.actions = actions;
    this.signature = null;
    this.rows = [];
    editor.addEventListener('change', () => this.refresh());
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

    if (editor.animating) {
      if (kind === 'bone') out.push({ title: 'Os — pose animée', rows: this.animBoneRows(editor.selected) });
      if (kind === 'slot') out.push({ title: 'Slot — pose animée', rows: this.animSlotRows(editor.selectedSlot) });
      if (kind === 'attachment') {
        out.push({ title: 'Image', rows: [{ type: 'info', text: () => 'En mode Animation, on anime l\'os et le slot, pas l\'image elle-même. Repassez en mode Configuration pour la placer.' }] });
      }
      return out;
    }
    if (kind === 'bone') out.push({ title: 'Os', rows: this.boneRows(editor.selected) });
    if (kind === 'slot') out.push({ title: 'Slot', rows: this.slotRows(editor.selectedSlot) });
    if (kind === 'attachment') {
      out.push({ title: 'Image (pièce jointe région)', rows: this.attachmentRows(editor.selectedSlot, editor.attachment) });
    }
    return out;
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
    return rows;
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
        options: () => [['', '(aucune)'], ...[...sk.defaultSkin.attachmentsOf(slot.name).keys()].map((n) => [n, n])],
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
        options: () => [['', '(aucune)'], ...[...sk.defaultSkin.attachmentsOf(slot.name).keys()].map((n) => [n, n])],
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

// Panneau « Propriétés » : les valeurs de la pose de base de l'os sélectionné.

import { INHERIT_LABELS } from '../model/bone.js';
import { round } from '../model/math.js';

const NUMBER_FIELDS = [
  { key: 'length', label: 'Longueur', step: 1, min: 0 },
  { key: 'x', label: 'X', step: 1 },
  { key: 'y', label: 'Y', step: 1 },
  { key: 'rotation', label: 'Rotation', step: 1, unit: '°' },
  { key: 'scaleX', label: 'Échelle X', step: 0.05 },
  { key: 'scaleY', label: 'Échelle Y', step: 0.05 },
  { key: 'shearX', label: 'Cisaillement X', step: 1, unit: '°' },
  { key: 'shearY', label: 'Cisaillement Y', step: 1, unit: '°' },
];

export class PropertiesPanel {
  constructor(editor, host, notify) {
    this.editor = editor;
    this.host = host;
    this.notify = notify;
    this.build();
    editor.addEventListener('change', () => this.refresh());
    this.refresh();
  }

  build() {
    const form = document.createElement('form');
    form.className = 'props';
    form.addEventListener('submit', (e) => e.preventDefault());

    this.fields = {};

    const row = (labelText, input, unit) => {
      const lab = document.createElement('label');
      lab.className = 'prop-row';
      const span = document.createElement('span');
      span.textContent = labelText;
      lab.append(span, input);
      if (unit) {
        const u = document.createElement('em');
        u.textContent = unit;
        lab.appendChild(u);
      }
      form.appendChild(lab);
    };

    const skName = document.createElement('input');
    skName.type = 'text';
    skName.addEventListener('change', () => {
      const v = skName.value.trim() || 'squelette';
      this.editor.apply(() => {
        this.editor.skeleton.name = v;
      });
    });
    this.fields.skeletonName = skName;
    row('Squelette', skName);

    const sep = document.createElement('h3');
    sep.textContent = 'Os';
    form.appendChild(sep);

    const name = document.createElement('input');
    name.type = 'text';
    name.addEventListener('change', () => this.set((b, sk) => sk.renameBone(b, name.value)));
    this.fields.name = name;
    row('Nom', name);

    const parent = document.createElement('select');
    parent.addEventListener('change', () => this.set((b, sk) => sk.reparent(b, sk.findBone(parent.value))));
    this.fields.parent = parent;
    row('Parent', parent);

    for (const f of NUMBER_FIELDS) {
      const input = document.createElement('input');
      input.type = 'number';
      input.step = String(f.step);
      if (f.min !== undefined) input.min = String(f.min);
      input.addEventListener('change', () => {
        const v = Number(input.value);
        if (input.value === '' || !Number.isFinite(v)) {
          this.refresh();
          return;
        }
        this.set((b) => {
          b[f.key] = f.min !== undefined ? Math.max(f.min, v) : v;
        });
      });
      this.fields[f.key] = input;
      row(f.label, input, f.unit);
    }

    const inherit = document.createElement('select');
    for (const [value, text] of Object.entries(INHERIT_LABELS)) {
      inherit.appendChild(new Option(text, value));
    }
    inherit.addEventListener('change', () => this.set((b) => {
      b.inherit = inherit.value;
    }));
    this.fields.inherit = inherit;
    row('Héritage', inherit);

    const color = document.createElement('input');
    color.type = 'color';
    color.addEventListener('change', () => this.set((b) => {
      b.color = color.value;
    }));
    this.fields.color = color;
    row('Couleur', color);

    const world = document.createElement('p');
    world.className = 'world-info';
    form.appendChild(world);
    this.worldInfo = world;

    this.host.replaceChildren(form);
  }

  set(fn) {
    const bone = this.editor.selected;
    if (!bone) return;
    try {
      this.editor.apply(() => fn(bone, this.editor.skeleton));
    } catch (err) {
      this.notify(err.message);
      this.refresh();
    }
  }

  refresh() {
    const bone = this.editor.selected;
    const sk = this.editor.skeleton;
    const f = this.fields;
    const active = document.activeElement;
    const put = (input, value) => {
      if (input !== active) input.value = value;
    };

    put(f.skeletonName, sk.name);
    const disabled = !bone;
    for (const input of Object.values(f)) {
      if (input !== f.skeletonName) input.disabled = disabled;
    }
    if (!bone) return;

    put(f.name, bone.name);
    f.parent.replaceChildren();
    if (!bone.parent) {
      f.parent.appendChild(new Option('(aucun : racine)', ''));
      f.parent.disabled = true;
    } else {
      for (const b of sk.bones) {
        if (b === bone || bone.isAncestorOf(b)) continue;
        f.parent.appendChild(new Option(`${'  '.repeat(sk.depthOf(b))}${b.name}`, b.name));
      }
      f.parent.value = bone.parent.name;
    }
    for (const nf of NUMBER_FIELDS) put(f[nf.key], round(bone[nf.key], nf.step < 1 ? 4 : 2));
    put(f.inherit, bone.inherit);
    put(f.color, bone.color);
    f.inherit.disabled = !bone.parent;

    this.worldInfo.textContent =
      `Monde : x ${round(bone.worldX)}, y ${round(bone.worldY)}, ` +
      `rotation ${round(bone.worldRotationX)}°, échelle ${round(bone.worldScaleX, 3)} × ${round(bone.worldScaleY, 3)}`;
  }
}

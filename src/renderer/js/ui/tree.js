// Panneau « Arbre » : la hiérarchie des os, avec leurs slots et les pièces jointes de chaque slot.
//
// Clic = sélection, double-clic = renommer.
// Glisser un os sur un autre os = changer de parent. Glisser un slot sur un os = changer d'os.
// Glisser une image du panneau Images sur un os = créer un slot avec cette image.
// Le rond devant une pièce jointe la rend visible (ou la cache) dans la pose de base.

const DRAG_TYPE = 'application/x-wn2d-tree';
export const IMAGE_DRAG_TYPE = 'application/x-wn2d-image';

export class TreePanel {
  constructor(editor, host, notify, actions) {
    this.editor = editor;
    this.host = host;
    this.notify = notify;
    this.actions = actions;
    this.collapsed = new Set();
    this.dragItem = null;
    editor.addEventListener('change', (e) => {
      const r = e.detail.reason;
      if (r === 'drag' || r === 'keys' || r === 'physics' || (r === 'time' && editor.playing)) return;
      this.render();
    });
    this.render();
  }

  render() {
    const editor = this.editor;
    const sk = editor.skeleton;
    const ul = document.createElement('ul');
    ul.className = 'tree';
    ul.setAttribute('role', 'tree');

    const row = ({ key, depth, label, icon, selected, hasChildren, onClick, onRename, drag, drop, extra }) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'treeitem');
      const r = document.createElement('div');
      r.className = 'tree-row';
      if (selected) r.classList.add('selected');
      r.style.paddingLeft = `${6 + depth * 14}px`;

      const twisty = document.createElement('span');
      twisty.className = 'twisty';
      if (hasChildren) {
        const closed = this.collapsed.has(key);
        twisty.textContent = closed ? '▸' : '▾';
        twisty.addEventListener('click', (e) => {
          e.stopPropagation();
          if (closed) this.collapsed.delete(key);
          else this.collapsed.add(key);
          this.render();
        });
      }
      const text = document.createElement('span');
      text.className = 'tree-label';
      text.textContent = label;
      r.append(twisty, icon);
      if (extra) r.appendChild(extra);
      r.appendChild(text);

      r.addEventListener('click', onClick);
      if (onRename) r.addEventListener('dblclick', () => this.startRename(text, label, onRename));
      if (drag) {
        r.draggable = true;
        r.addEventListener('dragstart', (e) => {
          this.dragItem = drag;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData(DRAG_TYPE, key);
        });
        r.addEventListener('dragend', () => {
          this.dragItem = null;
        });
      }
      if (drop) {
        r.addEventListener('dragover', (e) => {
          const ok = (this.dragItem && drop.accepts(this.dragItem)) || e.dataTransfer.types.includes(IMAGE_DRAG_TYPE);
          if (!ok || this.editor.animating) return;
          e.preventDefault();
          r.classList.add('drop-target');
        });
        r.addEventListener('dragleave', () => r.classList.remove('drop-target'));
        r.addEventListener('drop', (e) => {
          e.preventDefault();
          r.classList.remove('drop-target');
          const image = e.dataTransfer.getData(IMAGE_DRAG_TYPE);
          const item = this.dragItem;
          this.dragItem = null;
          try {
            if (image) drop.onImage(image);
            else if (item) drop.onItem(item);
          } catch (err) {
            this.notify(err.message);
          }
        });
      }
      li.appendChild(r);
      ul.appendChild(li);
      return !this.collapsed.has(key);
    };

    const addBone = (bone, depth) => {
      const slots = sk.slotsOf(bone);
      const open = row({
        key: `b:${bone.name}`,
        depth,
        label: bone.name,
        icon: iconEl('bone-icon', bone.color),
        selected: bone === editor.selected && editor.selectionKind === 'bone',
        hasChildren: bone.children.length > 0 || slots.length > 0,
        onClick: () => editor.select(bone),
        onRename: (name) => editor.apply(() => sk.renameBone(bone, name)),
        drag: bone.parent ? { kind: 'bone', bone } : null,
        drop: {
          accepts: (item) => item.kind === 'slot' || (item.kind === 'bone' && item.bone !== bone),
          onItem: (item) => {
            if (item.kind === 'bone') {
              editor.apply(() => {
                sk.reparent(item.bone, bone);
                editor.selected = item.bone;
                editor.selectedSlot = null;
                editor.selectedAttachment = null;
              });
            } else {
              editor.apply(() => {
                sk.setSlotBone(item.slot, bone);
                editor.selected = bone;
                editor.selectedSlot = item.slot;
                editor.selectedAttachment = null;
              });
            }
            this.collapsed.delete(`b:${bone.name}`);
          },
          onImage: (path) => {
            this.actions.attachImage(path, bone, null);
            this.collapsed.delete(`b:${bone.name}`);
          },
        },
      });
      if (!open) return;
      // Les slots d'un os sont listés du plus en avant au plus au fond, comme l'ordre d'affichage.
      for (const slot of [...slots].reverse()) addSlot(slot, depth + 1);
      for (const c of bone.children) addBone(c, depth + 1);
    };

    const addSlot = (slot, depth) => {
      const atts = sk.defaultSkin.attachmentsOf(slot.name);
      const open = row({
        key: `s:${slot.name}`,
        depth,
        label: slot.name,
        icon: iconEl('slot-icon'),
        selected: editor.selectionKind === 'slot' && editor.selectedSlot === slot,
        hasChildren: atts.size > 0,
        onClick: () => editor.selectSlot(slot),
        onRename: (name) => editor.apply(() => sk.renameSlot(slot, name)),
        drag: { kind: 'slot', slot },
        drop: {
          accepts: () => false,
          onItem: () => {},
          onImage: (path) => this.actions.attachImage(path, slot.bone, slot),
        },
      });
      if (!open) return;
      for (const [name, att] of atts) {
        // En mode Animation, le rond montre et anime la pose courante (clé de pièce jointe).
        const animating = editor.animating;
        const visible = (animating ? slot.pose.attachment : slot.attachment) === name;
        const eye = document.createElement('button');
        eye.type = 'button';
        eye.className = `eye${visible ? ' on' : ''}`;
        eye.title = visible ? 'Visible dans la pose de base (cliquer pour cacher)' : 'Rendre visible';
        eye.setAttribute('aria-label', eye.title);
        eye.addEventListener('click', (e) => {
          e.stopPropagation();
          editor.apply(() => {
            if (animating) {
              slot.pose.attachment = visible ? null : name;
              editor.keySlot(slot, ['attachment']);
            } else slot.attachment = visible ? null : name;
          });
        });
        eye.addEventListener('dblclick', (e) => e.stopPropagation());
        const isPath = att.type === 'path';
        const missing = !isPath && !this.actions.hasImage(att.imagePath);
        const kindClass = isPath ? 'path-icon' : att.type === 'mesh' ? 'att-icon mesh' : 'att-icon';
        row({
          key: `a:${slot.name}/${name}`,
          depth: depth + 1,
          label: missing ? `${name}  (image manquante)` : att.parent ? `${name}  (lié à ${att.parent})` : name,
          icon: iconEl(missing ? `${kindClass} missing` : kindClass),
          extra: eye,
          selected: editor.selectionKind === 'attachment' && editor.selectedSlot === slot && editor.selectedAttachment === name,
          hasChildren: false,
          onClick: () => editor.selectAttachment(slot, name),
          onRename: (newName) => editor.apply(() => {
            sk.renameAttachment(slot, name, newName);
            editor.selectedAttachment = newName.trim();
          }),
        });
      }
    };

    addBone(sk.root, 0);

    // Contraintes, dans leur ordre d'évaluation.
    if (sk.constraints.length) {
      const head = document.createElement('li');
      head.className = 'tree-section';
      head.textContent = 'Contraintes';
      ul.appendChild(head);
      const labels = { ik: 'IK', transform: 'Transf.', path: 'Chemin', physics: 'Physique' };
      for (const c of sk.sortedConstraints()) {
        const note = document.createElement('span');
        note.className = 'tree-note';
        note.textContent = labels[c.kind];
        row({
          key: `c:${c.name}`,
          depth: 0,
          label: c.name,
          icon: iconEl(`constraint-icon ${c.kind}`),
          extra: null,
          selected: editor.selectedConstraint === c.name,
          hasChildren: false,
          onClick: () => editor.selectConstraint(c.name),
          onRename: (name) => {
            editor.apply(() => sk.renameConstraint(c, name));
            editor.selectConstraint(c.name);
          },
        });
        ul.lastChild.firstChild.appendChild(note);
      }
    }
    this.host.replaceChildren(ul);
    this.host.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
  }

  startRename(label, oldName, onRename) {
    const input = document.createElement('input');
    input.className = 'tree-rename';
    input.value = oldName;
    label.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      if (ok && input.value.trim() !== oldName) {
        try {
          onRename(input.value);
          return;
        } catch (err) {
          this.notify(err.message);
        }
      }
      this.render();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
      e.stopPropagation();
    });
    input.addEventListener('blur', () => finish(true));
  }
}

function iconEl(className, color) {
  const span = document.createElement('span');
  span.className = className;
  if (color) span.style.background = color;
  return span;
}

// Panneau « Ordre d'affichage » : les slots, du plus en avant (en haut) au plus au fond (en bas).
export class DrawOrderPanel {
  constructor(editor, host, notify) {
    this.editor = editor;
    this.host = host;
    this.notify = notify;
    this.dragSlot = null;
    editor.addEventListener('change', (e) => {
      const r = e.detail.reason;
      if (r === 'drag' || r === 'keys' || r === 'physics' || (r === 'time' && editor.playing)) return;
      this.render();
    });
    this.render();
  }

  render() {
    const editor = this.editor;
    const sk = editor.skeleton;
    if (sk.slots.length === 0) {
      this.host.replaceChildren(emptyNote('Aucun slot. Glissez une image sur un os pour en créer un.'));
      return;
    }
    const ul = document.createElement('ul');
    ul.className = 'tree';
    // En mode Animation, on montre et on anime l'ordre courant.
    const animating = editor.animating;
    const ordered = [...(animating ? sk.drawOrder : sk.slots)].reverse();
    ordered.forEach((slot) => {
      const li = document.createElement('li');
      const r = document.createElement('div');
      r.className = 'tree-row';
      r.style.paddingLeft = '8px';
      if (editor.selectedSlot === slot) r.classList.add('selected');
      const label = document.createElement('span');
      label.className = 'tree-label';
      label.textContent = slot.name;
      const bone = document.createElement('span');
      bone.className = 'tree-note';
      bone.textContent = slot.bone.name;
      r.append(iconEl('slot-icon'), label, bone);
      r.addEventListener('click', () => editor.selectSlot(slot));
      r.draggable = true;
      r.addEventListener('dragstart', (e) => {
        this.dragSlot = slot;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', slot.name);
      });
      r.addEventListener('dragover', (e) => {
        if (!this.dragSlot || this.dragSlot === slot) return;
        e.preventDefault();
        const rect = r.getBoundingClientRect();
        const above = e.clientY < rect.top + rect.height / 2;
        r.classList.toggle('drop-above', above);
        r.classList.toggle('drop-below', !above);
      });
      r.addEventListener('dragleave', () => r.classList.remove('drop-above', 'drop-below'));
      r.addEventListener('drop', (e) => {
        e.preventDefault();
        const above = r.classList.contains('drop-above');
        r.classList.remove('drop-above', 'drop-below');
        const moving = this.dragSlot;
        this.dragSlot = null;
        if (!moving || moving === slot) return;
        editor.apply(() => {
          // En haut de la liste = en avant = fin du tableau des slots.
          const list = animating ? sk.drawOrder : sk.slots;
          const without = list.filter((s) => s !== moving);
          const idx = without.indexOf(slot);
          const target = above ? idx + 1 : idx;
          if (animating) {
            without.splice(target, 0, moving);
            sk.drawOrder = without;
            editor.keyDrawOrder();
          } else sk.moveSlot(moving, target);
          editor.selected = moving.bone;
          editor.selectedSlot = moving;
          editor.selectedAttachment = null;
        });
      });
      li.appendChild(r);
      ul.appendChild(li);
    });
    this.host.replaceChildren(ul);
    this.host.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
  }
}

// Panneau « Images » : le contenu du dossier d'images, à glisser sur la vue ou sur un os.
export class ImagesPanel {
  constructor(editor, library, host, actions) {
    this.editor = editor;
    this.library = library;
    this.host = host;
    this.actions = actions;
    library.addEventListener('change', () => this.render());
    editor.addEventListener('change', (e) => {
      if (e.detail.reason === 'reset') this.render();
    });
    this.render();
  }

  render() {
    const lib = this.library;
    const wrap = document.createElement('div');
    wrap.className = 'images-panel';

    const head = document.createElement('div');
    head.className = 'images-head';
    const dir = document.createElement('span');
    dir.className = 'images-dir';
    dir.textContent = lib.dir ? lib.dir : 'Aucun dossier d\'images';
    dir.title = lib.dir ?? '';
    const choose = document.createElement('button');
    choose.type = 'button';
    choose.textContent = lib.dir ? 'Changer…' : 'Choisir…';
    choose.addEventListener('click', () => this.actions.chooseImagesDir());
    head.append(dir, choose);
    wrap.appendChild(head);

    if (!lib.dir) {
      wrap.appendChild(emptyNote('Choisissez le dossier qui contient les images (PNG) du personnage, ou importez un fichier ORA / PSD (Ctrl+I).'));
    } else if (lib.list.length === 0) {
      wrap.appendChild(emptyNote('Ce dossier ne contient aucune image PNG, JPG ou WebP.'));
    } else {
      const hint = emptyNote('Glissez une image sur la vue ou sur un os. Double-clic : l\'attacher à l\'os sélectionné.');
      wrap.appendChild(hint);
      const grid = document.createElement('div');
      grid.className = 'images-grid';
      for (const e of lib.list) {
        const cell = document.createElement('div');
        cell.className = 'image-cell';
        cell.draggable = true;
        cell.title = `${e.path}  (${e.width} × ${e.height})`;
        const img = document.createElement('img');
        img.src = e.url;
        img.alt = '';
        img.draggable = false;
        const name = document.createElement('span');
        name.textContent = e.path;
        cell.append(img, name);
        cell.addEventListener('dragstart', (ev) => {
          ev.dataTransfer.effectAllowed = 'copy';
          ev.dataTransfer.setData(IMAGE_DRAG_TYPE, e.path);
        });
        cell.addEventListener('dblclick', () => this.actions.attachImage(e.path, this.editor.selected, this.editor.selectedSlot));
        grid.appendChild(cell);
      }
      wrap.appendChild(grid);
    }
    this.host.replaceChildren(wrap);
  }
}

function emptyNote(text) {
  const p = document.createElement('p');
  p.className = 'empty-note';
  p.textContent = text;
  return p;
}

// Panneau « Arbre » : la hiérarchie des os.
// Clic = sélection, double-clic = renommer, glisser-déposer un os sur un autre = changer de parent.

export class TreePanel {
  constructor(editor, host, notify) {
    this.editor = editor;
    this.host = host;
    this.notify = notify;
    this.collapsed = new Set();
    this.dragName = null;
    editor.addEventListener('change', (e) => {
      if (e.detail.reason !== 'drag') this.render();
    });
    this.render();
  }

  render() {
    const editor = this.editor;
    const sk = editor.skeleton;
    const ul = document.createElement('ul');
    ul.className = 'tree';
    ul.setAttribute('role', 'tree');

    const add = (bone, depth) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'treeitem');
      const row = document.createElement('div');
      row.className = 'tree-row';
      if (bone === editor.selected) row.classList.add('selected');
      row.style.paddingLeft = `${6 + depth * 14}px`;
      row.dataset.name = bone.name;
      row.draggable = Boolean(bone.parent);

      const twisty = document.createElement('span');
      twisty.className = 'twisty';
      if (bone.children.length) {
        const closed = this.collapsed.has(bone.name);
        twisty.textContent = closed ? '▸' : '▾';
        twisty.addEventListener('click', (e) => {
          e.stopPropagation();
          if (closed) this.collapsed.delete(bone.name);
          else this.collapsed.add(bone.name);
          this.render();
        });
      }
      const icon = document.createElement('span');
      icon.className = 'bone-icon';
      icon.style.background = bone.color;
      const label = document.createElement('span');
      label.className = 'tree-label';
      label.textContent = bone.name;
      row.append(twisty, icon, label);

      row.addEventListener('click', () => editor.select(bone));
      row.addEventListener('dblclick', () => this.startRename(row, label, bone));
      this.bindDrag(row, bone);

      li.appendChild(row);
      ul.appendChild(li);
      if (!this.collapsed.has(bone.name)) {
        for (const c of bone.children) add(c, depth + 1);
      }
    };
    add(sk.root, 0);

    this.host.replaceChildren(ul);
    this.host.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
  }

  startRename(row, label, bone) {
    const input = document.createElement('input');
    input.className = 'tree-rename';
    input.value = bone.name;
    label.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      if (ok && input.value !== bone.name) {
        try {
          this.editor.apply(() => this.editor.skeleton.renameBone(bone, input.value));
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

  bindDrag(row, bone) {
    row.addEventListener('dragstart', (e) => {
      this.dragName = bone.name;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', bone.name);
    });
    row.addEventListener('dragend', () => {
      this.dragName = null;
    });
    row.addEventListener('dragover', (e) => {
      if (!this.dragName || this.dragName === bone.name) return;
      e.preventDefault();
      row.classList.add('drop-target');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop-target'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('drop-target');
      const sk = this.editor.skeleton;
      const moving = sk.findBone(this.dragName);
      this.dragName = null;
      if (!moving) return;
      try {
        this.editor.apply(() => {
          sk.reparent(moving, bone);
          this.editor.selected = moving;
        });
        this.collapsed.delete(bone.name);
      } catch (err) {
        this.notify(err.message);
      }
    });
  }
}

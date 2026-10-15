// Panneau « Skins » : plusieurs tenues pour un même squelette.
//
// Une case cochée = skin active (on peut en combiner plusieurs). La skin sélectionnée (clic)
// reçoit les nouvelles pièces jointes ; elle est activée en même temps. Une pièce jointe se cherche dans les skins actives, puis dans
// « default » : un même nom dans plusieurs skins est un « emplacement » que chaque skin remplit à sa façon.
// Os et contraintes cochés pour une skin : actifs seulement quand elle est active.

export class SkinsPanel {
  constructor(editor, host, notify) {
    this.editor = editor;
    this.host = host;
    this.notify = notify;
    editor.addEventListener('change', (e) => {
      if (!['drag', 'time', 'keys', 'physics'].includes(e.detail.reason)) this.render();
    });
    this.render();
  }

  change(fn) {
    try {
      this.editor.apply(fn);
    } catch (err) {
      this.notify(err.message);
    }
  }

  render() {
    const ed = this.editor;
    const sk = ed.skeleton;
    const wrap = document.createElement('div');
    wrap.className = 'anim-panel';
    const head = document.createElement('div');
    head.className = 'anim-head';
    const title = document.createElement('span');
    title.textContent = 'Skins';
    const actions = document.createElement('span');
    actions.className = 'panel-actions';
    const button = (text, label, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.title = label;
      b.setAttribute('aria-label', label);
      b.addEventListener('click', fn);
      actions.appendChild(b);
    };
    const edit = sk.editSkin;
    const select = (name) => {
      sk.editSkinName = name;
      if (name && !sk.activeSkins.includes(name)) sk.activeSkins = [...sk.activeSkins, name];
    };
    button('＋', 'Nouvelle skin', () => this.change(() => select(sk.addSkin(sk.uniqueSkinName('skin')).name)));
    button('⧉', 'Dupliquer la skin sélectionnée (pièces jointes copiées)', () => this.change(() => {
      const s = sk.addSkin(sk.uniqueSkinName(`${edit.name}_copie`));
      for (const [slotName, map] of edit.attachments) for (const [n, a] of map) s.set(slotName, n, a.copy(n));
      for (const b of edit.bones) s.bones.add(b);
      for (const c of edit.constraints) s.constraints.add(c);
      sk.activeSkins = sk.activeSkins.filter((n) => n !== edit.name);
      select(s.name);
    }));
    button('✕', 'Supprimer la skin sélectionnée', () => this.change(() => sk.removeSkin(edit)));
    head.append(title, actions);
    wrap.appendChild(head);

    const ul = document.createElement('ul');
    ul.className = 'tree';
    for (const skin of sk.skins) {
      const li = document.createElement('li');
      const row = document.createElement('div');
      row.className = 'tree-row';
      row.style.paddingLeft = '8px';
      const isDefault = skin === sk.defaultSkin;
      if (skin === edit) row.classList.add('selected');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = isDefault || sk.activeSkins.includes(skin.name);
      box.disabled = isDefault;
      box.title = isDefault ? 'Toujours active' : 'Active (combinable avec d\'autres skins)';
      box.addEventListener('click', (e) => e.stopPropagation());
      box.addEventListener('change', () => this.change(() => {
        sk.activeSkins = box.checked ? [...sk.activeSkins, skin.name] : sk.activeSkins.filter((n) => n !== skin.name);
        if (!box.checked && sk.editSkinName === skin.name) sk.editSkinName = null;
      }));
      const label = document.createElement('span');
      label.className = 'tree-label';
      label.textContent = skin.name;
      let count = 0;
      for (const m of skin.attachments.values()) count += m.size;
      const note = document.createElement('span');
      note.className = 'tree-note';
      note.textContent = `${count} pièce(s)`;
      row.append(box, label, note);
      // Clic : la skin devient celle qui reçoit les nouvelles pièces jointes (et elle est activée).
      row.addEventListener('click', () => this.change(() => select(isDefault ? null : skin.name)));
      if (!isDefault) {
        row.addEventListener('dblclick', () => {
          const input = document.createElement('input');
          input.className = 'tree-rename';
          input.value = skin.name;
          label.replaceWith(input);
          input.focus();
          input.select();
          const done = (ok) => {
            if (ok && input.value.trim() && input.value.trim() !== skin.name) this.change(() => sk.renameSkin(skin, input.value));
            else this.render();
          };
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') done(true);
            if (e.key === 'Escape') done(false);
            e.stopPropagation();
          });
          input.addEventListener('blur', () => done(true), { once: true });
        });
      }
      li.appendChild(row);
      ul.appendChild(li);
    }
    wrap.appendChild(ul);

    const note = document.createElement('p');
    note.className = 'empty-note';
    note.textContent = edit === sk.defaultSkin
      ? 'Les nouvelles pièces jointes vont dans « default ». Créez une skin (＋) pour une tenue alternative.'
      : `Les nouvelles pièces jointes vont dans « ${edit.name} ». Un même nom dans plusieurs skins remplace celui de « default ».`;
    wrap.appendChild(note);

    if (edit !== sk.defaultSkin) {
      const section = (titleText, items, set, toggle) => {
        const h = document.createElement('div');
        h.className = 'anim-head';
        h.textContent = titleText;
        wrap.appendChild(h);
        const list = document.createElement('div');
        list.className = 'checklist skin-list';
        if (items.length === 0) list.textContent = '—';
        for (const name of items) {
          const l = document.createElement('label');
          const c = document.createElement('input');
          c.type = 'checkbox';
          c.checked = set.has(name);
          c.addEventListener('change', () => this.change(() => toggle(name, c.checked)));
          l.append(c, name);
          list.appendChild(l);
        }
        wrap.appendChild(list);
      };
      section(`Os réservés à « ${edit.name} »`, sk.bones.filter((b) => b.parent).map((b) => b.name), edit.bones, (n, on) => {
        if (on) edit.bones.add(n);
        else edit.bones.delete(n);
      });
      section(`Contraintes réservées à « ${edit.name} »`, sk.constraints.map((c) => c.name), edit.constraints, (n, on) => {
        if (on) edit.constraints.add(n);
        else edit.constraints.delete(n);
      });
    }
    this.host.replaceChildren(wrap);
  }
}

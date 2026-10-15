// Panneau « Animations » : liste des animations du squelette et définitions des événements.
// Clic sur une animation = l'ouvrir en mode Animation ; double-clic = renommer.

export class AnimationsPanel {
  constructor(editor, host, notify, actions = {}) {
    this.actions = actions;
    this.editor = editor;
    this.host = host;
    this.notify = notify;
    this.selectedEvent = null;
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

    // --- Animations ---
    wrap.appendChild(header('Animations', [
      ['＋', 'Nouvelle animation', () => {
        const name = sk.uniqueAnimationName('animation');
        this.change(() => sk.addAnimation(name));
        ed.setAnimation(name);
        ed.setMode('animate');
      }],
      ['⧉', 'Dupliquer l\'animation', () => {
        const a = ed.animation;
        if (!a) return;
        const name = sk.uniqueAnimationName(`${a.name}_copie`);
        this.change(() => sk.addAnimation(name, a.copy(name)));
        ed.setAnimation(name);
      }],
      ['✕', 'Supprimer l\'animation', () => {
        const a = ed.animation;
        if (!a) return;
        this.change(() => sk.removeAnimation(a));
        const next = sk.animations[0]?.name ?? null;
        ed.animationName = null;
        if (next) ed.setAnimation(next);
        else ed.setMode('setup');
      }],
    ]));
    const list = document.createElement('ul');
    list.className = 'tree';
    if (sk.animations.length === 0) list.appendChild(note('Aucune animation. Cliquez sur ＋ ou passez en mode Animation.'));
    for (const a of sk.animations) {
      const li = document.createElement('li');
      const row = document.createElement('div');
      row.className = 'tree-row';
      row.style.paddingLeft = '8px';
      if (a.name === ed.animationName) row.classList.add('selected');
      const icon = document.createElement('span');
      icon.className = 'anim-icon';
      icon.textContent = '▶';
      const label = document.createElement('span');
      label.className = 'tree-label';
      label.textContent = a.name;
      const info = document.createElement('span');
      info.className = 'tree-note';
      info.textContent = `${a.duration.toFixed(2)} s`;
      row.append(icon, label, info);
      row.addEventListener('click', () => {
        ed.setAnimation(a.name);
        ed.setMode('animate');
      });
      row.addEventListener('dblclick', () => rename(label, a.name, (v) => {
        const wasCurrent = ed.animationName === a.name;
        this.change(() => sk.renameAnimation(a, v));
        if (wasCurrent) ed.animationName = a.name;
        ed.refreshPose();
        ed.emit('animation');
      }, () => this.render()));
      li.appendChild(row);
      list.appendChild(li);
    }
    wrap.appendChild(list);

    // --- Événements ---
    wrap.appendChild(header('Événements', [
      ['＋', 'Nouvel événement', () => {
        const name = sk.uniqueEventName('evenement');
        this.change(() => sk.addEvent(name));
        this.selectedEvent = name;
        this.render();
      }],
      ['✕', 'Supprimer l\'événement (et ses clés)', () => {
        if (!this.selectedEvent) return;
        const name = this.selectedEvent;
        this.change(() => sk.removeEvent(name));
        this.selectedEvent = null;
        this.render();
      }],
    ]));
    const evList = document.createElement('ul');
    evList.className = 'tree';
    if (sk.events.size === 0) evList.appendChild(note('Les événements marquent un instant de l\'animation (un pas, un coup qui touche, un son).'));
    for (const e of sk.events.values()) {
      const li = document.createElement('li');
      const row = document.createElement('div');
      row.className = 'tree-row';
      row.style.paddingLeft = '8px';
      if (e.name === this.selectedEvent) row.classList.add('selected');
      const icon = document.createElement('span');
      icon.className = 'anim-icon event';
      icon.textContent = '⚡';
      const label = document.createElement('span');
      label.className = 'tree-label';
      label.textContent = e.name;
      row.append(icon, label);
      row.addEventListener('click', () => {
        this.selectedEvent = e.name;
        this.render();
      });
      row.addEventListener('dblclick', () => rename(label, e.name, (v) => {
        this.change(() => sk.renameEvent(e.name, v));
        this.selectedEvent = v.trim();
        this.render();
      }, () => this.render()));
      li.appendChild(row);
      evList.appendChild(li);
    }
    wrap.appendChild(evList);

    const ev = this.selectedEvent && sk.events.get(this.selectedEvent);
    if (ev) {
      const form = document.createElement('div');
      form.className = 'props';
      const field = (label, type, get, set) => {
        const l = document.createElement('label');
        l.className = 'prop-row';
        const span = document.createElement('span');
        span.textContent = label;
        const input = document.createElement('input');
        input.type = type;
        if (type === 'number') input.step = 'any';
        input.value = get();
        input.addEventListener('change', () => this.change(() => set(type === 'number' ? Number(input.value) || 0 : input.value)));
        l.append(span, input);
        form.appendChild(l);
      };
      field('Entier', 'number', () => ev.int, (v) => { ev.int = Math.trunc(v); });
      field('Décimal', 'number', () => ev.float, (v) => { ev.float = v; });
      field('Texte', 'text', () => ev.string, (v) => { ev.string = v; });
      field('Son', 'text', () => ev.audio, (v) => { ev.audio = v.trim(); });
      if (this.actions.chooseAudio) {
        const choose = document.createElement('button');
        choose.type = 'button';
        choose.className = 'prop-button';
        choose.textContent = 'Choisir un son (OGG, MP3, WAV)…';
        choose.addEventListener('click', async () => {
          const rel = await this.actions.chooseAudio();
          if (rel) this.change(() => { ev.audio = rel; });
        });
        form.appendChild(choose);
      }
      if (ev.audio) {
        field('Volume', 'number', () => ev.volume, (v) => { ev.volume = v; });
        field('Balance', 'number', () => ev.balance, (v) => { ev.balance = v; });
      }
      const put = document.createElement('button');
      put.type = 'button';
      put.className = 'prop-button';
      put.textContent = ed.animating ? `Poser « ${ev.name} » à l'image courante` : 'Poser (passez en mode Animation)';
      put.disabled = !ed.animating || !ed.animation;
      put.addEventListener('click', () => {
        this.change(() => ed.animation.setKey('events', '', 'events', {
          time: ed.time, name: ev.name, int: ev.int, float: ev.float, string: ev.string,
        }));
      });
      form.appendChild(put);
      wrap.appendChild(form);
    }

    if (ed.animating && sk.animations.length) wrap.appendChild(this.previewSection());

    this.host.replaceChildren(wrap);
  }

  // Aperçu des mélanges : plusieurs pistes, fondus entre animations, file d'attente.
  previewSection() {
    const ed = this.editor;
    const sk = ed.skeleton;
    const box = document.createElement('div');
    box.appendChild(header('Aperçu des mélanges', []));
    const form = document.createElement('div');
    form.className = 'props preview-box';
    const mixRow = document.createElement('label');
    mixRow.className = 'prop-row';
    const mixLabel = document.createElement('span');
    mixLabel.textContent = 'Fondu (s)';
    const mix = document.createElement('input');
    mix.type = 'number';
    mix.step = '0.05';
    mix.min = '0';
    mix.value = String(ed.previewMix);
    mix.addEventListener('change', () => {
      ed.previewMix = Math.max(0, Number(mix.value) || 0);
      if (ed.preview) ed.preview.defaultMix = ed.previewMix;
    });
    mixRow.append(mixLabel, mix);
    form.appendChild(mixRow);
    this.previewChoice ??= [];
    for (let track = 0; track < 3; track++) {
      const row = document.createElement('div');
      row.className = 'preview-track';
      const lab = document.createElement('span');
      lab.textContent = `Piste ${track}`;
      const sel = document.createElement('select');
      sel.appendChild(new Option('—', ''));
      for (const a of sk.animations) sel.appendChild(new Option(a.name, a.name));
      sel.value = this.previewChoice[track]?.name ?? (track === 0 ? ed.animationName ?? '' : '');
      const loop = document.createElement('input');
      loop.type = 'checkbox';
      loop.checked = this.previewChoice[track]?.loop ?? true;
      loop.title = 'En boucle';
      const save = () => {
        this.previewChoice[track] = { name: sel.value, loop: loop.checked };
      };
      sel.addEventListener('change', save);
      loop.addEventListener('change', save);
      const act = (text, title, fn) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        b.title = title;
        b.addEventListener('click', () => {
          save();
          const st = ed.preview ?? ed.startPreview();
          if (!st) return;
          fn(st, sel.value ? sk.findAnimation(sel.value) : null, loop.checked);
          ed.playing = true;
          ed.emit('preview');
        });
        return b;
      };
      row.append(lab, sel, loop,
        act('▶', 'Lancer sur cette piste (fondu depuis l\'animation en cours)', (st, a, l) => (a ? st.setAnimation(track, a, l) : st.setEmptyAnimation(track, ed.previewMix))),
        act('⤵', 'Enchaîner après l\'animation en cours de cette piste', (st, a, l) => a && st.addAnimation(track, a, l, 0)),
        act('∅', 'Vider la piste (fondu)', (st) => st.setEmptyAnimation(track, ed.previewMix)));
      form.appendChild(row);
    }
    const stop = document.createElement('button');
    stop.type = 'button';
    stop.className = 'prop-button';
    stop.textContent = ed.preview ? '■ Arrêter l\'aperçu (retour à la timeline)' : 'L\'aperçu démarre au premier ▶';
    stop.disabled = !ed.preview;
    stop.addEventListener('click', () => ed.stopPreview());
    form.appendChild(stop);
    box.appendChild(form);
    return box;
  }
}

function header(title, buttons) {
  const h = document.createElement('div');
  h.className = 'anim-head';
  const t = document.createElement('span');
  t.textContent = title;
  h.appendChild(t);
  const actions = document.createElement('span');
  actions.className = 'panel-actions';
  for (const [text, label, fn] of buttons) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.title = label;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', fn);
    actions.appendChild(b);
  }
  h.appendChild(actions);
  return h;
}

function note(text) {
  const p = document.createElement('p');
  p.className = 'empty-note';
  p.textContent = text;
  return p;
}

function rename(label, oldName, onRename, onCancel) {
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
    if (ok && input.value.trim() && input.value.trim() !== oldName) onRename(input.value);
    else onCancel();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
    e.stopPropagation();
  });
  input.addEventListener('blur', () => finish(true));
}

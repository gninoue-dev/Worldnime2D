// Le « réalisateur » des tutoriels vidéo : il pilote la vraie interface comme un utilisateur
// (curseur visible, clics, glisser, clavier) et ajoute ce qu'il faut à l'écran pour un débutant :
// cartes de titre, encadrés, touches pressées, menus et dialogues (invisibles hors écran).

import { OVERLAY_CSS } from './overlay-css.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const raf = () => new Promise((r) => requestAnimationFrame(() => r()));

const CURSOR_SVG = `<svg viewBox="0 0 24 24" width="28" height="28">
  <path d="M3 2l15 11.5-6.3.9 3.8 7.6-3 1.5-3.8-7.7L3 20z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`;

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

export class Director {
  constructor(ctx, job, lesson) {
    this.ctx = ctx;
    this.job = job;
    this.lesson = lesson;
    this.editor = ctx.editor;
    this.viewport = ctx.viewport;
    this.api = ctx.api;
    this.pos = { x: 760, y: 470 };
    this.stepStart = performance.now();
    this.highlights = new Set();
    // Répétition accélérée (make.mjs --rapide) : tout le minutage est divisé par speed.
    this.speed = job.speed ?? 1;
    this.buildOverlay();
  }

  // --- Calque d'affichage ------------------------------------------------------------------

  buildOverlay() {
    const style = document.createElement('style');
    style.textContent = OVERLAY_CSS;
    document.head.appendChild(style);
    document.body.classList.add('tuto');

    // Barre de menus (reproduction fidèle des vrais menus de l'application).
    this.menubar = el('div', 'tuto-menubar');
    for (const m of this.job.menus) {
      const item = el('span', 'tuto-menu', escapeHtml(m.label));
      item.dataset.menu = m.label;
      this.menubar.appendChild(item);
    }
    document.body.appendChild(this.menubar);

    // Le calque passe au-dessus de tout, même des dialogues modaux (couche « top layer »).
    this.root = el('div', 'tuto-root');
    this.root.popover = 'manual';
    this.cursor = el('div', 'tuto-cursor', CURSOR_SVG);
    this.keys = el('div', 'tuto-keys');
    this.tag = el('div', 'tuto-tag');
    this.root.append(this.keys, this.tag, this.cursor);
    document.body.appendChild(this.root);
    this.root.showPopover();
    this.placeCursor();

    // Un dialogue qui s'ouvre passe devant : on remet le calque au premier plan.
    const observer = new MutationObserver(() => this.raise());
    for (const d of document.querySelectorAll('dialog')) observer.observe(d, { attributes: true, attributeFilter: ['open'] });
  }

  raise() {
    this.root.hidePopover();
    this.root.showPopover();
  }

  placeCursor() {
    this.cursor.style.transform = `translate(${this.pos.x - 4}px, ${this.pos.y - 3}px)`;
  }

  setTag(text) {
    this.tag.textContent = text;
    this.tag.classList.toggle('show', Boolean(text));
  }

  // --- Temps ---------------------------------------------------------------------------------

  wait(sec) {
    return sleep((sec * 1000) / this.speed);
  }

  // Attend un instant précis de l'étape en cours (en secondes depuis le début de la narration).
  async at(sec) {
    const ms = this.stepStart + (sec * 1000) / this.speed - performance.now();
    if (ms > 0) await sleep(ms);
  }

  // --- Cibles --------------------------------------------------------------------------------

  // Élément par sélecteur CSS, éventuellement filtré par son texte.
  $(selector, text = null) {
    const all = [...document.querySelectorAll(selector)].filter((e) => e.offsetParent !== null || e.getClientRects().length);
    const found = text == null ? all[0] : all.find((e) => e.textContent.trim() === text) ?? all.find((e) => e.textContent.includes(text));
    if (!found) throw new Error(`Élément introuvable : ${selector}${text ? ` « ${text} »` : ''}`);
    return found;
  }

  // Point de l'écran (pixels CSS) pour une cible :
  // [x, y] = point du monde dans la vue ; { x, y } = point écran ; élément ou sélecteur = son centre.
  point(target) {
    if (Array.isArray(target)) {
      const s = this.viewport.toScreen(target[0], target[1]);
      const r = this.viewport.canvas.getBoundingClientRect();
      return { x: r.left + s.x, y: r.top + s.y };
    }
    if (typeof target === 'string') target = this.$(target);
    if (target instanceof Element) {
      const r = target.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    if (target && target.el) {
      const r = (typeof target.el === 'string' ? this.$(target.el) : target.el).getBoundingClientRect();
      return { x: r.left + (target.fx ?? 0.5) * r.width + (target.dx ?? 0), y: r.top + (target.fy ?? 0.5) * r.height + (target.dy ?? 0) };
    }
    return target;
  }

  rect(target) {
    if (typeof target === 'string') target = this.$(target);
    if (target instanceof Element) return target.getBoundingClientRect();
    return target;
  }

  // --- Souris ----------------------------------------------------------------------------------

  async move(target, duration = 0.7, onStep = null) {
    const to = this.point(target);
    const from = { ...this.pos };
    const ms = (duration * 1000) / this.speed;
    const t0 = performance.now();
    for (;;) {
      await raf();
      const t = Math.min(1, (performance.now() - t0) / ms);
      const k = ease(t);
      this.pos = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
      this.placeCursor();
      onStep?.(this.pos);
      if (t >= 1) break;
    }
    return to;
  }

  ripple() {
    const r = el('div', 'tuto-ripple');
    r.style.left = `${this.pos.x}px`;
    r.style.top = `${this.pos.y}px`;
    this.root.appendChild(r);
    setTimeout(() => r.remove(), 700);
  }

  // Élément réel sous le curseur (le calque laisse passer la souris).
  under(p = this.pos) {
    return document.elementFromPoint(p.x, p.y);
  }

  pointerInit(type, p, mods = {}, button = 0) {
    const pressed = type === 'pointerdown' || type === 'pointermove' ? (button === 2 ? 2 : 1) : 0;
    return {
      bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: 'mouse', isPrimary: true,
      clientX: p.x, clientY: p.y, button: type === 'pointermove' ? -1 : button, buttons: this.down ? pressed : 0,
      shiftKey: Boolean(mods.shift), ctrlKey: Boolean(mods.ctrl), altKey: Boolean(mods.alt),
    };
  }

  async click(target, { mods = {}, duration = 0.6, button = 0, double = false } = {}) {
    if (target != null) await this.move(target, duration);
    await this.wait(0.12);
    const t = this.under();
    if (!t) return;
    const p = this.pos;
    const times = double ? 2 : 1;
    for (let i = 1; i <= times; i++) {
      this.ripple();
      this.down = true;
      t.dispatchEvent(new PointerEvent('pointerdown', this.pointerInit('pointerdown', p, mods, button)));
      t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: p.x, clientY: p.y, button, detail: i }));
      if (t.focus && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(t.tagName)) t.focus();
      await this.wait(0.06);
      this.down = false;
      t.dispatchEvent(new PointerEvent('pointerup', this.pointerInit('pointerup', p, mods, button)));
      t.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: p.x, clientY: p.y, button, detail: i }));
      if (button === 0) {
        t.dispatchEvent(new MouseEvent('click', {
          bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, detail: i,
          shiftKey: Boolean(mods.shift), ctrlKey: Boolean(mods.ctrl), altKey: Boolean(mods.alt),
        }));
      }
      if (double && i === 1) await this.wait(0.08);
    }
    if (double) t.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, detail: 2 }));
    await this.wait(0.15);
  }

  dblclick(target, opts = {}) {
    return this.click(target, { ...opts, double: true });
  }

  // Cliquer-glisser (vue, timeline, curseurs…) : le curseur suit le geste à vitesse humaine.
  async drag(from, to, { mods = {}, duration = 1, button = 0, path = null } = {}) {
    await this.move(from, 0.6);
    await this.wait(0.1);
    const t = this.under();
    this.down = true;
    this.ripple();
    t.dispatchEvent(new PointerEvent('pointerdown', this.pointerInit('pointerdown', this.pos, mods, button)));
    await this.wait(0.12);
    const send = (p) => t.dispatchEvent(new PointerEvent('pointermove', this.pointerInit('pointermove', p, mods, button)));
    const points = path ?? [to];
    for (const pt of points) await this.move(pt, duration / points.length, send);
    await this.wait(0.1);
    this.down = false;
    t.dispatchEvent(new PointerEvent('pointerup', this.pointerInit('pointerup', this.pos, mods, button)));
    await this.wait(0.15);
  }

  // Survol simple (affiche les infos de survol de la vue).
  async hover(target, duration = 0.6) {
    const send = (p) => this.under(p)?.dispatchEvent(new PointerEvent('pointermove', this.pointerInit('pointermove', p)));
    await this.move(target, duration, send);
  }

  // Molette (zoom de la vue) : plusieurs crans.
  async wheel(target, notches = 3, deltaY = -100) {
    await this.move(target, 0.5);
    const t = this.under();
    for (let i = 0; i < notches; i++) {
      t.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: this.pos.x, clientY: this.pos.y, deltaY }));
      await this.wait(0.12);
    }
  }

  // Glisser-déposer HTML (arbre, ordre d'affichage, images vers la vue).
  async dragDrop(source, target, { duration = 1.1 } = {}) {
    const src = typeof source === 'string' ? this.$(source) : source;
    await this.move(src, 0.6);
    this.ripple();
    const dt = new DataTransfer();
    const fire = (node, type, p) => node?.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: p.x, clientY: p.y }));
    fire(src, 'dragstart', this.pos);
    const ghost = el('div', 'tuto-ghost', escapeHtml(src.textContent.trim().slice(0, 40)));
    this.root.appendChild(ghost);
    let last = null;
    await this.move(target, duration, (p) => {
      ghost.style.transform = `translate(${p.x + 14}px, ${p.y + 12}px)`;
      const over = this.under(p);
      if (over !== last) {
        fire(last, 'dragleave', p);
        last = over;
        fire(over, 'dragenter', p);
      }
      fire(over, 'dragover', p);
    });
    await this.wait(0.15);
    fire(this.under(), 'drop', this.pos);
    fire(src, 'dragend', this.pos);
    ghost.remove();
    await this.wait(0.2);
  }

  // --- Clavier et champs ---------------------------------------------------------------------

  showKeys(combo, sec = 1.6) {
    this.keys.replaceChildren();
    const parts = combo.split('+').map((k) => k.trim());
    parts.forEach((k, i) => {
      if (i) this.keys.appendChild(el('span', 'tuto-plus', '+'));
      this.keys.appendChild(el('kbd', null, escapeHtml(k)));
    });
    this.keys.classList.add('show');
    clearTimeout(this.keysTimer);
    this.keysTimer = setTimeout(() => this.keys.classList.remove('show'), sec * 1000);
  }

  // Appuie sur une touche (ex. « Ctrl+Z », « K », « Suppr »). cmd : commande de menu à exécuter
  // pour les raccourcis que gère le menu natif (absent hors écran), comme Ctrl+S.
  async key(combo, cmd = null) {
    this.showKeys(combo);
    await this.wait(0.25);
    if (cmd) {
      await this.ctx.command(cmd);
    } else {
      const parts = combo.split('+').map((k) => k.trim());
      const name = parts[parts.length - 1];
      const KEYS = { Suppr: 'Delete', 'Échap': 'Escape', Espace: ' ', Entrée: 'Enter', '←': 'ArrowLeft', '→': 'ArrowRight', Origine: 'Home', Maj: 'Shift' };
      const key = KEYS[name] ?? (name.length === 1 ? name.toLowerCase() : name);
      const init = {
        key, bubbles: true, cancelable: true,
        ctrlKey: parts.includes('Ctrl'), shiftKey: parts.includes('Maj'), altKey: parts.includes('Alt'),
      };
      const target = document.activeElement && document.activeElement !== document.body ? document.activeElement : window;
      target.dispatchEvent(new KeyboardEvent('keydown', init));
      await this.wait(0.05);
      target.dispatchEvent(new KeyboardEvent('keyup', init));
    }
    await this.wait(0.3);
  }

  // Maintient une touche (Espace, Maj…) pendant une action.
  async holding(keyName, fn) {
    const key = keyName === 'Espace' ? ' ' : keyName === 'Maj' ? 'Shift' : keyName;
    this.showKeys(keyName, 30);
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, shiftKey: key === 'Shift' }));
    try {
      await fn();
    } finally {
      window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
      this.keys.classList.remove('show');
    }
  }

  // Tape une valeur dans un champ, lettre par lettre, puis valide.
  async type(target, text, { enter = true, clear = true } = {}) {
    const input = typeof target === 'string' ? this.$(target) : target;
    await this.click(input);
    input.focus();
    if (clear) {
      input.select?.();
      await this.wait(0.15);
      input.value = '';
    }
    for (const ch of String(text)) {
      input.value += ch;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await this.wait(0.07);
    }
    await this.wait(0.2);
    if (enter) {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.blur();
    }
    await this.wait(0.2);
  }

  // Choisit une option d'une liste déroulante (la liste native ne s'affiche pas : on montre une bulle).
  async choose(target, value) {
    const select = typeof target === 'string' ? this.$(target) : target;
    await this.click(select);
    const opt = [...select.options].find((o) => o.value === String(value) || o.textContent.trim() === String(value));
    if (!opt) throw new Error(`Option introuvable : ${value}`);
    const r = select.getBoundingClientRect();
    const list = el('div', 'tuto-dropdown');
    for (const o of select.options) {
      const row = el('div', o === opt ? 'on' : '', escapeHtml(o.textContent));
      list.appendChild(row);
    }
    list.style.left = `${r.left}px`;
    list.style.top = `${r.bottom + 2}px`;
    list.style.minWidth = `${r.width}px`;
    this.root.appendChild(list);
    const row = list.querySelector('.on');
    await this.wait(0.3);
    await this.move(row, 0.5);
    this.ripple();
    await this.wait(0.2);
    list.remove();
    select.value = opt.value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await this.wait(0.3);
  }

  // Coche ou décoche une case.
  async check(target, on = true) {
    const box = typeof target === 'string' ? this.$(target) : target;
    if (box.checked === on) {
      await this.move(box, 0.5);
      return;
    }
    await this.click(box);
  }

  // --- Menus et dialogues --------------------------------------------------------------------

  // Ouvre un menu de la barre (reproduit), survole l'entrée puis exécute la commande.
  async menu(menuLabel, itemLabel, cmd) {
    const head = this.menubar.querySelector(`[data-menu="${menuLabel}"]`);
    await this.move(head, 0.6);
    this.ripple();
    head.classList.add('open');
    const m = this.job.menus.find((x) => x.label === menuLabel);
    const drop = el('div', 'tuto-dropdown tuto-menudrop');
    let target = null;
    for (const it of m.items) {
      if (it.separator) {
        drop.appendChild(el('hr'));
        continue;
      }
      const row = el('div', 'tuto-mi', `<span>${escapeHtml(it.label)}</span><em>${escapeHtml(it.accelerator.replace('CmdOrCtrl', 'Ctrl'))}</em>`);
      if (it.label === itemLabel) target = row;
      drop.appendChild(row);
    }
    if (!target) throw new Error(`Entrée de menu introuvable : ${menuLabel} › ${itemLabel}`);
    const r = head.getBoundingClientRect();
    drop.style.left = `${r.left}px`;
    drop.style.top = `${r.bottom}px`;
    this.root.appendChild(drop);
    await this.wait(0.4);
    await this.move(target, 0.7);
    target.classList.add('on');
    await this.wait(0.35);
    this.ripple();
    await this.wait(0.15);
    drop.remove();
    head.classList.remove('open');
    if (cmd) await this.ctx.command(cmd);
    await this.wait(0.3);
  }

  // Le prochain dialogue natif (ouvrir, enregistrer, choisir un dossier) répondra avec ce chemin.
  async answerNext(...paths) {
    await this.api.tutorialAnswer(paths);
  }

  // Montre un dialogue de fichier simulé : titre, chemin tapé, bouton de validation.
  async fileDialog(title, shownPath, button = 'Sélectionner') {
    const box = el('div', 'tuto-filedlg', `<div class="t">${escapeHtml(title)}</div>
      <div class="b"><div class="crumbs">📁 ${escapeHtml(shownPath.replace(/[^/\\]+$/, ''))}</div>
      <label>Nom <input readonly></label></div>
      <div class="a"><span class="btn">Annuler</span><span class="btn primary">${escapeHtml(button)}</span></div>`);
    this.root.appendChild(box);
    await this.wait(0.5);
    const input = box.querySelector('input');
    const name = shownPath.replace(/^.*[/\\]/, '') || shownPath;
    for (const ch of name) {
      input.value += ch;
      await this.wait(0.05);
    }
    await this.wait(0.3);
    await this.move(box.querySelector('.primary'), 0.6);
    this.ripple();
    await this.wait(0.25);
    box.remove();
  }

  // --- Encadrés et cartes ----------------------------------------------------------------------

  // Encadre une zone, avec une étiquette. dim : assombrit le reste de l'écran.
  highlight(target, label = '', { dim = false, place = 'auto', pad = 4 } = {}) {
    const r = this.rect(target);
    const box = el('div', `tuto-hl${dim ? ' dim' : ''}`);
    Object.assign(box.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    if (label) {
      const tip = el('div', `tuto-tip ${place === 'auto' ? (r.top > 200 ? 'above' : 'below') : place}`, escapeHtml(label));
      box.appendChild(tip);
    }
    this.root.insertBefore(box, this.cursor);
    this.highlights.add(box);
    requestAnimationFrame(() => box.classList.add('show'));
    return {
      remove: () => {
        box.classList.remove('show');
        this.highlights.delete(box);
        setTimeout(() => box.remove(), 300);
      },
    };
  }

  clearHighlights() {
    for (const h of this.highlights) {
      h.classList.remove('show');
      setTimeout(() => h.remove(), 300);
    }
    this.highlights.clear();
  }

  // Bulle d'explication posée sur un point (ex. sur un os dans la vue).
  note(target, text, sec = null) {
    const p = this.point(target);
    const n = el('div', 'tuto-note', escapeHtml(text));
    n.style.left = `${p.x}px`;
    n.style.top = `${p.y}px`;
    this.root.insertBefore(n, this.cursor);
    requestAnimationFrame(() => n.classList.add('show'));
    const remove = () => {
      n.classList.remove('show');
      setTimeout(() => n.remove(), 300);
    };
    if (sec) setTimeout(remove, sec * 1000);
    this.highlights.add(n);
    return { remove };
  }

  // Carte plein écran : titre de leçon, schéma, récapitulatif.
  card({ kicker = '', title = '', subtitle = '', bullets = [], footer = '', html = '' }) {
    const c = el('div', 'tuto-card');
    c.innerHTML = `<div class="inner">
      <div class="brand"><img src="icon.png" alt=""> Formation Worldnime2D</div>
      ${kicker ? `<div class="kicker">${escapeHtml(kicker)}</div>` : ''}
      ${title ? `<h1>${escapeHtml(title)}</h1>` : ''}
      ${subtitle ? `<p class="sub">${escapeHtml(subtitle)}</p>` : ''}
      ${bullets.length ? `<ul>${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>` : ''}
      ${html}
      ${footer ? `<div class="foot">${escapeHtml(footer)}</div>` : ''}
    </div>`;
    this.root.insertBefore(c, this.cursor);
    this.cursor.style.opacity = '0';
    requestAnimationFrame(() => c.classList.add('show'));
    // Les puces apparaissent une à une.
    const items = [...c.querySelectorAll('li')];
    return {
      el: c,
      reveal: async (gap = 0.6) => {
        for (const li of items) {
          li.classList.add('on');
          await this.wait(gap);
        }
      },
      revealAt: (i) => items[i]?.classList.add('on'),
      remove: async () => {
        c.classList.remove('show');
        this.cursor.style.opacity = '1';
        await this.wait(0.5);
        c.remove();
      },
    };
  }
}

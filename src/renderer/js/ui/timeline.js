// Timeline (dopesheet) du mode Animation : barre de commandes + grille de clés dessinée sur un canvas.
//
// Lignes : Résumé, Ordre d'affichage, Événements, puis les os et les slots animés (ou sélectionnés).
// Un os se déplie pour montrer une ligne par type de clé.
// Souris : règle = tête de lecture ; Maj + glisser dans la règle = plage de lecture ;
// clic sur une clé = sélection (Maj : ajouter/retirer) ; glisser des clés = les déplacer ;
// Alt + glisser des clés = les étirer dans le temps ; glisser dans le vide = sélection par rectangle ;
// molette = défiler ; Ctrl + molette = zoom ; Maj + molette = défiler dans le temps.

import { BONE_TIMELINES, SLOT_TIMELINES, TIMELINE_LABELS, TIME_EPSILON } from '../model/animation.js';
import { CURVE_PRESETS, isBezier } from '../model/curve.js';
import { GraphView } from './graph.js';

const NAME_W = 190;
const RULER_H = 22;
const ROW_H = 20;
const MIN_PPF = 2;
const MAX_PPF = 48;

const TYPE_COLORS = {
  rotate: '#66bb6a',
  translate: '#42a5f5',
  scale: '#ef5350',
  shear: '#ffa726',
  attachment: '#ffd54f',
  rgba: '#ce93d8',
  rgba2: '#ba68c8',
  drawOrder: '#90a4ae',
  events: '#fff176',
};

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export class TimelinePanel {
  constructor(editor, host, notify) {
    this.editor = editor;
    this.host = host;
    this.notify = notify;
    this.ppf = 12;
    this.scrollX = 0;
    this.scrollY = 0;
    this.expanded = new Set();
    this.drag = null;
    // Vue « keys » (dopesheet) ou « graph » (éditeur de courbes).
    this.view = 'keys';
    this.graph = new GraphView(this);
    this.build();
    editor.addEventListener('change', (e) => {
      if (['time', 'drag'].includes(e.detail.reason)) {
        this.followPlayhead();
        this.draw();
        this.refreshToolbar(true);
      } else {
        this.refreshToolbar();
        this.draw();
      }
    });
    new ResizeObserver(() => this.draw()).observe(this.body);
  }

  // --- Barre de commandes -------------------------------------------------------------

  build() {
    const bar = document.createElement('div');
    bar.className = 'tl-bar';
    const btn = (text, title, onClick, cls = '') => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.title = title;
      b.setAttribute('aria-label', title);
      if (cls) b.className = cls;
      b.addEventListener('click', onClick);
      bar.appendChild(b);
      return b;
    };
    const sep = () => {
      const s = document.createElement('span');
      s.className = 'sep';
      bar.appendChild(s);
    };
    const labelled = (text, el) => {
      const l = document.createElement('label');
      l.className = 'tl-field';
      l.append(text, el);
      bar.appendChild(l);
      return el;
    };
    const ed = this.editor;

    this.animSelect = labelled('', document.createElement('select'));
    this.animSelect.title = 'Animation en cours';
    this.animSelect.addEventListener('change', () => ed.setAnimation(this.animSelect.value));
    sep();
    btn('⏮', 'Début (Origine)', () => ed.setTime(0));
    btn('◆◀', 'Clé précédente (Maj+←)', () => this.jumpKey(-1));
    btn('◀', 'Image précédente (←)', () => ed.setFrame(ed.frame - 1));
    this.playBtn = btn('▶', 'Lecture / pause (P)', () => ed.togglePlay(), 'tl-play');
    btn('▶', 'Image suivante (→)', () => ed.setFrame(ed.frame + 1)).classList.add('tl-next');
    btn('▶◆', 'Clé suivante (Maj+→)', () => this.jumpKey(1));
    btn('⏭', 'Fin', () => ed.setTime(ed.animation?.duration ?? 0));
    this.rangeBtn = btn('⟷ ×', 'Retirer la plage de lecture (Maj + glisser dans la règle pour en créer une)', () => ed.setRange(null), 'tl-range');
    sep();
    this.frameInput = labelled('Image ', document.createElement('input'));
    this.frameInput.type = 'number';
    this.frameInput.min = '0';
    this.frameInput.className = 'tl-frame';
    this.frameInput.addEventListener('change', () => ed.setFrame(Number(this.frameInput.value) || 0));
    this.durationLabel = document.createElement('span');
    this.durationLabel.className = 'tl-duration';
    bar.appendChild(this.durationLabel);
    sep();
    this.loopBox = labelled('Boucle ', document.createElement('input'));
    this.loopBox.type = 'checkbox';
    this.loopBox.addEventListener('change', () => {
      ed.loop = this.loopBox.checked;
    });
    this.speedSelect = labelled('Vitesse ', document.createElement('select'));
    for (const v of [0.1, 0.25, 0.5, 1, 1.5, 2]) this.speedSelect.appendChild(new Option(`×${v}`, String(v)));
    this.speedSelect.addEventListener('change', () => {
      ed.speed = Number(this.speedSelect.value);
    });
    this.fpsSelect = labelled('IPS ', document.createElement('select'));
    for (const v of [12, 15, 24, 25, 30, 48, 50, 60]) this.fpsSelect.appendChild(new Option(String(v), String(v)));
    this.fpsSelect.title = 'Images par seconde de la timeline';
    this.fpsSelect.addEventListener('change', () => {
      ed.apply(() => {
        ed.skeleton.fps = Number(this.fpsSelect.value);
      });
    });
    sep();
    this.autoKeyBtn = btn('● Clé auto', 'Clé automatique : chaque transformation crée une clé', () => {
      ed.autoKey = !ed.autoKey;
      this.refreshToolbar();
    }, 'tl-toggle');
    this.onionBtn = btn('Pelure d\'oignon', 'Afficher les images voisines en transparence', () => {
      ed.onion = !ed.onion;
      ed.emit('onion');
    }, 'tl-toggle');
    btn('◆ Clé', 'Poser une clé de rotation, position et échelle sur l\'os sélectionné (K)', () => this.keySelected());
    this.graphBtn = btn('∿ Courbes', 'Basculer entre la vue des clés et l\'éditeur de courbes (G)', () => this.toggleView(), 'tl-toggle');
    sep();
    this.curveSelect = labelled('Courbe ', document.createElement('select'));
    this.curveSelect.title = 'Courbe des clés sélectionnées (vers la clé suivante)';
    this.curveSelect.appendChild(new Option('—', ''));
    for (const [id, p] of Object.entries(CURVE_PRESETS)) this.curveSelect.appendChild(new Option(p.label, id));
    this.curveSelect.appendChild(new Option('Personnalisée', 'custom'));
    this.curveSelect.addEventListener('change', () => {
      const p = CURVE_PRESETS[this.curveSelect.value];
      if (p) ed.setCurve(p.curve);
    });

    this.body = document.createElement('div');
    this.body.className = 'tl-body';
    this.canvas = document.createElement('canvas');
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('aria-label', 'Timeline des clés');
    this.body.appendChild(this.canvas);
    this.host.replaceChildren(bar, this.body);
    this.bindCanvas();
    this.refreshToolbar();
  }

  refreshToolbar(timeOnly = false) {
    const ed = this.editor;
    const anim = ed.animation;
    if (document.activeElement !== this.frameInput) this.frameInput.value = String(ed.frame);
    this.playBtn.textContent = ed.playing ? '⏸' : '▶';
    if (timeOnly) return;
    const sk = ed.skeleton;
    const names = sk.animations.map((a) => a.name);
    if ([...this.animSelect.options].map((o) => o.value).join('\n') !== names.join('\n')) {
      this.animSelect.replaceChildren(...names.map((n) => new Option(n, n)));
    }
    this.animSelect.value = ed.animationName ?? '';
    const d = anim?.duration ?? 0;
    this.durationLabel.textContent = `/ ${Math.round(d * ed.fps)}  (${d.toFixed(2)} s)`;
    this.loopBox.checked = ed.loop;
    this.speedSelect.value = String(ed.speed);
    if (![...this.fpsSelect.options].some((o) => o.value === String(sk.fps))) this.fpsSelect.appendChild(new Option(String(sk.fps), String(sk.fps)));
    this.fpsSelect.value = String(sk.fps);
    this.autoKeyBtn.classList.toggle('on', ed.autoKey);
    this.rangeBtn.hidden = !ed.range;
    if (ed.range) this.rangeBtn.textContent = `⟷ ${ed.range.start}–${ed.range.end} ×`;
    this.onionBtn.classList.toggle('on', ed.onion);
    const keys = ed.selectedKeys.filter((e) => e.key.curve !== undefined || e.type !== 'attachment');
    this.curveSelect.disabled = keys.length === 0;
    this.curveSelect.value = keys.length ? curveId(keys[0].key.curve) : '';
  }

  toggleView() {
    this.view = this.view === 'keys' ? 'graph' : 'keys';
    this.graphBtn.classList.toggle('on', this.view === 'graph');
    this.draw();
  }

  jumpKey(dir) {
    const ed = this.editor;
    const times = ed.keyTimes();
    const t = ed.time;
    const next = dir > 0 ? times.find((x) => x > t + TIME_EPSILON) : [...times].reverse().find((x) => x < t - TIME_EPSILON);
    if (next !== undefined) ed.setTime(next);
  }

  keySelected() {
    const ed = this.editor;
    if (!ed.animation) return;
    if (ed.selectionKind !== 'bone') {
      this.notify('Sélectionnez un os pour poser une clé.');
      return;
    }
    const bone = ed.selected;
    ed.apply(() => ed.keyBone(bone, ['rotate', 'translate', 'scale']));
  }

  // --- Lignes ------------------------------------------------------------------------------

  rows() {
    const ed = this.editor;
    const anim = ed.animation;
    const sk = ed.skeleton;
    const rows = [];
    if (!anim) return rows;
    const all = [...anim.timelines()];
    rows.push({ kind: 'summary', label: 'Résumé', depth: 0, tls: all });
    rows.push({ kind: 'drawOrder', label: TIMELINE_LABELS.drawOrder, depth: 0, tls: anim.drawOrder.length ? [{ owner: 'drawOrder', name: '', type: 'drawOrder', keys: anim.drawOrder }] : [] });
    rows.push({ kind: 'events', label: TIMELINE_LABELS.events, depth: 0, tls: anim.events.length ? [{ owner: 'events', name: '', type: 'events', keys: anim.events }] : [] });

    for (const bone of sk.bones) {
      const tls = anim.bones.get(bone.name);
      const selected = ed.selected === bone && ed.selectionKind === 'bone';
      if (!tls && !selected) continue;
      const list = Object.entries(tls ?? {}).map(([type, keys]) => ({ owner: 'bone', name: bone.name, type, keys }));
      const key = `b:${bone.name}`;
      rows.push({ kind: 'bone', bone, label: bone.name, depth: 0, tls: list, key, selected, expandable: true });
      if (this.expanded.has(key)) {
        for (const type of BONE_TIMELINES) {
          const keys = tls?.[type];
          rows.push({
            kind: 'sub', bone, label: TIMELINE_LABELS[type], depth: 1, type,
            tls: keys ? [{ owner: 'bone', name: bone.name, type, keys }] : [],
          });
        }
      }
    }
    for (const slot of sk.slots) {
      const tls = anim.slots.get(slot.name);
      const selected = ed.selectedSlot === slot;
      if (!tls && !selected) continue;
      const list = Object.entries(tls ?? {}).map(([type, keys]) => ({ owner: 'slot', name: slot.name, type, keys }));
      const key = `s:${slot.name}`;
      rows.push({ kind: 'slot', slot, label: `▢ ${slot.name}`, depth: 0, tls: list, key, selected, expandable: true });
      if (this.expanded.has(key)) {
        for (const type of SLOT_TIMELINES) {
          const keys = tls?.[type];
          if (!keys) continue;
          rows.push({ kind: 'sub', slot, label: TIMELINE_LABELS[type], depth: 1, type, tls: [{ owner: 'slot', name: slot.name, type, keys }] });
        }
      }
    }
    return rows;
  }

  // Clés d'une ligne regroupées par image : Map image → [{ owner, name, type, key }].
  keysByFrame(row) {
    const fps = this.editor.fps;
    const map = new Map();
    for (const tl of row.tls) {
      for (const key of tl.keys) {
        const f = Math.round(key.time * fps);
        if (!map.has(f)) map.set(f, []);
        map.get(f).push({ owner: tl.owner, name: tl.name, type: tl.type, key });
      }
    }
    return map;
  }

  // --- Coordonnées --------------------------------------------------------------------------

  frameToX(f) {
    return NAME_W + 10 + f * this.ppf - this.scrollX;
  }

  xToFrame(x) {
    return Math.max(0, Math.round((x - NAME_W - 10 + this.scrollX) / this.ppf));
  }

  rowAt(y, rows) {
    if (y < RULER_H) return -1;
    const i = Math.floor((y - RULER_H + this.scrollY) / ROW_H);
    return i >= 0 && i < rows.length ? i : -1;
  }

  // Garde la tête de lecture visible pendant la lecture.
  followPlayhead() {
    const x = this.frameToX(this.editor.time * this.editor.fps);
    const w = this.canvas.clientWidth;
    if (x > w - 30) this.scrollX += x - (w - 30) + (w - NAME_W) * 0.5;
    if (x < NAME_W + 10) this.scrollX = Math.max(0, this.scrollX - (NAME_W + 10 - x) - 20);
  }

  // --- Dessin -------------------------------------------------------------------------------

  draw() {
    const canvas = this.canvas;
    const w = this.body.clientWidth;
    const h = this.body.clientHeight;
    if (!w || !h || this.host.hidden) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ed = this.editor;
    const anim = ed.animation;
    const fps = ed.fps;
    const rows = this.rows();
    this.lastRows = rows;
    const maxScrollY = Math.max(0, rows.length * ROW_H - (h - RULER_H));
    this.scrollY = Math.min(this.scrollY, maxScrollY);

    ctx.fillStyle = css('--panel') || '#252526';
    ctx.fillRect(0, 0, w, h);
    ctx.font = '11px system-ui, sans-serif';
    ctx.textBaseline = 'middle';

    const duration = anim ? Math.round(anim.duration * fps) : 0;
    // Zone hors durée assombrie.
    const endX = this.frameToX(duration);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(Math.max(NAME_W, endX), RULER_H, w, h);
    // Plage de lecture.
    const range = this.drag?.kind === 'range' ? { start: this.drag.a, end: this.drag.b } : ed.range;
    if (range) {
      const x0 = Math.max(NAME_W, this.frameToX(Math.min(range.start, range.end)));
      const x1 = this.frameToX(Math.max(range.start, range.end));
      ctx.fillStyle = 'rgba(102,187,106,0.10)';
      if (x1 > x0) ctx.fillRect(x0, 0, x1 - x0, h);
    }

    if (this.view === 'graph') {
      ctx.save();
      this.graph.draw(ctx, w, h, NAME_W, RULER_H, TYPE_COLORS);
      ctx.restore();
    } else this.drawRows(ctx, w, h, rows, ed);

    this.drawRulerAndHead(ctx, w, h, ed, anim, fps, duration, endX);
  }

  drawRows(ctx, w, h, rows, ed) {
    const fps = ed.fps;
    // Lignes.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, RULER_H, w, h - RULER_H);
    ctx.clip();
    rows.forEach((row, i) => {
      const y = RULER_H + i * ROW_H - this.scrollY;
      if (y + ROW_H < RULER_H || y > h) return;
      if (row.selected) {
        ctx.fillStyle = 'rgba(79,195,247,0.16)';
        ctx.fillRect(0, y, w, ROW_H);
      } else if (i % 2) {
        ctx.fillStyle = 'rgba(255,255,255,0.025)';
        ctx.fillRect(0, y, w, ROW_H);
      }
      // Nom.
      ctx.fillStyle = row.kind === 'sub' ? '#9a9a9a' : row.kind === 'summary' ? '#e0e0e0' : '#cfcfcf';
      const indent = 8 + row.depth * 14;
      if (row.expandable) ctx.fillText(this.expanded.has(row.key) ? '▾' : '▸', indent, y + ROW_H / 2);
      if (row.kind === 'sub') {
        ctx.fillStyle = TYPE_COLORS[row.type];
        ctx.fillRect(indent + 2, y + ROW_H / 2 - 3, 6, 6);
        ctx.fillStyle = '#9a9a9a';
      }
      ctx.fillText(row.label, indent + 14, y + ROW_H / 2, NAME_W - indent - 20);
    });

    // Grille des images.
    ctx.beginPath();
    ctx.rect(NAME_W, RULER_H, w - NAME_W, h - RULER_H);
    ctx.clip();
    const step = this.ppf >= 8 ? 1 : this.ppf >= 4 ? 5 : 10;
    const first = this.firstFrame(step);
    for (let f = first; this.frameToX(f) < w; f += step) {
      const x = Math.round(this.frameToX(f)) + 0.5;
      ctx.strokeStyle = f % (step * 5) === 0 ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.04)';
      ctx.beginPath();
      ctx.moveTo(x, RULER_H);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Clés.
    rows.forEach((row, i) => {
      const y = RULER_H + i * ROW_H - this.scrollY + ROW_H / 2;
      if (y < RULER_H - ROW_H || y > h + ROW_H) return;
      const byFrame = this.keysByFrame(row);
      const frames = [...byFrame.keys()].sort((a, b) => a - b);
      // Trait entre deux clés identiques consécutives d'une ligne simple (valeur tenue).
      for (const [f, entries] of byFrame) {
        const x = this.frameToX(f);
        if (x < NAME_W - 8 || x > w + 8) continue;
        const selected = entries.some((e) => ed.isKeySelected(e.key));
        const type = entries.length === 1 || entries.every((e) => e.type === entries[0].type) ? entries[0].type : null;
        const color = selected ? '#4fc3f7' : row.kind === 'summary' ? '#d0d0d0' : TYPE_COLORS[type] ?? '#d0d0d0';
        const curve = entries[0].key.curve;
        drawKey(ctx, x, y, color, curve, entries.length > 1 && row.kind !== 'summary');
      }
      if (frames.length && row.kind === 'sub') {
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        ctx.moveTo(this.frameToX(frames[0]), y);
        ctx.lineTo(this.frameToX(frames.at(-1)), y);
        ctx.stroke();
      }
    });
    ctx.restore();

    // Rectangle de sélection.
    if (this.drag?.kind === 'box') {
      const b = this.drag;
      ctx.strokeStyle = '#4fc3f7';
      ctx.fillStyle = 'rgba(79,195,247,0.12)';
      const x = Math.min(b.x0, b.x1);
      const y = Math.min(b.y0, b.y1);
      ctx.fillRect(x, y, Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
      ctx.strokeRect(x + 0.5, y + 0.5, Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
    }

  }

  firstFrame(step) {
    return Math.max(0, Math.floor((this.scrollX - 10) / this.ppf / step) * step);
  }

  drawRulerAndHead(ctx, w, h, ed, anim, fps, duration, endX) {
    const first = this.firstFrame(1);
    // Règle.
    ctx.fillStyle = css('--panel-head') || '#2d2d30';
    ctx.fillRect(0, 0, w, RULER_H);
    ctx.fillStyle = '#8b8b8b';
    ctx.textAlign = 'center';
    const labelStep = [1, 2, 5, 10, 20, 50, 100].find((s) => s * this.ppf >= 34) ?? 100;
    ctx.save();
    ctx.beginPath();
    ctx.rect(NAME_W, 0, w - NAME_W, RULER_H);
    ctx.clip();
    for (let f = Math.floor(first / labelStep) * labelStep; this.frameToX(f) < w + 20; f += labelStep) {
      const x = this.frameToX(f);
      ctx.fillText(String(f), x, RULER_H / 2);
      ctx.fillRect(Math.round(x), RULER_H - 4, 1, 4);
    }
    // Fin de l'animation.
    if (duration > 0) {
      ctx.fillStyle = '#ffb74d';
      ctx.fillRect(Math.round(endX) - 1, 0, 2, RULER_H);
    }
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#8b8b8b';
    ctx.fillText(anim ? `${anim.name} · ${anim.keyCount} clés` : 'Aucune animation', 8, RULER_H / 2, NAME_W - 14);

    // Tête de lecture.
    const px = this.frameToX(ed.time * fps);
    if (px >= NAME_W) {
      ctx.fillStyle = '#e53935';
      ctx.fillRect(Math.round(px) - 1, 0, 2, h);
      ctx.beginPath();
      ctx.moveTo(px - 6, 0);
      ctx.lineTo(px + 6, 0);
      ctx.lineTo(px, 8);
      ctx.fill();
    }
    // Séparation noms / clés.
    ctx.fillStyle = css('--border') || '#3c3c3c';
    ctx.fillRect(NAME_W, 0, 1, h);
  }

  // --- Souris -------------------------------------------------------------------------------

  bindCanvas() {
    const c = this.canvas;
    const pos = (e) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const p = pos(e);
        const f = (p.x - NAME_W - 10 + this.scrollX) / this.ppf;
        this.ppf = Math.min(MAX_PPF, Math.max(MIN_PPF, this.ppf * Math.exp(-e.deltaY * 0.002)));
        this.scrollX = Math.max(0, f * this.ppf - (p.x - NAME_W - 10));
      } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        this.scrollX = Math.max(0, this.scrollX + (e.deltaX || e.deltaY));
      } else {
        this.scrollY = Math.max(0, this.scrollY + e.deltaY * 0.5);
      }
      this.draw();
    }, { passive: false });

    c.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      c.focus();
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        // Événements simulés.
      }
      const p = pos(e);
      const ed = this.editor;
      if (!ed.animation) return;
      const rows = this.lastRows ?? this.rows();

      if (p.y < RULER_H && p.x > NAME_W && e.shiftKey) {
        const f0 = this.xToFrame(p.x);
        this.drag = { kind: 'range', a: f0, b: f0 };
        return;
      }
      if (p.y < RULER_H && p.x > NAME_W) {
        this.drag = { kind: 'scrub' };
        ed.playing = false;
        ed.setFrame(this.xToFrame(p.x));
        return;
      }
      if (this.view === 'graph') {
        if (p.x > NAME_W && this.graph.down(p, e)) {
          this.drag = { kind: 'graph' };
          return;
        }
        // Clic dans le vide : désélection et tête de lecture.
        if (p.x > NAME_W) {
          if (!e.shiftKey) ed.selectKeys([]);
          ed.setFrame(this.xToFrame(p.x));
        }
        return;
      }
      const ri = this.rowAt(p.y, rows);
      if (ri < 0) return;
      const row = rows[ri];
      if (p.x < NAME_W) {
        if (row.expandable && p.x < 8 + row.depth * 14 + 14) {
          if (this.expanded.has(row.key)) this.expanded.delete(row.key);
          else this.expanded.add(row.key);
          this.draw();
        } else if (row.bone && row.kind === 'bone') ed.select(row.bone);
        else if (row.slot && row.kind === 'slot') ed.selectSlot(row.slot);
        return;
      }
      // Clé sous le pointeur ?
      const f = this.xToFrame(p.x);
      const byFrame = this.keysByFrame(row);
      const hitFrame = [f, f - 1, f + 1].find((ff) => byFrame.has(ff) && Math.abs(this.frameToX(ff) - p.x) <= Math.max(6, this.ppf / 2));
      if (hitFrame !== undefined) {
        const entries = byFrame.get(hitFrame);
        const allSelected = entries.every((x) => ed.isKeySelected(x.key));
        if (e.shiftKey) ed.selectKeys(entries, true);
        else if (!allSelected) ed.selectKeys(entries);
        if (e.altKey && ed.selectedKeys.length > 1) {
          // Étirement : pivot = la première clé sélectionnée.
          const originals = new Map(ed.selectedKeys.map((x) => [x.key, x.key.time]));
          const pivot = Math.min(...originals.values());
          this.drag = { kind: 'scale', pivot, originals, startX: p.x, pivotX: this.frameToX(pivot * ed.fps), began: false };
          return;
        }
        this.drag = { kind: 'keys', startFrame: f, applied: 0, began: false };
        return;
      }
      this.drag = { kind: 'box', x0: p.x, y0: p.y, x1: p.x, y1: p.y, add: e.shiftKey };
    });

    c.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d) return;
      const p = pos(e);
      const ed = this.editor;
      if (d.kind === 'scrub') {
        ed.setFrame(this.xToFrame(p.x));
      } else if (d.kind === 'graph') {
        this.graph.move(p);
      } else if (d.kind === 'range') {
        d.b = this.xToFrame(p.x);
        this.draw();
      } else if (d.kind === 'scale') {
        const span = d.startX - d.pivotX;
        if (Math.abs(span) < 2) return;
        if (!d.began) {
          ed.begin();
          d.began = true;
        }
        ed.scaleSelectedKeys(Math.max(0.05, (p.x - d.pivotX) / span), d.pivot, d.originals);
        ed.refreshPose();
        ed.emit('drag');
      } else if (d.kind === 'keys') {
        const df = this.xToFrame(p.x) - d.startFrame;
        if (df !== d.applied) {
          if (!d.began) {
            ed.begin();
            d.began = true;
          }
          ed.moveSelectedKeys(df - d.applied);
          d.applied = df;
          ed.refreshPose();
          ed.emit('drag');
        }
      } else if (d.kind === 'box') {
        d.x1 = p.x;
        d.y1 = p.y;
        this.draw();
      }
    });

    const end = (e) => {
      const d = this.drag;
      this.drag = null;
      if (!d) return;
      const ed = this.editor;
      if (d.kind === 'graph') {
        this.graph.up();
      } else if (d.kind === 'range') {
        ed.setRange(d.a, d.b);
      } else if ((d.kind === 'keys' || d.kind === 'scale') && d.began) {
        ed.commit();
        ed.emit('keys');
      } else if (d.kind === 'box') {
        const p = pos(e);
        if (Math.abs(p.x - d.x0) < 3 && Math.abs(p.y - d.y0) < 3) {
          // Simple clic dans le vide : désélection et déplacement de la tête de lecture.
          if (!d.add) ed.selectKeys([]);
          ed.setFrame(this.xToFrame(p.x));
          return;
        }
        const rows = this.lastRows ?? [];
        const f0 = this.xToFrame(Math.min(d.x0, p.x) - this.ppf / 2 + 1);
        const f1 = this.xToFrame(Math.max(d.x0, p.x) + this.ppf / 2 - 1);
        const r0 = this.rowAt(Math.max(RULER_H, Math.min(d.y0, p.y)), rows);
        const r1 = this.rowAt(Math.max(d.y0, p.y), rows);
        const entries = [];
        for (let i = Math.max(0, r0); i <= (r1 < 0 ? rows.length - 1 : r1); i++) {
          // Le résumé contient tout : on ne l'inclut que s'il est la seule ligne du rectangle.
          if (rows[i].kind === 'summary' && r1 !== r0) continue;
          for (const [f, list] of this.keysByFrame(rows[i])) if (f >= f0 && f <= f1) entries.push(...list);
        }
        const unique = [...new Map(entries.map((x) => [x.key, x])).values()];
        ed.selectKeys(unique, d.add);
      }
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', () => {
      if ((this.drag?.kind === 'keys' || this.drag?.kind === 'scale') && this.drag.began) this.editor.cancel();
      if (this.drag?.kind === 'graph') this.graph.cancel();
      this.drag = null;
      this.draw();
    });
    c.addEventListener('dblclick', (e) => {
      const p = pos(e);
      if (p.x > NAME_W && p.y > RULER_H) this.editor.setFrame(this.xToFrame(p.x));
    });
  }
}

function curveId(curve) {
  if (curve === undefined || curve === 'linear') return 'linear';
  if (curve === 'stepped') return 'stepped';
  for (const [id, p] of Object.entries(CURVE_PRESETS)) {
    if (isBezier(p.curve) && isBezier(curve) && p.curve.every((v, i) => Math.abs(v - curve[i]) < 1e-4)) return id;
  }
  return 'custom';
}

// Losange = linéaire, carré = palier, rond = courbe de Bézier.
function drawKey(ctx, x, y, color, curve, multiple) {
  const r = 5;
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (curve === 'stepped') ctx.rect(x - r + 1, y - r + 1, 2 * r - 2, 2 * r - 2);
  else if (isBezier(curve)) ctx.arc(x, y, r - 0.5, 0, Math.PI * 2);
  else {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
  if (multiple) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }
}

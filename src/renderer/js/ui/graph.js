// Éditeur de courbes (vue « Courbes » de la timeline).
//
// Trace dans le temps chaque valeur animée de l'os sélectionné (ou des timelines des clés sélectionnées).
// Points = clés : clic pour sélectionner (Maj : ajouter), glisser verticalement pour changer la valeur,
// Alt + glisser pour changer le temps. Poignées = courbe de Bézier vers la clé suivante : glisser pour la modifier.
//
// La courbe d'une clé est normalisée (temps et valeur de 0 à 1 entre cette clé et la suivante),
// partagée par les deux valeurs d'une clé (X et Y). Sur un segment où la valeur ne change pas,
// seule l'allure dans le temps compte.

import { evaluateCurve, isBezier } from '../model/curve.js';

// Valeurs tracées par type de timeline : [champ, libellé, style de trait].
const CHANNELS = {
  rotate: [['value', 'Rotation', []]],
  translate: [['x', 'Position X', []], ['y', 'Position Y', [5, 3]]],
  scale: [['x', 'Échelle X', []], ['y', 'Échelle Y', [5, 3]]],
  shear: [['x', 'Cisaillement X', []], ['y', 'Cisaillement Y', [5, 3]]],
};

const HANDLE_R = 5;

export class GraphView {
  constructor(panel) {
    this.panel = panel;
    this.editor = panel.editor;
    this.drag = null;
  }

  // Timelines tracées : celles de l'os sélectionné, sinon celles des clés sélectionnées.
  channels() {
    const ed = this.editor;
    const anim = ed.animation;
    if (!anim) return [];
    const out = [];
    const seen = new Set();
    const add = (owner, name, type, keys) => {
      const id = `${owner}/${name}/${type}`;
      if (seen.has(id) || !CHANNELS[type]) return;
      seen.add(id);
      for (const [field, label, dash] of CHANNELS[type]) out.push({ owner, name, type, keys, field, label: `${name} · ${label}`, dash });
    };
    if (ed.selectionKind === 'bone') {
      for (const [type, keys] of Object.entries(anim.bones.get(ed.selected.name) ?? {})) add('bone', ed.selected.name, type, keys);
    }
    for (const e of ed.selectedKeys) {
      const keys = anim.timeline(e.owner, e.name, e.type);
      if (keys) add(e.owner, e.name, e.type, keys);
    }
    return out;
  }

  // Échelle verticale : toutes les valeurs (et poignées) visibles, avec une marge.
  fit(channels, top, bottom) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of channels) {
      c.keys.forEach((k, i) => {
        const v = k[c.field];
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
        const n = c.keys[i + 1];
        if (n && isBezier(k.curve)) {
          for (const y of [k.curve[1], k.curve[3]]) {
            const hv = v + (n[c.field] - v) * y;
            lo = Math.min(lo, hv);
            hi = Math.max(hi, hv);
          }
        }
      });
    }
    if (!Number.isFinite(lo)) {
      lo = -1;
      hi = 1;
    }
    if (hi - lo < 1e-6) {
      lo -= 1;
      hi += 1;
    }
    const pad = (hi - lo) * 0.12;
    lo -= pad;
    hi += pad;
    this.vlo = lo;
    this.vhi = hi;
    this.top = top;
    this.bottom = bottom;
  }

  valueToY(v) {
    return this.bottom - ((v - this.vlo) / (this.vhi - this.vlo)) * (this.bottom - this.top);
  }

  yToValue(y) {
    return this.vlo + ((this.bottom - y) / (this.bottom - this.top)) * (this.vhi - this.vlo);
  }

  timeToX(t) {
    return this.panel.frameToX(t * this.editor.fps);
  }

  // Poignées (coordonnées écran) de la courbe de la clé i d'un canal.
  handles(c, i) {
    const k = c.keys[i];
    const n = c.keys[i + 1];
    if (!n || k.curve === 'stepped') return null;
    const curve = isBezier(k.curve) ? k.curve : [1 / 3, 1 / 3, 2 / 3, 2 / 3];
    const x0 = this.timeToX(k.time);
    const x1 = this.timeToX(n.time);
    const v0 = k[c.field];
    const dv = n[c.field] - v0;
    // Segment plat : les poignées restent sur la ligne (seule l'allure dans le temps compte).
    const hy = (y) => this.valueToY(Math.abs(dv) < 1e-9 ? v0 : v0 + dv * y);
    return [
      { x: x0 + (x1 - x0) * curve[0], y: hy(curve[1]), which: 0 },
      { x: x0 + (x1 - x0) * curve[2], y: hy(curve[3]), which: 1 },
    ];
  }

  draw(ctx, w, h, nameW, rulerH, colors) {
    const ed = this.editor;
    const channels = this.channels();
    this.lastChannels = channels;
    this.fit(channels, rulerH + 14, h - 14);

    // Légende à gauche.
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, rulerH, nameW, h - rulerH);
    ctx.font = '11px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    if (channels.length === 0) {
      ctx.fillStyle = '#8b8b8b';
      ctx.fillText('Sélectionnez un os animé', 10, rulerH + 16, nameW - 16);
      ctx.fillText('ou des clés pour voir', 10, rulerH + 32, nameW - 16);
      ctx.fillText('leurs courbes.', 10, rulerH + 48, nameW - 16);
    }
    channels.forEach((c, i) => {
      const y = rulerH + 14 + i * 16;
      ctx.strokeStyle = colors[c.type];
      ctx.setLineDash(c.dash);
      ctx.beginPath();
      ctx.moveTo(10, y);
      ctx.lineTo(28, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#cfcfcf';
      ctx.fillText(c.label, 34, y, nameW - 40);
    });

    ctx.save();
    ctx.beginPath();
    ctx.rect(nameW, rulerH, w - nameW, h - rulerH);
    ctx.clip();

    // Graduations horizontales des valeurs.
    const span = this.vhi - this.vlo;
    const step = niceStep(span / 5);
    ctx.fillStyle = '#6f6f6f';
    ctx.textAlign = 'left';
    for (let v = Math.ceil(this.vlo / step) * step; v <= this.vhi; v += step) {
      const y = Math.round(this.valueToY(v)) + 0.5;
      ctx.strokeStyle = Math.abs(v) < step / 2 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)';
      ctx.beginPath();
      ctx.moveTo(nameW, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.fillText(formatValue(v, step), nameW + 4, y - 7);
    }

    // Courbes.
    for (const c of channels) {
      if (!c.keys.length) continue;
      ctx.strokeStyle = colors[c.type];
      ctx.lineWidth = 1.6;
      ctx.setLineDash(c.dash);
      ctx.beginPath();
      const first = c.keys[0];
      ctx.moveTo(nameW, this.valueToY(first[c.field]));
      ctx.lineTo(this.timeToX(first.time), this.valueToY(first[c.field]));
      c.keys.forEach((k, i) => {
        const n = c.keys[i + 1];
        if (!n) {
          ctx.lineTo(w, this.valueToY(k[c.field]));
          return;
        }
        const x0 = this.timeToX(k.time);
        const x1 = this.timeToX(n.time);
        const steps = Math.max(2, Math.min(64, Math.ceil((x1 - x0) / 4)));
        for (let s = 1; s <= steps; s++) {
          const p = s / steps;
          const e = evaluateCurve(k.curve, p);
          // Palier : la valeur tient jusqu'à la clé suivante.
          if (k.curve === 'stepped' && s === steps) ctx.lineTo(x1, this.valueToY(k[c.field]));
          ctx.lineTo(x0 + (x1 - x0) * p, this.valueToY(k[c.field] + (n[c.field] - k[c.field]) * (k.curve === 'stepped' && s < steps ? 0 : e)));
        }
      });
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
    }

    // Poignées des clés sélectionnées, puis points des clés.
    for (const c of channels) {
      c.keys.forEach((k, i) => {
        if (!ed.isKeySelected(k)) return;
        const hs = this.handles(c, i);
        if (!hs) return;
        const n = c.keys[i + 1];
        const a = { x: this.timeToX(k.time), y: this.valueToY(k[c.field]) };
        const b = { x: this.timeToX(n.time), y: this.valueToY(n[c.field]) };
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(hs[0].x, hs[0].y);
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(hs[1].x, hs[1].y);
        ctx.stroke();
        for (const hnd of hs) {
          ctx.fillStyle = isBezier(k.curve) ? '#ffffff' : '#9e9e9e';
          ctx.beginPath();
          ctx.arc(hnd.x, hnd.y, HANDLE_R - 1, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      for (const k of c.keys) {
        const x = this.timeToX(k.time);
        const y = this.valueToY(k[c.field]);
        ctx.fillStyle = ed.isKeySelected(k) ? '#4fc3f7' : colors[c.type];
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.beginPath();
        ctx.rect(x - 4, y - 4, 8, 8);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // --- Souris ------------------------------------------------------------------------------

  // Renvoie true si l'appui est géré par la vue Courbes.
  down(p, e) {
    const ed = this.editor;
    const channels = this.lastChannels ?? [];
    // Poignée d'une clé sélectionnée ?
    for (const c of channels) {
      for (let i = 0; i < c.keys.length; i++) {
        if (!ed.isKeySelected(c.keys[i])) continue;
        const hs = this.handles(c, i);
        const hit = hs?.find((hnd) => Math.hypot(hnd.x - p.x, hnd.y - p.y) <= HANDLE_R + 3);
        if (hit) {
          this.drag = { kind: 'handle', c, i, which: hit.which, began: false };
          return true;
        }
      }
    }
    // Clé ?
    for (const c of channels) {
      for (const k of c.keys) {
        const x = this.timeToX(k.time);
        const y = this.valueToY(k[c.field]);
        if (Math.abs(x - p.x) <= 6 && Math.abs(y - p.y) <= 6) {
          const entry = { owner: c.owner, name: c.name, type: c.type, key: k };
          if (e.shiftKey) ed.selectKeys([entry], true);
          else if (!ed.isKeySelected(k)) ed.selectKeys([entry]);
          this.drag = {
            kind: 'key', c, key: k, startY: p.y, startX: p.x, startValue: k[c.field],
            startFrame: this.panel.xToFrame(p.x), applied: 0, began: false, timeMode: e.altKey,
          };
          return true;
        }
      }
    }
    return false;
  }

  move(p) {
    const d = this.drag;
    if (!d) return;
    const ed = this.editor;
    if (!d.began) {
      ed.begin();
      d.began = true;
    }
    if (d.kind === 'handle') {
      const k = d.c.keys[d.i];
      const n = d.c.keys[d.i + 1];
      const x0 = this.timeToX(k.time);
      const x1 = this.timeToX(n.time);
      const v0 = k[d.c.field];
      const dv = n[d.c.field] - v0;
      const curve = isBezier(k.curve) ? [...k.curve] : [1 / 3, 1 / 3, 2 / 3, 2 / 3];
      const nx = Math.min(1, Math.max(0, (p.x - x0) / (x1 - x0 || 1)));
      const ny = Math.abs(dv) < 1e-9 ? curve[d.which * 2 + 1] : (this.yToValue(p.y) - v0) / dv;
      curve[d.which * 2] = nx;
      curve[d.which * 2 + 1] = Math.max(-3, Math.min(4, ny));
      k.curve = curve;
    } else if (d.kind === 'key') {
      if (d.timeMode) {
        // Alt : déplacement dans le temps (comme dans la vue des clés).
        const df = this.panel.xToFrame(p.x) - d.startFrame;
        if (df !== d.applied) {
          ed.moveSelectedKeys(df - d.applied);
          d.applied = df;
        }
      } else {
        // Déplacement vertical : nouvelle valeur.
        const v = this.yToValue(p.y);
        d.key[d.c.field] = Math.round(v * 1000) / 1000;
      }
    }
    ed.refreshPose();
    ed.emit('drag');
  }

  up() {
    const d = this.drag;
    this.drag = null;
    if (d?.began) {
      this.editor.commit();
      this.editor.emit('keys');
    }
  }

  cancel() {
    if (this.drag?.began) this.editor.cancel();
    this.drag = null;
  }
}

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

function formatValue(v, step) {
  const digits = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)));
  return v.toFixed(digits);
}

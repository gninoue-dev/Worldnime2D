// Interaction à la souris avec les maillages, selon l'outil de maillage de l'éditeur (editor.meshTool) :
//   'edit'    (Configuration) : sélectionner et déplacer des sommets ; clic dans le maillage = nouveau
//              sommet intérieur ; clic sur le contour = nouveau sommet de contour ; Alt + clic = supprimer ;
//              Ctrl + clic sur deux sommets = ajouter (ou retirer) une arête.
//   'weights' (Configuration) : pinceau de poids pour l'os choisi (Alt : retirer du poids).
//   'deform'  (Animation) : déformation libre (FFD), une clé de déformation est posée à l'image courante.
// Le rayon doux (editor.softRadius, en pixels écran) entraîne aussi les sommets voisins.

import { MeshAttachment } from '../model/mesh.js';
import { deformKey } from '../model/animation.js';
import { insertVertex, deleteVertices, setupPositions, setupWorld, applyPositions, toggleEdge } from '../editor/meshtools.js';
import { paintWeights } from '../model/weights.js';
import { distToSegment } from '../model/math.js';

const VERTEX_HIT = 8;
const EDGE_HIT = 6;

export class MeshInteraction {
  constructor(viewport) {
    this.vp = viewport;
    this.editor = viewport.editor;
    this.selected = new Set();
    this.hoverVertex = -1;
    this.drag = null;
    this.mouse = null;
    this.lastKey = null;
  }

  // Maillage visé : { slot, att, source } ou null.
  target() {
    const ed = this.editor;
    const sk = ed.skeleton;
    const tool = ed.meshTool;
    if (!tool || !ed.selectedSlot) return null;
    const slot = ed.selectedSlot;
    const att = tool === 'deform' ? sk.currentAttachment(slot) : ed.attachment;
    if (!(att instanceof MeshAttachment)) return null;
    const source = sk.meshSource(slot, att);
    if ((tool === 'edit' || tool === 'weights') && att.parent) return null;
    if (tool === 'weights' && !source.weights) return null;
    return { slot, att, source };
  }

  active() {
    const t = this.target();
    const key = t ? `${t.slot.name}/${t.att.name}/${this.editor.meshTool}` : null;
    if (key !== this.lastKey) {
      this.selected.clear();
      this.lastKey = key;
    }
    return Boolean(t);
  }

  worldVerts(t) {
    return this.editor.skeleton.attachmentVertices(t.slot, t.att);
  }

  vertexAt(t, sx, sy) {
    const v = this.worldVerts(t);
    let best = -1;
    let bd = VERTEX_HIT;
    for (let i = 0; i < v.length / 2; i++) {
      const s = this.vp.toScreen(v[i * 2], v[i * 2 + 1]);
      const d = Math.hypot(s.x - sx, s.y - sy);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  // Facteur d'entraînement de chaque sommet (1 pour les sommets saisis, décroissant dans le rayon doux).
  falloff(t, picked) {
    const v = this.worldVerts(t);
    const n = v.length / 2;
    const f = new Float32Array(n);
    const r = this.editor.softRadius;
    const pts = [...picked].map((i) => this.vp.toScreen(v[i * 2], v[i * 2 + 1]));
    for (let i = 0; i < n; i++) {
      if (picked.has(i)) {
        f[i] = 1;
        continue;
      }
      if (r <= 0) continue;
      const s = this.vp.toScreen(v[i * 2], v[i * 2 + 1]);
      const d = Math.min(...pts.map((p) => Math.hypot(p.x - s.x, p.y - s.y)));
      if (d < r) f[i] = (1 - d / r) ** 2;
    }
    return f;
  }

  // --- Souris ----------------------------------------------------------------------------

  down(p, w, e) {
    const t = this.target();
    if (!t) return false;
    const ed = this.editor;
    const sk = ed.skeleton;
    const tool = ed.meshTool;

    if (tool === 'weights') {
      ed.begin();
      this.drag = { kind: 'paint', t, world: setupWorld(sk, t.slot, t.source), subtract: e.altKey };
      this.paint(w);
      return true;
    }

    const vi = this.vertexAt(t, p.x, p.y);
    if (tool === 'edit' && vi >= 0 && (e.ctrlKey || e.metaKey)) {
      // Arête : premier Ctrl + clic = départ, second = arrivée.
      if (this.edgeStart === undefined || this.edgeStart === null || this.edgeStart === vi) {
        this.edgeStart = vi;
        this.selected = new Set([vi]);
      } else {
        const from = this.edgeStart;
        ed.apply(() => toggleEdge(sk, t.slot, t.source, from, vi));
        this.edgeStart = null;
        this.selected = new Set([vi]);
      }
      this.vp.render();
      return true;
    }
    this.edgeStart = null;
    if (tool === 'edit' && vi >= 0 && e.altKey) {
      try {
        ed.apply(() => deleteVertices(sk, t.slot, t.source, [vi]));
        this.selected.clear();
      } catch (err) {
        this.vp.notify?.(err.message);
      }
      return true;
    }
    if (vi < 0 && tool === 'edit') {
      // Nouveau sommet (intérieur ou sur le contour), puis on peut le glisser tout de suite.
      const local = t.slot.bone.worldToLocal(w.x, w.y);
      let index = -1;
      ed.apply(() => {
        index = insertVertex(sk, t.slot, t.source, local.x, local.y, EDGE_HIT / this.vp.zoom / Math.max(1e-6, t.slot.bone.worldScaleX));
      });
      if (index < 0) {
        this.selected.clear();
        this.vp.render();
        return true;
      }
      this.selected = new Set([index]);
      return this.startMove(this.target(), w);
    }
    if (vi < 0) {
      if (!e.shiftKey) this.selected.clear();
      this.vp.render();
      return true;
    }
    if (e.shiftKey) {
      if (this.selected.has(vi)) this.selected.delete(vi);
      else this.selected.add(vi);
    } else if (!this.selected.has(vi)) this.selected = new Set([vi]);
    return this.startMove(t, w);
  }

  startMove(t, w) {
    const ed = this.editor;
    const sk = ed.skeleton;
    ed.begin();
    const f = this.falloff(t, this.selected);
    if (ed.meshTool === 'edit') {
      this.drag = { kind: 'move', t, start: w, f, positions: setupPositions(sk, t.slot, t.source) };
    } else {
      const src = t.source;
      const name = sk.deformName(t.slot, t.att);
      const pose = t.slot.pose;
      const base = pose.deformFor === name && pose.deform?.length === src.deformLength
        ? Float32Array.from(pose.deform) : new Float32Array(src.deformLength);
      this.drag = { kind: 'deform', t, start: w, f, base, name };
    }
    this.vp.render();
    return true;
  }

  move(p, w) {
    this.mouse = w;
    const d = this.drag;
    const t = this.target();
    if (!d) {
      if (t && this.editor.meshTool !== 'weights') {
        const vi = this.vertexAt(t, p.x, p.y);
        if (vi !== this.hoverVertex) {
          this.hoverVertex = vi;
          this.vp.render();
        }
      } else if (this.editor.meshTool === 'weights') this.vp.render();
      return;
    }
    const ed = this.editor;
    const sk = ed.skeleton;
    const dx = w.x - d.start.x;
    const dy = w.y - d.start.y;
    if (d.kind === 'paint') {
      this.paint(w);
    } else if (d.kind === 'move') {
      // Décalage monde → repère de l'os du slot.
      const b = d.t.slot.bone;
      const det = b.a * b.d - b.b * b.c || 1;
      const lx = (b.d * dx - b.b * dy) / det;
      const ly = (-b.c * dx + b.a * dy) / det;
      const pos = d.positions.map(([x, y], i) => [x + lx * d.f[i], y + ly * d.f[i]]);
      applyPositions(sk, d.t.slot, d.t.source, pos);
      sk.updateWorldTransform();
    } else if (d.kind === 'deform') {
      const src = d.t.source;
      const out = Float32Array.from(d.base);
      const toLocal = (bone, fx, fy) => {
        const det = bone.a * bone.d - bone.b * bone.c || 1;
        return [(bone.d * fx - bone.b * fy) / det, (-bone.c * fx + bone.a * fy) / det];
      };
      if (!src.weights) {
        for (let i = 0; i < d.f.length; i++) {
          if (!d.f[i]) continue;
          const [lx, ly] = toLocal(d.t.slot.bone, dx * d.f[i], dy * d.f[i]);
          out[i * 2] += lx;
          out[i * 2 + 1] += ly;
        }
      } else {
        let k = 0;
        src.weights.forEach((list, i) => {
          for (const e of list) {
            if (d.f[i]) {
              const [lx, ly] = toLocal(sk.findBone(e.bone), dx * d.f[i], dy * d.f[i]);
              out[k] += lx;
              out[k + 1] += ly;
            }
            k += 2;
          }
        });
      }
      const pose = d.t.slot.pose;
      pose.deform = out;
      pose.deformFor = d.name;
      if (ed.autoKey) this.keyDeform(d.t.slot, d.name, out);
    }
    ed.emit('drag');
  }

  keyDeform(slot, name, offsets) {
    const ed = this.editor;
    ed.animation?.setKey('deform', deformKey(slot.name, name), 'deform', {
      time: ed.time, vertices: Array.from(offsets, (v) => Math.round(v * 1000) / 1000),
    });
  }

  paint(w) {
    const d = this.drag;
    const ed = this.editor;
    const b = ed.brush;
    if (!b.bone) {
      this.vp.notify?.('Choisissez l\'os à peindre dans les propriétés.');
      return;
    }
    paintWeights(d.t.source, ed.skeleton, d.world, b.bone, w.x, w.y, b.radius / this.vp.zoom, b.strength, d.subtract);
    ed.skeleton.clearDeform(d.t.slot.name, d.t.source.name);
  }

  up() {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    this.editor.commit();
    this.editor.emit('edit');
  }

  cancel() {
    if (this.drag) this.editor.cancel();
    this.drag = null;
  }

  deleteSelected() {
    const t = this.target();
    if (!t || this.editor.meshTool !== 'edit' || this.selected.size === 0) return false;
    const sk = this.editor.skeleton;
    const idx = [...this.selected];
    this.editor.apply(() => deleteVertices(sk, t.slot, t.source, idx));
    this.selected.clear();
    return true;
  }

  // --- Dessin --------------------------------------------------------------------------------

  // Contour, triangles et sommets d'un maillage (pour la sélection et les outils).
  drawMesh(g, slot, att, { wire = true, vertices = false } = {}) {
    const sk = this.editor.skeleton;
    const src = sk.meshSource(slot, att);
    const v = sk.attachmentVertices(slot, att);
    const S = (i) => this.vp.toScreen(v[i * 2], v[i * 2 + 1]);
    if (wire) {
      for (let t = 0; t < src.triangles.length; t += 3) {
        const [a, b, c] = [S(src.triangles[t]), S(src.triangles[t + 1]), S(src.triangles[t + 2])];
        g.moveTo(a.x, a.y).lineTo(b.x, b.y).lineTo(c.x, c.y).lineTo(a.x, a.y);
      }
      g.stroke({ width: 1, color: 0xffffff, alpha: 0.35 });
      for (const [i, j] of src.edges) {
        const [a, b] = [S(i), S(j)];
        g.moveTo(a.x, a.y).lineTo(b.x, b.y);
      }
      if (src.edges.length) g.stroke({ width: 1.5, color: 0xffd54f, alpha: 0.8 });
    }
    if (src.hull >= 2) {
      const pts = [];
      for (let i = 0; i < src.hull; i++) {
        const s = S(i);
        pts.push(s.x, s.y);
      }
      g.poly(pts).stroke({ width: 1.5, color: 0x4fc3f7 });
    }
    if (!vertices) return;
    const tool = this.editor.meshTool;
    const weightBone = tool === 'weights' ? this.editor.brush.bone : null;
    for (let i = 0; i < src.vertexCount; i++) {
      const s = S(i);
      let color = i < src.hull ? 0x4fc3f7 : 0xb0bec5;
      if (weightBone && src.weights) color = heat(src.weights[i].find((e) => e.bone === weightBone)?.w ?? 0);
      const sel = this.selected.has(i);
      const r = sel ? 5 : i === this.hoverVertex ? 4.5 : weightBone ? 4.5 : 3.5;
      g.circle(s.x, s.y, r).fill({ color: sel ? 0xffd54f : color }).stroke({ width: 1, color: 0x111111 });
    }
  }

  draw(g) {
    const t = this.target();
    if (!t) return;
    const ed = this.editor;
    this.drawMesh(g, t.slot, t.att, { wire: true, vertices: true });
    if (!this.mouse) return;
    const m = this.vp.toScreen(this.mouse.x, this.mouse.y);
    if (ed.meshTool === 'weights') {
      g.circle(m.x, m.y, ed.brush.radius).stroke({ width: 1.5, color: this.drag?.subtract ? 0xe57373 : 0xffffff, alpha: 0.8 });
    } else if (ed.softRadius > 0) {
      g.circle(m.x, m.y, ed.softRadius).stroke({ width: 1, color: 0xffd54f, alpha: 0.6 });
    }
    // Arête du contour survolée en mode Modifier : un clic y insère un sommet.
    if (ed.meshTool === 'edit' && this.hoverVertex < 0 && !this.drag) {
      const v = this.worldVerts(t);
      for (let i = 0; i < t.source.hull; i++) {
        const j = (i + 1) % t.source.hull;
        const a = this.vp.toScreen(v[i * 2], v[i * 2 + 1]);
        const b = this.vp.toScreen(v[j * 2], v[j * 2 + 1]);
        if (distToSegment(m.x, m.y, a.x, a.y, b.x, b.y) < EDGE_HIT) {
          g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 3, color: 0xffd54f });
          break;
        }
      }
    }
  }
}

// Couleur d'un poids : bleu (0) → vert → jaune → rouge (1).
function heat(w) {
  const stops = [[0, [40, 60, 200]], [0.33, [40, 200, 120]], [0.66, [240, 220, 60]], [1, [230, 50, 40]]];
  let i = 0;
  while (i < stops.length - 2 && w > stops[i + 1][0]) i++;
  const [t0, c0] = stops[i];
  const [t1, c1] = stops[i + 1];
  const f = Math.min(1, Math.max(0, (w - t0) / (t1 - t0)));
  const c = c0.map((v, k) => Math.round(v + (c1[k] - v) * f));
  return (c[0] << 16) | (c[1] << 8) | c[2];
}

export { MeshAttachment };

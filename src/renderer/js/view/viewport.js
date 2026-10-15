// Zone de dessin : affiche le squelette avec PixiJS et gère la souris (outils, zoom, déplacement de la vue).
//
// Monde : Y vers le haut. Écran : Y vers le bas. La caméra fait la conversion.

import 'pixi.js/unsafe-eval';
import { Application, Container, Graphics, Text } from 'pixi.js';
import { TOOLS } from '../editor/editor.js';
import { atan2Deg, wrapDeg, distToSegment } from '../model/math.js';

const COLORS = {
  background: 0x262626,
  gridMinor: 0x303030,
  gridMajor: 0x3a3a3a,
  axisX: 0x7a3434,
  axisY: 0x34703a,
  selected: 0x4fc3f7,
  hover: 0xffffff,
  outline: 0x111111,
  preview: 0xffd54f,
};

const HIT_RADIUS = 7;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 40;
const SNAP_DEG = 15;

function hexToNumber(hex) {
  return parseInt(hex.slice(1), 16);
}

export class Viewport {
  constructor(editor, host, onStatus) {
    this.editor = editor;
    this.host = host;
    this.onStatus = onStatus;
    this.zoom = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.showNames = true;
    this.hover = null;
    this.drag = null;
    this.spaceDown = false;
    this.mouseWorld = { x: 0, y: 0 };
  }

  async init() {
    this.app = new Application();
    await this.app.init({
      resizeTo: this.host,
      antialias: true,
      background: COLORS.background,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      preserveDrawingBuffer: true,
    });
    this.host.appendChild(this.app.canvas);
    this.canvas = this.app.canvas;
    this.canvas.tabIndex = 0;

    this.grid = new Graphics();
    this.bonesLayer = new Graphics();
    this.overlay = new Graphics();
    this.labels = new Container();
    this.app.stage.addChild(this.grid, this.bonesLayer, this.overlay, this.labels);
    this.labelPool = [];

    this.centerView();
    this.bindEvents();
    new ResizeObserver(() => this.render()).observe(this.host);
    this.editor.addEventListener('change', () => this.render());
    this.render();
  }

  // --- Caméra --------------------------------------------------------------------

  get width() {
    return this.host.clientWidth;
  }

  get height() {
    return this.host.clientHeight;
  }

  toScreen(wx, wy) {
    return { x: this.offsetX + wx * this.zoom, y: this.offsetY - wy * this.zoom };
  }

  toWorld(sx, sy) {
    return { x: (sx - this.offsetX) / this.zoom, y: (this.offsetY - sy) / this.zoom };
  }

  centerView() {
    this.zoom = 1;
    this.offsetX = this.width / 2;
    this.offsetY = this.height * 0.6;
    this.render();
  }

  // Cadre tout le squelette à l'écran.
  frameAll() {
    const sk = this.editor.skeleton;
    sk.updateWorldTransform();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const b of sk.bones) {
      for (const [x, y] of [[b.worldX, b.worldY], [b.tipX, b.tipY]]) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    const w = Math.max(maxX - minX, 100);
    const h = Math.max(maxY - minY, 100);
    this.zoom = clampZoom(Math.min(this.width / (w * 1.4), this.height / (h * 1.4)));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    this.offsetX = this.width / 2 - cx * this.zoom;
    this.offsetY = this.height / 2 + cy * this.zoom;
    this.render();
  }

  zoomAt(sx, sy, factor) {
    const before = this.toWorld(sx, sy);
    this.zoom = clampZoom(this.zoom * factor);
    this.offsetX = sx - before.x * this.zoom;
    this.offsetY = sy + before.y * this.zoom;
    this.render();
  }

  // --- Dessin ----------------------------------------------------------------------------

  render() {
    if (!this.app) return;
    const sk = this.editor.skeleton;
    sk.updateWorldTransform();
    this.drawGrid();
    this.drawBones();
    this.drawOverlay();
    this.reportStatus();
  }

  drawGrid() {
    const g = this.grid;
    g.clear();
    const w = this.width;
    const h = this.height;
    // Pas de grille adapté au zoom : 10, 50, 100, 500…
    const steps = [1, 5, 10, 50, 100, 500, 1000, 5000];
    const step = steps.find((s) => s * this.zoom >= 12) ?? 5000;
    const major = step * 5;
    const tl = this.toWorld(0, 0);
    const br = this.toWorld(w, h);

    const drawLines = (s, color) => {
      for (let x = Math.ceil(tl.x / s) * s; x <= br.x; x += s) {
        const sx = Math.round(this.toScreen(x, 0).x) + 0.5;
        g.moveTo(sx, 0).lineTo(sx, h);
      }
      for (let y = Math.ceil(br.y / s) * s; y <= tl.y; y += s) {
        const sy = Math.round(this.toScreen(0, y).y) + 0.5;
        g.moveTo(0, sy).lineTo(w, sy);
      }
      g.stroke({ width: 1, color });
    };
    drawLines(step, COLORS.gridMinor);
    drawLines(major, COLORS.gridMajor);

    const o = this.toScreen(0, 0);
    g.moveTo(0, Math.round(o.y) + 0.5).lineTo(w, Math.round(o.y) + 0.5).stroke({ width: 1, color: COLORS.axisX });
    g.moveTo(Math.round(o.x) + 0.5, 0).lineTo(Math.round(o.x) + 0.5, h).stroke({ width: 1, color: COLORS.axisY });
  }

  drawBones() {
    const g = this.bonesLayer;
    g.clear();
    for (const l of this.labelPool) l.visible = false;
    const sk = this.editor.skeleton;
    let labelIndex = 0;

    for (const bone of sk.bones) {
      const selected = bone === this.editor.selected;
      const hovered = bone === this.hover && !selected;
      const color = selected ? COLORS.selected : hovered ? COLORS.hover : hexToNumber(bone.color);
      const o = this.toScreen(bone.worldX, bone.worldY);
      const t = this.toScreen(bone.tipX, bone.tipY);
      const lenPx = Math.hypot(t.x - o.x, t.y - o.y);

      if (lenPx > 4) {
        // Forme de l'os : un losange allongé, du point d'attache vers le bout.
        const ux = (t.x - o.x) / lenPx;
        const uy = (t.y - o.y) / lenPx;
        const width = Math.min(Math.max(lenPx * 0.1, 3), 10);
        const bx = o.x + ux * Math.min(lenPx * 0.15, 24);
        const by = o.y + uy * Math.min(lenPx * 0.15, 24);
        const pts = [o.x, o.y, bx - uy * width, by + ux * width, t.x, t.y, bx + uy * width, by - ux * width];
        g.poly(pts).fill({ color, alpha: selected ? 0.55 : 0.4 }).stroke({ width: selected ? 2 : 1.25, color });
        g.circle(o.x, o.y, Math.min(width * 0.8, 6)).fill({ color: COLORS.outline }).stroke({ width: 1.5, color });
      } else {
        // Os de longueur nulle : un cercle barré.
        g.circle(o.x, o.y, 6).fill({ color: COLORS.outline }).stroke({ width: selected ? 2 : 1.5, color });
        g.moveTo(o.x - 9, o.y).lineTo(o.x + 9, o.y).moveTo(o.x, o.y - 9).lineTo(o.x, o.y + 9).stroke({ width: 1, color });
      }

      if (this.showNames || selected) {
        const label = this.label(labelIndex++);
        label.text = bone.name;
        label.style.fill = selected ? COLORS.selected : 0xcfcfcf;
        label.x = Math.round((o.x + t.x) / 2 + 8);
        label.y = Math.round((o.y + t.y) / 2 - 18);
        label.visible = true;
      }
    }
  }

  label(i) {
    if (!this.labelPool[i]) {
      const t = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: 12, fill: 0xcfcfcf } });
      t.resolution = window.devicePixelRatio || 1;
      this.labels.addChild(t);
      this.labelPool[i] = t;
    }
    return this.labelPool[i];
  }

  drawOverlay() {
    const g = this.overlay;
    g.clear();
    const d = this.drag;
    if (d?.kind === 'create') {
      const a = this.toScreen(d.start.x, d.start.y);
      const b = this.toScreen(d.end.x, d.end.y);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 2, color: COLORS.preview });
      g.circle(a.x, a.y, 5).stroke({ width: 2, color: COLORS.preview });
    }
    // Repère de l'os sélectionné pendant une transformation.
    const bone = this.editor.selected;
    if (bone && d && d.kind !== 'create' && d.kind !== 'pan') {
      const o = this.toScreen(bone.worldX, bone.worldY);
      const ax = this.toScreen(bone.worldX + bone.a * 40 / this.zoom, bone.worldY + bone.c * 40 / this.zoom);
      const ay = this.toScreen(bone.worldX + bone.b * 40 / this.zoom, bone.worldY + bone.d * 40 / this.zoom);
      g.moveTo(o.x, o.y).lineTo(ax.x, ax.y).stroke({ width: 2, color: 0xe57373 });
      g.moveTo(o.x, o.y).lineTo(ay.x, ay.y).stroke({ width: 2, color: 0x81c784 });
    }
  }

  reportStatus() {
    const m = this.mouseWorld;
    this.onStatus?.({ zoom: this.zoom, x: m.x, y: m.y, hover: this.hover?.name ?? null });
  }

  // --- Sélection à la souris ---------------------------------------------------

  hitTest(sx, sy) {
    let best = null;
    let bestDist = HIT_RADIUS;
    const bones = this.editor.skeleton.bones;
    for (let i = bones.length - 1; i >= 0; i--) {
      const b = bones[i];
      const o = this.toScreen(b.worldX, b.worldY);
      const t = this.toScreen(b.tipX, b.tipY);
      const dist = Math.hypot(t.x - o.x, t.y - o.y) > 4
        ? distToSegment(sx, sy, o.x, o.y, t.x, t.y)
        : Math.max(0, Math.hypot(sx - o.x, sy - o.y) - 6);
      if (dist < bestDist) {
        best = b;
        bestDist = dist;
      }
    }
    return best;
  }

  // --- Événements -------------------------------------------------------------------

  bindEvents() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = this.local(e);
      this.zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', () => this.cancelDrag());
    c.addEventListener('pointerleave', () => {
      if (!this.drag && this.hover) {
        this.hover = null;
        this.render();
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !isTyping(e)) this.spaceDown = true;
      if (e.key === 'Escape' && this.drag) this.cancelDrag();
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.spaceDown = false;
    });
  }

  local(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  onDown(e) {
    this.canvas.focus();
    const p = this.local(e);
    const w = this.toWorld(p.x, p.y);
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Événements simulés (tests) : pas de capture possible.
    }

    if (e.button === 1 || e.button === 2 || (e.button === 0 && this.spaceDown)) {
      this.drag = { kind: 'pan', sx: p.x, sy: p.y, ox: this.offsetX, oy: this.offsetY };
      return;
    }
    if (e.button !== 0) return;

    const editor = this.editor;
    const hit = this.hitTest(p.x, p.y);

    if (editor.tool === TOOLS.select) {
      if (hit) editor.select(hit);
      return;
    }

    if (editor.tool === TOOLS.create) {
      // Glisser depuis un os crée un enfant de cet os ; un simple clic dessus le sélectionne.
      this.drag = { kind: 'create', start: w, end: w, hit, parent: hit ?? editor.selected ?? editor.skeleton.root };
      this.render();
      return;
    }

    // Outils de transformation : un clic sur un os le sélectionne, puis le glisser le transforme.
    if (hit) editor.select(hit);
    const bone = editor.selected;
    if (!bone) return;
    editor.begin();
    this.drag = {
      kind: editor.tool,
      bone,
      start: w,
      startAngle: atan2Deg(w.y - bone.worldY, w.x - bone.worldX),
      startWorld: { x: bone.worldX, y: bone.worldY },
      initial: {
        x: bone.x, y: bone.y, rotation: bone.rotation,
        scaleX: bone.scaleX, scaleY: bone.scaleY, shearX: bone.shearX, shearY: bone.shearY,
      },
      // Repère de l'os au début (rotation seule) pour l'outil Échelle.
      axisAngle: bone.worldRotationX,
      parentFlip: bone.parent ? Math.sign(bone.parent.a * bone.parent.d - bone.parent.b * bone.parent.c) || 1 : 1,
    };
  }

  onMove(e) {
    const p = this.local(e);
    const w = this.toWorld(p.x, p.y);
    this.mouseWorld = w;
    const d = this.drag;

    if (!d) {
      const hit = this.hitTest(p.x, p.y);
      if (hit !== this.hover) {
        this.hover = hit;
        this.render();
      } else {
        this.reportStatus();
      }
      return;
    }

    if (d.kind === 'pan') {
      this.offsetX = d.ox + (p.x - d.sx);
      this.offsetY = d.oy + (p.y - d.sy);
      this.render();
      return;
    }

    if (d.kind === 'create') {
      d.end = e.shiftKey ? snapPoint(d.start, w) : w;
      this.render();
      return;
    }

    const bone = d.bone;
    const init = d.initial;
    switch (d.kind) {
      case TOOLS.rotate: {
        const angle = atan2Deg(w.y - bone.worldY, w.x - bone.worldX);
        let r = init.rotation + wrapDeg(angle - d.startAngle) * d.parentFlip;
        if (e.shiftKey) r = Math.round(r / SNAP_DEG) * SNAP_DEG;
        bone.rotation = r;
        break;
      }
      case TOOLS.translate: {
        let dx = w.x - d.start.x;
        let dy = w.y - d.start.y;
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        const local = bone.parentWorldToLocal(d.startWorld.x + dx, d.startWorld.y + dy);
        bone.x = local.x;
        bone.y = local.y;
        break;
      }
      case TOOLS.scale: {
        const a = (-d.axisAngle * Math.PI) / 180;
        const toAxis = (pt) => {
          const x = pt.x - d.startWorld.x;
          const y = pt.y - d.startWorld.y;
          return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) };
        };
        const s0 = toAxis(d.start);
        const s1 = toAxis(w);
        const minSpan = 8 / this.zoom;
        if (e.shiftKey) {
          const r0 = Math.hypot(s0.x, s0.y);
          const f = r0 > minSpan ? Math.hypot(s1.x, s1.y) / r0 : 1;
          bone.scaleX = init.scaleX * f;
          bone.scaleY = init.scaleY * f;
        } else {
          bone.scaleX = Math.abs(s0.x) > minSpan ? init.scaleX * (s1.x / s0.x) : init.scaleX;
          bone.scaleY = Math.abs(s0.y) > minSpan ? init.scaleY * (s1.y / s0.y) : init.scaleY;
        }
        break;
      }
      case TOOLS.shear: {
        const angle = atan2Deg(w.y - d.startWorld.y, w.x - d.startWorld.x);
        const delta = wrapDeg(angle - d.startAngle) * d.parentFlip;
        if (e.shiftKey) bone.shearX = init.shearX + delta;
        else bone.shearY = init.shearY + delta;
        break;
      }
      default:
        break;
    }
    this.editor.skeleton.updateWorldTransform();
    this.editor.emit('drag');
  }

  onUp(e) {
    const d = this.drag;
    try {
      if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      // Idem.
    }
    if (!d) return;
    this.drag = null;

    if (d.kind === 'pan') return;

    if (d.kind === 'create') {
      const editor = this.editor;
      const parent = d.parent;
      const isClick = Math.hypot(d.end.x - d.start.x, d.end.y - d.start.y) * this.zoom < 4;
      if (isClick && d.hit) {
        editor.select(d.hit);
        this.render();
        return;
      }
      editor.apply(() => {
        const sk = editor.skeleton;
        sk.updateWorldTransform();
        const bone = sk.addBone(sk.uniqueBoneName('bone'), parent);
        const local = parent.worldToLocal(d.start.x, d.start.y);
        bone.x = local.x;
        bone.y = local.y;
        // Un simple clic dans le vide crée un os de longueur nulle.
        if (!isClick) {
          sk.updateWorldTransform();
          bone.updateWorldTransform();
          const worldAngle = atan2Deg(d.end.y - d.start.y, d.end.x - d.start.x);
          bone.rotation = bone.worldToLocalRotation(worldAngle);
          bone.updateWorldTransform();
          bone.length = Math.hypot(d.end.x - d.start.x, d.end.y - d.start.y) / (bone.worldScaleX || 1);
        }
        editor.selected = bone;
      });
      return;
    }

    this.editor.commit();
    this.render();
  }

  cancelDrag() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (d.kind !== 'pan' && d.kind !== 'create') this.editor.cancel();
    this.render();
  }

  // Image PNG de la vue (pour les captures et la vérification automatique).
  snapshotDataURL() {
    this.app.renderer.render(this.app.stage);
    return this.app.canvas.toDataURL('image/png');
  }
}

function clampZoom(z) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

function snapPoint(start, p) {
  const len = Math.hypot(p.x - start.x, p.y - start.y);
  const ang = Math.round(atan2Deg(p.y - start.y, p.x - start.x) / SNAP_DEG) * SNAP_DEG;
  return { x: start.x + len * Math.cos((ang * Math.PI) / 180), y: start.y + len * Math.sin((ang * Math.PI) / 180) };
}

export function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

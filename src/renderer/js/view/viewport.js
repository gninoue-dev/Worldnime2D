// Zone de dessin : affiche le squelette et ses images avec PixiJS, et gère la souris
// (outils, zoom, déplacement de la vue, dépôt d'images).
//
// Monde : Y vers le haut. Écran : Y vers le bas. Le conteneur « world » fait la conversion
// pour les images ; les os et les repères sont dessinés directement en pixels écran.

import 'pixi.js/unsafe-eval';
import { Application, Container, Graphics, Sprite, Text } from 'pixi.js';
import { TOOLS } from '../editor/editor.js';
import { atan2Deg, wrapDeg, distToSegment } from '../model/math.js';
import { RegionAttachment, quadContains } from '../model/attachment.js';
import { AttachmentsView } from './attachments.js';
import { MeshInteraction } from './meshinteraction.js';
import { MeshAttachment } from '../model/mesh.js';
import { meshUVAt } from '../model/geometry.js';
import { parseProject, serializeProject } from '../model/format.js';

// Pelure d'oignon : images fantômes avant (rouge) et après (vert) l'instant courant.
const ONION = { count: 2, stepFrames: 3, before: [1, 0.45, 0.45], after: [0.45, 1, 0.55], alpha: 0.28 };

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
  attachment: 0xffb74d,
};

const HIT_RADIUS = 7;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 40;
const SNAP_DEG = 15;
// Opacité minimale (0 à 255) pour qu'un clic sur une image la sélectionne.
const ALPHA_HIT = 16;

function hexToNumber(hex) {
  return parseInt(hex.slice(1, 7), 16);
}

function sameHit(a, b) {
  if (!a || !b) return a === b;
  if (a.kind !== b.kind) return false;
  return a.kind === 'bone' ? a.bone === b.bone : a.slot === b.slot && a.name === b.name;
}

export class Viewport {
  constructor(editor, host, library, onStatus) {
    this.editor = editor;
    this.host = host;
    this.library = library;
    this.onStatus = onStatus;
    this.zoom = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.showNames = true;
    this.showBones = true;
    this.hover = null;
    this.drag = null;
    this.spaceDown = false;
    this.mouseWorld = { x: 0, y: 0 };
    this.reference = { path: null, texture: null };
    // Fonction appelée quand on dépose une image du panneau Images sur la vue.
    this.onDropImage = null;
    // Fonction d'affichage des messages (fournie par la page).
    this.notify = null;
    // Pelure d'oignon : copie du squelette pour calculer les poses voisines.
    this.ghostSkeleton = null;
    this.ghostViews = [];
    // Événements déclenchés pendant la lecture : { name, until }.
    this.flashes = [];
    this.mesh = new MeshInteraction(this);
  }

  async init(preference = 'webgl') {
    this.app = new Application();
    await this.app.init({
      resizeTo: this.host,
      antialias: true,
      background: COLORS.background,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      preserveDrawingBuffer: true,
      preference,
    });
    // Le shader « deux couleurs » est écrit en GLSL : il ne sert qu'avec le rendu WebGL.
    this.rendererName = this.app.renderer.name;
    this.host.appendChild(this.app.canvas);
    this.canvas = this.app.canvas;
    this.canvas.tabIndex = 0;

    this.grid = new Graphics();
    this.world = new Container();
    this.referenceSprite = new Sprite();
    this.referenceSprite.anchor.set(0.5);
    this.referenceSprite.visible = false;
    this.attachments = new AttachmentsView(this.library, this.rendererName === 'webgl');
    this.ghostLayer = new Container();
    this.world.addChild(this.referenceSprite, this.ghostLayer, this.attachments.container);
    this.bonesLayer = new Graphics();
    this.overlay = new Graphics();
    this.labels = new Container();
    this.app.stage.addChild(this.grid, this.world, this.bonesLayer, this.overlay, this.labels);
    this.labelPool = [];

    this.centerView();
    this.bindEvents();
    new ResizeObserver(() => this.render()).observe(this.host);
    this.editor.addEventListener('change', (e) => {
      if (['edit', 'undo', 'redo', 'reset', 'cancel', 'commit', 'drag', 'animation', 'mode'].includes(e.detail.reason)) {
        this.ghostSkeleton = null;
      }
      this.render();
    });
    this.editor.addEventListener('events', (e) => this.flash(e.detail.map((k) => k.name)));
    this.library.addEventListener('change', () => this.render());
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

  // Cadre tout le squelette (os et images) à l'écran.
  frameAll() {
    const sk = this.editor.skeleton;
    sk.updateWorldTransform();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const add = (x, y) => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    };
    for (const b of sk.bones) {
      add(b.worldX, b.worldY);
      add(b.tipX, b.tipY);
    }
    for (const slot of sk.drawOrder) {
      const att = sk.currentAttachment(slot);
      if (!(att instanceof RegionAttachment) && !(att instanceof MeshAttachment)) continue;
      const v = sk.attachmentVertices(slot, att);
      for (let i = 0; i < v.length; i += 2) add(v[i], v[i + 1]);
    }
    const w = Math.max(maxX - minX, 100);
    const h = Math.max(maxY - minY, 100);
    this.zoom = clampZoom(Math.min(this.width / (w * 1.25), this.height / (h * 1.25)));
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

  // --- Image de référence ----------------------------------------------------------

  setReferenceTexture(path, texture) {
    if (this.reference.texture && this.reference.texture !== texture) this.reference.texture.destroy(true);
    this.reference = { path, texture };
    this.render();
  }

  // --- Dessin ----------------------------------------------------------------------------

  render() {
    if (!this.app) return;
    const sk = this.editor.skeleton;
    sk.updateWorldTransform();
    this.world.position.set(this.offsetX, this.offsetY);
    this.world.scale.set(this.zoom, -this.zoom);
    this.drawGrid();
    this.drawReference();
    this.drawGhosts();
    this.attachments.update(sk);
    this.drawBones();
    this.drawOverlay();
    this.reportStatus();
  }

  drawReference() {
    const ref = this.editor.skeleton.reference;
    const s = this.referenceSprite;
    const tex = this.reference.texture;
    if (!ref || !ref.visible || !tex) {
      s.visible = false;
      return;
    }
    s.texture = tex;
    s.visible = true;
    s.position.set(ref.x, ref.y);
    // Le monde a son Y vers le haut : on retourne l'image pour qu'elle s'affiche à l'endroit.
    s.scale.set(ref.scale, -ref.scale);
    s.alpha = ref.alpha;
  }

  // Pelure d'oignon : la même animation quelques images avant et après, en transparence.
  drawGhosts() {
    const editor = this.editor;
    const anim = editor.animation;
    const on = editor.animating && editor.onion && anim && !editor.playing && this.attachments.visible;
    this.ghostLayer.visible = Boolean(on);
    if (!on) return;
    if (!this.ghostSkeleton) {
      this.ghostSkeleton = parseProject(JSON.stringify(serializeProject(editor.skeleton)));
      this.ghostSkeleton.posed = true;
    }
    const gs = this.ghostSkeleton;
    const ganim = gs.findAnimation(anim.name);
    const offsets = [];
    for (let i = ONION.count; i >= 1; i--) offsets.push(-i, i);
    this.ghostLayer.removeChildren();
    offsets.forEach((o, n) => {
      const time = editor.time + (o * ONION.stepFrames) / editor.fps;
      if (time < 0 || time > anim.duration + 1e-6) return;
      if (!this.ghostViews[n]) this.ghostViews[n] = new AttachmentsView(this.library, this.attachments.useShader);
      const view = this.ghostViews[n];
      gs.setToSetupPose();
      ganim?.apply(gs, time);
      gs.updateWorldTransform();
      view.update(gs, { color: o < 0 ? ONION.before : ONION.after, alpha: ONION.alpha / Math.abs(o) });
      this.ghostLayer.addChild(view.container);
    });
  }

  // Affiche brièvement le nom des événements déclenchés.
  flash(names) {
    const until = performance.now() + 900;
    for (const name of names) this.flashes.push({ name, until });
    setTimeout(() => this.render(), 950);
    this.render();
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
    if (!this.showBones) return;
    const sk = this.editor.skeleton;
    const editor = this.editor;
    let labelIndex = 0;

    for (const bone of sk.bones) {
      const selected = bone === editor.selected && editor.selectionKind === 'bone';
      const context = bone === editor.selected && !selected;
      const hovered = this.hover?.kind === 'bone' && this.hover.bone === bone && !selected;
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
        g.poly(pts).fill({ color, alpha: selected ? 0.55 : 0.4 })
          .stroke({ width: selected || context ? 2 : 1.25, color: context ? COLORS.selected : color });
        g.circle(o.x, o.y, Math.min(width * 0.8, 6)).fill({ color: COLORS.outline }).stroke({ width: 1.5, color });
      } else {
        // Os de longueur nulle : un cercle barré.
        g.circle(o.x, o.y, 6).fill({ color: COLORS.outline }).stroke({ width: selected ? 2 : 1.5, color });
        g.moveTo(o.x - 9, o.y).lineTo(o.x + 9, o.y).moveTo(o.x, o.y - 9).lineTo(o.x, o.y + 9).stroke({ width: 1, color });
      }

      if (this.showNames || selected) {
        const label = this.label(labelIndex++);
        label.style.fontWeight = 'normal';
        label.text = bone.name;
        label.style.fill = selected ? COLORS.selected : 0xcfcfcf;
        label.x = Math.round((o.x + t.x) / 2 + 8);
        label.y = Math.round((o.y + t.y) / 2 - 18);
        label.visible = true;
      }
    }

    // Événements déclenchés pendant la lecture, au-dessus de la racine.
    const now = performance.now();
    this.flashes = this.flashes.filter((f) => f.until > now);
    const root = this.toScreen(sk.root.worldX, sk.root.worldY);
    this.flashes.forEach((f, i) => {
      const label = this.label(labelIndex++);
      label.text = `⚡ ${f.name}`;
      label.style.fill = 0xffd54f;
      label.style.fontWeight = 'bold';
      label.x = Math.round(root.x + 12);
      label.y = Math.round(root.y - 40 - i * 16);
      label.visible = true;
    });
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

  // Contour d'une image à l'écran (le contour extérieur pour un maillage).
  strokeAttachment(g, slot, att, color, width) {
    if (att instanceof MeshAttachment) {
      const sk = this.editor.skeleton;
      const src = sk.meshSource(slot, att);
      const v = sk.attachmentVertices(slot, att);
      const pts = [];
      for (let i = 0; i < src.hull; i++) {
        const s = this.toScreen(v[i * 2], v[i * 2 + 1]);
        pts.push(s.x, s.y);
      }
      if (pts.length >= 6) g.poly(pts).stroke({ width, color });
      return;
    }
    const v = att.worldVertices(slot.bone);
    const pts = [];
    for (let i = 0; i < 8; i += 2) {
      const s = this.toScreen(v[i], v[i + 1]);
      pts.push(s.x, s.y);
    }
    g.poly(pts).stroke({ width, color });
  }

  drawOverlay() {
    const g = this.overlay;
    g.clear();
    const editor = this.editor;
    const sk = editor.skeleton;

    // Images : contour de l'image survolée, de la sélection, et des images du slot sélectionné.
    if (this.hover?.kind === 'attachment') {
      const att = sk.getAttachment(this.hover.slot, this.hover.name);
      if (att) this.strokeAttachment(g, this.hover.slot, att, COLORS.hover, 1);
    }
    if (this.mesh.active()) this.mesh.draw(g);
    else if (editor.selectedSlot) {
      const att = editor.attachment ?? sk.currentAttachment(editor.selectedSlot);
      if (att instanceof RegionAttachment || att instanceof MeshAttachment) {
        this.strokeAttachment(g, editor.selectedSlot, att, editor.attachment ? COLORS.selected : COLORS.attachment, 2);
        // Maillage sélectionné : ses triangles, pour voir sa structure.
        if (att instanceof MeshAttachment && editor.attachment === att) this.mesh.drawMesh(g, editor.selectedSlot, att);
      }
    }

    const d = this.drag;
    if (d?.kind === 'create') {
      const a = this.toScreen(d.start.x, d.start.y);
      const b = this.toScreen(d.end.x, d.end.y);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: 2, color: COLORS.preview });
      g.circle(a.x, a.y, 5).stroke({ width: 2, color: COLORS.preview });
    }
    // Repère de l'élément transformé pendant un geste.
    if (d?.target) {
      const f = d.target.frame();
      const o = this.toScreen(f.x, f.y);
      const len = 40 / this.zoom;
      const ax = this.toScreen(f.x + f.ax * len, f.y + f.ay * len);
      const ay = this.toScreen(f.x + f.bx * len, f.y + f.by * len);
      g.moveTo(o.x, o.y).lineTo(ax.x, ax.y).stroke({ width: 2, color: 0xe57373 });
      g.moveTo(o.x, o.y).lineTo(ay.x, ay.y).stroke({ width: 2, color: 0x81c784 });
    }
  }

  reportStatus() {
    const m = this.mouseWorld;
    const h = this.hover;
    const hoverName = h ? (h.kind === 'bone' ? h.bone.name : `${h.slot.name} / ${h.name}`) : null;
    this.onStatus?.({ zoom: this.zoom, x: m.x, y: m.y, hover: hoverName });
  }

  // --- Sélection à la souris ---------------------------------------------------

  // Os sous le pointeur (coordonnées écran), ou null.
  hitBone(sx, sy) {
    if (!this.showBones) return null;
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

  // Image visible sous le pointeur (la plus en avant, sur un pixel non transparent), ou null.
  hitAttachment(sx, sy) {
    if (!this.attachments.visible) return null;
    const sk = this.editor.skeleton;
    const w = this.toWorld(sx, sy);
    for (let i = sk.drawOrder.length - 1; i >= 0; i--) {
      const slot = sk.drawOrder[i];
      const att = sk.currentAttachment(slot);
      if (att instanceof MeshAttachment) {
        const src = sk.meshSource(slot, att);
        const uv = meshUVAt(sk.attachmentVertices(slot, att), src.triangles, src.uvs, w.x, w.y);
        if (!uv) continue;
        if (this.library.get(att.imagePath) && this.library.alphaAt(att.imagePath, uv[0], uv[1]) < ALPHA_HIT) continue;
        return { kind: 'attachment', slot, name: att.name };
      }
      if (!(att instanceof RegionAttachment)) continue;
      const v = att.worldVertices(slot.bone);
      if (!quadContains(v, w.x, w.y)) continue;
      const uv = attachmentUV(slot.bone, att, w);
      if (this.library.get(att.imagePath) && this.library.alphaAt(att.imagePath, uv.u, uv.v) < ALPHA_HIT) continue;
      return { kind: 'attachment', slot, name: att.name };
    }
    return null;
  }

  // Les os passent avant les images, comme dans les éditeurs du genre.
  hitTest(sx, sy) {
    const bone = this.hitBone(sx, sy);
    if (bone) return { kind: 'bone', bone };
    return this.hitAttachment(sx, sy);
  }

  selectHit(hit) {
    if (!hit) return;
    if (hit.kind === 'bone') this.editor.select(hit.bone);
    // En mode Animation, cliquer sur une image sélectionne son os : on anime un membre en cliquant dessus.
    else if (this.editor.animating) this.editor.select(hit.slot.bone);
    else this.editor.selectAttachment(hit.slot, hit.name);
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
    // Dépôt d'une image venue du panneau Images.
    c.addEventListener('dragover', (e) => {
      if (e.dataTransfer.types.includes('application/x-wn2d-image')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    c.addEventListener('drop', (e) => {
      const path = e.dataTransfer.getData('application/x-wn2d-image');
      if (!path) return;
      e.preventDefault();
      const p = this.local(e);
      this.onDropImage?.(path, this.toWorld(p.x, p.y));
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

    // Outil de maillage actif : la souris agit sur les sommets.
    if (editor.meshTool && this.mesh.active() && this.mesh.down(p, w, e)) {
      this.drag = { kind: 'mesh' };
      return;
    }

    if (editor.tool === TOOLS.select) {
      this.selectHit(this.hitTest(p.x, p.y));
      return;
    }

    if (editor.tool === TOOLS.create && editor.animating) {
      this.notify?.('En mode Animation, on ne crée pas d\'os : repassez en mode Configuration.');
      return;
    }

    if (editor.tool === TOOLS.create) {
      // Glisser depuis un os crée un enfant de cet os ; un simple clic dessus le sélectionne.
      const hit = this.hitBone(p.x, p.y);
      this.drag = { kind: 'create', start: w, end: w, hit, parent: hit ?? editor.selected ?? editor.skeleton.root };
      this.render();
      return;
    }

    // Outils de transformation : un clic sélectionne, puis le glisser transforme la sélection.
    this.selectHit(this.hitTest(p.x, p.y));
    if (editor.attachment instanceof MeshAttachment && (editor.attachment.weights || editor.attachment.parent) && editor.selectionKind === 'attachment') {
      this.notify?.('Un maillage avec des poids suit ses os : modifiez ses sommets avec « Modifier le maillage ».');
      return;
    }
    const target = editor.selectionKind === 'attachment'
      ? (editor.attachment instanceof MeshAttachment ? meshTarget(editor.selectedSlot, editor.attachment)
        : attachmentTarget(editor.selectedSlot, editor.attachment))
      : editor.selectionKind === 'bone' ? boneTarget(editor.selected, editor.animating) : null;
    if (!target) return;
    if (editor.tool === TOOLS.shear && !target.canShear) return;
    editor.begin();
    const f = target.frame();
    this.drag = {
      kind: editor.tool,
      target,
      start: w,
      startAngle: atan2Deg(w.y - f.y, w.x - f.x),
      startWorld: { x: f.x, y: f.y },
      initial: target.save(),
      axisAngle: atan2Deg(f.ay, f.ax),
    };
    this.render();
  }

  onMove(e) {
    const p = this.local(e);
    const w = this.toWorld(p.x, p.y);
    this.mouseWorld = w;
    const d = this.drag;

    if (d?.kind === 'mesh') {
      this.mesh.move(p, w);
      return;
    }
    if (!d && this.editor.meshTool && this.mesh.active()) {
      this.mesh.move(p, w);
      this.reportStatus();
      return;
    }

    if (!d) {
      const hit = this.hitTest(p.x, p.y);
      if (!sameHit(hit, this.hover)) {
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

    const t = d.target;
    const init = d.initial;
    switch (d.kind) {
      case TOOLS.rotate: {
        const angle = atan2Deg(w.y - d.startWorld.y, w.x - d.startWorld.x);
        let r = init.rotation + wrapDeg(angle - d.startAngle) * t.flip;
        if (e.shiftKey) r = Math.round(r / SNAP_DEG) * SNAP_DEG;
        t.setRotation(r);
        break;
      }
      case TOOLS.translate: {
        let dx = w.x - d.start.x;
        let dy = w.y - d.start.y;
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        t.setWorldPosition(d.startWorld.x + dx, d.startWorld.y + dy);
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
          t.setScale(init.scaleX * f, init.scaleY * f);
        } else {
          t.setScale(
            Math.abs(s0.x) > minSpan ? init.scaleX * (s1.x / s0.x) : init.scaleX,
            Math.abs(s0.y) > minSpan ? init.scaleY * (s1.y / s0.y) : init.scaleY,
          );
        }
        break;
      }
      case TOOLS.shear: {
        const angle = atan2Deg(w.y - d.startWorld.y, w.x - d.startWorld.x);
        const delta = wrapDeg(angle - d.startAngle) * t.flip;
        if (e.shiftKey) t.setShear(init.shearX + delta, init.shearY);
        else t.setShear(init.shearX, init.shearY + delta);
        break;
      }
      default:
        break;
    }
    // Mode Animation : la pose modifiée devient une clé au temps courant (clé automatique).
    if (this.editor.animating && this.editor.autoKey && t.bone) this.editor.keyBone(t.bone, [d.kind]);
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

    if (d.kind === 'mesh') {
      this.mesh.up();
      return;
    }

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
          const worldAngle = atan2Deg(d.end.y - d.start.y, d.end.x - d.start.x);
          bone.rotation = bone.worldToLocalRotation(worldAngle);
          sk.updateWorldTransform();
          bone.length = Math.hypot(d.end.x - d.start.x, d.end.y - d.start.y) / (bone.worldScaleX || 1);
        }
        editor.selected = bone;
        editor.selectedSlot = null;
        editor.selectedAttachment = null;
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
    if (d.kind === 'mesh') this.mesh.cancel();
    else if (d.kind !== 'pan' && d.kind !== 'create') this.editor.cancel();
    this.render();
  }

  // Image PNG de la vue (pour les captures et la vérification automatique).
  snapshotDataURL() {
    this.app.renderer.render(this.app.stage);
    return this.app.canvas.toDataURL('image/png');
  }
}

// --- Cibles des outils de transformation ------------------------------------------------
// Une cible donne son repère monde (frame) et sait appliquer rotation, position, échelle.

function determinantSign(b) {
  return b ? Math.sign(b.a * b.d - b.b * b.c) || 1 : 1;
}

// En mode Animation, la cible est la pose courante de l'os (bone.pose) ; sinon, sa pose de base.
function boneTarget(bone, animating = false) {
  if (!bone) return null;
  const v = animating ? bone.pose : bone;
  return {
    bone,
    canShear: true,
    flip: determinantSign(bone.parent),
    frame: () => ({ x: bone.worldX, y: bone.worldY, ax: bone.a, ay: bone.c, bx: bone.b, by: bone.d }),
    save: () => ({
      rotation: v.rotation, scaleX: v.scaleX, scaleY: v.scaleY, shearX: v.shearX, shearY: v.shearY,
    }),
    setRotation: (r) => {
      v.rotation = r;
    },
    setWorldPosition: (x, y) => {
      const l = bone.parentWorldToLocal(x, y);
      v.x = l.x;
      v.y = l.y;
    },
    setScale: (sx, sy) => {
      v.scaleX = sx;
      v.scaleY = sy;
    },
    setShear: (shx, shy) => {
      v.shearX = shx;
      v.shearY = shy;
    },
  };
}

// Maillage sans poids transformé en bloc autour de son centre (rotation, déplacement, échelle).
function meshTarget(slot, mesh) {
  const bone = slot.bone;
  const base = mesh.vertices.map((v) => [...v]);
  const cx = base.reduce((s, v) => s + v[0], 0) / base.length;
  const cy = base.reduce((s, v) => s + v[1], 0) / base.length;
  const st = { rotation: 0, scaleX: 1, scaleY: 1, ox: 0, oy: 0 };
  const apply = () => {
    const r = (st.rotation * Math.PI) / 180;
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    mesh.vertices = base.map(([x, y]) => {
      const dx = (x - cx) * st.scaleX;
      const dy = (y - cy) * st.scaleY;
      return [cx + st.ox + dx * cos - dy * sin, cy + st.oy + dx * sin + dy * cos];
    });
  };
  return {
    canShear: false,
    flip: determinantSign(bone),
    frame: () => {
      const c = bone.localToWorld(cx + st.ox, cy + st.oy);
      return { x: c.x, y: c.y, ax: bone.a, ay: bone.c, bx: bone.b, by: bone.d };
    },
    save: () => ({ rotation: st.rotation, scaleX: st.scaleX, scaleY: st.scaleY }),
    setRotation: (r) => {
      st.rotation = r;
      apply();
    },
    setWorldPosition: (x, y) => {
      const l = bone.worldToLocal(x, y);
      st.ox = l.x - cx;
      st.oy = l.y - cy;
      apply();
    },
    setScale: (sx, sy) => {
      st.scaleX = sx;
      st.scaleY = sy;
      apply();
    },
    setShear: () => {},
  };
}

function attachmentTarget(slot, att) {
  if (!slot || !(att instanceof RegionAttachment)) return null;
  const bone = slot.bone;
  return {
    canShear: false,
    flip: determinantSign(bone),
    frame: () => {
      const c = bone.localToWorld(att.x, att.y);
      const r = (att.rotation * Math.PI) / 180;
      const ux = Math.cos(r);
      const uy = Math.sin(r);
      // Axes de l'image dans le repère de l'os, puis dans le monde.
      return {
        x: c.x,
        y: c.y,
        ax: bone.a * ux + bone.b * uy,
        ay: bone.c * ux + bone.d * uy,
        bx: bone.a * -uy + bone.b * ux,
        by: bone.c * -uy + bone.d * ux,
      };
    },
    save: () => ({ rotation: att.rotation, scaleX: att.scaleX, scaleY: att.scaleY }),
    setRotation: (r) => {
      att.rotation = r;
    },
    setWorldPosition: (x, y) => {
      const l = bone.worldToLocal(x, y);
      att.x = l.x;
      att.y = l.y;
    },
    setScale: (sx, sy) => {
      att.scaleX = sx;
      att.scaleY = sy;
    },
    setShear: () => {},
  };
}

// Coordonnées (u, v) dans l'image du point monde w (u vers la droite, v vers le bas).
function attachmentUV(bone, att, w) {
  const l = bone.worldToLocal(w.x, w.y);
  const r = (-att.rotation * Math.PI) / 180;
  const dx = l.x - att.x;
  const dy = l.y - att.y;
  const px = (dx * Math.cos(r) - dy * Math.sin(r)) / (att.scaleX || 1);
  const py = (dx * Math.sin(r) + dy * Math.cos(r)) / (att.scaleY || 1);
  return { u: px / att.width + 0.5, v: 0.5 - py / att.height };
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

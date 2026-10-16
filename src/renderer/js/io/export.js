// Export pour les moteurs de jeu et en images.
//
//   exportData   : <nom>.json (squelette, animations…) + <nom>.atlas.json + pages <nom>.png, <nom>_2.png…
//   renderFrames : images d'une animation rendues hors écran (pour PNG, planche de sprites, GIF, WebM).
//
// Atlas : chaque image utilisée est (éventuellement) rognée de ses bords transparents et réduite par
// « scale », puis rangée dans des pages. Les coordonnées du squelette ne changent pas : un runtime
// affiche chaque région à sa taille d'origine (originalWidth × originalHeight, en pixels de l'image source).

import { Application, Container } from 'pixi.js';
import { packRects, usedImages, trimBounds } from '../model/atlas.js';
import { serializeProject, parseProject } from '../model/format.js';
import { MeshAttachment } from '../model/mesh.js';
import { RegionAttachment } from '../model/attachment.js';
import { AttachmentsView } from '../view/attachments.js';
import { canvasToPng } from './layers.js';
import { encodeGif } from './gif.js';

const text = (s) => new TextEncoder().encode(s);

// --- Données (JSON + atlas) ----------------------------------------------------------------------

export async function buildAtlas(skeleton, library, { name, scale = 1, padding = 2, maxSize = 2048, rotate = true, pot = false, trim = true }) {
  const used = usedImages(skeleton);
  const missing = [...used.keys()].filter((p) => !library.get(p));
  if (missing.length) throw new Error(`Images introuvables : ${missing.join(', ')}`);
  const rects = [];
  for (const [path, info] of used) {
    const e = library.get(path);
    const a = library.alphaInfo(path);
    // Les images de maillage ne sont pas rognées (leurs coordonnées d'image couvrent toute l'image).
    const t = trim && !info.mesh ? trimBounds(a.alpha, a.width, a.height) : { x: 0, y: 0, width: e.width, height: e.height };
    rects.push({
      id: path,
      width: Math.max(1, Math.round(t.width * scale)),
      height: Math.max(1, Math.round(t.height * scale)),
      src: { bitmap: e.bitmap, ...t },
      original: { width: e.width, height: e.height },
    });
  }
  const pages = packRects(rects, { maxWidth: maxSize, maxHeight: maxSize, padding, rotate, pot });
  const byId = new Map(rects.map((r) => [r.id, r]));
  const atlas = { format: 'worldnime2d-atlas', version: 1, scale, pages: [], regions: {} };
  const files = [];
  for (let pi = 0; pi < pages.length; pi++) {
    const page = pages[pi];
    const file = pi === 0 ? `${name}.png` : `${name}_${pi + 1}.png`;
    const canvas = new OffscreenCanvas(page.width, page.height);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    for (const it of page.items) {
      const r = byId.get(it.id);
      const { bitmap, x, y, width, height } = r.src;
      ctx.save();
      if (it.rotated) {
        // Rotation de 90° dans le sens horaire : la largeur de l'image descend le long de Y.
        ctx.translate(it.x + it.height, it.y);
        ctx.rotate(Math.PI / 2);
      } else ctx.translate(it.x, it.y);
      ctx.drawImage(bitmap, x, y, width, height, 0, 0, it.width, it.height);
      ctx.restore();
      atlas.regions[it.id] = {
        page: pi, x: it.x, y: it.y, width: it.width, height: it.height, rotated: it.rotated,
        // Position de la zone rognée dans l'image d'origine (pixels, origine en haut à gauche).
        offsetX: r.src.x, offsetY: r.src.y, trimmedWidth: r.src.width, trimmedHeight: r.src.height,
        originalWidth: r.original.width, originalHeight: r.original.height,
      };
    }
    atlas.pages.push({ file, width: page.width, height: page.height });
    files.push({ file, bytes: await canvasToPng(canvas) });
  }
  return { atlas, files };
}

// Données du squelette pour les runtimes : le format du projet sans les réglages propres à l'éditeur.
export function exportSkeletonJSON(skeleton, { appVersion, atlasFile }) {
  const data = serializeProject(skeleton, { appVersion });
  delete data.skeleton.images;
  delete data.skeleton.reference;
  delete data.skeleton.activeSkins;
  delete data.skeleton.editSkin;
  data.export = { atlas: atlasFile };
  return `${JSON.stringify(data)}\n`;
}

export async function exportData({ skeleton, library, api, dir, name, appVersion, atlasOptions }) {
  const { atlas, files } = await buildAtlas(skeleton, library, { name, ...atlasOptions });
  const atlasFile = `${name}.atlas.json`;
  for (const f of files) await api.writeImage(dir, f.file, f.bytes);
  await api.writeImage(dir, atlasFile, text(`${JSON.stringify(atlas, null, 2)}\n`));
  await api.writeImage(dir, `${name}.json`, text(exportSkeletonJSON(skeleton, { appVersion, atlasFile })));
  return { files: [`${name}.json`, atlasFile, ...files.map((f) => f.file)], pages: atlas.pages.length };
}

// --- Images ----------------------------------------------------------------------------------------

// Rend chaque image d'une animation. Renvoie { width, height, frames: [ImageData] }.
// options : fps, scale, margin (pixels), background (null = transparent, ou « #rrggbb »), renderer.
export async function renderFrames(skeleton, library, animName, { fps = 30, scale = 1, margin = 8, background = null, renderer = 'webgl', onProgress } = {}) {
  // Copie indépendante du squelette (mêmes skins actives).
  const sk = parseProject(JSON.stringify(serializeProject(skeleton)));
  sk.activeSkins = [...skeleton.activeSkins];
  sk.posed = true;
  const anim = sk.findAnimation(animName);
  if (!anim) throw new Error(`Animation introuvable : ${animName}`);
  // Une image par pas de 1/fps, de 0 à la fin (exclue : en boucle, elle est identique à la première).
  const count = Math.max(1, Math.round(anim.duration * fps));
  const times = Array.from({ length: count }, (_, i) => i / fps);

  // Poses (physique simulée depuis le début) et cadre englobant de toute l'animation.
  const poseAt = (t, first) => {
    sk.setToSetupPose();
    anim.apply(sk, t);
    sk.time = t;
    sk.updateWorldTransform(first ? 'reset' : 'update');
  };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  times.forEach((t, i) => {
    poseAt(t, i === 0);
    for (const slot of sk.drawOrder) {
      const att = sk.currentAttachment(slot);
      if (!(att instanceof RegionAttachment) && !(att instanceof MeshAttachment)) continue;
      if (slot.bone.active === false) continue;
      const v = sk.attachmentVertices(slot, att);
      for (let k = 0; k < v.length; k += 2) {
        minX = Math.min(minX, v[k]);
        maxX = Math.max(maxX, v[k]);
        minY = Math.min(minY, v[k + 1]);
        maxY = Math.max(maxY, v[k + 1]);
      }
    }
  });
  if (!Number.isFinite(minX)) throw new Error('Rien à dessiner dans cette animation.');
  const width = Math.max(1, Math.ceil((maxX - minX) * scale + margin * 2));
  const height = Math.max(1, Math.ceil((maxY - minY) * scale + margin * 2));

  const app = new Application();
  await app.init({
    width, height, preference: renderer, antialias: true, preserveDrawingBuffer: true, autoStart: false,
    backgroundAlpha: background ? 1 : 0, background: background ?? 0x000000,
  });
  try {
    const view = new AttachmentsView(library, app.renderer.name === 'webgl');
    const world = new Container();
    world.addChild(view.container);
    app.stage.addChild(world);
    world.position.set(margin - minX * scale, margin + maxY * scale);
    world.scale.set(scale, -scale);
    const frames = [];
    const copy = new OffscreenCanvas(width, height);
    const ctx = copy.getContext('2d', { willReadFrequently: true });
    for (let i = 0; i < times.length; i++) {
      poseAt(times[i], i === 0);
      view.update(sk);
      app.renderer.render(app.stage);
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(app.canvas, 0, 0);
      frames.push(ctx.getImageData(0, 0, width, height));
      onProgress?.(i + 1, times.length);
      if (i % 8 === 7) await new Promise((r) => setTimeout(r, 0));
    }
    return { width, height, frames, fps };
  } finally {
    // Surtout pas destroy(true) : PixiJS libérerait aussi ses réserves globales (lots de rendu),
    // partagées avec le renderer de l'éditeur, qui planterait à l'image suivante.
    app.destroy({ removeView: true }, { children: true });
  }
}

async function imageDataToPng(img) {
  const c = new OffscreenCanvas(img.width, img.height);
  c.getContext('2d').putImageData(img, 0, 0);
  return canvasToPng(c);
}

export async function exportPngSequence({ result, api, dir, base }) {
  const files = [];
  const digits = String(result.frames.length).length;
  for (let i = 0; i < result.frames.length; i++) {
    const file = `${base}_${String(i).padStart(Math.max(3, digits), '0')}.png`;
    await api.writeImage(dir, file, await imageDataToPng(result.frames[i]));
    files.push(file);
  }
  return files;
}

// Planche de sprites : images en grille + description JSON (position de chaque image).
export async function exportSpriteSheet({ result, api, dir, base }) {
  const n = result.frames.length;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const { width: w, height: h } = result;
  const sheet = new OffscreenCanvas(cols * w, rows * h);
  const ctx = sheet.getContext('2d');
  const frames = [];
  result.frames.forEach((img, i) => {
    const x = (i % cols) * w;
    const y = Math.floor(i / cols) * h;
    ctx.putImageData(img, x, y);
    frames.push({ x, y, width: w, height: h });
  });
  await api.writeImage(dir, `${base}_planche.png`, await canvasToPng(sheet));
  const meta = { image: `${base}_planche.png`, fps: result.fps, frameWidth: w, frameHeight: h, columns: cols, frames };
  await api.writeImage(dir, `${base}_planche.json`, text(`${JSON.stringify(meta, null, 2)}\n`));
  return [`${base}_planche.png`, `${base}_planche.json`];
}

export async function exportGif({ result, api, dir, base }) {
  const gif = encodeGif(result.frames.map((f) => ({ data: f.data, width: f.width, height: f.height })), { delayMs: 1000 / result.fps });
  await api.writeImage(dir, `${base}.gif`, gif);
  return [`${base}.gif`];
}

// Vidéo WebM (VP9 ou VP8) : les images sont envoyées au rythme de la cadence. Le fond est opaque.
export async function exportWebm({ result, api, dir, base, background = '#ffffff' }) {
  const canvas = document.createElement('canvas');
  canvas.width = result.width;
  canvas.height = result.height;
  const ctx = canvas.getContext('2d');
  const tmp = new OffscreenCanvas(result.width, result.height);
  const tctx = tmp.getContext('2d');
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0];
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error('L\'enregistrement vidéo WebM n\'est pas disponible.');
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((r) => {
    rec.onstop = r;
  });
  rec.start();
  for (const img of result.frames) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    tctx.putImageData(img, 0, 0);
    ctx.drawImage(tmp, 0, 0);
    track.requestFrame?.();
    await new Promise((r) => setTimeout(r, 1000 / result.fps));
  }
  rec.stop();
  await done;
  const blob = new Blob(chunks, { type: 'video/webm' });
  await api.writeImage(dir, `${base}.webm`, new Uint8Array(await blob.arrayBuffer()));
  return [`${base}.webm`];
}

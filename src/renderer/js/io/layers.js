// Lecture des fichiers à calques : OpenRaster (.ora, Krita, GIMP, MyPaint) et Photoshop (.psd).
// Résultat commun : la taille du document et la liste des calques visibles, du fond vers l'avant,
// chacun recadré sur ses pixels non transparents.

import { readPsd } from 'ag-psd';

export async function readLayerFile(fileName, bytes) {
  const ext = fileName.split('.').pop().toLowerCase();
  if (ext === 'ora') return readOra(bytes);
  if (ext === 'psd') return readPsdFile(bytes);
  throw new Error('Format non pris en charge : seuls .ora et .psd sont acceptés.');
}

// --- OpenRaster ------------------------------------------------------------------------

async function readOra(bytes) {
  const zip = readZip(bytes);
  const stackEntry = zip.get('stack.xml');
  if (!stackEntry) throw new Error('Fichier ORA invalide : stack.xml manquant.');
  const xml = new TextDecoder().decode(await unzipEntry(bytes, stackEntry));
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const image = doc.querySelector('image');
  if (!image) throw new Error('Fichier ORA invalide : stack.xml illisible.');
  const width = Number(image.getAttribute('w'));
  const height = Number(image.getAttribute('h'));

  // Dans un ORA, le premier calque est celui du dessus : on parcourt puis on inverse.
  const found = [];
  const walk = (stack, ox, oy, hidden) => {
    for (const el of stack.children) {
      const x = ox + Number(el.getAttribute('x') || 0);
      const y = oy + Number(el.getAttribute('y') || 0);
      const isHidden = hidden || el.getAttribute('visibility') === 'hidden';
      if (el.tagName === 'stack') walk(el, x, y, isHidden);
      else if (el.tagName === 'layer') {
        found.push({
          name: el.getAttribute('name') || 'calque',
          src: el.getAttribute('src'),
          x,
          y,
          hidden: isHidden,
          opacity: Number(el.getAttribute('opacity') ?? 1),
          blend: oraBlend(el.getAttribute('composite-op') || el.getAttribute('composite_op')),
        });
      }
    }
  };
  walk(image.querySelector('stack'), 0, 0, false);
  found.reverse();

  const layers = [];
  let skipped = 0;
  for (const l of found) {
    if (l.hidden) {
      skipped++;
      continue;
    }
    const entry = zip.get(l.src);
    if (!entry) throw new Error(`Calque introuvable dans l'archive : ${l.src}`);
    const png = await unzipEntry(bytes, entry);
    const bitmap = await createImageBitmap(new Blob([png], { type: 'image/png' }));
    const trimmed = trim(bitmap);
    bitmap.close();
    if (!trimmed) {
      skipped++;
      continue;
    }
    layers.push({ ...trimmed, name: l.name, left: l.x + trimmed.dx, top: l.y + trimmed.dy, opacity: l.opacity, blend: l.blend });
  }
  return { width, height, layers, skipped };
}

function oraBlend(op) {
  if (op === 'svg:multiply') return 'multiply';
  if (op === 'svg:screen') return 'screen';
  if (op === 'svg:plus' || op === 'svg:color-dodge') return 'additive';
  return 'normal';
}

// --- Photoshop -----------------------------------------------------------------------------

function readPsdFile(bytes) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const psd = readPsd(buffer, { skipCompositeImageData: true, skipThumbnail: true, skipLinkedFilesData: true });
  const layers = [];
  let skipped = 0;
  // ag-psd donne les calques du fond vers le dessus.
  const walk = (children, hidden) => {
    for (const layer of children ?? []) {
      const isHidden = hidden || layer.hidden;
      if (layer.children) {
        walk(layer.children, isHidden);
        continue;
      }
      if (isHidden || !layer.canvas || !layer.canvas.width || !layer.canvas.height) {
        skipped++;
        continue;
      }
      const trimmed = trim(layer.canvas);
      if (!trimmed) {
        skipped++;
        continue;
      }
      layers.push({
        ...trimmed,
        name: layer.name || 'calque',
        left: (layer.left ?? 0) + trimmed.dx,
        top: (layer.top ?? 0) + trimmed.dy,
        opacity: layer.opacity ?? 1,
        blend: psdBlend(layer.blendMode),
      });
    }
  };
  walk(psd.children, false);
  return { width: psd.width, height: psd.height, layers, skipped };
}

function psdBlend(mode) {
  if (mode === 'multiply') return 'multiply';
  if (mode === 'screen') return 'screen';
  if (mode === 'linear dodge' || mode === 'color dodge') return 'additive';
  return 'normal';
}

// --- Recadrage --------------------------------------------------------------------------------

// Recadre une image sur ses pixels non transparents.
// Renvoie { canvas, width, height, dx, dy } ou null si l'image est vide.
function trim(source) {
  const w = source.width;
  const h = source.height;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (data[row + x * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const tw = maxX - minX + 1;
  const th = maxY - minY + 1;
  const out = new OffscreenCanvas(tw, th);
  out.getContext('2d').drawImage(canvas, minX, minY, tw, th, 0, 0, tw, th);
  return { canvas: out, width: tw, height: th, dx: minX, dy: minY };
}

export async function canvasToPng(canvas) {
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new Uint8Array(await blob.arrayBuffer());
}

// --- Lecture d'une archive zip (suffisant pour l'OpenRaster) -------------------------------

function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Fin du répertoire central : signature 0x06054b50, cherchée depuis la fin.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Archive zip invalide.');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries = new Map();
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('Archive zip invalide (répertoire central).');
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    entries.set(name, { method, compressedSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function unzipEntry(bytes, entry) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const p = entry.localOffset;
  if (view.getUint32(p, true) !== 0x04034b50) throw new Error('Archive zip invalide (en-tête local).');
  const start = p + 30 + view.getUint16(p + 26, true) + view.getUint16(p + 28, true);
  const data = bytes.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return data;
  if (entry.method !== 8) throw new Error(`Compression zip non gérée (méthode ${entry.method}).`);
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Nom de fichier sûr sous Windows et Linux.
export function safeFileName(name) {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').trim();
  return cleaned || 'calque';
}

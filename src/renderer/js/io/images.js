// Bibliothèque d'images : le contenu du dossier d'images du projet, chargé en textures PixiJS.
// Le dossier est surveillé : une image retouchée dans Krita ou GIMP se met à jour toute seule.

import { Texture, ImageSource } from 'pixi.js';

export class ImageLibrary extends EventTarget {
  constructor(api) {
    super();
    this.api = api;
    this.dir = null;
    // path (sans extension) → { file, path, mtime, texture, width, height, url, alpha }
    this.entries = new Map();
    this.loading = null;
    api.onImagesChanged?.(() => this.reload());
  }

  get list() {
    return [...this.entries.values()];
  }

  get(path) {
    return this.entries.get(path) ?? null;
  }

  async setDir(dir) {
    if (dir === this.dir) return;
    this.dir = dir;
    this.clear();
    await this.api.watchImages(dir);
    await this.reload();
  }

  clear() {
    for (const e of this.entries.values()) this.dispose(e);
    this.entries.clear();
  }

  // Prévient la vue avant de détruire une texture, pour qu'elle cesse de l'utiliser.
  dispose(e) {
    if (e.texture) this.dispatchEvent(new CustomEvent('dispose', { detail: e.texture }));
    disposeEntry(e);
  }

  // Recharge les images ajoutées ou modifiées depuis la dernière fois.
  async reload() {
    if (this.loading) {
      this.reloadAgain = true;
      return this.loading;
    }
    this.loading = this.doReload();
    try {
      await this.loading;
    } finally {
      this.loading = null;
    }
    if (this.reloadAgain) {
      this.reloadAgain = false;
      await this.reload();
    }
  }

  async doReload() {
    const dir = this.dir;
    if (!dir) {
      this.emitChange();
      return;
    }
    const files = await this.api.listImages(dir);
    if (dir !== this.dir) return;
    const seen = new Set();
    for (const f of files) {
      seen.add(f.path);
      const old = this.entries.get(f.path);
      if (old && old.mtime === f.mtime && old.file === f.file) continue;
      try {
        const bytes = await this.api.readImage(dir, f.file);
        const entry = await decodeImage(bytes, f);
        if (dir !== this.dir) {
          disposeEntry(entry);
          return;
        }
        if (old) this.dispose(old);
        this.entries.set(f.path, entry);
      } catch (err) {
        console.warn(`Image illisible : ${f.file}`, err);
      }
    }
    for (const [path, e] of this.entries) {
      if (!seen.has(path)) {
        this.dispose(e);
        this.entries.delete(path);
      }
    }
    this.emitChange();
  }

  emitChange() {
    this.dispatchEvent(new Event('change'));
  }

  // Opacité (0 à 255) du pixel (u, v) de l'image, u et v entre 0 et 1. Sert à cliquer sur les images.
  alphaAt(path, u, v) {
    const e = this.entries.get(path);
    if (!e) return 255;
    if (!e.alpha) e.alpha = readAlpha(e.bitmap);
    const x = Math.min(e.width - 1, Math.max(0, Math.floor(u * e.width)));
    const y = Math.min(e.height - 1, Math.max(0, Math.floor(v * e.height)));
    return e.alpha[y * e.width + x];
  }
}

export async function decodeImage(bytes, info) {
  const blob = new Blob([bytes], { type: mimeOf(info.file) });
  const bitmap = await createImageBitmap(blob);
  const source = new ImageSource({ resource: bitmap });
  const texture = new Texture({ source });
  return {
    ...info,
    bitmap,
    texture,
    width: bitmap.width,
    height: bitmap.height,
    url: URL.createObjectURL(blob),
    alpha: null,
  };
}

function disposeEntry(e) {
  e.texture?.destroy(true);
  e.bitmap?.close?.();
  if (e.url) URL.revokeObjectURL(e.url);
}

function readAlpha(bitmap) {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
  const alpha = new Uint8Array(bitmap.width * bitmap.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
  return alpha;
}

function mimeOf(file) {
  const ext = file.split('.').pop().toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return 'image/png';
}

// Nom d'image par défaut pour un slot : la dernière partie du chemin (« bras/main_g » → « main_g »).
export function baseName(path) {
  return path.split('/').pop();
}

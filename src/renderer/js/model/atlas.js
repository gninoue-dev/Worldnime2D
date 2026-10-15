// Empaquetage de textures (atlas) : range des rectangles d'images dans des pages, sans chevauchement.
// Algorithme MaxRects, heuristique « meilleur petit côté » (Best Short Side Fit), rotation 90° possible.

// rects : [{ id, width, height }]. Options : maxWidth, maxHeight, padding (espace entre images),
// rotate (autoriser la rotation de 90°), pot (pages en puissances de deux).
// Renvoie [{ width, height, items: [{ id, x, y, width, height, rotated }] }] (width/height sans rotation).
export function packRects(rects, { maxWidth = 2048, maxHeight = 2048, padding = 2, rotate = true, pot = false } = {}) {
  const todo = rects.map((r) => ({ ...r, w: r.width + padding, h: r.height + padding }));
  for (const r of todo) {
    const fits = (r.w <= maxWidth + padding && r.h <= maxHeight + padding) || (rotate && r.h <= maxWidth + padding && r.w <= maxHeight + padding);
    if (!fits) throw new Error(`Image trop grande pour une page de ${maxWidth} × ${maxHeight} : ${r.id} (${r.width} × ${r.height}).`);
  }
  // Les plus grands d'abord.
  todo.sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h);
  const pages = [];
  while (todo.length) {
    const page = packPage(todo, maxWidth + padding, maxHeight + padding, rotate);
    if (page.items.length === 0) throw new Error('Empaquetage impossible.');
    let w = 0;
    let h = 0;
    for (const it of page.items) {
      w = Math.max(w, it.x + (it.rotated ? it.height : it.width));
      h = Math.max(h, it.y + (it.rotated ? it.width : it.height));
    }
    if (pot) {
      w = 2 ** Math.ceil(Math.log2(Math.max(1, w)));
      h = 2 ** Math.ceil(Math.log2(Math.max(1, h)));
    }
    pages.push({ width: Math.min(w, maxWidth), height: Math.min(h, maxHeight), items: page.items });
  }
  return pages;
}

function packPage(todo, W, H, rotate) {
  let free = [{ x: 0, y: 0, w: W, h: H }];
  const items = [];
  for (let k = 0; k < todo.length;) {
    // Meilleure place pour l'un des rectangles restants.
    let best = null;
    for (let i = 0; i < todo.length; i++) {
      const r = todo[i];
      for (const f of free) {
        for (const rot of rotate && r.w !== r.h ? [false, true] : [false]) {
          const w = rot ? r.h : r.w;
          const h = rot ? r.w : r.h;
          if (w > f.w || h > f.h) continue;
          const shortSide = Math.min(f.w - w, f.h - h);
          const longSide = Math.max(f.w - w, f.h - h);
          if (!best || shortSide < best.shortSide || (shortSide === best.shortSide && longSide < best.longSide)) {
            best = { i, x: f.x, y: f.y, w, h, rot, shortSide, longSide };
          }
        }
      }
    }
    if (!best) break;
    const r = todo[best.i];
    todo.splice(best.i, 1);
    items.push({ id: r.id, x: best.x, y: best.y, width: r.width, height: r.height, rotated: best.rot });
    // Découpe des espaces libres touchés par le rectangle placé.
    const placed = { x: best.x, y: best.y, w: best.w, h: best.h };
    const next = [];
    for (const f of free) {
      if (placed.x >= f.x + f.w || placed.x + placed.w <= f.x || placed.y >= f.y + f.h || placed.y + placed.h <= f.y) {
        next.push(f);
        continue;
      }
      if (placed.x > f.x) next.push({ x: f.x, y: f.y, w: placed.x - f.x, h: f.h });
      if (placed.x + placed.w < f.x + f.w) next.push({ x: placed.x + placed.w, y: f.y, w: f.x + f.w - placed.x - placed.w, h: f.h });
      if (placed.y > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: placed.y - f.y });
      if (placed.y + placed.h < f.y + f.h) next.push({ x: f.x, y: placed.y + placed.h, w: f.w, h: f.y + f.h - placed.y - placed.h });
    }
    // On retire les espaces contenus dans d'autres.
    free = next.filter((a, i) => !next.some((b, j) => i !== j && a.x >= b.x && a.y >= b.y
      && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h && (j < i || a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h)));
  }
  return { items };
}

// Images utilisées par le squelette (toutes skins), avec le type de pièces jointes qui les utilisent.
// Renvoie Map chemin → { mesh: bool } (une image de maillage n'est pas rognée).
export function usedImages(skeleton) {
  const out = new Map();
  for (const skin of skeleton.skins) {
    for (const map of skin.attachments.values()) {
      for (const att of map.values()) {
        if (att.type !== 'region' && att.type !== 'mesh') continue;
        const e = out.get(att.imagePath) ?? { mesh: false };
        if (att.type === 'mesh') e.mesh = true;
        out.set(att.imagePath, e);
      }
    }
  }
  return out;
}

// Zone non transparente d'une image : { x, y, width, height } (toute l'image si elle est vide).
export function trimBounds(alpha, width, height, threshold = 0) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[y * width + x] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, width: 1, height: 1 };
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

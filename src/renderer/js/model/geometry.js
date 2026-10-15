// Géométrie des maillages : triangulation, contour d'une image, enveloppe convexe, simplification.

// Triangulation de Delaunay (Bowyer-Watson) des points, puis on ne garde que les triangles
// dont le centre est dans le contour (les hull premiers points, dans l'ordre).
// edges : arêtes imposées [[i, j], ...] (insérées par retournement d'arêtes).
// points : [[x, y], ...]. Renvoie une liste plate d'indices [a, b, c, ...].
export function triangulate(points, hull = points.length, edges = []) {
  const n = points.length;
  if (n < 3) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const d = Math.max(maxX - minX, maxY - minY, 1) * 20;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  // Super-triangle qui contient tous les points (indices n, n+1, n+2).
  const pts = [...points, [cx - d, cy - d], [cx + d, cy - d], [cx, cy + d]];
  let tris = [[n, n + 1, n + 2]];

  for (let i = 0; i < n; i++) {
    const [px, py] = pts[i];
    const bad = [];
    const keep = [];
    for (const t of tris) (inCircumcircle(pts, t, px, py) ? bad : keep).push(t);
    // Bord du trou : les arêtes des mauvais triangles qui ne sont partagées par aucun autre.
    const edges = new Map();
    for (const t of bad) {
      for (const [a, b] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
        const k = a < b ? `${a},${b}` : `${b},${a}`;
        edges.set(k, edges.has(k) ? null : [a, b]);
      }
    }
    tris = keep;
    for (const e of edges.values()) if (e) tris.push([e[0], e[1], i]);
  }

  tris = tris.filter((t) => t.every((v) => v < n));
  for (const [u, v] of edges) insertEdge(pts, tris, u, v);

  const polygon = points.slice(0, Math.max(3, hull));
  const out = [];
  for (const t of tris) {
    if (t.some((v) => v >= n)) continue;
    const [a, b, c] = t.map((v) => pts[v]);
    if (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 1e-9) continue;
    const gx = (a[0] + b[0] + c[0]) / 3;
    const gy = (a[1] + b[1] + c[1]) / 3;
    if (hull >= 3 && !pointInPolygon(polygon, gx, gy)) continue;
    // Sens anti-horaire pour tous les triangles.
    if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) < 0) out.push(t[0], t[2], t[1]);
    else out.push(t[0], t[1], t[2]);
  }
  return out;
}

// Retourne les arêtes qui coupent le segment (u, v) jusqu'à ce qu'il fasse partie de la triangulation.
function insertEdge(pts, tris, u, v) {
  const has = () => tris.some((t) => t.includes(u) && t.includes(v));
  for (let guard = 0; guard < 500 && !has(); guard++) {
    let flipped = false;
    for (let a = 0; a < tris.length && !flipped; a++) {
      const t = tris[a];
      for (let e = 0; e < 3 && !flipped; e++) {
        const p = t[e];
        const q = t[(e + 1) % 3];
        const r = t[(e + 2) % 3];
        if ([p, q].some((x) => x === u || x === v) || !segmentsCross(pts[p], pts[q], pts[u], pts[v])) continue;
        const b = tris.findIndex((o, i) => i !== a && o.includes(p) && o.includes(q));
        if (b < 0) continue;
        const s = tris[b].find((x) => x !== p && x !== q);
        // Retournement possible seulement si le quadrilatère p, s, q, r est convexe.
        if (!segmentsCross(pts[r], pts[s], pts[p], pts[q])) continue;
        tris[a] = [r, s, p];
        tris[b] = [s, r, q];
        flipped = true;
      }
    }
    if (!flipped) return;
  }
}

function segmentsCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

function inCircumcircle(pts, [i, j, k], px, py) {
  const [ax, ay] = pts[i];
  const [bx, by] = pts[j];
  const [cx, cy] = pts[k];
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-12) return false;
  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  const r2 = (ax - ux) ** 2 + (ay - uy) ** 2;
  return (px - ux) ** 2 + (py - uy) ** 2 < r2 * (1 - 1e-9);
}

export function pointInPolygon(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function polygonArea(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  return a / 2;
}

// Coordonnées barycentriques de (x, y) dans le triangle (a, b, c).
export function barycentric(a, b, c, x, y) {
  const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(d) < 1e-12) return null;
  const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d;
  const l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d;
  return [l1, l2, 1 - l1 - l2];
}

// Enveloppe convexe (chaîne monotone), sens anti-horaire.
export function convexHull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

// Simplification d'un contour fermé (Douglas-Peucker), avec une tolérance en pixels.
export function simplifyClosed(poly, tolerance) {
  if (poly.length <= 4) return poly;
  // On coupe le contour au point le plus éloigné du premier pour avoir deux chaînes ouvertes.
  let far = 0;
  let best = -1;
  poly.forEach((q, i) => {
    const d = (q[0] - poly[0][0]) ** 2 + (q[1] - poly[0][1]) ** 2;
    if (d > best) {
      best = d;
      far = i;
    }
  });
  const a = simplifyOpen(poly.slice(0, far + 1), tolerance);
  const b = simplifyOpen([...poly.slice(far), poly[0]], tolerance);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

function simplifyOpen(pts, tol) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts.at(-1)];
  let idx = -1;
  let dmax = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segmentDistance(pts[i], a, b);
    if (d > dmax) {
      dmax = d;
      idx = i;
    }
  }
  if (dmax <= tol) return [a, b];
  return [...simplifyOpen(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplifyOpen(pts.slice(idx), tol)];
}

function segmentDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

// Contour d'une image d'après sa transparence (marching squares sur une grille réduite).
// alpha : Uint8Array (largeur × hauteur). Renvoie un polygone en pixels de l'image (Y vers le bas),
// simplifié, décalé vers l'extérieur de margin pixels, avec au plus maxPoints sommets.
export function traceContour(alpha, width, height, { threshold = 16, detail = 1, margin = 2, maxPoints = 32 } = {}) {
  // Grille de cellules : 1 = opaque. Taille de cellule adaptée à l'image.
  const cell = Math.max(1, Math.round(Math.max(width, height) / (64 * detail)));
  const gw = Math.ceil(width / cell) + 2;
  const gh = Math.ceil(height / cell) + 2;
  const grid = new Uint8Array(gw * gh);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[y * width + x] > threshold) grid[(Math.floor(y / cell) + 1) * gw + Math.floor(x / cell) + 1] = 1;
    }
  }
  // Bords entre cellules pleines et vides, reliés en boucles.
  const next = new Map();
  const key = (x, y) => y * (gw + 1) + x;
  const add = (x0, y0, x1, y1) => next.set(key(x0, y0), [x1, y1, x0, y0]);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      if (!grid[y * gw + x]) continue;
      // Contour parcouru en gardant le plein à gauche.
      if (!grid[(y - 1) * gw + x]) add(x + 1, y, x, y);
      if (!grid[(y + 1) * gw + x]) add(x, y + 1, x + 1, y + 1);
      if (!grid[y * gw + x - 1]) add(x, y, x, y + 1);
      if (!grid[y * gw + x + 1]) add(x + 1, y + 1, x + 1, y);
    }
  }
  let bestLoop = null;
  let bestArea = 0;
  const seen = new Set();
  for (const [k, start] of next) {
    if (seen.has(k)) continue;
    const loop = [];
    let cur = start;
    let guard = 0;
    let curKey = k;
    while (cur && !seen.has(curKey) && guard++ < 1e6) {
      seen.add(curKey);
      loop.push([cur[2], cur[3]]);
      curKey = key(cur[0], cur[1]);
      cur = next.get(curKey);
    }
    const area = Math.abs(polygonArea(loop));
    if (loop.length >= 3 && area > bestArea) {
      bestArea = area;
      bestLoop = loop;
    }
  }
  if (!bestLoop) return [[0, 0], [width, 0], [width, height], [0, height]];
  // Retour en pixels de l'image.
  let poly = bestLoop.map(([x, y]) => [(x - 1) * cell, (y - 1) * cell]);
  let tol = cell * 0.75;
  poly = simplifyClosed(poly, tol);
  while (poly.length > maxPoints) {
    tol *= 1.4;
    poly = simplifyClosed(poly, tol);
  }
  return offsetPolygon(poly, margin).map(([x, y]) => [
    Math.min(width + margin, Math.max(-margin, x)),
    Math.min(height + margin, Math.max(-margin, y)),
  ]);
}

// Décale chaque sommet vers l'extérieur le long de la bissectrice.
// (polygonArea est négative pour un polygone anti-horaire dans un repère Y vers le haut.)
function offsetPolygon(poly, d) {
  if (!d) return poly;
  const sign = polygonArea(poly) > 0 ? -1 : 1;
  return poly.map((p, i) => {
    const a = poly[(i - 1 + poly.length) % poly.length];
    const b = poly[(i + 1) % poly.length];
    let nx = 0;
    let ny = 0;
    for (const [p0, p1] of [[a, p], [p, b]]) {
      const ex = p1[0] - p0[0];
      const ey = p1[1] - p0[1];
      const l = Math.hypot(ex, ey) || 1;
      nx += (ey / l) * sign;
      ny += (-ex / l) * sign;
    }
    const l = Math.hypot(nx, ny) || 1;
    return [p[0] + (nx / l) * d, p[1] + (ny / l) * d];
  });
}

// Matrice affine (a, b, c, d, tx, ty) qui envoie les trois points src sur les trois points dst :
// x' = a·x + c·y + tx ; y' = b·x + d·y + ty. Renvoie null si les points sont alignés.
export function affineFromTriangles(src, dst) {
  const [[x0, y0], [x1, y1], [x2, y2]] = src;
  const det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (Math.abs(det) < 1e-12) return null;
  const solve = (v0, v1, v2) => {
    const p = ((v1 - v0) * (y2 - y0) - (v2 - v0) * (y1 - y0)) / det;
    const q = ((v2 - v0) * (x1 - x0) - (v1 - v0) * (x2 - x0)) / det;
    return [p, q, v0 - p * x0 - q * y0];
  };
  const [a, c, tx] = solve(dst[0][0], dst[1][0], dst[2][0]);
  const [b, d, ty] = solve(dst[0][1], dst[1][1], dst[2][1]);
  return { a, b, c, d, tx, ty };
}

export function distToSegmentPoint(x, y, a, b) {
  return segmentDistance([x, y], a, b);
}

// Le point monde (x, y) est-il sur un triangle du maillage ? Renvoie ses coordonnées d'image (u, v),
// ou null. verts : positions monde aplaties ; uvs : [[u, v], ...].
export function meshUVAt(verts, triangles, uvs, x, y) {
  for (let t = 0; t < triangles.length; t += 3) {
    const [i, j, k] = [triangles[t], triangles[t + 1], triangles[t + 2]];
    const l = barycentric([verts[i * 2], verts[i * 2 + 1]], [verts[j * 2], verts[j * 2 + 1]], [verts[k * 2], verts[k * 2 + 1]], x, y);
    if (!l || l.some((v) => v < -1e-6)) continue;
    return [0, 1].map((d) => l[0] * uvs[i][d] + l[1] * uvs[j][d] + l[2] * uvs[k][d]);
  }
  return null;
}

// Pièce jointe « maillage » : une image découpée en triangles, déformable.
//
// Sommets :
//   - sans poids : vertices[i] = [x, y] dans le repère de l'os du slot ;
//   - avec poids : weights[i] = [{ bone, x, y, w }, ...] : position du sommet dans le repère de
//     chaque os qui l'influence (au moment de la liaison) et poids (somme = 1).
// uvs[i] = [u, v] dans l'image (0 à 1, v vers le bas). Les hull premiers sommets forment le contour,
// dans l'ordre. triangles = indices par trois. edges = arêtes ajoutées à la main (paires d'indices).
//
// Déformation (FFD) : décalages ajoutés aux positions locales, un couple (dx, dy) par sommet
// (sans poids) ou par influence (avec poids), comme dans Spine.
//
// Maillage lié : parent = nom d'un autre maillage du même slot. Il en reprend la géométrie et les poids
// avec sa propre image ; avec timelines = true, il suit aussi ses déformations animées.

import { WHITE } from './color.js';
import { triangulate, barycentric } from './geometry.js';

export class MeshAttachment {
  constructor(name) {
    this.type = 'mesh';
    this.name = name;
    this.path = null;
    this.color = WHITE;
    this.width = 32;
    this.height = 32;
    this.vertices = [];
    this.weights = null;
    this.uvs = [];
    this.triangles = [];
    this.hull = 0;
    this.edges = [];
    // Maillage lié.
    this.parent = null;
    this.timelines = true;
  }

  get imagePath() {
    return this.path ?? this.name;
  }

  get isLinked() {
    return this.parent !== null;
  }

  get vertexCount() {
    return this.weights ? this.weights.length : this.vertices.length;
  }

  // Nombre de valeurs d'une déformation (2 par sommet, ou 2 par influence avec des poids).
  get deformLength() {
    if (!this.weights) return this.vertices.length * 2;
    let n = 0;
    for (const v of this.weights) n += v.length;
    return n * 2;
  }

  copy(name = this.name) {
    const m = new MeshAttachment(name);
    for (const k of ['path', 'color', 'width', 'height', 'hull', 'parent', 'timelines']) m[k] = this[k];
    m.vertices = this.vertices.map((v) => [...v]);
    m.weights = this.weights ? this.weights.map((list) => list.map((e) => ({ ...e }))) : null;
    m.uvs = this.uvs.map((v) => [...v]);
    m.triangles = [...this.triangles];
    m.edges = this.edges.map((e) => [...e]);
    return m;
  }

  // Positions monde des sommets (Float32Array x, y, x, y…). source = maillage qui porte la géométrie
  // (lui-même, ou le parent d'un maillage lié). deform = décalages (ou null).
  static worldVertices(source, slotBone, skeleton, deform = null, out = null) {
    const n = source.vertexCount;
    const res = out && out.length === n * 2 ? out : new Float32Array(n * 2);
    if (!source.weights) {
      const b = slotBone;
      for (let i = 0; i < n; i++) {
        const x = source.vertices[i][0] + (deform ? deform[i * 2] : 0);
        const y = source.vertices[i][1] + (deform ? deform[i * 2 + 1] : 0);
        res[i * 2] = x * b.a + y * b.b + b.worldX;
        res[i * 2 + 1] = x * b.c + y * b.d + b.worldY;
      }
      return res;
    }
    let f = 0;
    for (let i = 0; i < n; i++) {
      let wx = 0;
      let wy = 0;
      for (const e of source.weights[i]) {
        const b = skeleton.findBone(e.bone);
        const x = e.x + (deform ? deform[f] : 0);
        const y = e.y + (deform ? deform[f + 1] : 0);
        f += 2;
        if (!b) continue;
        wx += (x * b.a + y * b.b + b.worldX) * e.w;
        wy += (x * b.c + y * b.d + b.worldY) * e.w;
      }
      res[i * 2] = wx;
      res[i * 2 + 1] = wy;
    }
    return res;
  }

  // UV aplaties (u, v, u, v…) pour l'affichage.
  flatUVs() {
    const out = new Float32Array(this.uvs.length * 2);
    this.uvs.forEach(([u, v], i) => {
      out[i * 2] = u;
      out[i * 2 + 1] = v;
    });
    return out;
  }
}

// --- Construction et édition (sur un maillage non lié, positions en repère de l'os du slot) ------------

// Maillage équivalent à une image « région » : les 4 coins, 2 triangles.
export function meshFromRegion(region, name = region.name) {
  const m = new MeshAttachment(name);
  m.path = region.path;
  m.color = region.color;
  m.width = region.width;
  m.height = region.height;
  // Coins de la région : bas-gauche, bas-droite, haut-droite, haut-gauche (cf. RegionAttachment).
  m.vertices = region.localCorners().map(([x, y]) => [x, y]);
  m.uvs = [[0, 1], [1, 1], [1, 0], [0, 0]];
  m.hull = 4;
  m.triangles = [0, 1, 2, 0, 2, 3];
  return m;
}

// Transformation affine image (u, v) → repère local, estimée sur le triangle le mieux formé.
export function uvToLocalMapping(mesh, positions) {
  let best = null;
  let bestArea = 0;
  for (let t = 0; t < mesh.triangles.length; t += 3) {
    const [i, j, k] = [mesh.triangles[t], mesh.triangles[t + 1], mesh.triangles[t + 2]];
    const [a, b, c] = [mesh.uvs[i], mesh.uvs[j], mesh.uvs[k]];
    const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
    if (area > bestArea) {
      bestArea = area;
      best = [i, j, k];
    }
  }
  if (!best) return null;
  // Copie : le maillage peut être modifié pendant qu'on utilise la correspondance.
  const uv = best.map((i) => [...mesh.uvs[i]]);
  const p = best.map((i) => [...positions[i]]);
  return (u, v) => {
    const l = barycentric(uv[0], uv[1], uv[2], u, v);
    if (!l) return [0, 0];
    return [0, 1].map((d) => l[0] * p[0][d] + l[1] * p[1][d] + l[2] * p[2][d]);
  };
}

// Recalcule les triangles à partir des positions (repère de configuration) et du contour.
export function retriangulate(mesh, positions) {
  mesh.triangles = triangulate(positions, mesh.hull);
}

// Interpole les données d'un nouveau point (uv, poids) dans le triangle qui le contient
// (ou d'après le sommet le plus proche).
export function interpolateAt(mesh, positions, x, y) {
  for (let t = 0; t < mesh.triangles.length; t += 3) {
    const idx = [mesh.triangles[t], mesh.triangles[t + 1], mesh.triangles[t + 2]];
    const l = barycentric(positions[idx[0]], positions[idx[1]], positions[idx[2]], x, y);
    if (l && l.every((v) => v >= -1e-6)) return { idx, l };
  }
  let best = 0;
  let bd = Infinity;
  positions.forEach(([px, py], i) => {
    const d = (px - x) ** 2 + (py - y) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return { idx: [best], l: [1] };
}

export function blendUV(mesh, { idx, l }) {
  return [0, 1].map((d) => idx.reduce((s, i, j) => s + mesh.uvs[i][d] * l[j], 0));
}

// Poids d'un point nouveau : mélange des poids des sommets voisins (positions locales recalculées
// par l'appelant à partir de la position monde).
export function blendWeights(mesh, { idx, l }) {
  const acc = new Map();
  idx.forEach((i, j) => {
    for (const e of mesh.weights[i]) acc.set(e.bone, (acc.get(e.bone) ?? 0) + e.w * l[j]);
  });
  const total = [...acc.values()].reduce((a, b) => a + b, 0) || 1;
  return [...acc].filter(([, w]) => w > 1e-4).map(([bone, w]) => ({ bone, w: w / total }));
}

// Retire un sommet (et ses arêtes), puis renumérote.
export function removeVertex(mesh, i) {
  if (mesh.weights) mesh.weights.splice(i, 1);
  else mesh.vertices.splice(i, 1);
  mesh.uvs.splice(i, 1);
  if (i < mesh.hull) mesh.hull--;
  mesh.edges = mesh.edges.filter((e) => !e.includes(i)).map((e) => e.map((v) => (v > i ? v - 1 : v)));
}

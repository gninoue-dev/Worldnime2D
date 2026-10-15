// Poids des maillages (skinning) : chaque sommet suit plusieurs os, avec des poids qui totalisent 1.
//
// Toutes les fonctions travaillent à partir des positions monde des sommets dans la pose de base
// (world : [[x, y], ...]) et recalculent les positions locales de chaque influence, pour que
// le maillage ne bouge pas à l'écran quand on change les poids.

import { distToSegment } from './math.js';

export const DEFAULT_MAX_INFLUENCES = 4;

// Positions locales d'un sommet pour chaque os de sa liste de poids.
function localize(skeleton, list, wx, wy) {
  return list.map(({ bone, w }) => {
    const b = skeleton.findBone(bone);
    const l = b.worldToLocal(wx, wy);
    return { bone, x: l.x, y: l.y, w };
  });
}

function normalize(list, max = Infinity) {
  let l = [...list].filter((e) => e.w > 0).sort((a, b) => b.w - a.w).slice(0, max);
  const total = l.reduce((s, e) => s + e.w, 0);
  if (total <= 0) return [];
  l = l.map((e) => ({ ...e, w: e.w / total }));
  return l;
}

// Liaison automatique : poids selon la distance de chaque sommet à chaque os (segment origine → bout).
export function bindAuto(mesh, skeleton, boneNames, world, maxInfluences = DEFAULT_MAX_INFLUENCES) {
  const bones = boneNames.map((n) => skeleton.findBone(n)).filter(Boolean);
  if (bones.length === 0) throw new Error('Choisissez au moins un os à lier.');
  // Échelle de distance : la taille du maillage, pour un résultat indépendant de la résolution.
  const xs = world.map((p) => p[0]);
  const ys = world.map((p) => p[1]);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
  mesh.weights = world.map(([x, y]) => {
    const list = bones.map((b) => {
      const d = b.length > 0 ? distToSegment(x, y, b.worldX, b.worldY, b.tipX, b.tipY) : Math.hypot(x - b.worldX, y - b.worldY);
      return { bone: b.name, w: 1 / ((d / size + 0.02) ** 4) };
    });
    return localize(skeleton, normalize(list, maxInfluences), x, y);
  });
  mesh.vertices = [];
}

// Remet un maillage sans poids, attaché à l'os du slot, sans le déplacer.
export function unbind(mesh, slotBone, world) {
  mesh.vertices = world.map(([x, y]) => {
    const l = slotBone.worldToLocal(x, y);
    return [l.x, l.y];
  });
  mesh.weights = null;
}

// Fixe la liste de poids d'un sommet ({ bone, w } sans position) et recalcule les positions locales.
export function setVertexWeights(mesh, skeleton, i, list, world) {
  mesh.weights[i] = localize(skeleton, normalize(list), world[i][0], world[i][1]);
}

// Pinceau : ajoute (ou retire) du poids pour un os autour d'un point monde.
// La force diminue avec la distance au centre du pinceau.
export function paintWeights(mesh, skeleton, world, boneName, cx, cy, radius, strength, subtract = false, max = DEFAULT_MAX_INFLUENCES) {
  let changed = 0;
  world.forEach(([x, y], i) => {
    const d = Math.hypot(x - cx, y - cy);
    if (d > radius) return;
    const f = strength * (1 - d / radius) ** 2;
    const list = mesh.weights[i].map(({ bone, w }) => ({ bone, w }));
    let e = list.find((x2) => x2.bone === boneName);
    if (!e) {
      if (subtract) return;
      e = { bone: boneName, w: 0 };
      list.push(e);
    }
    const old = e.w;
    const target = subtract ? Math.max(0, old - f) : Math.min(1, old + f);
    // Les autres os se partagent le reste, en gardant leurs proportions.
    const others = list.filter((x2) => x2 !== e);
    const rest = others.reduce((s, x2) => s + x2.w, 0);
    if (subtract && rest <= 0) return;
    e.w = target;
    for (const o of others) o.w = rest > 0 ? (o.w / rest) * (1 - target) : 0;
    const norm = normalize(list, max);
    if (norm.length === 0) return;
    mesh.weights[i] = localize(skeleton, norm, x, y);
    changed++;
  });
  return changed;
}

// Voisins de chaque sommet (par les triangles et les arêtes).
export function neighbors(mesh) {
  const n = mesh.vertexCount;
  const out = Array.from({ length: n }, () => new Set());
  const link = (a, b) => {
    out[a].add(b);
    out[b].add(a);
  };
  for (let t = 0; t < mesh.triangles.length; t += 3) {
    const [a, b, c] = [mesh.triangles[t], mesh.triangles[t + 1], mesh.triangles[t + 2]];
    link(a, b);
    link(b, c);
    link(c, a);
  }
  for (const [a, b] of mesh.edges) link(a, b);
  return out;
}

// Lissage : chaque sommet prend un peu des poids de ses voisins.
export function smoothWeights(mesh, skeleton, world, amount = 0.5, max = DEFAULT_MAX_INFLUENCES) {
  const nb = neighbors(mesh);
  const before = mesh.weights.map((l) => new Map(l.map((e) => [e.bone, e.w])));
  mesh.weights = mesh.weights.map((list, i) => {
    const acc = new Map();
    for (const [bone, w] of before[i]) acc.set(bone, (acc.get(bone) ?? 0) + w * (1 - amount));
    const ns = [...nb[i]];
    for (const j of ns) {
      for (const [bone, w] of before[j]) acc.set(bone, (acc.get(bone) ?? 0) + (w * amount) / ns.length);
    }
    if (ns.length === 0) return list;
    return localize(skeleton, normalize([...acc].map(([bone, w]) => ({ bone, w })), max), world[i][0], world[i][1]);
  });
}

// Élagage : retire les poids trop faibles et limite le nombre d'os par sommet.
export function pruneWeights(mesh, skeleton, world, threshold = 0.05, max = DEFAULT_MAX_INFLUENCES) {
  mesh.weights = mesh.weights.map((list, i) => {
    const kept = list.filter((e) => e.w >= threshold);
    const use = kept.length ? kept : [list.reduce((a, b) => (b.w > a.w ? b : a))];
    return localize(skeleton, normalize(use.map(({ bone, w }) => ({ bone, w })), max), world[i][0], world[i][1]);
  });
}

// Os qui influencent le maillage.
export function boundBones(mesh) {
  const set = new Set();
  for (const list of mesh.weights ?? []) for (const e of list) set.add(e.bone);
  return [...set];
}

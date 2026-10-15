// Outils d'édition des maillages, en pose de base (mode Configuration).
//
// On travaille sur des positions « de configuration » exprimées dans le repère de l'os du slot,
// qu'elles viennent de sommets simples ou de sommets pondérés (recalculées depuis le monde).
// Après un changement de sommets, les triangles sont recalculés et les déformations animées
// de ce maillage sont effacées (elles ne correspondent plus aux sommets).

import { MeshAttachment, interpolateAt, blendUV, blendWeights, removeVertex, uvToLocalMapping } from '../model/mesh.js';
import { triangulate, traceContour, pointInPolygon, distToSegmentPoint } from '../model/geometry.js';

// Positions des sommets dans le repère de l'os du slot (pose de base, monde à jour).
export function setupPositions(sk, slot, mesh) {
  if (!mesh.weights) return mesh.vertices.map((v) => [...v]);
  const w = MeshAttachment.worldVertices(mesh, slot.bone, sk);
  const out = [];
  for (let i = 0; i < w.length; i += 2) {
    const l = slot.bone.worldToLocal(w[i], w[i + 1]);
    out.push([l.x, l.y]);
  }
  return out;
}

// Positions monde de configuration, sous forme [[x, y], ...].
export function setupWorld(sk, slot, mesh) {
  const w = MeshAttachment.worldVertices(mesh, slot.bone, sk);
  const out = [];
  for (let i = 0; i < w.length; i += 2) out.push([w[i], w[i + 1]]);
  return out;
}

// Écrit des positions (repère de l'os du slot) dans le maillage, avec ou sans poids.
export function applyPositions(sk, slot, mesh, positions) {
  if (!mesh.weights) {
    mesh.vertices = positions.map((p) => [...p]);
    return;
  }
  mesh.weights = mesh.weights.map((list, i) => {
    const w = slot.bone.localToWorld(positions[i][0], positions[i][1]);
    return list.map((e) => {
      const l = sk.findBone(e.bone).worldToLocal(w.x, w.y);
      return { ...e, x: l.x, y: l.y };
    });
  });
}

function topologyChanged(sk, slot, mesh, positions) {
  mesh.edges = mesh.edges.filter(([a, b]) => a < positions.length && b < positions.length);
  mesh.triangles = triangulate(positions, mesh.hull, mesh.edges);
  sk.clearDeform(slot.name, mesh.name);
}

// Ajoute un sommet au point local (x, y). Sur une arête du contour (à moins de edgeTol), il est
// inséré dans le contour ; à l'intérieur, c'est un sommet intérieur. Renvoie son indice, ou -1.
export function insertVertex(sk, slot, mesh, x, y, edgeTol) {
  const pos = setupPositions(sk, slot, mesh);
  const hullPoly = pos.slice(0, mesh.hull);
  let edge = -1;
  let best = edgeTol;
  for (let i = 0; i < mesh.hull; i++) {
    const a = hullPoly[i];
    const b = hullPoly[(i + 1) % mesh.hull];
    const d = distToSegmentPoint(x, y, a, b);
    if (d < best) {
      best = d;
      edge = i;
    }
  }
  const inside = pointInPolygon(hullPoly, x, y);
  if (edge < 0 && !inside) return -1;

  const where = interpolateAt(mesh, pos, x, y);
  const uv = blendUV(mesh, where);
  const weights = mesh.weights ? blendWeights(mesh, where) : null;
  const index = edge >= 0 ? edge + 1 : pos.length;
  pos.splice(index, 0, [x, y]);
  mesh.uvs.splice(index, 0, uv);
  if (weights) {
    const w = slot.bone.localToWorld(x, y);
    mesh.weights.splice(index, 0, weights.map((e) => {
      const l = sk.findBone(e.bone).worldToLocal(w.x, w.y);
      return { bone: e.bone, x: l.x, y: l.y, w: e.w };
    }));
  } else mesh.vertices.splice(index, 0, [x, y]);
  if (edge >= 0) {
    mesh.hull++;
    mesh.edges = mesh.edges.map((e) => e.map((v) => (v >= index ? v + 1 : v)));
  }
  topologyChanged(sk, slot, mesh, pos);
  return index;
}

// Supprime des sommets (le contour garde au moins 3 sommets).
export function deleteVertices(sk, slot, mesh, indices) {
  const sorted = [...new Set(indices)].sort((a, b) => b - a);
  const hullLeft = mesh.hull - sorted.filter((i) => i < mesh.hull).length;
  if (hullLeft < 3) throw new Error('Le contour doit garder au moins 3 sommets.');
  for (const i of sorted) removeVertex(mesh, i);
  topologyChanged(sk, slot, mesh, setupPositions(sk, slot, mesh));
}

// Ajoute l'arête (i, j), ou la retire si elle existe déjà, puis recalcule les triangles.
export function toggleEdge(sk, slot, mesh, i, j) {
  if (i === j) return false;
  const k = mesh.edges.findIndex(([a, b]) => (a === i && b === j) || (a === j && b === i));
  if (k >= 0) mesh.edges.splice(k, 1);
  else mesh.edges.push([i, j]);
  topologyChanged(sk, slot, mesh, setupPositions(sk, slot, mesh));
  return k < 0;
}

// Recalcule les triangles.
export function retriangulateMesh(sk, slot, mesh) {
  topologyChanged(sk, slot, mesh, setupPositions(sk, slot, mesh));
}

// Contour automatique d'après la transparence de l'image : remplace tous les sommets.
// alphaInfo : { alpha, width, height } de l'image.
export function generateContour(sk, slot, mesh, alphaInfo, opts = {}) {
  if (mesh.weights) throw new Error('Déliez les os avant de régénérer le contour.');
  const pos = setupPositions(sk, slot, mesh);
  const toLocal = uvToLocalMapping(mesh, pos);
  if (!toLocal) throw new Error('Maillage invalide.');
  const { alpha, width, height } = alphaInfo;
  const poly = traceContour(alpha, width, height, opts);
  mesh.uvs = poly.map(([x, y]) => [x / width, y / height]);
  mesh.vertices = mesh.uvs.map(([u, v]) => toLocal(u, v));
  mesh.hull = mesh.vertices.length;
  mesh.edges = [];
  topologyChanged(sk, slot, mesh, mesh.vertices);
}

// Ajoute des sommets intérieurs en grille (espacement en fraction de la taille de l'image).
export function addInteriorGrid(sk, slot, mesh, spacing = 0.2) {
  const pos = setupPositions(sk, slot, mesh);
  const toLocal = uvToLocalMapping(mesh, pos);
  const hullUV = mesh.uvs.slice(0, mesh.hull);
  let added = 0;
  for (let v = spacing / 2; v < 1; v += spacing) {
    for (let u = spacing / 2; u < 1; u += spacing) {
      if (!pointInPolygon(hullUV, u, v)) continue;
      // Pas trop près d'un sommet existant.
      if (mesh.uvs.some(([a, b]) => Math.hypot(a - u, b - v) < spacing * 0.45)) continue;
      const [x, y] = toLocal(u, v);
      mesh.uvs.push([u, v]);
      if (mesh.weights) {
        const where = interpolateAt(mesh, pos, x, y);
        const w = slot.bone.localToWorld(x, y);
        mesh.weights.push(blendWeights(mesh, where).map((e) => {
          const l = sk.findBone(e.bone).worldToLocal(w.x, w.y);
          return { bone: e.bone, x: l.x, y: l.y, w: e.w };
        }));
      } else mesh.vertices.push([x, y]);
      pos.push([x, y]);
      added++;
    }
  }
  topologyChanged(sk, slot, mesh, pos);
  return added;
}

// Revient aux 4 coins de l'image (sans poids).
export function resetToRectangle(sk, slot, mesh) {
  if (mesh.weights) throw new Error('Déliez les os avant de revenir au rectangle.');
  const pos = setupPositions(sk, slot, mesh);
  const toLocal = uvToLocalMapping(mesh, pos);
  mesh.uvs = [[0, 1], [1, 1], [1, 0], [0, 0]];
  mesh.vertices = mesh.uvs.map(([u, v]) => toLocal(u, v));
  mesh.hull = 4;
  mesh.edges = [];
  topologyChanged(sk, slot, mesh, mesh.vertices);
}

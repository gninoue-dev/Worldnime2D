import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Skeleton } from '../src/renderer/js/model/skeleton.js';
import { RegionAttachment } from '../src/renderer/js/model/attachment.js';
import { MeshAttachment, meshFromRegion } from '../src/renderer/js/model/mesh.js';
import { triangulate, traceContour, convexHull, affineFromTriangles, pointInPolygon } from '../src/renderer/js/model/geometry.js';
import { bindAuto, paintWeights, smoothWeights, pruneWeights, unbind, boundBones } from '../src/renderer/js/model/weights.js';
import { deformKey } from '../src/renderer/js/model/animation.js';
import { parseProject, projectToText } from '../src/renderer/js/model/format.js';

const close = (a, b, eps = 1e-4) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const closeArr = (a, b, eps = 1e-3) => {
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) close(a[i], b[i], eps);
};

function bras() {
  const sk = new Skeleton();
  const haut = sk.addBone('haut', sk.root);
  haut.length = 100;
  const bas = sk.addBone('bas', haut);
  bas.x = 100;
  bas.length = 100;
  const slot = sk.addSlot('bras', haut);
  const region = new RegionAttachment('bras');
  region.x = 100;
  region.width = 200;
  region.height = 40;
  sk.addAttachment(slot, region);
  slot.attachment = 'bras';
  sk.updateWorldTransform();
  return { sk, haut, bas, slot, region };
}

// Maillage en bande : 2 × 5 sommets le long du bras.
function bande(sk, slot) {
  const m = new MeshAttachment('bras');
  const top = [];
  const bot = [];
  for (let i = 0; i <= 4; i++) {
    bot.push([i * 50, -20]);
    top.push([i * 50, 20]);
  }
  // Contour : le bas de gauche à droite, puis le haut de droite à gauche.
  m.vertices = [...bot, ...top.reverse()];
  m.uvs = m.vertices.map(([x, y]) => [x / 200, (20 - y) / 40]);
  m.hull = 10;
  m.triangles = triangulate(m.vertices, m.hull);
  m.width = 200;
  m.height = 40;
  sk.removeAttachment(slot, 'bras');
  sk.addAttachment(slot, m);
  slot.attachment = 'bras';
  return m;
}

test('triangulation : carré avec un point au centre, polygone concave', () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10], [5, 5]];
  const t = triangulate(square, 4);
  assert.equal(t.length / 3, 4);
  // Polygone en L : aucun triangle hors de la forme.
  const L = [[0, 0], [20, 0], [20, 10], [10, 10], [10, 20], [0, 20]];
  const tl = triangulate(L, 6);
  assert.equal(tl.length / 3, 4);
  for (let i = 0; i < tl.length; i += 3) {
    const [a, b, c] = [L[tl[i]], L[tl[i + 1]], L[tl[i + 2]]];
    assert.ok(pointInPolygon(L, (a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3));
  }
});

test('contour d\'une image : un disque donne un contour qui l\'entoure', () => {
  const w = 64;
  const h = 64;
  const alpha = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x - 32) ** 2 + (y - 32) ** 2 < 20 ** 2) alpha[y * w + x] = 255;
  const poly = traceContour(alpha, w, h, { maxPoints: 16 });
  assert.ok(poly.length >= 6 && poly.length <= 16, String(poly.length));
  assert.ok(pointInPolygon(poly, 32, 32));
  assert.ok(pointInPolygon(poly, 32, 13));
  assert.ok(!pointInPolygon(poly, 2, 2));
  assert.equal(convexHull([[0, 0], [2, 0], [1, 1], [2, 2], [0, 2]]).length, 4);
});

test('transformation affine entre triangles', () => {
  const m = affineFromTriangles([[0, 0], [1, 0], [0, 1]], [[10, 10], [12, 10], [10, 13]]);
  close(m.a, 2);
  close(m.d, 3);
  close(m.tx, 10);
  close(m.ty, 10);
});

test('une image convertie en maillage reste à la même place', () => {
  const { sk, slot, region } = bras();
  const before = region.worldVertices(slot.bone);
  const m = meshFromRegion(region);
  closeArr(MeshAttachment.worldVertices(m, slot.bone, sk), before);
});

test('poids automatiques : le maillage ne bouge pas, et suit les deux os', () => {
  const { sk, slot, bas } = bras();
  const m = bande(sk, slot);
  const before = sk.attachmentVertices(slot, m);
  const world = [];
  for (let i = 0; i < before.length; i += 2) world.push([before[i], before[i + 1]]);
  bindAuto(m, sk, ['haut', 'bas'], world);
  closeArr(sk.attachmentVertices(slot, m), before);
  assert.deepEqual(boundBones(m).sort(), ['bas', 'haut']);
  // Sommet du bout (x = 200) : surtout « bas » ; sommet de l'épaule (x = 0) : surtout « haut ».
  const wOf = (i, b) => m.weights[i].find((e) => e.bone === b)?.w ?? 0;
  assert.ok(wOf(4, 'bas') > 0.8);
  assert.ok(wOf(0, 'haut') > 0.8);
  // On plie le coude : le bout suit l'avant-bras, l'épaule ne bouge presque pas.
  bas.rotation = 90;
  sk.updateWorldTransform();
  const after = sk.attachmentVertices(slot, m);
  assert.ok(after[9] > 50, `bout levé : ${after[9]}`);
  close(after[0], before[0], 2);
});

test('pinceau, lissage, élagage : positions conservées, poids normalisés', () => {
  const { sk, slot } = bras();
  const m = bande(sk, slot);
  const v = sk.attachmentVertices(slot, m);
  const world = [];
  for (let i = 0; i < v.length; i += 2) world.push([v[i], v[i + 1]]);
  bindAuto(m, sk, ['haut', 'bas'], world);
  const n = paintWeights(m, sk, world, 'bas', 100, 0, 60, 0.8);
  assert.ok(n > 0);
  smoothWeights(m, sk, world, 0.5);
  pruneWeights(m, sk, world, 0.1, 1);
  for (const list of m.weights) {
    assert.equal(list.length, 1);
    close(list.reduce((s, e) => s + e.w, 0), 1);
  }
  closeArr(sk.attachmentVertices(slot, m), v);
  unbind(m, slot.bone, world);
  assert.equal(m.weights, null);
  closeArr(sk.attachmentVertices(slot, m), v);
});

test('déformation animée, avec et sans poids', () => {
  const { sk, slot } = bras();
  const m = bande(sk, slot);
  const anim = sk.addAnimation('a');
  const offsets = new Array(m.deformLength).fill(0);
  offsets[1] = 10;
  anim.setKey('deform', deformKey('bras', 'bras'), 'deform', { time: 0, vertices: offsets });
  anim.setKey('deform', deformKey('bras', 'bras'), 'deform', { time: 1, vertices: new Array(m.deformLength).fill(0) });
  sk.posed = true;
  sk.setToSetupPose();
  anim.apply(sk, 0.5);
  sk.updateWorldTransform();
  close(sk.attachmentVertices(slot, m)[1], -20 + 5);

  // Avec poids : un décalage par influence.
  const v = MeshAttachment.worldVertices(m, slot.bone, sk);
  const world = [];
  for (let i = 0; i < v.length; i += 2) world.push([v[i], v[i + 1]]);
  bindAuto(m, sk, ['haut', 'bas'], world);
  assert.ok(m.deformLength > m.vertexCount * 2);
});

test('maillage lié : géométrie et déformation du parent', () => {
  const { sk, slot } = bras();
  const m = bande(sk, slot);
  const linked = new MeshAttachment('bras_tatoue');
  linked.parent = 'bras';
  linked.path = 'bras_tatoue';
  sk.addAttachment(slot, linked);
  closeArr(sk.attachmentVertices(slot, linked), sk.attachmentVertices(slot, m));
  sk.renameAttachment(slot, 'bras', 'bras_nu');
  assert.equal(linked.parent, 'bras_nu');
  // Supprimer le parent : le lié devient indépendant, au même endroit.
  const before = sk.attachmentVertices(slot, linked);
  sk.removeAttachment(slot, 'bras_nu');
  assert.equal(linked.parent, null);
  closeArr(sk.attachmentVertices(slot, linked), before);
});

test('renommer ou supprimer un os met à jour les poids', () => {
  const { sk, slot, bas } = bras();
  const m = bande(sk, slot);
  const v = MeshAttachment.worldVertices(m, slot.bone, sk);
  const world = [];
  for (let i = 0; i < v.length; i += 2) world.push([v[i], v[i + 1]]);
  bindAuto(m, sk, ['haut', 'bas'], world, 1);
  sk.renameBone(bas, 'avant_bras');
  assert.ok(boundBones(m).includes('avant_bras'));
  sk.removeBone(sk.findBone('avant_bras'));
  assert.deepEqual(boundBones(m), ['haut']);
  sk.updateWorldTransform();
  closeArr(sk.attachmentVertices(slot, m), v, 1e-2);
});

test('enregistrement et relecture : maillage avec poids, maillage lié, déformation', () => {
  const { sk, slot } = bras();
  const m = bande(sk, slot);
  m.edges = [[0, 9]];
  const v = MeshAttachment.worldVertices(m, slot.bone, sk);
  const world = [];
  for (let i = 0; i < v.length; i += 2) world.push([v[i], v[i + 1]]);
  bindAuto(m, sk, ['haut', 'bas'], world);
  const linked = new MeshAttachment('bras2');
  linked.parent = 'bras';
  linked.timelines = false;
  sk.addAttachment(slot, linked);
  const anim = sk.addAnimation('flex');
  const off = new Array(m.deformLength).fill(0);
  off[3] = 4.5;
  anim.setKey('deform', deformKey('bras', 'bras'), 'deform', { time: 0.25, vertices: off, curve: 'stepped' });
  const text = projectToText(sk, { appVersion: 't' });
  const sk2 = parseProject(text);
  assert.equal(projectToText(sk2, { appVersion: 't' }), text);
  const s2 = sk2.findSlot('bras');
  closeArr(sk2.attachmentVertices(s2, sk2.getAttachment(s2, 'bras')), sk.attachmentVertices(slot, m), 1e-2);
  assert.equal(sk2.getAttachment(s2, 'bras2').timelines, false);
  const i = text.lastIndexOf('"haut"');
  assert.throws(() => parseProject(`${text.slice(0, i)}"fantome"${text.slice(i + 6)}`), /Os inconnu/);
});

test('outils : ajouter un sommet sur le contour et à l\'intérieur, supprimer, grille', async () => {
  const { insertVertex, deleteVertices, addInteriorGrid, resetToRectangle, setupPositions } = await import('../src/renderer/js/editor/meshtools.js');
  const { sk, slot, region } = bras();
  const m = meshFromRegion(region);
  sk.removeAttachment(slot, 'bras');
  sk.addAttachment(slot, m);
  const before = sk.attachmentVertices(slot, m);
  // Sur l'arête du bas (y = -20), au milieu.
  const i = insertVertex(sk, slot, m, 100, -20, 3);
  assert.equal(m.hull, 5);
  assert.equal(i, 1);
  closeArr(m.uvs[i], [0.5, 1]);
  const j = insertVertex(sk, slot, m, 100, 0, 3);
  assert.equal(j, 5);
  closeArr(m.uvs[j], [0.5, 0.5]);
  // 6 sommets dont 5 sur le contour : 2 × 6 − 5 − 2 = 5 triangles.
  assert.equal(m.triangles.length / 3, 5);
  assert.equal(insertVertex(sk, slot, m, 500, 500, 3), -1);
  deleteVertices(sk, slot, m, [j, i]);
  assert.equal(m.vertexCount, 4);
  assert.throws(() => deleteVertices(sk, slot, m, [0, 1]), /au moins 3/);
  const n = addInteriorGrid(sk, slot, m, 0.25);
  assert.ok(n > 0);
  resetToRectangle(sk, slot, m);
  closeArr(sk.attachmentVertices(slot, m), before);
  assert.equal(setupPositions(sk, slot, m).length, 4);
});

test('arête imposée : la triangulation la respecte', () => {
  // Carré + 2 points intérieurs ; on impose la diagonale 0-2.
  const pts = [[0, 0], [10, 0], [10, 10], [0, 10], [3, 6], [7, 4]];
  const has = (t, a, b) => {
    for (let i = 0; i < t.length; i += 3) {
      const tri = [t[i], t[i + 1], t[i + 2]];
      if (tri.includes(a) && tri.includes(b)) return true;
    }
    return false;
  };
  const free = triangulate(pts, 4);
  const forced = triangulate(pts, 4, [[1, 3]]);
  assert.ok(has(forced, 1, 3), 'arête 1-3 présente');
  assert.equal(forced.length, free.length);
});

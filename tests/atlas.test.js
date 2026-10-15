import { test } from 'node:test';
import assert from 'node:assert/strict';

import { packRects, trimBounds } from '../src/renderer/js/model/atlas.js';

function overlaps(a, b) {
  const aw = a.rotated ? a.height : a.width;
  const ah = a.rotated ? a.width : a.height;
  const bw = b.rotated ? b.height : b.width;
  const bh = b.rotated ? b.width : b.height;
  return a.x < b.x + bw && b.x < a.x + aw && a.y < b.y + bh && b.y < a.y + ah;
}

test('empaquetage : tout est placé, sans chevauchement, dans la page', () => {
  const rects = [];
  let seed = 7;
  const rnd = (n) => {
    seed = (seed * 16807) % 2147483647;
    return 1 + (seed % n);
  };
  for (let i = 0; i < 60; i++) rects.push({ id: `img${i}`, width: rnd(120), height: rnd(200) });
  const pages = packRects(rects, { maxWidth: 512, maxHeight: 512, padding: 2 });
  const placed = pages.flatMap((p, pi) => p.items.map((it) => ({ ...it, page: pi, pw: p.width, ph: p.height })));
  assert.equal(placed.length, 60);
  assert.deepEqual(new Set(placed.map((p) => p.id)).size, 60);
  for (const a of placed) {
    assert.ok(a.x >= 0 && a.y >= 0);
    assert.ok(a.x + (a.rotated ? a.height : a.width) <= a.pw && a.y + (a.rotated ? a.width : a.height) <= a.ph);
  }
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      if (placed[i].page === placed[j].page) assert.ok(!overlaps(placed[i], placed[j]), `${placed[i].id} / ${placed[j].id}`);
    }
  }
  // Bonne densité : les images occupent l'essentiel des pages.
  const area = rects.reduce((s, r) => s + r.width * r.height, 0);
  const pagesArea = pages.reduce((s, p) => s + p.width * p.height, 0);
  assert.ok(area / pagesArea > 0.65, `densité ${(area / pagesArea).toFixed(2)}`);
});

test('empaquetage : rotation, puissances de deux, plusieurs pages, image trop grande', () => {
  const pages = packRects([{ id: 'long', width: 300, height: 40 }], { maxWidth: 64, maxHeight: 512, padding: 0 });
  assert.equal(pages[0].items[0].rotated, true);
  const pot = packRects([{ id: 'a', width: 100, height: 30 }], { pot: true, padding: 0 });
  assert.deepEqual([pot[0].width, pot[0].height], [128, 32]);
  const many = packRects(Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, width: 100, height: 100 })), { maxWidth: 210, maxHeight: 210, padding: 2, rotate: false });
  assert.equal(many.length, 2);
  assert.throws(() => packRects([{ id: 'geant', width: 5000, height: 10 }], { maxWidth: 1024, maxHeight: 1024, rotate: false }), /trop grande/);
});

test('rognage : zone non transparente', () => {
  const w = 10;
  const h = 8;
  const a = new Uint8Array(w * h);
  a[3 * w + 2] = 255;
  a[5 * w + 6] = 10;
  assert.deepEqual(trimBounds(a, w, h), { x: 2, y: 3, width: 5, height: 3 });
  assert.deepEqual(trimBounds(new Uint8Array(4), 2, 2), { x: 0, y: 0, width: 1, height: 1 });
});

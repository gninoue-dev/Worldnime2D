import { test } from 'node:test';
import assert from 'node:assert/strict';

import { encodeGif, lzwEncode } from '../src/renderer/js/io/gif.js';

// Décodeur LZW du GIF (pour vérifier l'encodeur).
function lzwDecode(data, minCode, count) {
  const clear = 1 << minCode;
  const end = clear + 1;
  let size = minCode + 1;
  let dict = [];
  const reset = () => {
    dict = [];
    for (let i = 0; i < clear; i++) dict.push([i]);
    dict.push(null, null);
    size = minCode + 1;
  };
  reset();
  const out = [];
  let pos = 0;
  let prev = null;
  const read = () => {
    let code = 0;
    for (let i = 0; i < size; i++, pos++) code |= ((data[pos >> 3] >> (pos & 7)) & 1) << i;
    return code;
  };
  for (;;) {
    const code = read();
    if (code === clear) {
      reset();
      prev = null;
      continue;
    }
    if (code === end) break;
    let entry;
    if (code < dict.length && dict[code]) entry = dict[code];
    else entry = [...prev, prev[0]];
    out.push(...entry);
    if (prev) dict.push([...prev, entry[0]]);
    prev = entry;
    if (dict.length === 1 << size && size < 12) size++;
    if (out.length >= count && count) break;
  }
  return out;
}

test('LZW : compression puis décompression identiques', () => {
  let seed = 3;
  const data = Uint8Array.from({ length: 20000 }, (_, i) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return i % 300 < 150 ? seed % 7 : (i >> 4) % 256;
  });
  const enc = lzwEncode(data, 8);
  assert.ok(enc.length < data.length);
  assert.deepEqual(lzwDecode(enc, 8, data.length), Array.from(data));
});

test('GIF : en-tête, boucle, nombre d\'images, transparence', () => {
  const w = 16;
  const h = 12;
  const frames = [0, 1, 2].map((k) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const x = i % w;
      if (x < 4 + k * 4) data.set([200, 50 * k, 30, 255], i * 4);
    }
    return { data, width: w, height: h };
  });
  const gif = encodeGif(frames, { delayMs: 50 });
  const text = String.fromCharCode(...gif.subarray(0, 6));
  assert.equal(text, 'GIF89a');
  assert.equal(gif[6] | (gif[7] << 8), w);
  assert.ok(String.fromCharCode(...gif).includes('NETSCAPE2.0'));
  // Trois descripteurs d'image (0x2C précédé d'un contrôle graphique 0x21 0xF9).
  let count = 0;
  for (let i = 0; i < gif.length - 1; i++) if (gif[i] === 0x21 && gif[i + 1] === 0xf9) count++;
  assert.equal(count, 3);
  assert.equal(gif.at(-1), 0x3b);
});

// Encodeur GIF animé (GIF89a) : palette commune de 255 couleurs (coupe médiane) + 1 couleur transparente,
// compression LZW, boucle infinie. frames : [{ data: Uint8ClampedArray RGBA, width, height }].

export function encodeGif(frames, { delayMs = 33, loop = true } = {}) {
  if (frames.length === 0) throw new Error('Aucune image à encoder.');
  const { width, height } = frames[0];
  const palette = buildPalette(frames, 255);
  const transparent = palette.length; // index de la couleur transparente
  const cache = new Map();
  const out = new ByteWriter();
  out.str('GIF89a');
  out.u16(width);
  out.u16(height);
  // Palette globale de 256 entrées (taille 2^(7+1)).
  out.u8(0xf7);
  out.u8(transparent);
  out.u8(0);
  for (let i = 0; i < 256; i++) {
    const c = palette[i] ?? [0, 0, 0];
    out.u8(c[0]);
    out.u8(c[1]);
    out.u8(c[2]);
  }
  if (loop) {
    out.u8(0x21);
    out.u8(0xff);
    out.u8(11);
    out.str('NETSCAPE2.0');
    out.u8(3);
    out.u8(1);
    out.u16(0);
    out.u8(0);
  }
  const delay = Math.max(2, Math.round(delayMs / 10));
  for (const f of frames) {
    // Contrôle graphique : délai, effacement avant l'image suivante, couleur transparente.
    out.u8(0x21);
    out.u8(0xf9);
    out.u8(4);
    out.u8((2 << 2) | 1);
    out.u16(delay);
    out.u8(transparent);
    out.u8(0);
    // Image.
    out.u8(0x2c);
    out.u16(0);
    out.u16(0);
    out.u16(width);
    out.u16(height);
    out.u8(0);
    const indices = new Uint8Array(width * height);
    for (let i = 0; i < indices.length; i++) {
      const a = f.data[i * 4 + 3];
      if (a < 128) {
        indices[i] = transparent;
        continue;
      }
      const r = f.data[i * 4];
      const g = f.data[i * 4 + 1];
      const b = f.data[i * 4 + 2];
      const key = (r << 16) | (g << 8) | b;
      let idx = cache.get(key);
      if (idx === undefined) {
        idx = nearest(palette, r, g, b);
        cache.set(key, idx);
      }
      indices[i] = idx;
    }
    const minCode = 8;
    out.u8(minCode);
    const data = lzwEncode(indices, minCode);
    for (let i = 0; i < data.length; i += 255) {
      const chunk = data.subarray(i, i + 255);
      out.u8(chunk.length);
      out.bytes(chunk);
    }
    out.u8(0);
  }
  out.u8(0x3b);
  return out.result();
}

// Palette par coupe médiane, sur un échantillon des pixels opaques de toutes les images.
function buildPalette(frames, max) {
  const samples = [];
  const total = frames.reduce((s, f) => s + f.width * f.height, 0);
  const step = Math.max(1, Math.floor(total / 60000));
  let k = 0;
  for (const f of frames) {
    for (let i = 0; i < f.width * f.height; i++, k++) {
      if (k % step || f.data[i * 4 + 3] < 128) continue;
      samples.push([f.data[i * 4], f.data[i * 4 + 1], f.data[i * 4 + 2]]);
    }
  }
  if (samples.length === 0) return [[0, 0, 0]];
  let boxes = [samples];
  while (boxes.length < max) {
    // On coupe la boîte la plus étendue.
    let bi = -1;
    let bestRange = -1;
    let bestChannel = 0;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 255;
        let hi = 0;
        for (const p of box) {
          if (p[c] < lo) lo = p[c];
          if (p[c] > hi) hi = p[c];
        }
        if (hi - lo > bestRange) {
          bestRange = hi - lo;
          bi = i;
          bestChannel = c;
        }
      }
    });
    if (bi < 0 || bestRange <= 0) break;
    const box = boxes[bi].sort((a, b) => a[bestChannel] - b[bestChannel]);
    const mid = box.length >> 1;
    boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
  }
  return boxes.map((box) => {
    const s = [0, 0, 0];
    for (const p of box) for (let c = 0; c < 3; c++) s[c] += p[c];
    return s.map((v) => Math.round(v / box.length));
  });
}

function nearest(palette, r, g, b) {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i];
    const d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
      if (d === 0) break;
    }
  }
  return best;
}

// Compression LZW du GIF (codes de taille variable, poids faibles d'abord).
export function lzwEncode(indices, minCode) {
  const clear = 1 << minCode;
  const end = clear + 1;
  const bytes = [];
  let cur = 0;
  let nbits = 0;
  let size = minCode + 1;
  const emit = (code) => {
    cur |= code << nbits;
    nbits += size;
    while (nbits >= 8) {
      bytes.push(cur & 0xff);
      cur >>>= 8;
      nbits -= 8;
    }
  };
  let dict = new Map();
  let next = end + 1;
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const c = indices[i];
    const key = prefix * 4096 + c;
    const found = dict.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > 1 << size && size < 12) size++;
    } else {
      emit(clear);
      dict = new Map();
      next = end + 1;
      size = minCode + 1;
    }
    prefix = c;
  }
  emit(prefix);
  emit(end);
  if (nbits > 0) bytes.push(cur & 0xff);
  return Uint8Array.from(bytes);
}

class ByteWriter {
  constructor() {
    this.chunks = [];
    this.buf = new Uint8Array(1 << 16);
    this.pos = 0;
  }

  ensure(n) {
    if (this.pos + n <= this.buf.length) return;
    this.chunks.push(this.buf.subarray(0, this.pos));
    this.buf = new Uint8Array(Math.max(1 << 16, n));
    this.pos = 0;
  }

  u8(v) {
    this.ensure(1);
    this.buf[this.pos++] = v & 0xff;
  }

  u16(v) {
    this.u8(v);
    this.u8(v >> 8);
  }

  str(s) {
    for (const ch of s) this.u8(ch.charCodeAt(0));
  }

  bytes(b) {
    this.ensure(b.length);
    this.buf.set(b, this.pos);
    this.pos += b.length;
  }

  result() {
    const parts = [...this.chunks, this.buf.subarray(0, this.pos)];
    const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }
}

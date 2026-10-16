// Personnage de démonstration des tutoriels, « Ama », dessiné par programme (aucune image externe).
// Chaque morceau est dessiné dans le repère du personnage (pieds à l'origine, Y vers le bas ici),
// puis recadré ; on connaît ainsi la position exacte de chaque image dans le monde.

const W = 420;
const H = 480;
const OX = 210; // x = 0 du personnage dans la grande toile
const OY = 450; // pieds (Y = 0)

const INK = '#2b1a10';
const SKIN = '#8a5a3c';
const SKIN_DARK = '#6e4429';
const TEAL = '#14808a';
const ORANGE = '#f08a24';
const GOLD = '#f6c343';
const INDIGO = '#3b3470';
const RED = '#c0392b';

function capsule(ctx, x0, y0, x1, y1, w, fill, line = INK) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = line;
  ctx.lineWidth = w + 6;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.strokeStyle = fill;
  ctx.lineWidth = w;
  ctx.stroke();
  ctx.restore();
}

function blob(ctx, path, fill, line = INK, lw = 3) {
  ctx.save();
  ctx.beginPath();
  path(ctx);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = line;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

// Motif « wax » : cercles et losanges alternés, découpés dans la forme.
function wax(ctx, path, base, a, b) {
  ctx.save();
  ctx.beginPath();
  path(ctx);
  ctx.fillStyle = base;
  ctx.fill();
  ctx.clip();
  for (let y = -460; y < 40; y += 26) {
    for (let x = -200; x < 200; x += 26) {
      const odd = ((x + y) / 26) & 1;
      ctx.fillStyle = odd ? a : b;
      if (odd) {
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = base;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(x, y - 7);
        ctx.lineTo(x + 7, y);
        ctx.lineTo(x, y + 7);
        ctx.lineTo(x - 7, y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  path(ctx);
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

const side = (s, fn) => (ctx) => fn(ctx, s);

// Chaque morceau : nom → fonction de dessin (repère du personnage, Y vers le bas).
const PARTS = {
  ombre: (ctx) => {
    const g = ctx.createRadialGradient(0, -2, 4, 0, -2, 90);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.save();
    ctx.scale(1, 0.18);
    ctx.beginPath();
    ctx.arc(0, -10, 90, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },
  echarpe: (ctx) => {
    // Foulard qui pend derrière l'épaule droite (écran) : bande à franges.
    const path = (c) => {
      c.moveTo(22, -298);
      c.bezierCurveTo(44, -270, 52, -230, 50, -180);
      c.lineTo(28, -178);
      c.bezierCurveTo(30, -228, 22, -262, 8, -290);
      c.closePath();
    };
    wax(ctx, path, RED, GOLD, '#7d1f16');
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(30 + i * 4, -178);
      ctx.lineTo(29 + i * 4.3, -164);
      ctx.stroke();
    }
  },
  cuisse_gauche: side(-1, (ctx, s) => capsule(ctx, s * 24, -126, s * 26, -70, 30, INDIGO)),
  cuisse_droite: side(1, (ctx, s) => capsule(ctx, s * 24, -126, s * 26, -70, 30, INDIGO)),
  jambe_gauche: side(-1, (ctx, s) => {
    capsule(ctx, s * 26, -72, s * 27, -18, 24, SKIN);
    blob(ctx, (c) => c.ellipse(s * 33, -9, 21, 9, 0, 0, Math.PI * 2), '#7a4a22');
  }),
  jambe_droite: side(1, (ctx, s) => {
    capsule(ctx, s * 26, -72, s * 27, -18, 24, SKIN);
    blob(ctx, (c) => c.ellipse(s * 33, -9, 21, 9, 0, 0, Math.PI * 2), '#7a4a22');
  }),
  bassin: (ctx) => {
    const path = (c) => {
      c.moveTo(-46, -176);
      c.lineTo(46, -176);
      c.lineTo(58, -110);
      c.quadraticCurveTo(0, -100, -58, -110);
      c.closePath();
    };
    wax(ctx, path, ORANGE, TEAL, '#ffffff');
    blob(ctx, (c) => c.rect(-47, -180, 94, 12), GOLD);
  },
  bras_gauche: side(-1, (ctx, s) => {
    capsule(ctx, s * 50, -284, s * 61, -216, 24, SKIN);
    blob(ctx, (c) => c.ellipse(s * 52, -276, 17, 15, s * -0.3, 0, Math.PI * 2), TEAL);
  }),
  bras_droit: side(1, (ctx, s) => {
    capsule(ctx, s * 50, -284, s * 61, -216, 24, SKIN);
    blob(ctx, (c) => c.ellipse(s * 52, -276, 17, 15, s * -0.3, 0, Math.PI * 2), TEAL);
  }),
  avant_bras_gauche: side(-1, (ctx, s) => {
    capsule(ctx, s * 61, -216, s * 67, -152, 21, SKIN);
    blob(ctx, (c) => c.arc(s * 68, -140, 13, 0, Math.PI * 2), SKIN);
    blob(ctx, (c) => c.rect(s * 67 - 12, -168, 24, 8), GOLD, INK, 2);
  }),
  avant_bras_droit: side(1, (ctx, s) => {
    capsule(ctx, s * 61, -216, s * 67, -152, 21, SKIN);
    blob(ctx, (c) => c.arc(s * 68, -140, 13, 0, Math.PI * 2), SKIN);
    blob(ctx, (c) => c.rect(s * 67 - 12, -168, 24, 8), GOLD, INK, 2);
  }),
  torse: (ctx) => {
    blob(ctx, (c) => c.rect(-12, -318, 24, 26), SKIN);
    const path = (c) => {
      c.moveTo(-50, -296);
      c.quadraticCurveTo(0, -306, 50, -296);
      c.lineTo(44, -170);
      c.lineTo(-44, -170);
      c.closePath();
    };
    wax(ctx, path, TEAL, GOLD, ORANGE);
    blob(ctx, (c) => {
      c.moveTo(-16, -300);
      c.quadraticCurveTo(0, -270, 16, -300);
    }, SKIN_DARK);
  },
  torse_fete: (ctx) => {
    blob(ctx, (c) => c.rect(-12, -318, 24, 26), SKIN);
    const path = (c) => {
      c.moveTo(-50, -296);
      c.quadraticCurveTo(0, -306, 50, -296);
      c.lineTo(44, -170);
      c.lineTo(-44, -170);
      c.closePath();
    };
    wax(ctx, path, RED, GOLD, '#ffffff');
    blob(ctx, (c) => {
      c.moveTo(-16, -300);
      c.quadraticCurveTo(0, -270, 16, -300);
    }, SKIN_DARK);
    // Collier de perles.
    for (let i = -4; i <= 4; i++) blob(ctx, (c) => c.arc(i * 6, -292 + Math.abs(i) * -1.5 + 8, 4, 0, Math.PI * 2), i % 2 ? GOLD : '#2e86de', INK, 1.5);
  },
  tete: (ctx) => {
    // Cheveux afro derrière, puis visage et oreilles.
    blob(ctx, (c) => {
      for (const [x, y, r] of [[0, -392, 52], [-36, -376, 34], [36, -376, 34], [-22, -414, 30], [22, -414, 30]]) {
        c.moveTo(x + r, y);
        c.arc(x, y, r, 0, Math.PI * 2);
      }
    }, '#1d120c', '#1d120c');
    blob(ctx, (c) => c.ellipse(-44, -350, 9, 13, 0, 0, Math.PI * 2), SKIN);
    blob(ctx, (c) => c.ellipse(44, -350, 9, 13, 0, 0, Math.PI * 2), SKIN);
    blob(ctx, (c) => c.ellipse(0, -350, 42, 48, 0, 0, Math.PI * 2), SKIN);
    // Sourcils et joues.
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 9, -372);
      ctx.quadraticCurveTo(s * 18, -377, s * 27, -371);
      ctx.stroke();
      ctx.fillStyle = 'rgba(220,90,80,0.35)';
      ctx.beginPath();
      ctx.ellipse(s * 26, -334, 8, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = SKIN_DARK;
    ctx.beginPath();
    ctx.ellipse(0, -340, 5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  yeux_ouverts: (ctx) => {
    for (const s of [-1, 1]) {
      blob(ctx, (c) => c.ellipse(s * 17, -355, 9, 11, 0, 0, Math.PI * 2), '#fff', INK, 2.5);
      ctx.fillStyle = '#1b0f08';
      ctx.beginPath();
      ctx.arc(s * 17 + 1, -354, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(s * 17 + 3, -357, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  yeux_fermes: (ctx) => {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 17 - 9, -355);
      ctx.quadraticCurveTo(s * 17, -348, s * 17 + 9, -355);
      ctx.stroke();
    }
  },
  bouche_sourire: (ctx) => {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-13, -326);
    ctx.quadraticCurveTo(0, -315, 13, -326);
    ctx.stroke();
  },
  bouche_ouverte: (ctx) => {
    blob(ctx, (c) => {
      c.moveTo(-13, -327);
      c.quadraticCurveTo(0, -330, 13, -327);
      c.quadraticCurveTo(12, -310, 0, -309);
      c.quadraticCurveTo(-12, -310, -13, -327);
    }, '#6b1d1d', INK, 2.5);
    blob(ctx, (c) => c.ellipse(0, -313, 6, 3.5, 0, 0, Math.PI * 2), '#e06666', '#e06666', 1);
  },
  chapeau: (ctx) => {
    // Foulard de tête noué (tenue de fête).
    const path = (c) => {
      c.moveTo(-50, -386);
      c.bezierCurveTo(-56, -446, 56, -446, 50, -386);
      c.quadraticCurveTo(0, -398, -50, -386);
    };
    wax(ctx, path, GOLD, RED, '#2e86de');
    blob(ctx, (c) => {
      c.moveTo(40, -420);
      c.quadraticCurveTo(76, -446, 70, -404);
      c.quadraticCurveTo(58, -414, 40, -405);
    }, GOLD);
  },
  lueur: (ctx) => {
    const g = ctx.createRadialGradient(68, -140, 2, 68, -140, 44);
    g.addColorStop(0, 'rgba(255,240,170,1)');
    g.addColorStop(0.35, 'rgba(255,190,60,0.7)');
    g.addColorStop(1, 'rgba(255,120,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(68, -140, 44, 0, Math.PI * 2);
    ctx.fill();
  },
  drapeau: (ctx) => {
    // Drapeau à motifs, sans mât (le mât est un os) : idéal pour les maillages.
    const path = (c) => c.rect(-150, -430, 190, 116);
    wax(ctx, path, ORANGE, '#ffffff', TEAL);
    blob(ctx, (c) => c.rect(-150, -390, 190, 36), TEAL);
    ctx.fillStyle = GOLD;
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('W2D', -55, -362);
  },
};

// Morceaux du personnage de base (ordre d'affichage : du fond vers l'avant).
export const BODY = [
  'ombre', 'echarpe', 'bras_droit', 'avant_bras_droit', 'cuisse_gauche', 'cuisse_droite', 'jambe_gauche', 'jambe_droite',
  'bassin', 'torse', 'tete', 'yeux_ouverts', 'bouche_sourire', 'bras_gauche', 'avant_bras_gauche',
];
export const EXTRA = ['yeux_fermes', 'bouche_ouverte', 'torse_fete', 'chapeau', 'lueur', 'drapeau'];

// Dessine un morceau et le recadre. Renvoie la toile, et le centre de l'image dans le monde (Y vers le haut).
export function drawPart(name) {
  const big = new OffscreenCanvas(W, H);
  const ctx = big.getContext('2d');
  ctx.translate(OX, OY);
  PARTS[name](ctx);
  const data = ctx.getImageData(0, 0, W, H).data;
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * 4 + 3] > 2) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  const pad = 2;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(W - 1, x1 + pad);
  y1 = Math.min(H - 1, y1 + pad);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const out = new OffscreenCanvas(w, h);
  out.getContext('2d').drawImage(big, x0, y0, w, h, 0, 0, w, h);
  return { name, canvas: out, width: w, height: h, left: x0, top: y0, cx: x0 + w / 2 - OX, cy: OY - (y0 + h / 2) };
}

export async function pngBytes(canvas) {
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new Uint8Array(await blob.arrayBuffer());
}

// Décor de fond (image de référence) : ciel, soleil, collines, sol.
export function drawBackdrop() {
  const c = new OffscreenCanvas(960, 540);
  const ctx = c.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, 540);
  sky.addColorStop(0, '#f7b267');
  sky.addColorStop(0.6, '#f4845f');
  sky.addColorStop(1, '#f25c54');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 960, 540);
  ctx.fillStyle = '#ffe8a3';
  ctx.beginPath();
  ctx.arc(700, 190, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8c4a3c';
  ctx.beginPath();
  ctx.moveTo(0, 380);
  ctx.quadraticCurveTo(240, 270, 480, 360);
  ctx.quadraticCurveTo(720, 440, 960, 330);
  ctx.lineTo(960, 540);
  ctx.lineTo(0, 540);
  ctx.fill();
  ctx.fillStyle = '#5b2e2a';
  ctx.fillRect(0, 440, 960, 100);
  // Baobab.
  ctx.fillStyle = '#3d1f1a';
  ctx.fillRect(140, 300, 34, 140);
  ctx.beginPath();
  ctx.ellipse(157, 290, 90, 40, 0, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

// --- Écriture des fichiers ---------------------------------------------------------------------

// Écrit les images du personnage (et le décor) dans un dossier. Renvoie le placement de chaque image.
export async function writeCharacter(api, dir, names = [...BODY, ...EXTRA]) {
  const placed = {};
  for (const n of names) {
    const p = drawPart(n);
    await api.writeImage(dir, `${n}.png`, await pngBytes(p.canvas));
    placed[n] = p;
  }
  return placed;
}

export async function writeBackdrop(api, dir, file = 'decor.png') {
  await api.writeImage(dir, file, await pngBytes(drawBackdrop()));
  return file;
}

// Fichier OpenRaster (comme Krita l'enregistre) avec les morceaux du corps en calques.
export async function writeOra(api, dir, file = 'ama.ora', names = BODY) {
  const files = [];
  const layers = [];
  for (const n of names) {
    const p = drawPart(n);
    files.push({ name: `data/${n}.png`, data: await pngBytes(p.canvas) });
    layers.push(`<layer name="${n}" src="data/${n}.png" x="${p.left}" y="${p.top}" opacity="${n === 'ombre' ? '0.8' : '1.0'}"${n === 'ombre' ? ' composite-op="svg:multiply"' : ''}/>`);
  }
  // Dans un ORA, le premier calque est celui du dessus.
  const stack = `<?xml version="1.0" encoding="UTF-8"?>
<image w="${W}" h="${H}" version="0.0.5"><stack>${layers.reverse().join('')}</stack></image>`;
  const zip = makeZip([
    { name: 'mimetype', data: new TextEncoder().encode('image/openraster') },
    { name: 'stack.xml', data: new TextEncoder().encode(stack) },
    ...files,
  ]);
  await api.writeImage(dir, file, zip);
  return file;
}

// Archive ZIP sans compression (suffisant pour un ORA).
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data) {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function makeZip(entries) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const crc = crc32(e.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 10, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, e.data.length, true);
    local.setUint32(22, e.data.length, true);
    local.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(local.buffer), name, e.data);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 10, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, e.data.length, true);
    cen.setUint32(24, e.data.length, true);
    cen.setUint16(28, name.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + e.data.length;
  }
  const size = central.reduce((a, c) => a + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((a, c) => a + c.length, 0));
  let p = 0;
  for (const c of all) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

// Images pour les cartes explicatives (adresses data:, autorisées par la CSP).
async function dataUrl(canvas) {
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(blob);
  });
}

export async function partDataUrl(name) {
  return dataUrl(drawPart(name).canvas);
}

// Le personnage complet, morceaux superposés dans l'ordre d'affichage.
export async function compositeDataUrl(names = BODY) {
  const c = new OffscreenCanvas(W, H);
  const ctx = c.getContext('2d');
  for (const n of names) {
    const p = drawPart(n);
    ctx.drawImage(p.canvas, p.left, p.top);
  }
  return dataUrl(c);
}

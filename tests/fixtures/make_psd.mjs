// Génère tests/fixtures/personnage_test.psd avec ag-psd (sans canvas : données de pixels brutes).
// Usage : node tests/fixtures/make_psd.mjs
import { writeFileSync } from 'node:fs';
import { writePsdBuffer } from 'ag-psd';

const W = 300;
const H = 500;

// Rectangle plein, avec une marge transparente de 8 pixels (pour tester le recadrage).
function rect(w, h, [r, g, b, a = 255]) {
  const m = 8;
  const width = w + 2 * m;
  const height = h + 2 * m;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = m; y < m + h; y++) {
    for (let x = m; x < m + w; x++) {
      const i = (y * width + x) * 4;
      data.set([r, g, b, a], i);
    }
  }
  return { width, height, data };
}

function layer(name, left, top, w, h, color, extra = {}) {
  const imageData = rect(w, h, color);
  return { name, left: left - 8, top: top - 8, right: left - 8 + imageData.width, bottom: top - 8 + imageData.height, imageData, ...extra };
}

const psd = {
  width: W,
  height: H,
  // Du fond vers le dessus.
  children: [
    layer('jambes', 110, 330, 80, 160, [50, 60, 130]),
    {
      name: 'haut du corps',
      opened: true,
      children: [
        layer('torse', 100, 150, 100, 190, [150, 50, 160]),
        layer('ombre_torse', 100, 300, 100, 40, [0, 0, 0], { blendMode: 'multiply', opacity: 0.5 }),
      ],
    },
    layer('brouillon', 0, 0, 40, 40, [255, 0, 0], { hidden: true }),
    layer('tete', 115, 30, 70, 110, [235, 190, 150]),
  ],
};

const out = new URL('./personnage_test.psd', import.meta.url);
writeFileSync(out, writePsdBuffer(psd, { generateThumbnail: false, noBackground: true }));
console.log(`${out.pathname} : 4 calques visibles (dont 2 dans un groupe), 1 caché`);

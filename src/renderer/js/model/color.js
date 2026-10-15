// Couleurs au format texte « #rrggbb » ou « #rrggbbaa » (comme dans les fichiers .wn2d).

export const WHITE = '#ffffffff';

const RGB_RE = /^#[0-9a-f]{6}$/;
const RGBA_RE = /^#[0-9a-f]{8}$/;

export function isRgb(value) {
  return typeof value === 'string' && RGB_RE.test(value.toLowerCase());
}

export function isRgba(value) {
  return typeof value === 'string' && RGBA_RE.test(value.toLowerCase());
}

// « #rrggbb » ou « #rrggbbaa » → [r, g, b, a] entre 0 et 1.
export function hexToRgba(hex) {
  const h = hex.slice(1);
  const c = (i) => parseInt(h.slice(i, i + 2), 16) / 255;
  return [c(0), c(2), c(4), h.length >= 8 ? c(6) : 1];
}

export function rgbaToHex(r, g, b, a = 1) {
  const c = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}${c(a)}`;
}

// Sépare « #rrggbbaa » en couleur « #rrggbb » et alpha (0 à 1), pour les champs de l'interface.
export function splitAlpha(hex) {
  const [, , , a] = hexToRgba(hex);
  return { rgb: hex.slice(0, 7), alpha: a };
}

export function joinAlpha(rgb, alpha) {
  const [r, g, b] = hexToRgba(rgb);
  return rgbaToHex(r, g, b, alpha);
}

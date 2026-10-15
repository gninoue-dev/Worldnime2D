// Courbes d'interpolation entre deux clés.
//
// Une clé porte la courbe qui mène à la clé suivante :
//   - absente ou 'linear' : interpolation linéaire ;
//   - 'stepped' : palier, la valeur saute à la clé suivante ;
//   - [x1, y1, x2, y2] : courbe de Bézier normalisée (comme les « easing » CSS) :
//     le temps et la valeur vont de 0 à 1, les deux poignées sont (x1, y1) et (x2, y2).

export const CURVE_LINEAR = 'linear';
export const CURVE_STEPPED = 'stepped';

export const CURVE_PRESETS = {
  linear: { label: 'Linéaire', curve: CURVE_LINEAR },
  stepped: { label: 'Palier', curve: CURVE_STEPPED },
  easeIn: { label: 'Accélération', curve: [0.42, 0, 1, 1] },
  easeOut: { label: 'Ralentissement', curve: [0, 0, 0.58, 1] },
  easeInOut: { label: 'Accélération puis ralentissement', curve: [0.42, 0, 0.58, 1] },
  overshoot: { label: 'Dépassement', curve: [0.34, 1.56, 0.64, 1] },
  anticipation: { label: 'Anticipation', curve: [0.36, 0, 0.66, -0.56] },
};

export function isBezier(curve) {
  return Array.isArray(curve) && curve.length === 4;
}

export function isValidCurve(curve) {
  if (curve === undefined || curve === CURVE_LINEAR || curve === CURVE_STEPPED) return true;
  return isBezier(curve) && curve.every((v) => typeof v === 'number' && Number.isFinite(v))
    && curve[0] >= 0 && curve[0] <= 1 && curve[2] >= 0 && curve[2] <= 1;
}

function bezier1D(p1, p2, t) {
  const u = 1 - t;
  return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t;
}

function bezierSlope(p1, p2, t) {
  const u = 1 - t;
  return 3 * u * u * p1 + 6 * u * t * (p2 - p1) + 3 * t * t * (1 - p2);
}

// Progression (0 à 1, ou plus pour un dépassement) pour une fraction de temps p entre 0 et 1.
export function evaluateCurve(curve, p) {
  if (curve === CURVE_STEPPED) return 0;
  if (!isBezier(curve)) return p;
  const [x1, y1, x2, y2] = curve;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  // On cherche t tel que x(t) = p (Newton, puis dichotomie si besoin), puis on renvoie y(t).
  let t = p;
  for (let i = 0; i < 8; i++) {
    const x = bezier1D(x1, x2, t) - p;
    if (Math.abs(x) < 1e-6) return bezier1D(y1, y2, t);
    const d = bezierSlope(x1, x2, t);
    if (Math.abs(d) < 1e-6) break;
    t -= x / d;
  }
  let lo = 0;
  let hi = 1;
  t = p;
  for (let i = 0; i < 40; i++) {
    const x = bezier1D(x1, x2, t);
    if (Math.abs(x - p) < 1e-7) break;
    if (x < p) lo = t;
    else hi = t;
    t = (lo + hi) / 2;
  }
  return bezier1D(y1, y2, t);
}

// Points de la courbe pour l'affichage (n segments), en coordonnées normalisées.
export function sampleCurve(curve, n = 32) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const p = i / n;
    pts.push([p, evaluateCurve(curve, p)]);
  }
  return pts;
}

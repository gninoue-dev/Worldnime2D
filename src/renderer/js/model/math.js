// Petites fonctions de calcul partagées par le modèle et l'éditeur.

export const DEG_RAD = Math.PI / 180;
export const RAD_DEG = 180 / Math.PI;

export function cosDeg(deg) {
  return Math.cos(deg * DEG_RAD);
}

export function sinDeg(deg) {
  return Math.sin(deg * DEG_RAD);
}

export function atan2Deg(y, x) {
  return Math.atan2(y, x) * RAD_DEG;
}

// Ramène un angle dans l'intervalle ]-180, 180].
export function wrapDeg(deg) {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

// Arrondit pour éviter les « 0.30000000000000004 » dans l'interface et les fichiers.
export function round(value, digits = 2) {
  const f = 10 ** digits;
  const r = Math.round(value * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

// Distance d'un point (px, py) au segment [(ax, ay), (bx, by)].
export function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

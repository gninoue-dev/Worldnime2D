// Pièce jointe « chemin » : une courbe de Bézier que des os peuvent suivre (contrainte de chemin).
//
// vertices : pour chaque point du chemin, trois positions dans le repère de l'os du slot :
// poignée d'entrée, point, poignée de sortie → [[ix, iy], [px, py], [ox, oy], ...].
// Entre deux points k et k+1 : courbe (point k, sortie k, entrée k+1, point k+1).
// closed : le dernier point rejoint le premier.

export class PathAttachment {
  constructor(name) {
    this.type = 'path';
    this.name = name;
    this.closed = false;
    this.constantSpeed = true;
    this.vertices = [];
    this.color = '#ff7f00ff';
  }

  get pointCount() {
    return this.vertices.length / 3;
  }

  copy(name = this.name) {
    const p = new PathAttachment(name);
    p.closed = this.closed;
    p.constantSpeed = this.constantSpeed;
    p.color = this.color;
    p.vertices = this.vertices.map((v) => [...v]);
    return p;
  }

  // Positions monde de toutes les poignées et points : [[x, y], ...].
  worldVertices(bone) {
    return this.vertices.map(([x, y]) => [x * bone.a + y * bone.b + bone.worldX, x * bone.c + y * bone.d + bone.worldY]);
  }

  // Courbes de Bézier dans le monde : [[p0, c1, c2, p1], ...].
  worldCurves(bone) {
    const w = this.worldVertices(bone);
    const n = this.pointCount;
    const curves = [];
    const last = this.closed ? n : n - 1;
    for (let k = 0; k < last; k++) {
      const j = (k + 1) % n;
      curves.push([w[k * 3 + 1], w[k * 3 + 2], w[j * 3], w[j * 3 + 1]]);
    }
    return curves;
  }
}

// Chemin simple : une ligne droite de « length » le long de l'axe X de l'os, avec n points.
export function straightPath(name, length = 200, n = 3) {
  const p = new PathAttachment(name);
  const step = length / (n - 1);
  for (let i = 0; i < n; i++) {
    const x = i * step;
    p.vertices.push([x - step / 3, 0], [x, 0], [x + step / 3, 0]);
  }
  return p;
}

export function bezierPoint([p0, c1, c2, p1], t) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [a * p0[0] + b * c1[0] + c * c2[0] + d * p1[0], a * p0[1] + b * c1[1] + c * c2[1] + d * p1[1]];
}

export function bezierTangent([p0, c1, c2, p1], t) {
  const u = 1 - t;
  const dx = 3 * u * u * (c1[0] - p0[0]) + 6 * u * t * (c2[0] - c1[0]) + 3 * t * t * (p1[0] - c2[0]);
  const dy = 3 * u * u * (c1[1] - p0[1]) + 6 * u * t * (c2[1] - c1[1]) + 3 * t * t * (p1[1] - c2[1]);
  return Math.atan2(dy, dx);
}

// Table de longueurs d'arc pour parcourir les courbes à vitesse constante.
export function arcTable(curves, samples = 24) {
  const table = [];
  let total = 0;
  curves.forEach((curve, ci) => {
    let prev = bezierPoint(curve, 0);
    if (ci === 0) table.push({ ci, t: 0, d: 0 });
    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const p = bezierPoint(curve, t);
      total += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
      table.push({ ci, t, d: total });
      prev = p;
    }
  });
  return { table, total };
}

// Point et angle (radians) à la distance d le long du chemin. Hors du chemin : prolongement en ligne
// droite (chemin ouvert) ou tour complet (chemin fermé).
export function pointAtDistance(curves, arc, d, closed) {
  const { table, total } = arc;
  if (!curves.length) return { x: 0, y: 0, angle: 0 };
  if (closed && total > 0) d = ((d % total) + total) % total;
  if (!closed && d < 0) {
    const a = bezierTangent(curves[0], 0);
    const p = curves[0][0];
    return { x: p[0] + Math.cos(a) * d, y: p[1] + Math.sin(a) * d, angle: a };
  }
  if (!closed && d > total) {
    const last = curves.at(-1);
    const a = bezierTangent(last, 1);
    const p = last[3];
    return { x: p[0] + Math.cos(a) * (d - total), y: p[1] + Math.sin(a) * (d - total), angle: a };
  }
  let lo = 0;
  let hi = table.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (table[mid].d < d) lo = mid;
    else hi = mid;
  }
  const a = table[lo];
  const b = table[hi];
  const f = b.d > a.d ? (d - a.d) / (b.d - a.d) : 0;
  const ci = b.ci;
  const t0 = a.ci === ci ? a.t : 0;
  const t = t0 + (b.t - t0) * f;
  const [x, y] = bezierPoint(curves[ci], t);
  return { x, y, angle: bezierTangent(curves[ci], t) };
}

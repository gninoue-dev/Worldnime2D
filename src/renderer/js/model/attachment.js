// Pièces jointes : ce qu'un slot affiche. La v0.2 gère la « région » (une image rectangulaire).

import { cosDeg, sinDeg } from './math.js';
import { WHITE } from './color.js';

export const ATTACHMENT_TYPES = Object.freeze({ region: 'region' });

export class RegionAttachment {
  constructor(name) {
    this.type = ATTACHMENT_TYPES.region;
    this.name = name;
    // Chemin de l'image dans le dossier d'images, sans extension. null = même chose que le nom.
    this.path = null;
    // Placement relatif à l'os.
    this.x = 0;
    this.y = 0;
    this.rotation = 0;
    this.scaleX = 1;
    this.scaleY = 1;
    // Taille de l'image en pixels (remplie à l'import).
    this.width = 32;
    this.height = 32;
    this.color = WHITE;
  }

  get imagePath() {
    return this.path ?? this.name;
  }

  copy(name = this.name) {
    const a = new RegionAttachment(name);
    for (const k of ['path', 'x', 'y', 'rotation', 'scaleX', 'scaleY', 'width', 'height', 'color']) a[k] = this[k];
    return a;
  }

  // Les 4 coins dans le repère de l'os : bas-gauche, bas-droite, haut-droite, haut-gauche.
  localCorners() {
    const hw = this.width / 2;
    const hh = this.height / 2;
    const cos = cosDeg(this.rotation);
    const sin = sinDeg(this.rotation);
    const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    return pts.map(([px, py]) => {
      const sx = px * this.scaleX;
      const sy = py * this.scaleY;
      return [this.x + sx * cos - sy * sin, this.y + sx * sin + sy * cos];
    });
  }

  // Les 4 coins dans le monde (8 nombres : x0, y0, x1, y1…).
  worldVertices(bone, out = new Float32Array(8)) {
    const corners = this.localCorners();
    for (let i = 0; i < 4; i++) {
      const [lx, ly] = corners[i];
      out[i * 2] = lx * bone.a + ly * bone.b + bone.worldX;
      out[i * 2 + 1] = lx * bone.c + ly * bone.d + bone.worldY;
    }
    return out;
  }

  // Coordonnées de texture correspondant aux coins (l'image a son Y vers le bas).
  static UVS = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]);
  static INDICES = new Uint32Array([0, 1, 2, 0, 2, 3]);
}

// Le point (wx, wy) du monde est-il dans le quadrilatère ?
export function quadContains(v, wx, wy) {
  let inside = false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const xi = v[i * 2];
    const yi = v[i * 2 + 1];
    const xj = v[j * 2];
    const yj = v[j * 2 + 1];
    if ((yi > wy) !== (yj > wy) && wx < ((xj - xi) * (wy - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

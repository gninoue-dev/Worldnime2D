// Pièces jointes spéciales (non dessinées comme des images) :
//   boundingbox : polygone de collision (zones de touche d'un jeu) ;
//   clipping    : polygone de découpe : les slots suivants, jusqu'au slot « end », sont masqués hors du polygone ;
//   point       : une position et une direction (pour faire apparaître un effet, une arme…).
// Les sommets sont dans le repère de l'os du slot.

import { cosDeg, sinDeg, atan2Deg } from './math.js';

class PolygonAttachment {
  constructor(type, name, color) {
    this.type = type;
    this.name = name;
    this.vertices = [];
    this.color = color;
  }

  worldVertices(bone) {
    const out = new Float32Array(this.vertices.length * 2);
    this.vertices.forEach(([x, y], i) => {
      out[i * 2] = x * bone.a + y * bone.b + bone.worldX;
      out[i * 2 + 1] = x * bone.c + y * bone.d + bone.worldY;
    });
    return out;
  }
}

export class BoundingBoxAttachment extends PolygonAttachment {
  constructor(name) {
    super('boundingbox', name, '#60f000ff');
  }

  copy(name = this.name) {
    const a = new BoundingBoxAttachment(name);
    a.vertices = this.vertices.map((v) => [...v]);
    a.color = this.color;
    return a;
  }
}

export class ClippingAttachment extends PolygonAttachment {
  constructor(name) {
    super('clipping', name, '#ce3a3aff');
    // Dernier slot découpé (null : jusqu'à la fin de l'ordre d'affichage).
    this.end = null;
  }

  copy(name = this.name) {
    const a = new ClippingAttachment(name);
    a.vertices = this.vertices.map((v) => [...v]);
    a.color = this.color;
    a.end = this.end;
    return a;
  }
}

export class PointAttachment {
  constructor(name) {
    this.type = 'point';
    this.name = name;
    this.x = 0;
    this.y = 0;
    this.rotation = 0;
    this.color = '#f1f100ff';
  }

  copy(name = this.name) {
    const a = new PointAttachment(name);
    Object.assign(a, { x: this.x, y: this.y, rotation: this.rotation, color: this.color });
    return a;
  }

  // Position et rotation monde.
  world(bone) {
    const x = this.x * bone.a + this.y * bone.b + bone.worldX;
    const y = this.x * bone.c + this.y * bone.d + bone.worldY;
    const c = cosDeg(this.rotation);
    const s = sinDeg(this.rotation);
    return { x, y, rotation: atan2Deg(bone.c * c + bone.d * s, bone.a * c + bone.b * s) };
  }
}

// Polygone carré centré sur l'origine de l'os.
export function squarePolygon(size = 100) {
  const h = size / 2;
  return [[-h, -h], [h, -h], [h, h], [-h, h]];
}

export function isPolygonAttachment(att) {
  return att instanceof BoundingBoxAttachment || att instanceof ClippingAttachment;
}

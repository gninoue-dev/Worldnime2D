// Un os du squelette.
// Les valeurs « locales » (x, y, rotation, échelle, cisaillement) sont relatives au parent.
// La matrice monde (a, b, c, d, worldX, worldY) est recalculée par updateWorldTransform().
// Repère : X vers la droite, Y vers le haut, angles en degrés, sens anti-horaire.

import { cosDeg, sinDeg, atan2Deg } from './math.js';

// Comment un os hérite de la transformation de son parent.
export const INHERIT = Object.freeze({
  normal: 'normal',
  onlyTranslation: 'onlyTranslation',
  noRotationOrReflection: 'noRotationOrReflection',
  noScale: 'noScale',
  noScaleOrReflection: 'noScaleOrReflection',
});

export const INHERIT_LABELS = {
  normal: 'Normal',
  onlyTranslation: 'Position seulement',
  noRotationOrReflection: 'Sans rotation ni reflet',
  noScale: 'Sans échelle',
  noScaleOrReflection: 'Sans échelle ni reflet',
};

export const DEFAULT_BONE_COLOR = '#9b9b9b';

export class Bone {
  constructor(name, parent = null) {
    this.name = name;
    this.parent = parent;
    this.children = [];

    // Pose de base (« setup pose »).
    this.length = 0;
    this.x = 0;
    this.y = 0;
    this.rotation = 0;
    this.scaleX = 1;
    this.scaleY = 1;
    this.shearX = 0;
    this.shearY = 0;
    this.inherit = INHERIT.normal;
    this.color = DEFAULT_BONE_COLOR;

    // Pose courante : la pose de base, modifiée par les animations et les contraintes.
    // C'est elle qui sert au calcul de la matrice monde.
    this.pose = { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0 };

    // Matrice monde.
    this.a = 1;
    this.b = 0;
    this.c = 0;
    this.d = 1;
    this.worldX = 0;
    this.worldY = 0;
  }

  setToSetupPose() {
    const p = this.pose;
    p.x = this.x;
    p.y = this.y;
    p.rotation = this.rotation;
    p.scaleX = this.scaleX;
    p.scaleY = this.scaleY;
    p.shearX = this.shearX;
    p.shearY = this.shearY;
  }

  updateWorldTransform() {
    const { x, y, rotation, scaleX, scaleY, shearX, shearY } = this.pose;
    const parent = this.parent;

    if (!parent) {
      const rx = rotation + shearX;
      const ry = rotation + 90 + shearY;
      this.a = cosDeg(rx) * scaleX;
      this.b = cosDeg(ry) * scaleY;
      this.c = sinDeg(rx) * scaleX;
      this.d = sinDeg(ry) * scaleY;
      this.worldX = x;
      this.worldY = y;
      return;
    }

    let pa = parent.a;
    let pb = parent.b;
    let pc = parent.c;
    let pd = parent.d;
    this.worldX = pa * x + pb * y + parent.worldX;
    this.worldY = pc * x + pd * y + parent.worldY;

    switch (this.inherit) {
      case INHERIT.onlyTranslation: {
        const rx = rotation + shearX;
        const ry = rotation + 90 + shearY;
        this.a = cosDeg(rx) * scaleX;
        this.b = cosDeg(ry) * scaleY;
        this.c = sinDeg(rx) * scaleX;
        this.d = sinDeg(ry) * scaleY;
        return;
      }
      case INHERIT.noRotationOrReflection: {
        let s = pa * pa + pc * pc;
        let prx;
        if (s > 0.0001) {
          s = Math.abs(pa * pd - pb * pc) / s;
          pb = pc * s;
          pd = pa * s;
          prx = atan2Deg(pc, pa);
        } else {
          pa = 0;
          pc = 0;
          prx = 90 - atan2Deg(pd, pb);
        }
        const rx = rotation + shearX - prx;
        const ry = rotation + shearY - prx + 90;
        const la = cosDeg(rx) * scaleX;
        const lb = cosDeg(ry) * scaleY;
        const lc = sinDeg(rx) * scaleX;
        const ld = sinDeg(ry) * scaleY;
        this.a = pa * la - pb * lc;
        this.b = pa * lb - pb * ld;
        this.c = pc * la + pd * lc;
        this.d = pc * lb + pd * ld;
        return;
      }
      case INHERIT.noScale:
      case INHERIT.noScaleOrReflection: {
        const cos = cosDeg(rotation);
        const sin = sinDeg(rotation);
        let za = pa * cos + pb * sin;
        let zc = pc * cos + pd * sin;
        let s = Math.sqrt(za * za + zc * zc);
        if (s > 0.00001) s = 1 / s;
        za *= s;
        zc *= s;
        s = Math.sqrt(za * za + zc * zc);
        if (this.inherit === INHERIT.noScale && pa * pd - pb * pc < 0) s = -s;
        const r = Math.PI / 2 + Math.atan2(zc, za);
        const zb = Math.cos(r) * s;
        const zd = Math.sin(r) * s;
        const la = cosDeg(shearX) * scaleX;
        const lb = cosDeg(90 + shearY) * scaleY;
        const lc = sinDeg(shearX) * scaleX;
        const ld = sinDeg(90 + shearY) * scaleY;
        this.a = za * la + zb * lc;
        this.b = za * lb + zb * ld;
        this.c = zc * la + zd * lc;
        this.d = zc * lb + zd * ld;
        return;
      }
      default: {
        const rx = rotation + shearX;
        const ry = rotation + 90 + shearY;
        const la = cosDeg(rx) * scaleX;
        const lb = cosDeg(ry) * scaleY;
        const lc = sinDeg(rx) * scaleX;
        const ld = sinDeg(ry) * scaleY;
        this.a = pa * la + pb * lc;
        this.b = pa * lb + pb * ld;
        this.c = pc * la + pd * lc;
        this.d = pc * lb + pd * ld;
      }
    }
  }

  // Angle de l'axe X de l'os dans le monde.
  get worldRotationX() {
    return atan2Deg(this.c, this.a);
  }

  get worldScaleX() {
    return Math.hypot(this.a, this.c);
  }

  get worldScaleY() {
    return Math.hypot(this.b, this.d);
  }

  // Bout de l'os dans le monde.
  get tipX() {
    return this.worldX + this.a * this.length;
  }

  get tipY() {
    return this.worldY + this.c * this.length;
  }

  // Convertit un point du monde dans le repère local de cet os.
  worldToLocal(wx, wy) {
    const det = this.a * this.d - this.b * this.c;
    const x = wx - this.worldX;
    const y = wy - this.worldY;
    if (Math.abs(det) < 1e-9) return { x: 0, y: 0 };
    return {
      x: (x * this.d - y * this.b) / det,
      y: (y * this.a - x * this.c) / det,
    };
  }

  localToWorld(lx, ly) {
    return {
      x: lx * this.a + ly * this.b + this.worldX,
      y: lx * this.c + ly * this.d + this.worldY,
    };
  }

  // Convertit une rotation monde en rotation locale (de la pose courante) pour cet os.
  worldToLocalRotation(worldRotation) {
    const sin = sinDeg(worldRotation);
    const cos = cosDeg(worldRotation);
    return atan2Deg(this.a * sin - this.c * cos, this.d * cos - this.b * sin) + this.pose.rotation - this.pose.shearX;
  }

  // Coordonnées (dans le repère du parent) d'un point du monde.
  parentWorldToLocal(wx, wy) {
    if (!this.parent) return { x: wx, y: wy };
    return this.parent.worldToLocal(wx, wy);
  }

  isAncestorOf(other) {
    for (let p = other.parent; p; p = p.parent) {
      if (p === this) return true;
    }
    return false;
  }
}

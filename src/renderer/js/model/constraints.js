// Contraintes : elles modifient les valeurs appliquées et la matrice monde des os après l'animation.
//   ik        : orienter 1 ou 2 os vers un os cible (bras, jambes) ;
//   transform : copier tout ou partie de la transformation d'un os cible ;
//   path      : placer des os le long d'une pièce jointe chemin ;
//   physics   : faire suivre un os avec inertie (cheveux, tissus, accessoires).
// Elles sont évaluées dans l'ordre de leur champ « order ». Les valeurs de « pose » sont animables.

import { DEG_RAD, RAD_DEG, wrapDeg } from './math.js';
import { PathAttachment, arcTable, pointAtDistance } from './path.js';

const PI2 = Math.PI * 2;

function wrapRad(r) {
  return r - Math.ceil(r / PI2 - 0.5) * PI2;
}

function rotateWorld(bone, r) {
  if (!r) return;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const { a, b, c, d } = bone;
  bone.a = cos * a - sin * c;
  bone.b = cos * b - sin * d;
  bone.c = sin * a + cos * c;
  bone.d = sin * b + cos * d;
}

class Constraint {
  constructor(kind, name) {
    this.kind = kind;
    this.name = name;
    this.order = 0;
    this.bones = [];
    this.target = null;
  }

  setToSetupPose() {
    for (const k of Object.keys(this.pose)) this.pose[k] = this[k];
  }
}

// --- IK ------------------------------------------------------------------------------------------

export class IkConstraint extends Constraint {
  constructor(name) {
    super('ik', name);
    this.mix = 1;
    this.softness = 0;
    this.bendPositive = true;
    this.compress = false;
    this.stretch = false;
    this.uniform = false;
    this.pose = { mix: 1, softness: 0, bendPositive: true, compress: false, stretch: false };
  }

  apply(sk) {
    const target = sk.findBone(this.target);
    const bones = this.bones.map((n) => sk.findBone(n)).filter(Boolean);
    const p = this.pose;
    if (!target || bones.length === 0 || p.mix === 0) return [];
    if (bones.length === 1) {
      ik1(bones[0], target.worldX, target.worldY, p.compress, p.stretch, this.uniform, p.mix);
      return [bones[0]];
    }
    ik2(sk, bones[0], bones[1], target.worldX, target.worldY, p.bendPositive ? 1 : -1, p.stretch, this.uniform, p.softness, p.mix);
    return [bones[0]];
  }
}

// Un os : on le tourne vers la cible (dans le repère de son parent).
function ik1(bone, tx, ty, compress, stretch, uniform, alpha) {
  const p = bone.parent;
  const pa = p ? p.a : 1;
  const pb = p ? p.b : 0;
  const pc = p ? p.c : 0;
  const pd = p ? p.d : 1;
  const ap = bone.ap;
  const x = tx - (p ? p.worldX : 0);
  const y = ty - (p ? p.worldY : 0);
  const det = pa * pd - pb * pc;
  let lx = 0;
  let ly = 0;
  if (Math.abs(det) > 1e-4) {
    lx = (x * pd - y * pb) / det - ap.x;
    ly = (y * pa - x * pc) / det - ap.y;
  }
  let rot = Math.atan2(ly, lx) * RAD_DEG - ap.shearX - ap.rotation;
  if (ap.scaleX < 0) rot += 180;
  rot = wrapDeg(rot);
  let sx = ap.scaleX;
  let sy = ap.scaleY;
  if (compress || stretch) {
    const b = bone.length * sx;
    if (b > 1e-4) {
      const dd = lx * lx + ly * ly;
      if ((compress && dd < b * b) || (stretch && dd > b * b)) {
        const s = (Math.sqrt(dd) / b - 1) * alpha + 1;
        sx *= s;
        if (uniform) sy *= s;
      }
    }
  }
  ap.rotation += rot * alpha;
  ap.scaleX = sx;
  ap.scaleY = sy;
  bone.updateWorldTransform();
}

// Deux os (parent puis enfant direct) : loi des cosinus dans le monde.
function ik2(sk, parent, child, tx, ty, bendDir, stretch, uniform, softness, alpha) {
  const childLen = () => child.length * Math.hypot(child.a, child.c);
  let px = parent.worldX;
  let py = parent.worldY;
  let l1 = Math.hypot(child.worldX - px, child.worldY - py);
  let l2 = childLen();
  let dx = tx - px;
  let dy = ty - py;
  let d = Math.hypot(dx, dy);
  if (l1 < 1e-4 || d < 1e-4) {
    ik1(child, tx, ty, false, stretch, uniform, alpha);
    return;
  }
  // Étirement : le parent s'allonge pour que la chaîne atteigne la cible.
  if (stretch && d > l1 + l2 && l1 + l2 > 0) {
    const s = (d / (l1 + l2) - 1) * alpha + 1;
    parent.ap.scaleX *= s;
    if (uniform) parent.ap.scaleY *= s;
    parent.updateWorldTransform();
    sk.updateDescendants(parent);
    l1 = Math.hypot(child.worldX - px, child.worldY - py);
    l2 = childLen();
  }
  // Souplesse : près de l'extension complète, la chaîne ralentit au lieu de se tendre d'un coup.
  const total = l1 + l2;
  if (softness > 0 && d > total - softness) {
    const x = (d - (total - softness)) / softness;
    const nd = total - softness + softness * (1 - Math.exp(-x));
    dx *= nd / d;
    dy *= nd / d;
    d = nd;
  }
  const dc = Math.min(total - 1e-4, Math.max(Math.abs(l1 - l2) + 1e-4, d));
  const cosA = Math.min(1, Math.max(-1, (l1 * l1 + dc * dc - l2 * l2) / (2 * l1 * dc)));
  const flip = Math.sign(parent.a * parent.d - parent.b * parent.c) || 1;
  const desired = Math.atan2(dy, dx) + Math.acos(cosA) * bendDir * flip;
  const current = Math.atan2(child.worldY - py, child.worldX - px);
  const pFlip = parent.parent ? Math.sign(parent.parent.a * parent.parent.d - parent.parent.b * parent.parent.c) || 1 : 1;
  parent.ap.rotation += wrapRad(desired - current) * RAD_DEG * alpha * pFlip;
  parent.updateWorldTransform();
  sk.updateDescendants(parent);
  // L'enfant pointe vers la cible.
  const cDesired = Math.atan2(py + dy - child.worldY, px + dx - child.worldX);
  const cCurrent = Math.atan2(child.c, child.a);
  child.ap.rotation += wrapRad(cDesired - cCurrent) * RAD_DEG * alpha * flip;
  child.updateWorldTransform();
}

// --- Transformation ----------------------------------------------------------------------------

export class TransformConstraint extends Constraint {
  constructor(name) {
    super('transform', name);
    for (const k of ['mixRotate', 'mixX', 'mixY', 'mixScaleX', 'mixScaleY', 'mixShearY']) this[k] = 1;
    for (const k of ['offsetRotation', 'offsetX', 'offsetY', 'offsetScaleX', 'offsetScaleY', 'offsetShearY']) this[k] = 0;
    this.local = false;
    this.relative = false;
    this.pose = { mixRotate: 1, mixX: 1, mixY: 1, mixScaleX: 1, mixScaleY: 1, mixShearY: 1 };
  }

  apply(sk) {
    const t = sk.findBone(this.target);
    const bones = this.bones.map((n) => sk.findBone(n)).filter((b) => b && b !== t);
    if (!t || bones.length === 0) return [];
    const m = this.pose;
    for (const bone of bones) {
      if (this.local) this.applyLocal(bone, t, m);
      else {
        this.applyWorld(bone, t, m);
        bone.updateAppliedFromWorld();
      }
    }
    return bones;
  }

  applyWorld(bone, t, m) {
    const ta = t.a;
    const tb = t.b;
    const tc = t.c;
    const td = t.d;
    const offR = this.offsetRotation * DEG_RAD;
    if (m.mixRotate) {
      const r = this.relative ? Math.atan2(tc, ta) + offR : Math.atan2(tc, ta) - Math.atan2(bone.c, bone.a) + offR;
      rotateWorld(bone, wrapRad(r) * m.mixRotate);
    }
    if (m.mixX || m.mixY) {
      const w = t.localToWorld(this.offsetX, this.offsetY);
      if (this.relative) {
        bone.worldX += (w.x - t.worldX + t.worldX) * m.mixX;
        bone.worldY += (w.y - t.worldY + t.worldY) * m.mixY;
      } else {
        bone.worldX += (w.x - bone.worldX) * m.mixX;
        bone.worldY += (w.y - bone.worldY) * m.mixY;
      }
    }
    if (m.mixScaleX) {
      const s = Math.hypot(bone.a, bone.c);
      const ts = Math.hypot(ta, tc);
      const f = this.relative ? (ts - 1 + this.offsetScaleX) * m.mixScaleX + 1 : s > 1e-5 ? (s + (ts - s + this.offsetScaleX) * m.mixScaleX) / s : 1;
      bone.a *= f;
      bone.c *= f;
    }
    if (m.mixScaleY) {
      const s = Math.hypot(bone.b, bone.d);
      const ts = Math.hypot(tb, td);
      const f = this.relative ? (ts - 1 + this.offsetScaleY) * m.mixScaleY + 1 : s > 1e-5 ? (s + (ts - s + this.offsetScaleY) * m.mixScaleY) / s : 1;
      bone.b *= f;
      bone.d *= f;
    }
    if (m.mixShearY) {
      const s = Math.hypot(bone.b, bone.d);
      const by = Math.atan2(bone.d, bone.b);
      const tShear = Math.atan2(td, tb) - Math.atan2(tc, ta);
      let r;
      if (this.relative) r = by + wrapRad(tShear - Math.PI / 2 + this.offsetShearY * DEG_RAD) * m.mixShearY;
      else r = by + wrapRad(tShear - (by - Math.atan2(bone.c, bone.a)) + this.offsetShearY * DEG_RAD) * m.mixShearY;
      bone.b = Math.cos(r) * s;
      bone.d = Math.sin(r) * s;
    }
  }

  applyLocal(bone, t, m) {
    const ap = bone.ap;
    const ta = t.ap;
    if (this.relative) {
      ap.rotation += (ta.rotation + this.offsetRotation) * m.mixRotate;
      ap.x += (ta.x + this.offsetX) * m.mixX;
      ap.y += (ta.y + this.offsetY) * m.mixY;
      ap.scaleX *= (ta.scaleX - 1 + this.offsetScaleX) * m.mixScaleX + 1;
      ap.scaleY *= (ta.scaleY - 1 + this.offsetScaleY) * m.mixScaleY + 1;
      ap.shearY += (ta.shearY + this.offsetShearY) * m.mixShearY;
    } else {
      ap.rotation += wrapDeg(ta.rotation - ap.rotation + this.offsetRotation) * m.mixRotate;
      ap.x += (ta.x - ap.x + this.offsetX) * m.mixX;
      ap.y += (ta.y - ap.y + this.offsetY) * m.mixY;
      if (ap.scaleX) ap.scaleX += (ta.scaleX - ap.scaleX + this.offsetScaleX) * m.mixScaleX;
      if (ap.scaleY) ap.scaleY += (ta.scaleY - ap.scaleY + this.offsetScaleY) * m.mixScaleY;
      ap.shearY += wrapDeg(ta.shearY - ap.shearY + this.offsetShearY) * m.mixShearY;
    }
    bone.updateWorldTransform();
  }
}

// --- Chemin ------------------------------------------------------------------------------------------

export const POSITION_MODES = { fixed: 'Fixe (distance)', percent: 'Pourcentage' };
export const SPACING_MODES = { length: 'Longueur des os', fixed: 'Fixe', percent: 'Pourcentage', proportional: 'Proportionnel' };
export const ROTATE_MODES = { tangent: 'Tangente', chain: 'Chaîne', chainScale: 'Chaîne avec échelle' };

export class PathConstraint extends Constraint {
  constructor(name) {
    super('path', name);
    this.positionMode = 'percent';
    this.spacingMode = 'length';
    this.rotateMode = 'tangent';
    this.offsetRotation = 0;
    this.position = 0;
    this.spacing = 0;
    this.mixRotate = 1;
    this.mixX = 1;
    this.mixY = 1;
    this.pose = { position: 0, spacing: 0, mixRotate: 1, mixX: 1, mixY: 1 };
  }

  apply(sk) {
    const slot = sk.findSlot(this.target);
    if (!slot) return [];
    const att = sk.currentAttachment(slot);
    if (!(att instanceof PathAttachment) || att.pointCount < 2) return [];
    const bones = this.bones.map((n) => sk.findBone(n)).filter(Boolean);
    if (bones.length === 0) return [];
    const m = this.pose;
    const curves = att.worldCurves(slot.bone);
    const arc = arcTable(curves);
    const total = arc.total;
    const lengths = bones.map((b) => b.length * Math.hypot(b.a, b.c));
    const sumL = lengths.reduce((s, l) => s + l, 0) || 1;
    let d = this.positionMode === 'percent' ? m.position * total : m.position;
    const dists = [d];
    for (let i = 0; i < bones.length; i++) {
      let sp;
      if (this.spacingMode === 'length') sp = lengths[i] + m.spacing;
      else if (this.spacingMode === 'fixed') sp = m.spacing;
      else if (this.spacingMode === 'percent') sp = m.spacing * total;
      else sp = (lengths[i] / sumL) * total * (m.spacing || 1);
      d += sp;
      dists.push(d);
    }
    const offR = this.offsetRotation * DEG_RAD;
    bones.forEach((bone, i) => {
      const pt = pointAtDistance(curves, arc, dists[i], att.closed);
      const next = pointAtDistance(curves, arc, dists[i + 1], att.closed);
      bone.worldX += (pt.x - bone.worldX) * m.mixX;
      bone.worldY += (pt.y - bone.worldY) * m.mixY;
      if (m.mixRotate) {
        const angle = this.rotateMode === 'tangent' ? pt.angle : Math.atan2(next.y - pt.y, next.x - pt.x);
        if (this.rotateMode === 'chainScale' && lengths[i] > 1e-4) {
          const s = 1 + (Math.hypot(next.x - pt.x, next.y - pt.y) / lengths[i] - 1) * m.mixRotate;
          bone.a *= s;
          bone.c *= s;
        }
        rotateWorld(bone, wrapRad(angle - Math.atan2(bone.c, bone.a) + offR) * m.mixRotate);
      }
      bone.updateAppliedFromWorld();
      sk.updateDescendants(bone, true);
    });
    return [];
  }
}

// --- Physique ---------------------------------------------------------------------------------------

export class PhysicsConstraint extends Constraint {
  constructor(name) {
    super('physics', name);
    // Part du mouvement simulée sur chaque canal (0 à 1).
    this.x = 0;
    this.y = 0;
    this.rotate = 1;
    this.scaleX = 0;
    this.shearX = 0;
    this.limit = 5000;
    this.step = 1 / 60;
    this.inertia = 1;
    this.strength = 100;
    this.damping = 1;
    this.mass = 1;
    this.wind = 0;
    this.gravity = 0;
    this.mix = 1;
    this.pose = { inertia: 1, strength: 100, damping: 1, mass: 1, wind: 0, gravity: 0, mix: 1 };
    this.resetState();
  }

  resetState() {
    this.st = {
      reset: true, ux: 0, uy: 0, cx: 0, cy: 0, tx: 0, ty: 0,
      xOffset: 0, xVelocity: 0, yOffset: 0, yVelocity: 0,
      rotateOffset: 0, rotateVelocity: 0, scaleOffset: 0, scaleVelocity: 0,
      remaining: 0, lastTime: 0,
    };
  }

  // physics : 'reset', 'update' (avance la simulation jusqu'à sk.time), 'pose' (applique sans avancer).
  apply(sk, physics = 'pose') {
    const bone = sk.findBone(this.bones[0]);
    const p = this.pose;
    if (!bone || p.mix === 0 || physics === 'none') return [];
    if (physics === 'reset') {
      this.resetState();
      this.st.lastTime = sk.time;
    }
    const st = this.st;
    const doX = this.x > 0;
    const doY = this.y > 0;
    const rotOrShear = this.rotate > 0 || this.shearX > 0;
    const doScale = this.scaleX > 0;
    const l = bone.length;
    const ref = sk.referenceScale;
    const mass = p.mass > 0 ? 1 / p.mass : 1;

    if (physics === 'update' || physics === 'reset') {
      const delta = Math.max(sk.time - st.lastTime, 0);
      st.remaining += delta;
      st.lastTime = sk.time;
      const bx = bone.worldX;
      const by = bone.worldY;
      if (st.reset) {
        st.reset = false;
        st.ux = bx;
        st.uy = by;
      } else {
        let a = st.remaining;
        const i = p.inertia;
        const t = this.step;
        let d = -1;
        let m = 0;
        if (doX || doY) {
          if (doX) {
            const u = (st.ux - bx) * i;
            st.xOffset += Math.max(-this.limit, Math.min(this.limit, u));
            st.ux = bx;
          }
          if (doY) {
            const u = (st.uy - by) * i;
            st.yOffset += Math.max(-this.limit, Math.min(this.limit, u));
            st.uy = by;
          }
          if (a >= t) {
            d = p.damping ** (60 * t);
            m = mass * t;
            const e = p.strength;
            const w = p.wind * ref;
            const g = p.gravity * ref;
            do {
              if (doX) {
                st.xVelocity += (w - st.xOffset * e) * m;
                st.xOffset += st.xVelocity * t;
                st.xVelocity *= d;
              }
              if (doY) {
                st.yVelocity -= (g + st.yOffset * e) * m;
                st.yOffset += st.yVelocity * t;
                st.yVelocity *= d;
              }
              a -= t;
            } while (a >= t);
          }
          if (doX) bone.worldX += st.xOffset * p.mix * this.x;
          if (doY) bone.worldY += st.yOffset * p.mix * this.y;
        }
        if (rotOrShear || doScale) {
          const ca = Math.atan2(bone.c, bone.a);
          let c;
          let s;
          let mr = 0;
          let dx = Math.max(-this.limit, Math.min(this.limit, st.cx - bone.worldX));
          let dy = Math.max(-this.limit, Math.min(this.limit, st.cy - bone.worldY));
          if (rotOrShear) {
            mr = (this.rotate + this.shearX) * p.mix;
            let r = Math.atan2(dy + st.ty, dx + st.tx) - ca - st.rotateOffset * mr;
            st.rotateOffset += wrapRad(r) * i;
            r = st.rotateOffset * mr + ca;
            c = Math.cos(r);
            s = Math.sin(r);
            if (doScale) {
              const len = l * Math.hypot(bone.a, bone.c);
              if (len > 0) st.scaleOffset += ((dx * c + dy * s) * i) / len;
            }
          } else {
            c = Math.cos(ca);
            s = Math.sin(ca);
            const len = l * Math.hypot(bone.a, bone.c);
            if (len > 0) st.scaleOffset += ((dx * c + dy * s) * i) / len;
          }
          a = st.remaining;
          if (a >= t) {
            if (d === -1) {
              d = p.damping ** (60 * t);
              m = mass * t;
            }
            const e = p.strength;
            const w = p.wind * ref;
            const g = p.gravity * ref;
            const h = l / ref;
            for (;;) {
              a -= t;
              if (doScale) {
                st.scaleVelocity += (w * c - g * s - st.scaleOffset * e) * m;
                st.scaleOffset += st.scaleVelocity * t;
                st.scaleVelocity *= d;
              }
              if (rotOrShear) {
                st.rotateVelocity -= ((w * s + g * c) * h + st.rotateOffset * e) * m;
                st.rotateOffset += st.rotateVelocity * t;
                st.rotateVelocity *= d;
              }
              if (a < t) break;
            }
          }
          dx = 0;
          dy = 0;
        }
        st.remaining = a;
      }
      st.cx = bone.worldX;
      st.cy = bone.worldY;
    } else {
      if (doX) bone.worldX += st.xOffset * p.mix * this.x;
      if (doY) bone.worldY += st.yOffset * p.mix * this.y;
    }

    if (rotOrShear) {
      let o = st.rotateOffset * p.mix;
      if (this.shearX > 0) {
        let r = 0;
        if (this.rotate > 0) {
          r = o * this.rotate;
          const s = Math.sin(r);
          const c = Math.cos(r);
          const b = bone.b;
          bone.b = c * b - s * bone.d;
          bone.d = s * b + c * bone.d;
        }
        r += o * this.shearX;
        const s = Math.sin(r);
        const c = Math.cos(r);
        const a = bone.a;
        bone.a = c * a - s * bone.c;
        bone.c = s * a + c * bone.c;
      } else {
        o *= this.rotate;
        rotateWorld(bone, o);
      }
    }
    if (doScale) {
      const s = 1 + st.scaleOffset * p.mix * this.scaleX;
      bone.a *= s;
      bone.c *= s;
    }
    if (physics !== 'pose') {
      st.tx = l * bone.a;
      st.ty = l * bone.c;
    }
    bone.updateAppliedFromWorld();
    return [bone];
  }
}

export const CONSTRAINT_CLASSES = { ik: IkConstraint, transform: TransformConstraint, path: PathConstraint, physics: PhysicsConstraint };
export const CONSTRAINT_LABELS = { ik: 'IK', transform: 'Transformation', path: 'Chemin', physics: 'Physique' };

// Champs enregistrés de chaque type (en plus de name, order, bones, target).
export const CONSTRAINT_FIELDS = {
  ik: ['mix', 'softness', 'bendPositive', 'compress', 'stretch', 'uniform'],
  transform: ['mixRotate', 'mixX', 'mixY', 'mixScaleX', 'mixScaleY', 'mixShearY', 'offsetRotation', 'offsetX', 'offsetY',
    'offsetScaleX', 'offsetScaleY', 'offsetShearY', 'local', 'relative'],
  path: ['positionMode', 'spacingMode', 'rotateMode', 'offsetRotation', 'position', 'spacing', 'mixRotate', 'mixX', 'mixY'],
  physics: ['x', 'y', 'rotate', 'scaleX', 'shearX', 'limit', 'step', 'inertia', 'strength', 'damping', 'mass', 'wind', 'gravity', 'mix'],
};

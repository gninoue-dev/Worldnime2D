// Dessin des pièces jointes (images) dans l'ordre d'affichage des slots.
//
// Chaque image est un Mesh PixiJS avec un shader « deux couleurs » :
//   couleur finale = image × couleur claire + (1 − image) × couleur sombre
// C'est la teinte sombre (« tint black ») : sans couleur sombre (noir), on retrouve la teinte classique.

import { Container, Graphics, Mesh, MeshGeometry, Shader, UniformGroup } from 'pixi.js';
import { RegionAttachment } from '../model/attachment.js';
import { hexToRgba } from '../model/color.js';

const VERTEX = /* glsl */ `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}
`;

// La texture est en alpha prémultiplié : t.rgb vaut déjà couleur × t.a.
const FRAGMENT = /* glsl */ `
in vec2 vUV;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uLight;
uniform vec3 uDark;

void main() {
  vec4 t = texture(uTexture, vUV);
  finalColor.a = t.a * uLight.a;
  finalColor.rgb = uLight.a * (t.rgb * uLight.rgb + (t.a - t.rgb) * uDark);
}
`;

const PIXI_BLEND = { normal: 'normal', additive: 'add', multiply: 'multiply', screen: 'screen' };

export class AttachmentsView {
  constructor(library) {
    this.library = library;
    this.container = new Container();
    this.missing = new Graphics();
    this.pool = new Map();
    this.visible = true;
  }

  // Redessine toutes les images du squelette (coordonnées monde).
  update(skeleton) {
    this.container.removeChildren();
    this.missing.clear();
    if (!this.visible) {
      this.container.addChild(this.missing);
      return;
    }
    const used = new Set();
    for (const slot of skeleton.slots) {
      const att = skeleton.visibleAttachment(slot);
      if (!(att instanceof RegionAttachment)) continue;
      const verts = att.worldVertices(slot.bone);
      const entry = this.library.get(att.imagePath);
      if (!entry) {
        this.drawMissing(verts);
        continue;
      }
      const item = this.item(slot.name, entry.texture);
      used.add(slot.name);
      item.geometry.positions = verts;
      item.geometry.getBuffer('aPosition').update();

      const [sr, sg, sb, sa] = hexToRgba(slot.color);
      const [ar, ag, ab, aa] = hexToRgba(att.color);
      const light = item.uniforms.uniforms.uLight;
      light[0] = sr * ar;
      light[1] = sg * ag;
      light[2] = sb * ab;
      light[3] = sa * aa;
      const dark = item.uniforms.uniforms.uDark;
      const [dr, dg, db] = slot.dark ? hexToRgba(slot.dark) : [0, 0, 0];
      dark[0] = dr;
      dark[1] = dg;
      dark[2] = db;
      item.uniforms.update();
      item.mesh.blendMode = PIXI_BLEND[slot.blend] ?? 'normal';
      this.container.addChild(item.mesh);
    }
    this.container.addChild(this.missing);
    // Libère les meshes des slots disparus.
    for (const [name, item] of this.pool) {
      if (!used.has(name) && !skeleton.findSlot(name)) {
        item.mesh.destroy();
        this.pool.delete(name);
      }
    }
  }

  item(slotName, texture) {
    let item = this.pool.get(slotName);
    if (!item) {
      const geometry = new MeshGeometry({
        positions: new Float32Array(8),
        uvs: new Float32Array(RegionAttachment.UVS),
        indices: new Uint32Array(RegionAttachment.INDICES),
      });
      const uniforms = new UniformGroup({
        uLight: { value: new Float32Array([1, 1, 1, 1]), type: 'vec4<f32>' },
        uDark: { value: new Float32Array([0, 0, 0]), type: 'vec3<f32>' },
      });
      const shader = Shader.from({
        gl: { vertex: VERTEX, fragment: FRAGMENT },
        resources: { uTexture: texture.source, tint: uniforms },
      });
      const mesh = new Mesh({ geometry, shader, texture });
      item = { mesh, geometry, shader, uniforms, texture };
      this.pool.set(slotName, item);
    }
    if (item.texture !== texture || item.texture.destroyed) {
      item.texture = texture;
      item.shader.resources.uTexture = texture.source;
      item.mesh.texture = texture;
    }
    return item;
  }

  // Image introuvable dans le dossier : un cadre rouge barré, comme un emplacement vide.
  drawMissing(v) {
    const g = this.missing;
    g.poly(Array.from(v)).fill({ color: 0xff3b3b, alpha: 0.12 });
    g.moveTo(v[0], v[1]).lineTo(v[4], v[5]).moveTo(v[2], v[3]).lineTo(v[6], v[7]);
    g.poly(Array.from(v)).stroke({ width: 1, color: 0xff5252, pixelLine: true });
  }
}

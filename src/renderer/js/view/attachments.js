// Dessin des pièces jointes (images) dans l'ordre d'affichage des slots.
//
// Chaque image est un Mesh PixiJS avec un shader « deux couleurs » :
//   couleur finale = image × couleur claire + (1 − image) × couleur sombre
// C'est la teinte sombre (« tint black ») : sans couleur sombre (noir), on retrouve la teinte classique.
//
// Sans WebGL (carte graphique sur liste noire, machine virtuelle…), PixiJS dessine en Canvas 2D,
// qui ne connaît pas les shaders : on utilise alors des sprites. Teinte et opacité marchent,
// mais pas la teinte sombre.

import { Container, Graphics, Matrix, Mesh, MeshGeometry, Shader, Sprite, UniformGroup } from 'pixi.js';
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
  constructor(library, useShader) {
    this.library = library;
    this.useShader = useShader;
    this.container = new Container();
    this.missing = new Graphics();
    this.pool = new Map();
    this.visible = true;
    library.addEventListener('dispose', (e) => this.forget(e.detail));
  }

  // Oublie les éléments qui utilisent une texture sur le point d'être détruite.
  forget(texture) {
    for (const [name, item] of this.pool) {
      if (item.texture !== texture) continue;
      this.destroyItem(item);
      this.pool.delete(name);
    }
  }

  destroyItem(item) {
    item.mesh.removeFromParent();
    item.mesh.destroy();
    item.shader?.destroy();
  }

  // Redessine toutes les images du squelette (coordonnées monde).
  // ghost : { color: [r, g, b], alpha } pour dessiner un « fantôme » (pelure d'oignon).
  update(skeleton, ghost = null) {
    this.container.removeChildren();
    this.missing.clear();
    if (!this.visible) {
      this.container.addChild(this.missing);
      return;
    }
    const used = new Set();
    for (const slot of skeleton.drawOrder) {
      const att = skeleton.currentAttachment(slot);
      if (!(att instanceof RegionAttachment)) continue;
      const verts = att.worldVertices(slot.bone);
      const entry = this.library.get(att.imagePath);
      if (!entry) {
        if (!ghost) this.drawMissing(verts);
        continue;
      }
      used.add(slot.name);
      const [sr, sg, sb, sa] = hexToRgba(slot.pose.color);
      const [ar, ag, ab, aa] = hexToRgba(att.color);
      const light = [sr * ar, sg * ag, sb * ab, sa * aa];
      if (ghost) {
        for (let i = 0; i < 3; i++) light[i] *= ghost.color[i];
        light[3] *= ghost.alpha;
      }
      const item = this.useShader
        ? this.shaderItem(slot, entry.texture, verts, light, ghost)
        : this.spriteItem(slot, entry.texture, verts, light);
      item.mesh.blendMode = PIXI_BLEND[slot.blend] ?? 'normal';
      this.container.addChild(item.mesh);
    }
    this.container.addChild(this.missing);
    // Libère les meshes des slots disparus.
    for (const [name, item] of this.pool) {
      if (!used.has(name) && !skeleton.findSlot(name)) {
        this.destroyItem(item);
        this.pool.delete(name);
      }
    }
  }

  shaderItem(slot, texture, verts, light, ghost) {
    const item = this.meshItem(slot.name, texture);
    item.geometry.positions = verts;
    item.geometry.getBuffer('aPosition').update();
    item.uniforms.uniforms.uLight.set(light);
    const [dr, dg, db] = slot.pose.dark && !ghost ? hexToRgba(slot.pose.dark) : [0, 0, 0];
    item.uniforms.uniforms.uDark.set([dr, dg, db]);
    item.uniforms.update();
    return item;
  }

  // Mode de secours : un sprite placé par une matrice qui envoie les coins de la texture
  // (en pixels, Y vers le bas) sur les coins de l'image dans le monde.
  spriteItem(slot, texture, v, light) {
    let item = this.pool.get(slot.name);
    if (!item || item.texture !== texture) {
      if (item) this.destroyItem(item);
      item = { mesh: new Sprite(texture), texture };
      this.pool.set(slot.name, item);
    }
    const w = texture.width;
    const h = texture.height;
    // Coins : 0 bas-gauche, 1 bas-droite, 2 haut-droite, 3 haut-gauche.
    const m = new Matrix(
      (v[4] - v[6]) / w, (v[5] - v[7]) / w,
      (v[0] - v[6]) / h, (v[1] - v[7]) / h,
      v[6], v[7],
    );
    item.mesh.setFromMatrix(m);
    item.mesh.tint = (Math.round(light[0] * 255) << 16) | (Math.round(light[1] * 255) << 8) | Math.round(light[2] * 255);
    item.mesh.alpha = light[3];
    return item;
  }

  meshItem(slotName, texture) {
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

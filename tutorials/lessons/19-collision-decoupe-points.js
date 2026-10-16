import { intro, outro } from './common.js';
import { prepareAma } from '../runtime/rig.js';

const bone = (d, name) => d.editor.skeleton.findBone(name);
const mid = (b) => [(b.worldX + b.tipX) / 2, (b.worldY + b.tipY) / 2];
const end = (d) => d.job.durations[d.stepIndex];

// Sommets (monde) d'un polygone : boîte de collision ou découpe.
function polyVerts(d, slotName) {
  const sk = d.editor.skeleton;
  const slot = sk.findSlot(slotName);
  const att = sk.getAttachment(slot, slotName);
  return att.vertices.map(([x, y]) => {
    const w = slot.bone.localToWorld(x, y);
    return [w.x, w.y];
  });
}

// Déplace chaque sommet d'un polygone vers une forme voulue (points du monde, même nombre).
async function reshape(d, slotName, targets, duration = 0.6) {
  for (let i = 0; i < targets.length; i++) {
    const v = polyVerts(d, slotName)[i];
    await d.drag(v, targets[i], { duration });
  }
}

export default {
  id: '19-collision-decoupe-points',
  module: 7,
  title: 'Collision, découpe et points',
  next: 'Aperçu des mélanges',
  goals: [
    'Les boîtes de collision, pour le jeu',
    'La découpe (clipping), pour masquer une partie du dessin',
    'Les points, pour repérer une position',
  ],
  recap: [
    'Boîte de collision : un polygone qui suit l\'os, que le jeu teste (coups, clics)',
    'Dans la vue : glisser un sommet, clic sur une arête = nouveau sommet, Alt+clic = supprimer',
    'Découpe : les slots dessinés après elle ne s\'affichent qu\'à l\'intérieur',
    'Point : une position et un angle sur un os (projectile, effet, arme)',
  ],
  async setup(d) {
    await prepareAma(d);
    d.editor.setTool('select');
  },
  steps: [
    intro('Dans cette leçon, on découvre trois pièces jointes spéciales, sans image : les boîtes de collision, les découpes et les points.'),
    {
      say: 'Une boîte de collision est un polygone accroché à un os. Elle ne s\'affiche pas dans le jeu : le jeu s\'en sert pour savoir si un coup touche, ou si on clique sur le personnage. Sélectionnez l\'avant-bras gauche, et cliquez sur « Boîte de collision sur cet os ».',
      do: async (d) => {
        await d.at(9);
        await d.click(mid(bone(d, 'avant_bras_gauche')));
        await d.at(12);
        await d.click(d.propButton('＋ Boîte de collision'));
        await d.wheel(mid(bone(d, 'avant_bras_gauche')), 3);
      },
    },
    {
      say: 'Un carré apparaît, avec ses sommets. Glissez-les pour entourer la main : ce sera la zone qui frappe. Cliquer sur une arête ajoute un sommet ; Alt plus clic en supprime un.',
      do: async (d) => {
        await d.at(2.5);
        const b = bone(d, 'avant_bras_gauche');
        const t = [b.tipX, b.tipY];
        await reshape(d, 'avant_bras_gauche_collision', [[t[0] - 16, t[1] - 18], [t[0] + 16, t[1] - 18], [t[0] + 16, t[1] + 16], [t[0] - 16, t[1] + 16]], 0.55);
        await d.at(end(d) - 3);
        const v = polyVerts(d, 'avant_bras_gauche_collision');
        await d.click([(v[0][0] + v[1][0]) / 2, (v[0][1] + v[1][1]) / 2 - 0.5]);
      },
    },
    {
      say: 'Faites-en une autre sur le torse : ce sera la zone qui reçoit les coups. Dans un jeu de combat, on compare ces deux boîtes à chaque image. Les boîtes suivent les os, donc toutes vos animations.',
      do: async (d) => {
        await d.key('F');
        await d.at(1.5);
        await d.click(mid(bone(d, 'torse')));
        await d.click(d.propButton('＋ Boîte de collision'));
        await d.at(4.5);
        await reshape(d, 'torse_collision', [[-48, 170], [48, 170], [48, 300], [-48, 300]], 0.5);
      },
    },
    {
      say: 'Passons à la découpe. Sélectionnez les hanches, et cliquez sur « Découpe sur cet os ». Une découpe cache tout ce qui est dessiné après elle, hors de son polygone. Envoyez-la tout au fond, dans les Propriétés du slot : Ama n\'est plus visible que dans le carré.',
      do: async (d) => {
        await d.at(3);
        await d.click(mid(bone(d, 'hanches')));
        await d.at(5);
        await d.click(d.propButton('＋ Découpe'));
        await d.at(10.5);
        await d.click(d.row('hanches_decoupe', '#tree', 'slot'));
        await d.at(13);
        await d.click(d.propButton('Envoyer tout au fond'));
      },
    },
    {
      say: 'Agrandissons le polygone en forme de fenêtre ronde. On s\'en sert pour un personnage qui sort d\'un portail, un reflet dans un miroir, ou de l\'eau dans un verre. La liste « Dernier slot découpé » limite les slots concernés.',
      do: async (d) => {
        await d.click(d.row('hanches_decoupe', '#tree', 'att'));
        const c = [0, 250];
        const r = 115;
        const pts = [0, 1, 2, 3].map((i) => {
          const a = -Math.PI * 0.75 + (i * Math.PI) / 2;
          return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r];
        });
        await reshape(d, 'hanches_decoupe', pts, 0.6);
        // Des sommets sur les arêtes, pour arrondir.
        for (let i = 0; i < 4; i++) {
          const v = polyVerts(d, 'hanches_decoupe');
          const a = v[i * 2];
          const b = v[(i * 2 + 1) % v.length];
          await d.click([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
          const idx = i * 2 + 1;
          const now = polyVerts(d, 'hanches_decoupe')[idx];
          const ang = Math.atan2(now[1] - c[1], now[0] - c[0]);
          await d.drag(now, [c[0] + Math.cos(ang) * r * 1.05, c[1] + Math.sin(ang) * r * 1.05], { duration: 0.4 });
        }
        await d.at(end(d) - 2);
        const h = d.highlight(d.prop('Dernier slot découpé').closest('.prop-row'), '', { place: 'left' });
        await d.at(end(d) - 0.2);
        h.remove();
      },
    },
    {
      say: 'Supprimons cette découpe, avec la touche Suppr, pour retrouver Ama entière.',
      do: async (d) => {
        await d.at(2);
        await d.click(d.row('hanches_decoupe', '#tree', 'slot'));
        await d.key('Suppr');
      },
    },
    {
      say: 'Dernière pièce jointe spéciale : le point. Il marque une position et une direction sur un os. Par exemple, d\'où part la boule d\'énergie quand Ama attaque. Sélectionnez l\'avant-bras droit, et cliquez sur « Point sur cet os ».',
      do: async (d) => {
        await d.at(8);
        await d.click(mid(bone(d, 'avant_bras_droit')));
        await d.at(10.5);
        await d.click(d.propButton('＋ Point sur cet os'));
      },
    },
    {
      say: 'Placez-le au bout de la main, avec X, et réglez sa Rotation pour indiquer la direction du tir. Le jeu lit la position et l\'angle du point à chaque image, et y fait apparaître le projectile ou l\'effet.',
      do: async (d) => {
        await d.at(1);
        await d.type(d.prop('X'), String(Math.round(bone(d, 'avant_bras_droit').length + 8)));
        await d.at(4);
        await d.type(d.prop('Rotation'), '-60');
        await d.wheel([67, 150], 3);
        await d.at(end(d) - 0.5);
        await d.key('F');
      },
    },
    outro('Bravo ! À retenir : une boîte de collision est un polygone que le jeu teste, pour les coups ou les clics. Une découpe masque les slots dessinés après elle, hors de son polygone. Et un point marque une position et une direction sur un os. Dans le prochain module, on prévisualise les mélanges d\'animations, puis on exporte.'),
  ],
};

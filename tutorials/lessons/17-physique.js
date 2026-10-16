import { intro, outro } from './common.js';
import { prepareAma } from '../runtime/rig.js';

const bone = (d, name) => d.editor.skeleton.findBone(name);
const mid = (b) => [(b.worldX + b.tipX) / 2, (b.worldY + b.tipY) / 2];
const end = (d) => d.job.durations[d.stepIndex];

// Secoue les hanches de gauche à droite (outil Déplacement), puis annule le geste.
async function shake(d, { undo = true } = {}) {
  const h = mid(bone(d, 'hanches'));
  await d.drag(h, h, { duration: 1.6, path: [[h[0] - 45, h[1]], [h[0] + 45, h[1]], [h[0] - 30, h[1]], [h[0], h[1]]] });
  await d.wait(1.6);
  if (undo) await d.key('Ctrl+Z');
}

export default {
  id: '17-physique',
  module: 6,
  title: 'La physique : ressorts et inertie',
  next: 'Les skins : plusieurs tenues',
  goals: [
    'Ajouter une contrainte physique à un os',
    'Régler l\'inertie, la raideur, l\'amortissement',
    'Le vent et la gravité, et la physique dans une animation',
  ],
  recap: [
    'Os sélectionné › « ＋ Contrainte physique » : l\'os réagit avec du retard',
    'Raideur : force du ressort · Amortissement : le mouvement se calme',
    'Inertie et Masse : le poids de l\'os · Vent et Gravité : des forces constantes',
    'En lecture, la physique bouge sans aucune clé',
  ],
  async setup(d) {
    await prepareAma(d);
    d.editor.setTool('select');
  },
  steps: [
    intro('Dans cette leçon, on donne de la vie à l\'écharpe d\'Ama avec la physique : elle va réagir toute seule aux mouvements.'),
    {
      say: 'Pour l\'instant, l\'écharpe suit le corps de façon rigide. Bougeons les hanches de gauche à droite : elle reste collée au torse, sans aucune souplesse.',
      do: async (d) => {
        await d.at(3);
        await d.key('T');
        await d.click(mid(bone(d, 'hanches')));
        await d.at(6);
        await shake(d);
      },
    },
    {
      say: 'Sélectionnez le premier os de l\'écharpe, et cliquez sur « Contrainte physique ». Faites de même pour le second os. Chaque os a maintenant sa propre simulation, comme un ressort.',
      do: async (d) => {
        await d.key('V');
        await d.at(2);
        await d.click(mid(bone(d, 'echarpe')));
        await d.at(4.5);
        await d.click(d.propButton('＋ Contrainte physique'));
        await d.at(7.5);
        await d.click(mid(bone(d, 'echarpe2')));
        await d.click(d.propButton('＋ Contrainte physique'));
      },
    },
    {
      say: 'Réglons-les. Sélectionnez la première contrainte. L\'Amortissement, à un, laisse le ressort osciller sans fin : baissez-le à zéro virgule huit, pour que le mouvement se calme. Même réglage pour la seconde.',
      do: async (d) => {
        await d.at(2.5);
        await d.click(d.row('echarpe_physics'));
        await d.at(4);
        const h = d.highlight(d.prop('Amortissement').closest('.prop-row'), '', { place: 'left' });
        await d.at(8);
        h.remove();
        await d.type(d.prop('Amortissement'), '0.8');
        await d.at(end(d) - 2.5);
        await d.click(d.row('echarpe2_physics'));
        await d.type(d.prop('Amortissement'), '0.8');
      },
    },
    {
      say: 'Secouons les hanches : l\'écharpe traîne derrière le mouvement, se balance, puis revient en place. La case En continu fait tourner la simulation même hors lecture, pour tester tout de suite.',
      do: async (d) => {
        await d.key('T');
        await d.click(mid(bone(d, 'hanches')));
        await d.at(1.5);
        await shake(d);
        await d.at(end(d) - 3.5);
        await d.click(d.row('echarpe_physics'));
        const h = d.highlight(d.prop('En continu').closest('.prop-row'), '', { place: 'left' });
        await d.at(end(d) - 0.2);
        h.remove();
      },
    },
    {
      say: 'Les autres réglages : la Raideur, c\'est la force du ressort. Basse, l\'écharpe est molle ; haute, elle revient vite. L\'Inertie et la Masse donnent du poids. Baissons la raideur à quarante, et secouons encore.',
      do: async (d) => {
        await d.at(1);
        const h = d.highlight(d.prop('Raideur').closest('.prop-row'), '', { place: 'left' });
        await d.at(7);
        h.remove();
        const i = d.highlight(d.prop('Inertie').closest('.prop-row'), '', { place: 'left' });
        const m = d.highlight(d.prop('Masse').closest('.prop-row'), '', { place: 'left' });
        await d.at(10);
        i.remove();
        m.remove();
        await d.type(d.prop('Raideur'), '40');
        await d.click(d.row('echarpe2_physics'));
        await d.type(d.prop('Raideur'), '40');
        await d.click(mid(bone(d, 'hanches')));
        await shake(d);
      },
    },
    {
      say: 'Le Vent et la Gravité sont des forces constantes. Mettons du vent sur les deux contraintes : l\'écharpe s\'envole sur le côté, et frémit. Les curseurs du haut, Position, Rotation, Échelle, choisissent ce que la physique a le droit de bouger.',
      do: async (d) => {
        await d.at(3);
        await d.click(d.row('echarpe_physics'));
        await d.type(d.prop('Vent'), '6');
        await d.click(d.row('echarpe2_physics'));
        await d.type(d.prop('Vent'), '6');
        await d.at(end(d) - 5);
        const rows = ['Position X', 'Position Y', 'Rotation', 'Échelle X', 'Cisaillement X'].map((l) => d.highlight(d.prop(l).closest('.prop-row'), '', { place: 'left', pad: 1 }));
        await d.at(end(d) - 0.3);
        rows.forEach((h) => h.remove());
      },
    },
    {
      say: 'En mode Animation, la physique joue pendant la lecture, sans aucune clé. Animons juste les hanches : un pas à gauche, un pas à droite. Et l\'écharpe vit toute seule.',
      do: async (d) => {
        await d.click(d.row('echarpe_physics'));
        await d.type(d.prop('Vent'), '0');
        await d.click(d.row('echarpe2_physics'));
        await d.type(d.prop('Vent'), '0');
        await d.key('Ctrl+2', 'mode-animate');
        await d.click(mid(bone(d, 'hanches')));
        await d.key('T');
        const move = (dx) => {
          const h = mid(bone(d, 'hanches'));
          return d.drag(h, [h[0] + dx, h[1]], { duration: 0.7 });
        };
        await move(-35);
        await d.click(d.tl(12));
        await move(70);
        await d.click(d.tl(24));
        await move(-70);
        d.editor.setTime(0);
        await d.key('P');
        await d.at(end(d) + 3);
        await d.key('P');
      },
    },
    {
      say: 'Dernier conseil : quand un personnage se téléporte, la physique pourrait faire un grand saut. Dans ce cas, sélectionnez la contrainte en mode Animation, et posez une clé de remise à zéro de la simulation, à l\'image voulue.',
      do: async (d) => {
        await d.at(6);
        await d.click(d.row('echarpe_physics'));
        await d.at(8);
        const h = d.highlight(d.propButton('Clé : remise à zéro'), '', { place: 'left' });
        await d.at(end(d) - 0.2);
        h.remove();
      },
    },
    outro('Bravo ! À retenir : une contrainte physique fait réagir un os avec du retard, comme un ressort. La raideur et l\'amortissement règlent sa souplesse, l\'inertie et la masse son poids, le vent et la gravité des forces constantes. En lecture, tout bouge sans aucune clé. Dans le prochain module, on découvre les skins.'),
  ],
};

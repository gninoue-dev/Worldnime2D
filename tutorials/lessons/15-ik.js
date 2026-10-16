import { intro, outro } from './common.js';
import { prepareAma } from '../runtime/rig.js';

const bone = (d, name) => d.editor.skeleton.findBone(name);
const mid = (b) => [(b.worldX + b.tipX) / 2, (b.worldY + b.tipY) / 2];
const end = (d) => d.job.durations[d.stepIndex];
const at = (b) => [b.worldX, b.worldY];

export default {
  id: '15-ik',
  module: 6,
  title: 'La cinématique inverse (IK)',
  next: 'Contraintes de transformation et de chemin',
  goals: [
    'Comprendre la cinématique inverse',
    'Créer une contrainte IK sur une jambe',
    'Pliage, mélange, étirement : les réglages',
  ],
  recap: [
    'IK : on place le bout de la chaîne, les os se plient tout seuls',
    'Os sélectionné › « ＋ Contrainte IK » : crée une cible au bout de l\'os',
    'Pliage positif : de quel côté plie l\'articulation',
    'Mélange : de 0 % (os libres) à 100 % (IK complète)',
    'Les cibles sont des os comme les autres : elles s\'animent',
  ],
  async setup(d) {
    await prepareAma(d);
    d.editor.setTool('select');
  },
  steps: [
    intro('Dans ce module, on découvre les contraintes, des règles qui pilotent les os. On commence par la plus utile : la cinématique inverse, ou IK.'),
    {
      say: 'Jusqu\'ici, pour plier une jambe, on tournait la cuisse, puis la jambe : c\'est la cinématique directe. Avec la cinématique inverse, on fait l\'inverse : on place le pied, et la cuisse et la jambe se plient toutes seules pour l\'atteindre.',
      do: async (d) => {
        const c = d.card({
          kicker: 'Le principe',
          title: 'Directe ou inverse ?',
          html: `<div style="display:flex; gap:90px; margin-top:34px; font-size:24px; text-align:center">
            <div><svg width="200" height="200" viewBox="0 0 200 200"><g stroke="#9fb3c8" stroke-width="10" stroke-linecap="round">
              <line x1="60" y1="20" x2="90" y2="100"/><line x1="90" y1="100" x2="60" y2="180"/></g>
              <path d="M100 60 a40 40 0 0 1 10 40" stroke="#ffca28" stroke-width="4" fill="none"/></svg>
              <br>Directe<br><small style="font-size:18px; color:#9fb3c8">on tourne chaque os</small></div>
            <div><svg width="200" height="200" viewBox="0 0 200 200"><g stroke="#9fb3c8" stroke-width="10" stroke-linecap="round">
              <line x1="60" y1="20" x2="130" y2="80"/><line x1="130" y1="80" x2="110" y2="160"/></g>
              <circle cx="110" cy="160" r="12" fill="none" stroke="#ffca28" stroke-width="4"/></svg>
              <br>Inverse (IK)<br><small style="font-size:18px; color:#9fb3c8">on place le bout, la chaîne suit</small></div></div>`,
        });
        await d.at(end(d) - 0.3);
        await c.remove();
      },
    },
    {
      say: 'Sélectionnez la jambe gauche, l\'os du bas. Dans les Propriétés, cliquez sur « Contrainte IK ». Deux choses sont créées : un os cible, en jaune, au bout de la jambe ; et la contrainte elle-même, en bas de l\'Arbre, dans la section Contraintes.',
      do: async (d) => {
        await d.at(1);
        await d.click(mid(bone(d, 'jambe_gauche')));
        await d.at(4.5);
        await d.click(d.propButton('＋ Contrainte IK'));
        await d.at(10);
        const n = d.note(at(bone(d, 'jambe_gauche_cible')), 'cible');
        await d.at(13);
        n.remove();
        const h = d.highlight(d.row('jambe_gauche_ik'), '', { place: 'left' });
        await d.at(end(d) - 0.2);
        h.remove();
      },
    },
    {
      say: 'Les Propriétés de la contrainte montrent les os de la chaîne : la cuisse et la jambe, jusqu\'à deux os. Et la cible qu\'ils doivent atteindre.',
      do: async (d) => {
        await d.at(1);
        const h = d.highlight(d.prop('Os (1 ou 2)').closest('.prop-row'), '', { place: 'left' });
        await d.at(5.5);
        h.remove();
        const c = d.highlight(d.prop('Cible').closest('.prop-row'), '', { place: 'left' });
        await d.at(end(d) - 0.2);
        c.remove();
      },
    },
    {
      say: 'Sélectionnez la cible, et déplacez-la avec l\'outil Déplacement : la jambe se plie au genou pour suivre le pied. On ne touche plus ni à la cuisse, ni à la jambe.',
      do: async (d) => {
        await d.at(1);
        await d.click(d.row('jambe_gauche_cible', '#tree', 'bone'));
        await d.key('T');
        await d.at(3.5);
        const t = at(bone(d, 'jambe_gauche_cible'));
        await d.drag([t[0] - 40, t[1] + 20], [t[0] - 75, t[1] + 75], { duration: 1.4, path: [[t[0] - 60, t[1] + 60], [t[0] - 75, t[1] + 35], [t[0] - 75, t[1] + 75]] });
        d.saved = true;
      },
    },
    {
      say: 'Si le genou plie du mauvais côté, sélectionnez la contrainte, dans l\'Arbre, et décochez Pliage positif : l\'articulation plie dans l\'autre sens. Recochez pour revenir.',
      do: async (d) => {
        await d.at(3);
        await d.click(d.row('jambe_gauche_ik'));
        await d.at(6);
        await d.click(d.prop('Pliage positif'));
        await d.at(end(d) - 2);
        await d.click(d.prop('Pliage positif'));
        await d.key('Ctrl+Z');
        await d.key('Ctrl+Z');
        await d.key('Ctrl+Z');
      },
    },
    {
      say: 'Faisons de même pour la jambe droite. Maintenant, sélectionnez les hanches et descendez-les : Ama s\'accroupit, et ses pieds restent plantés au sol, parce que les cibles ne bougent pas.',
      do: async (d) => {
        await d.key('V');
        await d.click(mid(bone(d, 'jambe_droite')));
        await d.click(d.propButton('＋ Contrainte IK'));
        await d.at(5.5);
        await d.key('T');
        await d.click(mid(bone(d, 'hanches')));
        await d.at(7.5);
        const h = mid(bone(d, 'hanches'));
        await d.drag(h, [h[0], h[1] - 38], { duration: 1.6 });
        await d.wait(0.6);
        await d.drag([h[0], h[1] - 38], [h[0] + 18, h[1] - 30], { duration: 1 });
      },
    },
    {
      say: 'Sélectionnez une contrainte : le curseur Mélange dose son effet. À zéro pour cent, la jambe reprend sa pose normale, comme si l\'IK n\'existait pas. À cent pour cent, elle atteint la cible. Les valeurs entre les deux permettent de passer en douceur de l\'un à l\'autre, dans une animation.',
      do: async (d) => {
        await d.at(1.5);
        await d.click(d.row('jambe_droite_ik'));
        await d.at(4.5);
        await d.slide(d.prop('Mélange'), 0, { duration: 1.4 });
        await d.at(10);
        await d.slide(d.prop('Mélange'), 1, { duration: 1.2 });
      },
    },
    {
      say: 'Que se passe-t-il si la cible est trop loin ? La jambe se tend au maximum, et le pied ne l\'atteint pas. Cochez Étirement : la jambe s\'allonge pour l\'atteindre. Compression fait l\'inverse quand la cible est trop près. Et Souplesse arrondit l\'arrivée en extension.',
      do: async (d) => {
        // On annule le mélange et l'accroupissement : Ama est de nouveau debout.
        for (let i = 0; i < 4; i++) await d.key('Ctrl+Z');
        await d.click(d.row('jambe_droite_cible', '#tree', 'bone'));
        await d.key('T');
        const t = at(bone(d, 'jambe_droite_cible'));
        await d.drag([t[0] + 30, t[1]], [t[0] + 90, t[1] - 40], { duration: 1.2 });
        await d.at(7);
        await d.click(d.row('jambe_droite_ik'));
        await d.click(d.prop('Étirement'));
        await d.at(end(d) - 1.5);
        await d.key('Ctrl+Z');
        await d.key('Ctrl+Z');
      },
    },
    {
      say: 'Les cibles sont des os comme les autres : en mode Animation, on pose des clés dessus. On anime ainsi un pied qui se pose, une main qui attrape un objet, ou un personnage qui s\'accroupit, avec très peu de clés.',
      do: async (d) => {
        await d.key('V');
        await d.key('Ctrl+2', 'mode-animate');
        await d.click(mid(bone(d, 'hanches')));
        await d.key('T');
        await d.at(5);
        // Le geste part toujours de l'os des hanches, là où il se trouve.
        const hip = (dy) => {
          const h = mid(bone(d, 'hanches'));
          return d.drag(h, [h[0], h[1] + dy], { duration: 0.9 });
        };
        await hip(-40);
        await d.click(d.tl(10));
        await hip(40);
        await d.click(d.tl(20));
        await hip(-40);
        d.editor.setTime(0);
        await d.key('P');
        await d.at(end(d) + 1.5);
        await d.key('P');
      },
    },
    outro('Bravo ! À retenir : avec l\'IK, on place le bout d\'une chaîne de un ou deux os, et ils se plient tout seuls. Le bouton Contrainte IK crée la cible et la contrainte. Pliage positif choisit le sens de l\'articulation, Mélange dose l\'effet, et Étirement allonge la chaîne. Dans la prochaine leçon, on découvre les contraintes de transformation et de chemin.'),
  ],
};

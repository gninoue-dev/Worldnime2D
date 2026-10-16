import { intro, outro } from './common.js';
import { prepareAma } from '../runtime/rig.js';

const bone = (d, name) => d.editor.skeleton.findBone(name);
const mid = (b) => [(b.worldX + b.tipX) / 2, (b.worldY + b.tipY) / 2];

// Glisser avec la touche Maj enfoncée (touche affichée à l'écran).
const shiftDrag = (d, from, to, opts = {}) => d.holding('Maj', () => d.drag(from, to, { ...opts, mods: { shift: true } }));

const TOOL_CARD = [
  ['R', 'Rotation', 'tourne l\'os autour de son articulation'],
  ['T', 'Déplacement', 'déplace l\'os et tous ses enfants'],
  ['S', 'Échelle', 'étire ou rétrécit l\'os'],
  ['H', 'Cisaillement', 'penche l\'os sans le tourner'],
];

export default {
  id: '06-transformer',
  module: 2,
  title: 'Transformer les os',
  next: 'Ordre d\'affichage et slots',
  goals: [
    'Les quatre outils : Rotation, Déplacement, Échelle, Cisaillement',
    'La touche Maj pour des gestes précis',
    'L\'héritage : ce qu\'un os reçoit de son parent',
  ],
  recap: [
    'R tourne · T déplace · S étire · H penche — V ne fait que sélectionner',
    'Maj : pas de 15° (R), un seul axe (T), échelle uniforme (S), cisaillement X (H)',
    'Une échelle négative fait un miroir',
    'Héritage : un os peut ignorer l\'échelle ou la rotation de son parent',
  ],
  async setup(d) {
    await prepareAma(d);
    d.editor.setTool('select');
  },
  steps: [
    intro('Dans cette leçon, on maîtrise les outils de transformation, qui font bouger les os, et la façon dont un os hérite des mouvements de son parent.'),
    {
      say: 'Les outils de transformation sont dans la barre d\'outils, avec une touche chacun. R pour la rotation, T pour le déplacement, S pour l\'échelle, et H pour le cisaillement. L\'outil Sélection, touche V, ne fait que sélectionner : pratique pour ne rien bouger par erreur.',
      do: async (d) => {
        const c = d.card({
          kicker: 'La boîte à outils',
          title: 'Quatre outils, quatre touches',
          html: `<div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:22px 40px; margin-top:34px; font-size:26px">
            ${TOOL_CARD.map(([k, name, what]) => `<div style="display:flex; gap:18px; align-items:center">
              <kbd style="font-size:30px; min-width:44px; text-align:center">${k}</kbd>
              <div><b>${name}</b><br><small style="font-size:19px; color:#9fb3c8">${what}</small></div></div>`).join('')}</div>`,
        });
        await d.at(9);
        await c.remove();
        const h = d.highlight('#tools', '', { place: 'right' });
        for (const t of ['rotate', 'translate', 'scale', 'shear']) await d.move(`.tool[data-tool="${t}"]`, 0.5);
        await d.at(d.job.durations[d.stepIndex] - 3.5);
        await d.move('.tool[data-tool="select"]', 0.5);
        await d.at(d.job.durations[d.stepIndex] - 0.3);
        h.remove();
      },
    },
    {
      say: 'Commençons par la rotation. Touche R, puis cliquez sur le bras et glissez : l\'os tourne autour de son articulation, l\'épaule. Son angle s\'affiche dans les Propriétés, champ Rotation.',
      do: async (d) => {
        await d.at(2);
        await d.key('R');
        await d.at(4);
        await d.drag(mid(bone(d, 'bras_gauche')), [-108, 258], { duration: 1.4 });
        await d.at(8.5);
        const h = d.highlight(d.prop('Rotation').closest('.prop-row'), '', { place: 'left' });
        await d.at(d.job.durations[d.stepIndex] - 0.3);
        h.remove();
      },
    },
    {
      say: 'Maintenez la touche Maj pendant le geste : l\'angle avance par pas de quinze degrés. Idéal pour une pose nette. Puis Ctrl+Z, deux fois, pour revenir à la pose de départ.',
      do: async (d) => {
        await d.at(1.5);
        await shiftDrag(d, mid(bone(d, 'avant_bras_gauche')), [-128, 196], { duration: 1.8 });
        await d.at(9);
        await d.key('Ctrl+Z');
        await d.key('Ctrl+Z');
      },
    },
    {
      say: 'Outil Déplacement, touche T. Glissez les hanches : tout le corps suit, car tous les os sont leurs descendants. Avec Maj, le déplacement reste sur un seul axe, ici à l\'horizontale.',
      do: async (d) => {
        await d.at(1.5);
        await d.key('T');
        await d.at(3);
        await d.drag(mid(bone(d, 'hanches')), [35, 180], { duration: 1.3 });
        await d.wait(0.6);
        await d.key('Ctrl+Z');
        await d.at(9);
        await shiftDrag(d, mid(bone(d, 'hanches')), [55, 166], { duration: 1.5 });
        await d.wait(0.6);
        await d.key('Ctrl+Z');
      },
    },
    {
      say: 'Outil Échelle, touche S. Sélectionnez le torse, puis glissez dans le sens de l\'os : il s\'allonge. C\'est l\'Échelle X. Remarquez que la tête et les bras s\'étirent aussi : les enfants héritent de l\'échelle de leur parent.',
      do: async (d) => {
        await d.at(1.5);
        await d.key('S');
        await d.at(3);
        await d.click(mid(bone(d, 'torse')));
        await d.at(5);
        await d.drag(mid(bone(d, 'torse')), [0, 268], { duration: 1.4 });
        await d.at(8.5);
        const h = d.highlight(d.prop('Échelle X').closest('.prop-row'), '', { place: 'left' });
        await d.at(11.5);
        h.remove();
        await d.at(d.job.durations[d.stepIndex] - 0.6);
        await d.key('Ctrl+Z');
      },
    },
    {
      say: 'Le geste peut commencer n\'importe où dans la vue : la sélection reste la même. Glissez sur le côté, en travers de l\'os : c\'est l\'Échelle Y, qui l\'élargit. Et avec Maj, les deux échelles changent ensemble, sans déformer.',
      do: async (d) => {
        await d.at(3.5);
        await d.drag([-140, 236], [-200, 236], { duration: 1.4 });
        await d.wait(0.5);
        const h = d.highlight(d.prop('Échelle Y').closest('.prop-row'), '', { place: 'left' });
        await d.wait(1.2);
        h.remove();
        await d.key('Ctrl+Z');
        await d.at(10.5);
        await shiftDrag(d, [-140, 236], [-175, 262], { duration: 1.5 });
        await d.wait(0.8);
        await d.key('Ctrl+Z');
      },
    },
    {
      say: 'Une échelle négative retourne l\'os comme dans un miroir. Sélectionnons les hanches et tapons moins un dans l\'Échelle Y : Ama est retournée, et son écharpe passe de l\'autre côté. Pratique pour faire regarder un personnage dans l\'autre sens.',
      do: async (d) => {
        await d.at(3.5);
        await d.click(mid(bone(d, 'hanches')));
        await d.at(6);
        await d.type(d.prop('Échelle Y'), '-1');
        await d.at(d.job.durations[d.stepIndex] - 0.6);
        await d.key('Ctrl+Z');
      },
    },
    {
      say: 'Dernier outil : le Cisaillement, touche H. Il penche l\'os sans le faire tourner : le torse s\'incline comme un rectangle qu\'on pousse sur le côté. Avec Maj, on règle l\'autre axe, le Cisaillement X. On s\'en sert surtout pour donner de la souplesse aux poses.',
      do: async (d) => {
        await d.at(2.5);
        await d.key('H');
        await d.click(mid(bone(d, 'torse')));
        await d.at(5);
        await d.drag([0, 256], [-34, 248], { duration: 1.4 });
        await d.wait(0.6);
        await d.key('Ctrl+Z');
        await d.at(11);
        await shiftDrag(d, [0, 256], [-30, 250], { duration: 1.4 });
        await d.wait(0.6);
        await d.key('Ctrl+Z');
        await d.key('V');
      },
    },
    {
      say: 'Parlons de l\'héritage. Par défaut, un os reçoit tout de son parent : position, rotation et échelle. Agrandissons le torse, avec une échelle de un virgule trois sur les deux axes : la tête grossit avec lui.',
      do: async (d) => {
        await d.at(3);
        await d.click(mid(bone(d, 'torse')));
        await d.at(9);
        await d.type(d.prop('Échelle X'), '1.3');
        await d.type(d.prop('Échelle Y'), '1.3');
      },
    },
    {
      say: 'Sélectionnez la tête. Dans les Propriétés, la liste Héritage dit ce que l\'os reçoit de son parent. Choisissez Sans échelle : la tête reprend sa taille normale, tout en restant posée sur le torse.',
      do: async (d) => {
        await d.at(1);
        await d.click(mid(bone(d, 'tete')));
        await d.at(3);
        const h = d.highlight(d.prop('Héritage').closest('.prop-row'), '', { place: 'left' });
        await d.at(7.5);
        h.remove();
        await d.choose(d.prop('Héritage'), 'noScale');
      },
    },
    {
      say: 'La tête suit encore la rotation du torse. Choisissez maintenant Sans rotation ni reflet. Surprise : la tête se couche ! Elle a perdu toute la rotation de ses parents, y compris celle qui la tenait debout. On lui donne donc la sienne : quatre-vingt-dix degrés.',
      do: async (d) => {
        await d.key('R');
        await d.drag(mid(bone(d, 'torse')), [-40, 226], { duration: 1.2 });
        await d.wait(0.4);
        await d.key('Ctrl+Z');
        await d.at(3.5);
        await d.click(mid(bone(d, 'tete')));
        await d.choose(d.prop('Héritage'), 'noRotationOrReflection');
        await d.at(d.job.durations[d.stepIndex] - 3.5);
        await d.type(d.prop('Rotation'), '90');
      },
    },
    {
      say: 'Penchez le torse : la tête reste bien droite. C\'est utile pour une tête qui garde l\'horizon, ou un objet qui doit rester vertical.',
      do: async (d) => {
        await d.at(1);
        await d.drag(mid(bone(d, 'torse')), [-40, 226], { duration: 1.4 });
      },
    },
    {
      say: 'Pour savoir où se trouve vraiment un os dans la scène, regardez la ligne Monde, sous les Propriétés : elle tient compte de tous ses parents. Et pour remettre un os à zéro, tapez zéro en rotation, et un en échelle.',
      do: async (d) => {
        await d.click(mid(bone(d, 'tete')));
        await d.at(3);
        const info = document.querySelector('#props .world-info');
        info.scrollIntoView({ block: 'nearest' });
        const h = d.highlight(info, '', { place: 'left' });
        await d.at(9);
        h.remove();
        await d.click(mid(bone(d, 'torse')));
        await d.type(d.prop('Rotation'), '0');
        await d.type(d.prop('Échelle X'), '1');
        await d.type(d.prop('Échelle Y'), '1');
        await d.key('V');
      },
    },
    outro('Bravo ! À retenir : R tourne, T déplace, S étire, et H penche. La touche Maj rend les gestes précis. Une échelle négative fait un miroir. Et la liste Héritage permet à un os d\'ignorer l\'échelle ou la rotation de son parent. Dans la prochaine leçon, on règle l\'ordre d\'affichage et les slots.'),
  ],
};

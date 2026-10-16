import { intro, outro } from './common.js';
import { prepareAma, setKeys } from '../runtime/rig.js';

const end = (d) => d.job.durations[d.stepIndex];

// Trois animations d'Ama : repos (respiration), salut, saut.
export async function prepareAnimations(d) {
  await prepareAma(d);
  const ed = d.editor;
  const sk = ed.skeleton;
  ed.setMode('animate');
  ed.apply(() => sk.renameAnimation(ed.animation, 'repos'));
  ed.animationName = 'repos';
  setKeys(d, 'hanches', 'translate', [[0, [0, 0]], [30, [0, -5]], [60, [0, 0]]]);
  setKeys(d, 'tete', 'rotate', [[0, 0], [30, 3], [60, 0]]);
  setKeys(d, 'bras_gauche', 'rotate', [[0, 0], [30, -4], [60, 0]]);
  setKeys(d, 'bras_droit', 'rotate', [[0, 0], [30, 4], [60, 0]]);
  for (const name of ['salut', 'saut']) ed.apply(() => sk.addAnimation(name));
  ed.setAnimation('salut');
  setKeys(d, 'bras_droit', 'rotate', [[0, 115.8], [40, 115.8]]);
  setKeys(d, 'avant_bras_droit', 'rotate', [[0, 68.8], [10, 18.8], [20, 68.8], [30, 18.8], [40, 68.8]]);
  ed.setAnimation('saut');
  setKeys(d, 'hanches', 'translate', [[0, [0, 0]], [12, [0, 80]], [24, [0, 0]]]);
  setKeys(d, 'bras_gauche', 'rotate', [[0, 0], [12, -55], [24, 0]]);
  setKeys(d, 'bras_droit', 'rotate', [[0, 0], [12, 55], [24, 0]]);
  ed.setAnimation('repos');
  ed.setTime(0);
  ed.refreshPose();
  ed.select(sk.root);
  ed.setTool('select');
  d.viewport.frameAll();
  d.viewport.zoomAt(d.viewport.width / 2, d.viewport.height / 2, 0.85);
}

// Ligne « Piste n » de l'aperçu (onglet Anim.).
const track = (d, n) => [...document.querySelectorAll('#animations .preview-track')][n];
const trackButton = (d, n, text) => [...track(d, n).querySelectorAll('button')].find((b) => b.textContent === text);

async function launch(d, n, anim, button = '▶') {
  await d.choose(track(d, n).querySelector('select'), anim);
  await d.click(trackButton(d, n, button));
}

export default {
  id: '20-melanges',
  module: 8,
  title: 'Aperçu des mélanges',
  next: 'Exporter : jeux, images, GIF et vidéo',
  goals: [
    'Passer d\'une animation à une autre en douceur, avec un fondu',
    'Enchaîner des animations',
    'Superposer deux animations sur des pistes',
  ],
  recap: [
    'Onglet Anim. › Aperçu des mélanges : joue les animations comme le jeu',
    'Fondu : durée de la transition entre deux animations',
    '⤵ enchaîne après l\'animation en cours · ∅ vide une piste en douceur',
    'Une piste du dessus ne remplace que les os qu\'elle anime',
  ],
  async setup(d) {
    await prepareAnimations(d);
    d.ctx.setTab('animations');
  },
  steps: [
    intro('Dans ce module, on prépare le passage au jeu. On commence par l\'aperçu des mélanges, pour voir comment les animations s\'enchaînent.'),
    {
      say: 'Ama a trois animations : repos, salut, et saut. Dans un jeu, on passe sans cesse de l\'une à l\'autre. Si le changement est brutal, le personnage saute d\'une pose à l\'autre. Le fondu, ou mélange, adoucit le passage.',
      do: async (d) => {
        await d.at(1);
        const rows = ['repos', 'salut', 'saut'].map((n) => d.highlight(d.row(n, '#animations'), '', { place: 'left' }));
        await d.at(6);
        rows.forEach((h) => h.remove());
      },
    },
    {
      say: 'En mode Animation, l\'onglet Anim. contient la section Aperçu des mélanges. Sur la Piste zéro, choisissez repos, et cliquez sur la flèche de lecture : l\'aperçu démarre, comme dans le jeu.',
      do: async (d) => {
        await d.at(2);
        const h = d.highlight(d.$('#animations .preview-box'), '', { place: 'left' });
        await d.at(6);
        h.remove();
        await launch(d, 0, 'repos');
      },
    },
    {
      say: 'Mettez le Fondu à zéro, et lancez saut sur la même piste : la pose change d\'un coup. Remettez un fondu de zéro virgule trois seconde, et relancez : cette fois, Ama passe en douceur du repos au saut.',
      do: async (d) => {
        await d.at(1);
        const mix = d.$('#animations .preview-box input[type="number"]');
        await d.type(mix, '0');
        await launch(d, 0, 'saut');
        await d.wait(1.5);
        await launch(d, 0, 'repos');
        await d.at(8);
        await d.type(d.$('#animations .preview-box input[type="number"]'), '0.3');
        await launch(d, 0, 'saut');
        await d.wait(1.6);
        await launch(d, 0, 'repos');
      },
    },
    {
      say: 'Le bouton avec la flèche courbe enchaîne une animation après celle en cours, quand elle se termine. Décochez la boucle du saut, puis enchaînez : un saut, et Ama revient au repos.',
      do: async (d) => {
        await d.at(4);
        await d.choose(track(d, 0).querySelector('select'), 'saut');
        await d.click(track(d, 0).querySelector('input[type="checkbox"]'));
        await d.click(trackButton(d, 0, '▶'));
        await d.at(8.5);
        await d.click(track(d, 0).querySelector('input[type="checkbox"]'));
        await launch(d, 0, 'repos', '⤵');
      },
    },
    {
      say: 'Les pistes se superposent. Sur la Piste un, lancez salut : Ama salue, tout en continuant de respirer. La piste du dessus ne remplace que les os qu\'elle anime : ici, le bras droit.',
      do: async (d) => {
        await d.at(3);
        await launch(d, 1, 'salut');
        await d.at(end(d) - 2.5);
        const h = d.highlight(track(d, 1), '', { place: 'left' });
        await d.at(end(d) - 0.3);
        h.remove();
      },
    },
    {
      say: 'Pour arrêter le salut en douceur, cliquez sur le rond barré de la Piste un : elle se vide avec un fondu, et le bras redescend tranquillement.',
      do: async (d) => {
        await d.at(2.5);
        await d.click(trackButton(d, 1, '∅'));
        await d.at(end(d) + 1);
      },
    },
    {
      say: 'C\'est exactement ce que fera votre jeu : une piste pour les jambes et le corps, une autre pour les gestes, avec des fondus entre chaque animation. Pour revenir à la timeline, cliquez sur Arrêter l\'aperçu.',
      do: async (d) => {
        await d.at(end(d) - 3);
        await d.click([...document.querySelectorAll('#animations .preview-box .prop-button')].at(-1));
      },
    },
    outro('Bravo ! À retenir : l\'aperçu des mélanges joue les animations comme le jeu. Le fondu adoucit le passage d\'une animation à l\'autre, le bouton enchaîner les met à la suite, et les pistes se superposent : celle du dessus ne remplace que les os qu\'elle anime. Dans la prochaine leçon, on exporte le personnage.'),
  ],
};

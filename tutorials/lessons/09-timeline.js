import { intro, outro } from './common.js';
import { prepareAma, setKeys } from '../runtime/rig.js';

const end = (d) => d.job.durations[d.stepIndex];

// Animation « salut » de la leçon précédente, avec deux coucous (sans la dernière clé : on la collera).
export async function prepareSalut(d) {
  await prepareAma(d);
  const ed = d.editor;
  ed.setMode('animate');
  ed.apply(() => ed.skeleton.renameAnimation(ed.animation, 'salut'));
  ed.animationName = 'salut';
  setKeys(d, 'bras_droit', 'rotate', [[0, 115.8]]);
  setKeys(d, 'avant_bras_droit', 'rotate', [[0, 68.8], [10, 18.8], [20, 68.8], [30, 18.8]]);
  setKeys(d, 'tete', 'rotate', [[0, 0], [10, -12], [20, 0], [30, -12]]);
  ed.setTime(0);
  ed.refreshPose();
  ed.select(ed.skeleton.root);
  d.viewport.frameAll();
}

// Ctrl + molette sur la timeline (zoom dans le temps).
async function ctrlWheel(d, target, notches, deltaY) {
  await d.move(target, 0.5);
  d.showKeys('Ctrl + molette');
  const c = d.ctx.timeline.canvas;
  for (let i = 0; i < notches; i++) {
    c.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: d.pos.x, clientY: d.pos.y, deltaY, ctrlKey: true }));
    await d.wait(0.12);
  }
}

export default {
  id: '09-timeline',
  module: 4,
  title: 'La timeline en détail',
  next: 'Les courbes d\'animation',
  goals: [
    'Sélectionner, déplacer et supprimer des clés',
    'Copier-coller des clés et étirer une animation dans le temps',
    'Boucle, vitesse, plage de lecture et pelure d\'oignon',
  ],
  recap: [
    'Clic : une clé · Maj+clic : en ajouter · glisser dans le vide : rectangle',
    'Glisser des clés les déplace ; Alt + glisser les étire dans le temps',
    'Ctrl+C / Ctrl+V : copier des clés, puis les coller à l\'image courante',
    'Maj + glisser dans la règle : plage de lecture',
    'Pelure d\'oignon : les images voisines en transparence',
  ],
  async setup(d) {
    await prepareSalut(d);
    d.editor.setTool('select');
  },
  steps: [
    intro('Dans cette leçon, on apprend à manipuler les clés dans la timeline, et à régler la lecture.'),
    {
      say: 'Voici l\'animation de la leçon précédente, avec un coucou de plus. Regardons-la une fois.',
      do: async (d) => {
        await d.key('P');
        await d.at(end(d) + 1.2);
        await d.key('P');
        d.editor.setTime(0);
      },
    },
    {
      say: 'Chaque ligne de la timeline correspond à un os animé. La ligne Résumé, tout en haut, regroupe toutes les clés. Cliquez sur le petit triangle d\'un os pour le déplier : on voit une ligne par type de clé. Rotation en vert, position en bleu, échelle en rouge.',
      do: async (d) => {
        await d.at(1);
        let h = d.highlight(d.tlRow('avant_bras_droit'), '', { place: 'above' });
        await d.at(4.5);
        h.remove();
        h = d.highlight(d.tlRow('Résumé'), '', { place: 'above' });
        await d.at(8);
        h.remove();
        const r = d.ctx.timeline.canvas.getBoundingClientRect();
        await d.click({ x: r.left + 10, y: d.tl(0, 'avant_bras_droit').y });
        await d.at(13);
        h = d.highlight(d.tlRow('Rotation'), '', { place: 'above' });
        await d.at(end(d) - 0.3);
        h.remove();
        await d.click({ x: r.left + 10, y: d.tl(0, 'avant_bras_droit').y });
      },
    },
    {
      say: 'Cliquez sur une clé pour la sélectionner : elle devient bleue. Maj plus clic en ajoute d\'autres. Et en glissant dans une zone vide, on sélectionne toutes les clés d\'un rectangle.',
      do: async (d) => {
        await d.at(1.5);
        await d.click(d.tl(10, 'tete'));
        await d.at(5);
        await d.holding('Maj', () => d.click(d.tl(30, 'tete'), { mods: { shift: true } }));
        await d.at(8.5);
        const a = d.tl(8, 'avant_bras_droit');
        const b = d.tl(22, 'tete');
        await d.drag({ x: a.x, y: a.y - 8 }, { x: b.x, y: b.y + 8 }, { duration: 1.2 });
      },
    },
    {
      say: 'Glisser une clé la déplace dans le temps. Un bon truc d\'animateur : décaler légèrement la tête. Sélectionnons ses clés, et poussons-les de trois images vers la droite. La tête suit maintenant le geste avec un petit retard : c\'est plus naturel.',
      do: async (d) => {
        await d.at(5);
        const a = d.tl(9, 'tete');
        const b = d.tl(31, 'tete');
        await d.drag({ x: a.x, y: a.y - 8 }, { x: b.x, y: b.y + 8 }, { duration: 1 });
        await d.at(8.5);
        await d.drag(d.tl(10, 'tete'), d.tl(13, 'tete'), { duration: 1.2 });
        await d.at(end(d) - 3.5);
        await d.key('P');
        await d.at(end(d) + 2.5);
        await d.key('P');
      },
    },
    {
      say: 'Pour une boucle parfaite, la dernière pose doit être identique à la première. Cliquez sur la clé de l\'image zéro, dans la ligne Résumé : toutes les clés de cette image sont sélectionnées. Ctrl+C pour les copier. Allez à l\'image quarante, puis Ctrl+V pour les coller.',
      do: async (d) => {
        d.editor.setTime(0);
        await d.at(5.5);
        await d.click(d.tl(0, 'Résumé'));
        await d.at(10.5);
        await d.key('Ctrl+C');
        await d.at(12.5);
        await d.click(d.tl(40));
        await d.at(15);
        await d.key('Ctrl+V');
      },
    },
    {
      say: 'Pour supprimer des clés, sélectionnez-les et appuyez sur Suppr. Supprimons cette clé de tête… puis annulons, avec Ctrl+Z.',
      do: async (d) => {
        await d.at(3.5);
        await d.click(d.tl(23, 'tete'));
        await d.at(5.5);
        await d.key('Suppr');
        await d.at(end(d) - 1.6);
        await d.key('Ctrl+Z');
      },
    },
    {
      say: 'L\'animation est un peu rapide. Encadrez toutes les clés de la ligne Résumé, puis, en maintenant Alt, glissez la dernière vers la droite : les clés s\'écartent, et toute l\'animation ralentit. Vers la gauche, elle accélérerait.',
      do: async (d) => {
        await d.at(2.5);
        // Rectangle sur la seule ligne Résumé, tiré depuis le vide (à droite) : toutes les clés.
        const a = d.tl(46, 'Résumé');
        const b = d.tl(-0.7, 'Résumé');
        await d.drag({ x: a.x, y: a.y - 6 }, { x: b.x, y: b.y + 6 }, { duration: 1 });
        await d.at(5.5);
        await d.holding('Alt', () => d.drag(d.tl(40, 'Résumé'), d.tl(52, 'Résumé'), { mods: { alt: true }, duration: 1.6 }));
      },
    },
    {
      say: 'Dans la barre de la timeline, la case Boucle décide si la lecture recommence au début. La liste Vitesse ralentit ou accélère la lecture, sans toucher aux clés : pratique pour vérifier un détail. Et IPS règle le nombre d\'images par seconde.',
      do: async (d) => {
        await d.at(0.5);
        let h = d.highlight(d.ctx.timeline.loopBox.closest('label'), '', { place: 'above' });
        await d.at(5);
        h.remove();
        await d.choose(d.ctx.timeline.speedSelect, '0.5');
        await d.key('P');
        await d.at(end(d) - 4.5);
        h = d.highlight(d.ctx.timeline.fpsSelect.closest('label'), '', { place: 'above' });
        await d.at(end(d) - 0.5);
        h.remove();
      },
    },
    {
      say: 'Pour travailler sur un passage précis, créez une plage de lecture : maintenez Maj, et glissez dans la règle. La lecture tourne alors seulement dans la zone verte. Le bouton avec la croix retire la plage.',
      do: async (d) => {
        await d.choose(d.ctx.timeline.speedSelect, '1');
        await d.at(3);
        await d.holding('Maj', () => d.drag(d.tl(13), d.tl(39), { mods: { shift: true }, duration: 1.4 }));
        await d.at(end(d) - 2.5);
        await d.click('.tl-range');
      },
    },
    {
      say: 'La pelure d\'oignon affiche les images voisines en transparence, avant et après la tête de lecture. Parfait pour juger l\'espacement d\'un mouvement.',
      do: async (d) => {
        await d.key('P');
        d.editor.setTime(5 / d.editor.fps);
        await d.at(1);
        await d.click(d.ctx.timeline.onionBtn);
        await d.at(5);
        for (let i = 0; i < 6; i++) await d.key('→');
        await d.at(end(d) - 0.6);
        await d.click(d.ctx.timeline.onionBtn);
      },
    },
    {
      say: 'Enfin, la molette fait défiler les lignes, et Ctrl plus molette zoome dans le temps, pour placer les clés à l\'image près.',
      do: async (d) => {
        await d.at(3);
        await ctrlWheel(d, d.tl(20, 'tete'), 5, -120);
        await d.wait(1);
        await ctrlWheel(d, d.tl(20, 'tete'), 5, 120);
      },
    },
    outro('Bravo ! À retenir : cliquez, Maj-cliquez ou encadrez pour sélectionner des clés, et glissez-les pour changer le rythme. Alt plus glisser étire l\'animation. Ctrl+C et Ctrl+V copient des clés à l\'image courante. Et la plage de lecture et la pelure d\'oignon aident à peaufiner. Dans la prochaine leçon, on donne du caractère au mouvement avec les courbes.'),
  ],
};

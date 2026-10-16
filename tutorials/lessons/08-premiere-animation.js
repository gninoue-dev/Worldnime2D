import { intro, outro } from './common.js';
import { prepareAma, saveAs, rotateTo } from '../runtime/rig.js';

const bone = (d, name) => d.editor.skeleton.findBone(name);
const mid = (b) => [(b.worldX + b.tipX) / 2, (b.worldY + b.tipY) / 2];
const end = (d) => d.job.durations[d.stepIndex];

// Va à une image en cliquant dans la règle de la timeline.
async function goTo(d, frame) {
  await d.click(d.tl(frame));
}

export default {
  id: '08-premiere-animation',
  module: 4,
  title: 'Votre première animation',
  next: 'La timeline en détail',
  goals: [
    'Passer en mode Animation',
    'Poser des clés : automatiquement, ou avec la touche K',
    'Lire l\'animation en boucle',
  ],
  recap: [
    'Ctrl+2 : mode Animation · Ctrl+1 : retour à la pose de base',
    'Clé auto : chaque geste pose une clé à l\'image courante',
    'K : clé de rotation, position et échelle sur l\'os sélectionné',
    'Entre deux clés, Worldnime2D calcule les images intermédiaires',
    'P : lecture et pause · ← → : image par image · Maj+← → : de clé en clé',
  ],
  async setup(d) {
    await prepareAma(d);
    await saveAs(d);
    d.editor.select(d.editor.skeleton.root);
    d.editor.setTool('select');
  },
  steps: [
    intro('Dans cette leçon, on crée notre première animation : Ama va nous faire coucou de la main.'),
    {
      say: 'Jusqu\'ici, on travaillait en mode Configuration : on construisait la pose de base. Pour animer, cliquez sur Animation, en haut, ou appuyez sur Ctrl+2. Une première animation est créée, et la timeline apparaît en bas de l\'écran.',
      do: async (d) => {
        await d.at(1);
        const h = d.highlight('.mode', '', { place: 'below' });
        await d.at(7);
        h.remove();
        await d.click('.mode-btn[data-mode="animate"]');
        await d.at(end(d) - 3);
        const t = d.highlight('#timeline', 'la timeline', { place: 'above' });
        await d.at(end(d) - 0.3);
        t.remove();
      },
    },
    {
      say: 'Donnons-lui un nom. Dans l\'onglet Anim., double-cliquez sur l\'animation, et tapez « salut ». Un projet peut contenir autant d\'animations que vous voulez : marcher, sauter, attaquer…',
      do: async (d) => {
        await d.at(2);
        await d.click('.tab[data-tab="animations"]');
        await d.at(4);
        await d.dblclick(d.row('animation', '#animations'));
        await d.wait(0.3);
        const input = d.$('#animations .tree-rename');
        await d.type(input, 'salut', { enter: false });
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await d.wait(0.4);
      },
    },
    {
      say: 'La timeline compte le temps en images : trente images font une seconde. Le trait rouge, la tête de lecture, montre l\'image affichée. Et le bouton Clé auto est allumé : chaque geste dans la vue posera une clé, à l\'image courante.',
      do: async (d) => {
        await d.at(0.5);
        const r = d.ctx.timeline.canvas.getBoundingClientRect();
        const ruler = d.highlight({ left: r.left + 190, top: r.top, width: r.width - 190, height: 22 }, '', { place: 'above' });
        await d.at(4);
        ruler.remove();
        await d.move(d.tl(0), 0.6);
        const head = d.note(d.tl(0), 'tête de lecture');
        await d.at(9);
        head.remove();
        const btn = d.$('.tl-bar .tl-toggle', '● Clé auto');
        const h = d.highlight(btn, '', { place: 'above' });
        await d.move(btn, 0.6);
        await d.at(end(d) - 0.3);
        h.remove();
      },
    },
    {
      say: 'Image zéro : la pose de départ. Outil Rotation, touche R. Levons le bras droit d\'Ama… puis son avant-bras, la main vers le ciel. Deux clés apparaissent dans la timeline, une pour chaque os.',
      do: async (d) => {
        await d.at(2.5);
        await d.key('R');
        await d.at(4.5);
        await rotateTo(d, 'bras_droit', 35, { duration: 1.4 });
        await d.wait(0.3);
        await rotateTo(d, 'avant_bras_droit', 100, { duration: 1.2 });
        await d.at(end(d) - 3.4);
        const a = d.note(d.tl(0, 'bras_droit'), 'clé');
        const b = d.note(d.tl(0, 'avant_bras_droit'), 'clé');
        await d.at(end(d) - 0.2);
        a.remove();
        b.remove();
        d.wave0 = bone(d, 'avant_bras_droit').pose.rotation;
      },
    },
    {
      say: 'Allez à l\'image dix, en cliquant dans la règle de la timeline. Penchez l\'avant-bras vers l\'extérieur : une nouvelle clé. Entre les deux, Worldnime2D calcule tout seul les images intermédiaires.',
      do: async (d) => {
        await d.at(2.5);
        await goTo(d, 10);
        await d.at(5.5);
        await rotateTo(d, 'avant_bras_droit', 50, { duration: 1.2 });
        await d.at(end(d) - 3);
        // On balaie la timeline : le bras passe d'une pose à l'autre.
        await d.drag(d.tl(0), d.tl(10), { duration: 1.6 });
      },
    },
    {
      say: 'Image vingt : la main revient au départ. Pour retrouver exactement la même pose, tapez dans les Propriétés la même rotation qu\'à l\'image zéro. Le petit losange plein, à côté du champ, signale une clé à cette image.',
      do: async (d) => {
        await goTo(d, 20);
        await d.at(3);
        const rot = d.prop('Rotation');
        await d.type(rot, String(Math.round(d.wave0 * 100) / 100));
        await d.at(end(d) - 3.2);
        const k = d.highlight(rot.closest('.prop-row').querySelector('.key-btn'), '', { place: 'left' });
        await d.at(end(d) - 0.3);
        k.remove();
      },
    },
    {
      say: 'Appuyez sur P pour lancer la lecture. L\'animation tourne en boucle, de l\'image zéro jusqu\'à la dernière clé. Ama nous salue ! Encore P pour mettre en pause.',
      do: async (d) => {
        await d.at(1.5);
        await d.key('P');
        await d.at(end(d) - 1.5);
        await d.key('P');
      },
    },
    {
      say: 'Ajoutons un mouvement de tête. Sélectionnez la tête, et appuyez sur K, à l\'image zéro : K pose une clé avec la pose actuelle, sans rien bouger. Faites de même à l\'image vingt. Puis, à l\'image dix, penchez la tête vers la main.',
      do: async (d) => {
        await d.click('.tl-bar button[title^="Début"]');
        await d.at(1.5);
        await d.click(mid(bone(d, 'tete')));
        await d.at(5);
        await d.key('K');
        await d.at(10);
        await goTo(d, 20);
        await d.key('K');
        await d.at(13.5);
        await goTo(d, 10);
        await rotateTo(d, 'tete', 80, { duration: 1 });
      },
    },
    {
      say: 'Pour vérifier image par image, utilisez les flèches gauche et droite. Avec Maj, la tête de lecture saute directement d\'une clé à la suivante.',
      do: async (d) => {
        d.editor.setTime(0);
        await d.at(2.5);
        for (let i = 0; i < 4; i++) await d.key('→');
        await d.at(end(d) - 4);
        await d.key('Maj+→');
        await d.key('Maj+→');
        await d.key('Maj+←');
      },
    },
    {
      say: 'Relançons la lecture : la tête accompagne le geste, c\'est plus vivant.',
      do: async (d) => {
        await d.key('P');
        await d.at(end(d) + 2.5);
      },
      pause: 0.2,
    },
    {
      say: 'Et la pose de base ? Repassez en mode Configuration, avec Ctrl+1 : Ama est revenue dans sa pose d\'origine. L\'animation ne la modifie jamais ; elle enregistre seulement des écarts par rapport à elle. N\'oubliez pas d\'enregistrer, avec Ctrl+S.',
      do: async (d) => {
        await d.key('P');
        await d.at(3);
        await d.key('Ctrl+1', 'mode-setup');
        await d.at(end(d) - 2.5);
        await d.key('Ctrl+S', 'save');
      },
    },
    outro('Bravo, votre première animation est faite ! À retenir : Ctrl+2 passe en mode Animation. Avec la clé auto, chaque geste pose une clé à l\'image courante, et la touche K en pose une sans rien bouger. Entre deux clés, les images sont calculées pour vous. Et P lance la lecture. Dans la prochaine leçon, on explore la timeline en détail.'),
  ],
};

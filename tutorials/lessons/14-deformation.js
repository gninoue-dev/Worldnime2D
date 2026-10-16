import { intro, outro } from './common.js';
import { prepareFlag, meshVerts, setKeys } from '../runtime/rig.js';

const end = (d) => d.job.durations[d.stepIndex];
const goTo = (d, frame) => d.click(d.tl(frame));

// Sommet du maillage le plus proche d'un point du monde.
function nearest(d, [x, y]) {
  return meshVerts(d, 'drapeau').reduce((a, b) => (Math.hypot(b[0] - x, b[1] - y) < Math.hypot(a[0] - x, a[1] - y) ? b : a));
}

export default {
  id: '14-deformation',
  module: 5,
  title: 'Déformation libre et maillages liés',
  next: 'La cinématique inverse (IK)',
  goals: [
    'Animer les sommets d\'un maillage : la déformation libre (FFD)',
    'Combiner déformation et os',
    'Les maillages liés : même forme, autre image',
  ],
  recap: [
    'Mode Animation › ✥ Déformer le maillage : glisser des sommets pose une clé',
    'Le rayon doux déforme toute une zone d\'un seul geste',
    '« Remettre la forme d\'origine » pose une clé sans déformation',
    'La déformation s\'ajoute au mouvement des os',
    'Maillage lié : partage les sommets, les poids et les déformations',
  ],
  async setup(d) {
    await prepareFlag(d, { mesh: true, bind: true });
    const ed = d.editor;
    ed.setMode('animate');
    ed.apply(() => ed.skeleton.renameAnimation(ed.animation, 'vent'));
    ed.animationName = 'vent';
    // Un léger balancement des os, déjà animé.
    setKeys(d, 'drapeau1', 'rotate', [[0, 0], [30, -6], [60, 0]]);
    setKeys(d, 'drapeau2', 'rotate', [[0, 0], [30, 8], [60, 0]]);
    ed.setTime(0);
    ed.refreshPose();
    ed.select(ed.skeleton.root);
    ed.setTool('select');
  },
  steps: [
    intro('Dans cette leçon, on anime directement les sommets du drapeau, et on découvre les maillages liés.'),
    {
      say: 'Nous sommes en mode Animation, dans l\'animation « vent ». Les os du drapeau se balancent déjà un peu. Pour ajouter des vagues dans le tissu, on va déplacer les sommets eux-mêmes : c\'est la déformation libre.',
      do: async (d) => {
        await d.at(3);
        await d.key('P');
        await d.at(end(d) - 0.5);
        await d.key('P');
        d.editor.setTime(0);
      },
    },
    {
      say: 'Dans l\'Arbre, cliquez sur le slot du drapeau. Dans les Propriétés, section Déformation du maillage, cliquez sur Déformer le maillage. Les sommets apparaissent. Réglez le rayon doux à cent, pour déformer toute une zone d\'un coup.',
      do: async (d) => {
        await d.at(1);
        await d.click(d.row('drapeau', '#tree', 'slot'));
        await d.at(4.5);
        await d.click(d.propButton('✥ Déformer le maillage'));
        await d.at(9);
        await d.type(d.prop('Rayon doux'), '100');
      },
    },
    {
      say: 'Image zéro : cliquez sur « Remettre la forme d\'origine ». Cela pose une première clé, sans déformation. Puis, à l\'image quinze, glissez le milieu du drapeau vers le haut : une vague. Une clé de déformation apparaît, en turquoise.',
      do: async (d) => {
        await d.at(2.5);
        await d.click(d.propButton('Remettre la forme d\'origine'));
        await d.at(7);
        await goTo(d, 15);
        await d.at(9.5);
        const v = nearest(d, [-70, 360]);
        await d.drag(v, [v[0], v[1] + 34], { duration: 1.2 });
      },
    },
    {
      say: 'À l\'image trente, la vague passe de l\'autre côté : glissez vers le bas. Et à l\'image quarante-cinq, soulevez le bout du drapeau.',
      do: async (d) => {
        await d.at(1);
        await goTo(d, 30);
        let v = nearest(d, [-70, 372]);
        await d.drag(v, [v[0], v[1] - 34], { duration: 1.1 });
        await d.at(5.5);
        await goTo(d, 45);
        v = nearest(d, [-140, 372]);
        await d.drag(v, [v[0] + 6, v[1] + 30], { duration: 1.1 });
      },
    },
    {
      say: 'Pour une boucle parfaite, à l\'image soixante, cliquez à nouveau sur « Remettre la forme d\'origine ». Et lançons la lecture : la déformation s\'ajoute au balancement des os. Le drapeau flotte au vent !',
      do: async (d) => {
        await d.at(3);
        await goTo(d, 60);
        await d.click(d.propButton('Remettre la forme d\'origine'));
        await d.key('Échap');
        await d.at(9);
        d.editor.setTime(0);
        await d.key('P');
        await d.at(end(d) + 3);
        await d.key('P');
      },
      pause: 0.2,
    },
    {
      say: 'Une astuce : pour adoucir les vagues, sélectionnez les clés de déformation et donnez-leur la courbe « Accélération puis ralentissement », comme on l\'a vu pour les os.',
      do: async (d) => {
        await d.at(2.5);
        const a = d.tl(62, 'drapeau');
        const b = d.tl(-0.7, 'drapeau');
        await d.drag({ x: a.x, y: a.y - 6 }, { x: b.x, y: b.y + 6 }, { duration: 1 });
        await d.at(6.5);
        await d.choose(d.ctx.timeline.curveSelect, 'easeInOut');
      },
    },
    {
      say: 'Passons aux maillages liés. Revenez en mode Configuration, sélectionnez le drapeau, et cliquez sur Créer un maillage lié. Une nouvelle pièce jointe apparaît dans le même slot : elle partage les sommets et les poids du drapeau.',
      do: async (d) => {
        await d.key('Ctrl+1', 'mode-setup');
        await d.at(4);
        await d.click([-120, 420]);
        await d.at(7);
        await d.click(d.propButton('Créer un maillage lié'));
        await d.at(end(d) - 2.5);
        const h = d.highlight(d.row('drapeau_lie', '#tree', 'att'), '', { place: 'left' });
        await d.at(end(d) - 0.2);
        h.remove();
      },
    },
    {
      say: 'Donnez-lui une autre image : le drapeau de nuit, aux mêmes dimensions. La case « Suit les déformations » lui fait aussi reprendre les clés de déformation du drapeau d\'origine. Rendez-le visible avec son rond, dans l\'Arbre.',
      do: async (d) => {
        await d.at(1.5);
        await d.choose(d.prop('Image'), 'drapeau_nuit');
        await d.at(5.5);
        const h = d.highlight(d.prop('Suit les déform.').closest('.prop-row'), '', { place: 'left' });
        await d.at(10);
        h.remove();
        await d.click(d.row('drapeau_lie', '#tree', 'att').querySelector('.eye'));
      },
    },
    {
      say: 'En mode Animation, le drapeau de nuit ondule exactement comme l\'autre, sans aucune clé de plus. Pratique pour une variante de couleur, une version abîmée, ou les tenues d\'un personnage, qu\'on verra avec les skins.',
      do: async (d) => {
        await d.key('Ctrl+2', 'mode-animate');
        d.editor.setTime(0);
        await d.key('P');
        await d.at(end(d) + 1);
        await d.key('P');
      },
    },
    outro('Bravo ! À retenir : en mode Animation, la déformation libre déplace les sommets d\'un maillage, et pose des clés de déformation. Elle s\'ajoute au mouvement des os. Et un maillage lié partage la forme, les poids et les déformations d\'un autre, avec sa propre image. Dans le prochain module, on découvre les contraintes, en commençant par la cinématique inverse.'),
  ],
};

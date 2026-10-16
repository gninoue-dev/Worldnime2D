import { intro, outro } from './common.js';
import { prepareAma, setKeys } from '../runtime/rig.js';

// Petite animation de salut pour montrer le principe (préparée hors caméra).
export function addWave(d, name = 'salut') {
  const ed = d.editor;
  ed.apply(() => ed.skeleton.addAnimation(name));
  ed.animationName = name;
  setKeys(d, 'bras_droit', 'rotate', [[0, 0], [10, 140], [50, 140], [60, 0]]);
  setKeys(d, 'avant_bras_droit', 'rotate', [[0, 0], [10, 30], [18, -10], [26, 30], [34, -10], [42, 30], [50, 0]]);
  setKeys(d, 'tete', 'rotate', [[0, 0], [15, -6], [45, -6], [60, 0]]);
  setKeys(d, 'torse', 'rotate', [[0, 0], [15, 3], [45, 3], [60, 0]]);
}

export default {
  id: '01-interface',
  module: 1,
  title: 'Découvrir Worldnime2D',
  goals: [
    'Comprendre l\'animation par squelette',
    'Faire le tour de l\'interface',
    'Se déplacer et zoomer dans la vue',
  ],
  recap: [
    'Un personnage = des images accrochées à des os',
    'Configuration pour construire, Animation pour animer',
    'Molette : zoom · clic droit ou Espace : déplacer · F : tout cadrer',
    'Aide › Raccourcis clavier (F1) : la liste des raccourcis',
  ],
  async setup(d) {
    await prepareAma(d);
    addWave(d);
    d.editor.selectedKeys = [];
  },
  steps: [
    intro('Bienvenue dans la formation Worldnime2D ! Je vais vous accompagner pas à pas, même si vous n\'avez jamais utilisé de logiciel d\'animation. Dans cette première leçon, on découvre le principe de l\'animation par squelette, puis on fait le tour de l\'interface.'),
    {
      say: 'Voici Ama, le personnage qui nous accompagnera tout au long de la formation. Regardez : elle salue de la main. Pourtant, personne n\'a dessiné ce mouvement image par image.',
      do: async (d) => {
        d.viewport.frameAll();
        d.editor.setMode('animate');
        d.editor.togglePlay();
        await d.move([150, 250], 1.2);
      },
    },
    {
      say: 'Le principe est simple. Le personnage est découpé en morceaux : la tête, le torse, les bras, les jambes. On construit un squelette fait d\'os, on accroche chaque morceau à son os, et pour animer, on fait simplement tourner les os. Les images suivent.',
      do: async (d) => {
        await d.at(3.5);
        d.editor.togglePlay();
        d.editor.setMode('setup');
        d.viewport.attachments.alpha = 0.35;
        d.viewport.render();
        const n1 = d.note([-62, 360], 'Des images…');
        await d.at(8);
        const n2 = d.note([20, 230], '… accrochées à des os');
        await d.at(12.5);
        d.viewport.attachments.alpha = 1;
        d.viewport.render();
        n1.remove();
        n2.remove();
      },
    },
    {
      say: 'C\'est la technique utilisée par de nombreux jeux vidéo en 2D : une seule série de dessins suffit pour créer des dizaines d\'animations fluides, très légères à charger.',
      do: async (d) => {
        d.editor.setMode('animate');
        d.editor.togglePlay();
        await d.at(6.5);
        d.editor.togglePlay();
        d.editor.setFrame(0);
        d.editor.setMode('setup');
      },
    },
    {
      say: 'Faisons maintenant le tour de l\'interface. En haut, la barre principale. À gauche, les deux modes : Configuration, pour construire le personnage, et Animation, pour l\'animer dans le temps.',
      do: async (d) => {
        const h = d.highlight('.topbar', 'La barre principale', { dim: true, place: 'below' });
        await d.at(5.5);
        h.remove();
        const m = d.highlight('.mode', 'Les deux modes', { place: 'below' });
        await d.move('.mode-btn[data-mode="setup"]');
        await d.at(9.5);
        await d.move('.mode-btn[data-mode="animate"]');
        await d.at(12);
        m.remove();
      },
    },
    {
      say: 'À droite, les boutons Nouveau, Ouvrir et Enregistrer, puis les flèches Annuler et Rétablir. Elles vous sauveront souvent la mise !',
      do: async (d) => {
        const h = d.highlight('.file-actions', 'Fichiers, annuler et rétablir', { place: 'below' });
        await d.move('.file-actions [data-cmd="save"]');
        await d.at(3.5);
        await d.move('#btn-undo');
        await d.at(6.5);
        h.remove();
      },
    },
    {
      say: 'Sur le côté gauche, la barre d\'outils : Sélection, Création d\'os, Rotation, Déplacement, Échelle et Cisaillement. Chaque outil a une touche de raccourci, affichée quand on survole son bouton.',
      do: async (d) => {
        const h = d.highlight('#tools', 'Les outils', { place: 'right' });
        for (const [i, t] of ['select', 'create', 'rotate', 'translate', 'scale', 'shear'].entries()) {
          await d.at(2.6 + i * 1.15);
          await d.move(`.tool[data-tool="${t}"]`, 0.45);
        }
        await d.at(11.5);
        h.remove();
      },
    },
    {
      say: 'Au centre, la vue. C\'est ici qu\'on voit le personnage et qu\'on le manipule à la souris.',
      do: async (d) => {
        const h = d.highlight('#viewport', 'La vue', { dim: true, place: 'inside' });
        await d.move([120, 200]);
        await d.at(4.5);
        h.remove();
      },
    },
    {
      say: 'Pour zoomer, tournez la molette de la souris : le zoom se fait vers le curseur. Pour déplacer la vue, maintenez le clic droit et glissez. Vous pouvez aussi maintenir la touche Espace et glisser avec le clic gauche.',
      do: async (d) => {
        await d.wheel([0, 350], 5, -120);
        await d.at(4.5);
        await d.drag({ x: 760, y: 420 }, { x: 600, y: 520 }, { button: 2, duration: 1.2 });
        await d.at(8.5);
        await d.holding('Espace', () => d.drag({ x: 600, y: 520 }, { x: 820, y: 360 }, { duration: 1.3 }));
      },
    },
    {
      say: 'Et si vous vous perdez, appuyez sur la touche F : la vue recadre tout le personnage.',
      do: async (d) => {
        await d.at(2.2);
        await d.key('F');
      },
    },
    {
      say: 'À droite, un panneau à onglets. L\'Arbre montre tous les os. L\'onglet Ordre décide quelle image passe devant les autres. Images liste les dessins du personnage. Anim. regroupe les animations, et Skins, les différentes tenues.',
      do: async (d) => {
        const h = d.highlight('.panel-tree', '', { place: 'left' });
        const tabs = [['tree', 1.8], ['draworder', 4.6], ['images', 7.8], ['animations', 10.4], ['skins', 13.2]];
        for (const [tab, t] of tabs) {
          await d.at(t);
          await d.click(`.tab[data-tab="${tab}"]`, { duration: 0.5 });
        }
        await d.at(15.5);
        await d.click('.tab[data-tab="tree"]', { duration: 0.5 });
        h.remove();
      },
    },
    {
      say: 'En dessous, le panneau Propriétés affiche les réglages de ce qui est sélectionné. Cliquons sur la tête d\'Ama : on voit la position, la rotation et la longueur de son os.',
      do: async (d) => {
        await d.at(5);
        const sk = d.editor.skeleton;
        const tete = sk.findBone('tete');
        await d.click([tete.worldX + 2, tete.worldY + 60]);
        const h = d.highlight('.panel-props', 'Propriétés', { place: 'left' });
        await d.at(9.5);
        h.remove();
      },
    },
    {
      say: 'Tout en bas, la barre d\'état rappelle la position de la souris, le zoom, le nombre d\'os et l\'outil actif.',
      do: async (d) => {
        const h = d.highlight('#status', 'La barre d\'état', { place: 'above' });
        await d.hover([-150, 200], 1.5);
        await d.at(5.5);
        h.remove();
      },
    },
    {
      say: 'Enfin, la barre de menus, tout en haut, donne accès à toutes les commandes. Dans le menu Aide, Raccourcis clavier affiche la liste complète des raccourcis. Gardez-la sous la main !',
      do: async (d) => {
        await d.at(3.2);
        await d.menu('Aide', 'Raccourcis clavier', 'help');
        await d.at(10.5);
        await d.click('#help form button');
      },
    },
    {
      say: 'Dernier point : cliquez sur Animation. La timeline apparaît en bas, et la vue se borde de rouge pour rappeler qu\'on est en train d\'animer. On revient en Configuration avec le bouton, ou avec Ctrl+1.',
      do: async (d) => {
        await d.click('.mode-btn[data-mode="animate"]');
        await d.at(3);
        const h = d.highlight('#timeline', 'La timeline', { place: 'above' });
        await d.at(8.5);
        h.remove();
        await d.at(9.5);
        await d.key('Ctrl+1');
      },
    },
    outro('Bravo, vous connaissez maintenant l\'interface ! À retenir : un personnage, ce sont des images accrochées à des os. On construit en mode Configuration, on anime en mode Animation. Molette pour zoomer, clic droit pour déplacer la vue, F pour tout cadrer. Dans la prochaine leçon, on crée nos premiers os.'),
  ],
};

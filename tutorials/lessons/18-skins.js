import { intro, outro } from './common.js';
import { prepareAma, setKeys } from '../runtime/rig.js';

const bone = (d, name) => d.editor.skeleton.findBone(name);
const mid = (b) => [(b.worldX + b.tipX) / 2, (b.worldY + b.tipY) / 2];
const end = (d) => d.job.durations[d.stepIndex];

// Case « active » d'une skin dans l'onglet Skins.
const skinBox = (d, name) => d.row(name, '#skins').querySelector('input[type="checkbox"]');

export default {
  id: '18-skins',
  module: 7,
  title: 'Les skins : plusieurs tenues',
  next: 'Collision, découpe et points',
  goals: [
    'Créer une skin, une tenue alternative',
    'Remplacer une image dans une skin',
    'Ajouter un accessoire réservé à une skin',
  ],
  recap: [
    'Une skin = une tenue : même squelette, mêmes animations',
    '« default » est toujours active ; les autres se cochent, et se combinent',
    'Pièce jointe › « Créer la version de la skin », puis changer son image',
    'La skin sélectionnée reçoit les nouvelles images et les nouveaux slots',
    'Os et contraintes peuvent être réservés à une skin',
  ],
  async setup(d) {
    await prepareAma(d);
    // Une petite animation de salut, pour montrer qu'elle marche avec toutes les tenues.
    const ed = d.editor;
    ed.setMode('animate');
    ed.apply(() => ed.skeleton.renameAnimation(ed.animation, 'salut'));
    ed.animationName = 'salut';
    setKeys(d, 'bras_droit', 'rotate', [[0, 115.8]]);
    setKeys(d, 'avant_bras_droit', 'rotate', [[0, 68.8], [10, 18.8], [20, 68.8]]);
    setKeys(d, 'tete', 'rotate', [[0, 0], [10, -8], [20, 0]]);
    ed.setMode('setup');
    ed.select(ed.skeleton.root);
    ed.setTool('select');
    // Arbre : seuls le slot torse et sa pièce jointe restent visibles dépliés.
    for (const r of [...document.querySelectorAll('#tree .tree-row')]) {
      const name = r.querySelector('.tree-label')?.textContent.trim();
      if (r.querySelector('.slot-icon') && r.querySelector('.twisty')?.textContent === '▾' && name !== 'torse') {
        d.row(name, '#tree', 'slot').querySelector('.twisty').click();
      }
    }
  },
  steps: [
    intro('Dans ce module, on découvre les skins, pour habiller un même personnage de plusieurs tenues.'),
    {
      say: 'Une skin est un ensemble d\'images pour un même squelette. Le squelette et les animations restent les mêmes : seules les images changent. Tenue de fête, armure, version abîmée… ou même un tout autre personnage, qui partage les mêmes os.',
      do: async (d) => {
        const c = d.card({
          kicker: 'Le principe',
          title: 'Un squelette, plusieurs tenues',
          html: `<div style="display:flex; gap:30px; align-items:center; margin-top:34px; font-size:24px">
            <div style="padding:20px 26px; border-radius:12px; background:#2c3e50; border:2px solid #9fb3c8">🦴 Squelette<br><small style="font-size:17px; color:#9fb3c8">os, slots, animations</small></div>
            <div style="font-size:40px; color:#ffca28">→</div>
            <div style="display:grid; gap:12px">
              <div style="padding:10px 22px; border-radius:10px; background:#14808a">default : tenue de tous les jours</div>
              <div style="padding:10px 22px; border-radius:10px; background:#c0392b">fete : tenue de fête + foulard</div>
              <div style="padding:10px 22px; border-radius:10px; background:#3b3470">… autant que vous voulez</div></div></div>`,
        });
        await d.at(end(d) - 0.3);
        await c.remove();
      },
    },
    {
      say: 'Ouvrez l\'onglet Skins. La skin « default » est toujours active : c\'est la tenue de base. Cliquez sur plus pour créer une skin, puis double-cliquez dessus pour l\'appeler « fete ».',
      do: async (d) => {
        await d.at(1);
        await d.click('.tab[data-tab="skins"]');
        await d.at(3);
        const h = d.highlight(d.row('default', '#skins'), '', { place: 'left' });
        await d.at(6.5);
        h.remove();
        await d.click(d.$('#skins .anim-head button'));
        await d.at(9);
        await d.dblclick(d.row('skin', '#skins'));
        await d.wait(0.3);
        const input = d.$('#skins .tree-rename');
        await d.type(input, 'fete', { enter: false });
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await d.wait(0.4);
      },
    },
    {
      say: 'La skin « fete » est cochée, donc active, et sélectionnée : c\'est elle qui recevra les nouvelles images. Pour lui donner son propre haut, sélectionnez l\'image du torse, dans l\'Arbre. Les Propriétés indiquent qu\'elle appartient à « default ».',
      do: async (d) => {
        await d.at(1);
        const h = d.highlight(d.row('fete', '#skins'), '', { place: 'left' });
        await d.at(7.5);
        h.remove();
        await d.click('.tab[data-tab="tree"]');
        await d.click(d.row('torse', '#tree', 'att'));
        await d.at(end(d) - 2.5);
        const i = d.highlight(d.$('#props .world-info'), '', { place: 'left' });
        await d.at(end(d) - 0.2);
        i.remove();
      },
    },
    {
      say: 'Cliquez sur « Créer la version de la skin fete ». Une copie est créée, sous le même nom, dans la skin « fete ». Choisissez son image : le haut de fête, rouge et blanc.',
      do: async (d) => {
        await d.at(1);
        await d.click(d.propButton('Créer la version de la skin'));
        await d.at(6.5);
        await d.choose(d.prop('Image'), 'torse_fete');
      },
    },
    {
      say: 'Ce nom, torse, est un emplacement : chaque skin peut le remplir à sa façon. Ajoutons un accessoire que seule la tenue de fête possède. Sélectionnez l\'os de la tête, et glissez le foulard depuis l\'onglet Images.',
      do: async (d) => {
        await d.at(7);
        await d.click(mid(bone(d, 'tete')));
        await d.at(9.5);
        await d.click('.tab[data-tab="images"]');
        const cell = [...document.querySelectorAll('#images .image-cell')].find((c) => c.textContent.trim() === 'chapeau');
        cell.scrollIntoView({ block: 'nearest' });
        await d.dragDrop(cell, [d.placed.chapeau.cx, d.placed.chapeau.cy], { duration: 1.3 });
      },
    },
    {
      say: 'Revenez à l\'onglet Skins. Décochez « fete » : Ama retrouve sa tenue de tous les jours, sans le foulard. Recochez : la tenue de fête revient. On peut cocher plusieurs skins à la fois, pour combiner une tenue et des accessoires.',
      do: async (d) => {
        await d.at(1);
        await d.click('.tab[data-tab="skins"]');
        await d.at(3);
        await d.click(skinBox(d, 'fete'));
        await d.at(7.5);
        await d.click(skinBox(d, 'fete'));
      },
    },
    {
      say: 'Quand une skin est sélectionnée, ces deux listes réservent des os et des contraintes à cette skin : ils n\'existent que quand elle est active. Utile pour une cape ou une queue, avec leurs propres os et leur physique.',
      do: async (d) => {
        await d.click(d.row('fete', '#skins'));
        await d.at(2);
        const heads = [...document.querySelectorAll('#skins .anim-head')].slice(1);
        const hs = heads.map((h) => d.highlight(h, '', { place: 'left' }));
        await d.at(end(d) - 0.3);
        hs.forEach((h) => h.remove());
      },
    },
    {
      say: 'Et les animations marchent avec toutes les skins. Lançons le salut, avec la tenue de fête, puis avec la tenue de base. Dans le jeu, on choisit la skin au moment voulu, sans rien réanimer.',
      do: async (d) => {
        await d.key('Ctrl+2', 'mode-animate');
        await d.key('P');
        await d.at(6);
        await d.click(skinBox(d, 'fete'));
        await d.at(end(d) + 1);
        await d.key('P');
        await d.click(skinBox(d, 'fete'));
      },
    },
    outro('Bravo ! À retenir : une skin est une tenue, qui partage le squelette et les animations. Créez-la dans l\'onglet Skins, puis créez la version de la skin d\'une image, et changez son image. La skin sélectionnée reçoit les nouveaux accessoires, et les skins se combinent en les cochant. Dans la prochaine leçon, on découvre les boîtes de collision, les découpes et les points.'),
  ],
};

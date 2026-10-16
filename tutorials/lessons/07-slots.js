import { intro, outro } from './common.js';
import { prepareAma, workDir } from '../runtime/rig.js';
import { writeBackdrop } from '../runtime/character.js';

const bone = (d, name) => d.editor.skeleton.findBone(name);
const mid = (b) => [(b.worldX + b.tipX) / 2, (b.worldY + b.tipY) / 2];
const end = (d) => d.job.durations[d.stepIndex];

// Ligne d'un slot dans l'Arbre, après être revenu sur l'onglet Arbre.
async function slotRow(d, name) {
  if (document.getElementById('tree').hidden) await d.click('.tab[data-tab="tree"]');
  return d.row(name, '#tree', 'slot');
}

export default {
  id: '07-slots',
  module: 3,
  title: 'Ordre d\'affichage et slots',
  next: 'Votre première animation',
  goals: [
    'Régler l\'ordre d\'affichage : qui passe devant, qui passe derrière',
    'Ranger plusieurs images dans un même slot',
    'Teinte, opacité, couleur sombre et modes de fusion',
    'Une image de référence en fond',
  ],
  recap: [
    'Onglet Ordre : en haut de la liste = devant ; glisser pour réordonner',
    'Un slot peut contenir plusieurs images, une seule visible à la fois',
    'Teinte et Opacité colorent tout le slot ; la couleur sombre teinte les ombres',
    'Fusion Additif : idéal pour la lumière, le feu, la magie',
    'Affichage › Image de référence : un décor ou un croquis derrière le personnage',
  ],
  async setup(d) {
    await prepareAma(d);
    await writeBackdrop(d.api, workDir(d, 'ama'));
    // Arbre plus lisible : chaque slot sur une seule ligne, sauf ceux qu'on va ouvrir.
    for (const r of [...document.querySelectorAll('#tree .tree-row')]) {
      const name = r.querySelector('.tree-label')?.textContent.trim();
      if (r.querySelector('.slot-icon') && r.querySelector('.twisty')?.textContent === '▾' && name !== 'yeux') {
        d.row(name, '#tree', 'slot').querySelector('.twisty').click();
      }
    }
    d.editor.select(d.editor.skeleton.root);
    d.editor.setTool('select');
  },
  steps: [
    intro('Dans cette leçon, on règle ce qui passe devant ou derrière, on range plusieurs images dans un slot, et on joue avec les couleurs.'),
    {
      say: 'Ouvrez l\'onglet Ordre. Il liste tous les slots, du premier plan, en haut, jusqu\'au fond, en bas. Le bras gauche est en haut : il passe devant le corps. Le bras droit est plus bas : il passe derrière.',
      do: async (d) => {
        await d.at(1);
        await d.click('.tab[data-tab="draworder"]');
        await d.at(3.5);
        const h = d.highlight('#draworder', '', { place: 'left' });
        await d.at(7.5);
        h.remove();
        const a = d.highlight(d.row('bras_gauche', '#draworder'), 'devant', { place: 'left' });
        await d.at(10.5);
        a.remove();
        const b = d.highlight(d.row('bras_droit', '#draworder'), 'derrière', { place: 'left' });
        await d.at(end(d) - 0.4);
        b.remove();
      },
    },
    {
      say: 'Pour changer l\'ordre, glissez un slot dans la liste. L\'écharpe est tout au fond, cachée derrière le torse. Glissons-la juste au-dessus du torse : elle passe maintenant devant.',
      do: async (d) => {
        await d.at(4);
        const h = d.highlight(d.row('echarpe', '#draworder'), '', { place: 'left' });
        await d.at(7);
        h.remove();
        await d.dragDrop(d.row('echarpe', '#draworder'), { el: d.row('torse', '#draworder'), fy: 0.2 }, { duration: 1.6 });
      },
    },
    {
      say: 'On peut aussi utiliser les flèches en haut du panneau : flèche vers le haut pour avancer d\'un cran, flèche vers le bas pour reculer. Et pour aller d\'un coup tout devant ou tout au fond, les Propriétés du slot ont deux boutons.',
      do: async (d) => {
        await d.at(2.5);
        await d.click(d.row('bras_droit', '#draworder'));
        await d.click('[data-cmd="move-up"]');
        await d.wait(0.4);
        await d.click('[data-cmd="move-down"]');
        await d.at(10);
        const a = d.highlight(d.propButton('Envoyer tout devant'), '', { place: 'left' });
        const b = d.highlight(d.propButton('Envoyer tout au fond'), '', { place: 'left' });
        await d.at(end(d) - 0.3);
        a.remove();
        b.remove();
      },
    },
    {
      say: 'Un slot peut contenir plusieurs images. Revenons à l\'Arbre et sélectionnons le slot yeux. Dans l\'onglet Images, un double-clic sur yeux fermés l\'ajoute à ce slot, à la même place que les yeux ouverts.',
      do: async (d) => {
        await d.at(3.5);
        await d.click(await slotRow(d, 'yeux'));
        await d.at(8);
        await d.click('.tab[data-tab="images"]');
        const cell = [...document.querySelectorAll('#images .image-cell')].find((c) => c.textContent.trim() === 'yeux_fermes');
        cell.scrollIntoView({ block: 'nearest' });
        await d.at(10);
        await d.dblclick(cell);
        await d.wait(0.6);
        await d.click('.tab[data-tab="tree"]');
      },
    },
    {
      say: 'Le slot contient maintenant deux images, mais une seule s\'affiche à la fois. Le petit rond, à droite de chaque image, montre laquelle. Cliquez sur le rond des yeux ouverts : Ama cligne des yeux. On s\'en servira pour animer les clignements et les bouches qui parlent.',
      do: async (d) => {
        await d.at(1);
        const r1 = d.row('yeux_ouverts', '#tree', 'att');
        const r2 = d.row('yeux_fermes', '#tree', 'att');
        const h1 = d.highlight(r1, '', { place: 'left' });
        const h2 = d.highlight(r2, '', { place: 'left' });
        await d.at(4.5);
        h1.remove();
        h2.remove();
        await d.move(r1.querySelector('.eye'), 0.6);
        await d.move(r2.querySelector('.eye'), 0.5);
        await d.at(9);
        await d.click(d.row('yeux_fermes', '#tree', 'att').querySelector('.eye'));
        await d.wait(1.2);
        await d.click(d.row('yeux_ouverts', '#tree', 'att').querySelector('.eye'));
        await d.wait(0.6);
        await d.click(d.row('yeux_fermes', '#tree', 'att').querySelector('.eye'));
        await d.wait(0.6);
        await d.click(d.row('yeux_ouverts', '#tree', 'att').querySelector('.eye'));
      },
    },
    {
      say: 'La liste Visible, dans les Propriétés du slot, fait la même chose. Elle propose aussi « aucune », pour cacher complètement le slot.',
      do: async (d) => {
        await d.click(d.row('yeux', '#tree', 'slot'));
        await d.at(2);
        await d.choose(d.prop('Visible'), 'yeux_fermes');
        await d.at(5.5);
        await d.choose(d.prop('Visible'), '');
        await d.wait(0.8);
        await d.choose(d.prop('Visible'), 'yeux_ouverts');
      },
    },
    {
      say: 'Chaque slot a aussi une couleur. Sélectionnez le slot torse : la Teinte multiplie les couleurs de l\'image. Avec un bleu, le haut d\'Ama vire au bleu. Et l\'Opacité rend le slot transparent.',
      do: async (d) => {
        await d.at(2.5);
        await d.click(d.row('torse', '#tree', 'slot'));
        await d.at(4.5);
        await d.pickColor(d.prop('Teinte'), '#64b5f6');
        await d.at(9);
        await d.slide(d.prop('Opacité'), 0.35, { duration: 1.2 });
        await d.wait(0.8);
        await d.slide(d.prop('Opacité'), 1, { duration: 0.8 });
        await d.key('Ctrl+Z');
        await d.key('Ctrl+Z');
        await d.key('Ctrl+Z');
      },
    },
    {
      say: 'La teinte ne peut qu\'assombrir. Pour éclaircir les parties sombres, cochez Teinte sombre : la Couleur sombre remplace le noir de l\'image. Avec un rouge vif, les parties sombres deviennent rouges : parfait pour un coup reçu, ou un personnage en colère.',
      do: async (d) => {
        await d.at(3);
        await d.check(d.prop('Teinte sombre'));
        await d.at(6);
        const h = d.highlight(d.prop('Couleur sombre').closest('.prop-row'), '', { place: 'left' });
        await d.at(8);
        h.remove();
        await d.pickColor(d.prop('Couleur sombre'), '#e53935');
        await d.at(end(d) - 0.8);
        await d.key('Ctrl+Z');
        await d.key('Ctrl+Z');
      },
    },
    {
      say: 'Passons aux modes de fusion. Ama tient une boule d\'énergie : sélectionnez l\'avant-bras droit, et glissez l\'image lueur sur sa main. En mode Normal, elle ressemble à une tache orange posée sur le dessin.',
      do: async (d) => {
        await d.at(4);
        await d.click(mid(bone(d, 'avant_bras_droit')));
        await d.at(6);
        await d.click('.tab[data-tab="images"]');
        const cell = [...document.querySelectorAll('#images .image-cell')].find((c) => c.textContent.trim() === 'lueur');
        cell.scrollIntoView({ block: 'nearest' });
        const p = d.placed.lueur;
        await d.dragDrop(cell, [p.cx, p.cy], { duration: 1.4 });
        await d.wait(0.4);
        await d.click('.tab[data-tab="tree"]');
      },
    },
    {
      say: 'Sélectionnez son slot, et choisissez la Fusion Additif : les couleurs s\'ajoutent à celles du dessous, et la lueur brille vraiment. C\'est le mode idéal pour la lumière, le feu ou la magie. Produit assombrit, comme une ombre, et Écran éclaircit en douceur.',
      do: async (d) => {
        await d.at(1);
        await d.click(d.row('lueur', '#tree', 'slot'));
        await d.at(3.5);
        await d.choose(d.prop('Fusion'), 'additive');
        await d.wait(0.8);
        await d.wheel(mid(bone(d, 'avant_bras_droit')), 4);
        await d.at(end(d) - 4.5);
        await d.choose(d.prop('Fusion'), 'multiply');
        await d.wait(0.9);
        await d.choose(d.prop('Fusion'), 'screen');
        await d.wait(0.9);
        await d.choose(d.prop('Fusion'), 'additive');
      },
    },
    {
      say: 'Dernier outil : l\'image de référence. Menu Affichage, Image de référence. Choisissez un décor, ou un croquis : il s\'affiche derrière le personnage, sans faire partie du squelette.',
      do: async (d) => {
        await d.key('F');
        await d.at(3.5);
        await d.answerNext(workDir(d, 'ama/decor.png'));
        await d.menu('Affichage', 'Image de référence…');
        const show = d.fileDialog('Image de référence', workDir(d, 'ama/decor.png'), 'Ouvrir');
        await show;
        await d.ctx.command('choose-reference');
      },
    },
    {
      say: 'Ses réglages sont dans les Propriétés, section Squelette. Baissons l\'Opacité, puis descendons le décor avec le champ Y, pour poser les pieds d\'Ama sur le sol. La case Référence la cache ou la montre.',
      do: async (d) => {
        d.editor.select(d.editor.skeleton.root);
        await d.at(2.5);
        await d.slide(d.prop('Opacité réf.'), 0.8, { duration: 1 });
        await d.at(6.5);
        await d.type(d.prop('Y réf.'), '200');
        await d.key('F');
        await d.at(end(d) - 2.5);
        await d.click(d.prop('Référence'));
        await d.wait(0.9);
        await d.click(d.prop('Référence'));
      },
    },
    outro('Bravo ! À retenir : dans l\'onglet Ordre, ce qui est en haut passe devant. Un slot peut ranger plusieurs images, mais n\'en montre qu\'une. La teinte, l\'opacité et la couleur sombre colorent un slot, et la fusion Additif fait briller la lumière. Dans la prochaine leçon, on entre dans le mode Animation, pour créer votre première animation.'),
  ],
};

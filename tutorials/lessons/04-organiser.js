import { intro, outro } from './common.js';
import { importAma, addAmaBones } from '../runtime/rig.js';

const bone = (d, name) => d.editor.skeleton.findBone(name);
const mid = (b) => [(b.worldX + b.tipX) / 2, (b.worldY + b.tipY) / 2];

// Choisit une couleur dans un champ couleur (le sélecteur natif ne s'affiche pas : on montre une palette).
async function pickColor(d, input, hex) {
  await d.click(input);
  const r = input.getBoundingClientRect();
  const pal = document.createElement('div');
  pal.className = 'tuto-dropdown';
  pal.style.cssText = `left:${r.left - 120}px; top:${r.bottom + 4}px; display:grid; grid-template-columns:repeat(6, 26px); gap:6px; padding:10px`;
  const colors = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#9b9b9b', '#26c6da', '#ec407a', '#7cb342', '#5c6bc0', '#ffffff'];
  for (const c of colors) {
    const sw = document.createElement('div');
    sw.style.cssText = `width:26px; height:26px; border-radius:5px; background:${c}; border:2px solid ${c === hex ? '#fff' : 'transparent'}`;
    sw.dataset.c = c;
    pal.appendChild(sw);
  }
  d.root.appendChild(pal);
  await d.wait(0.3);
  await d.move(pal.querySelector(`[data-c="${hex}"]`), 0.5);
  d.ripple();
  await d.wait(0.25);
  pal.remove();
  input.value = hex;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await d.wait(0.2);
}

export default {
  id: '04-organiser',
  module: 2,
  title: 'Organiser le squelette',
  next: 'Accrocher les images aux os',
  goals: [
    'Corriger le parent d\'un os',
    'Régler un os au chiffre près',
    'Ajouter, dupliquer, supprimer et colorer les os',
  ],
  recap: [
    'Glisser un os sur un autre dans l\'Arbre = changer de parent',
    'Propriétés : parent, longueur, position et rotation au chiffre près',
    '＋ ajoute un os enfant · Ctrl+D duplique · Suppr supprime',
    'Une couleur par côté du corps pour s\'y retrouver',
  ],
  async setup(d) {
    await importAma(d);
    // Erreur volontaire : la cuisse droite a été créée comme enfant de la cuisse gauche.
    addAmaBones(d, { skip: ['echarpe*'], parents: { cuisse_droite: 'cuisse_gauche' } });
    d.editor.select(d.editor.skeleton.root);
    d.editor.setTool('select');
  },
  steps: [
    intro('Dans cette leçon, on apprend à organiser le squelette : corriger une erreur de hiérarchie, régler les os avec précision, et ajouter, dupliquer ou supprimer des os.'),
    {
      say: 'Voici le squelette d\'Ama, mais il contient une erreur. Prenons l\'outil Rotation et faisons tourner la cuisse gauche. Regardez : la cuisse droite tourne avec elle !',
      do: async (d) => {
        await d.at(5.5);
        await d.key('R');
        await d.drag(mid(bone(d, 'cuisse_gauche')), [-60, 92], { duration: 1.3 });
        await d.wait(0.8);
        await d.key('Ctrl+Z');
      },
    },
    {
      say: 'L\'Arbre explique pourquoi : la cuisse droite a été rangée sous la cuisse gauche. C\'est son enfant, alors qu\'elle devrait être l\'enfant des hanches.',
      do: async (d) => {
        await d.click(d.row('cuisse_droite', '#tree', 'bone'));
        const h = d.highlight(d.row('cuisse_gauche', '#tree', 'bone'), 'Parent actuel', { place: 'above' });
        await d.at(8.5);
        h.remove();
      },
    },
    {
      say: 'Pour corriger, glissez la ligne cuisse droite et déposez-la sur hanches. La cuisse droite change de parent, sans bouger de place.',
      do: async (d) => {
        await d.at(1);
        await d.dragDrop(d.row('cuisse_droite', '#tree', 'bone'), d.row('hanches', '#tree', 'bone'), { duration: 1.4 });
        await d.at(6.5);
        await d.key('V');
        await d.click(d.row('cuisse_droite', '#tree', 'bone'));
      },
    },
    {
      say: 'Autre façon de faire : dans les Propriétés, la liste Parent permet de choisir le parent de l\'os sélectionné.',
      do: async (d) => {
        const h = d.highlight(d.prop('Parent').closest('.prop-row'), '', { place: 'left' });
        await d.move(d.prop('Parent'), 0.7);
        await d.at(6);
        h.remove();
      },
    },
    {
      say: 'Pour replier une branche de l\'Arbre et y voir plus clair, cliquez sur le petit triangle devant son nom. Un autre clic la déplie.',
      do: async (d) => {
        await d.at(1);
        await d.click(d.row('torse', '#tree', 'bone').querySelector('.twisty'));
        await d.at(4.5);
        await d.click(d.row('torse', '#tree', 'bone').querySelector('.twisty'));
      },
    },
    {
      say: 'Les Propriétés permettent aussi de régler un os au chiffre près. Sélectionnons la tête. Sa position X et Y est mesurée depuis son parent, et sa rotation est en degrés. Changeons sa longueur : tapez 140, puis Entrée.',
      do: async (d) => {
        await d.at(2.5);
        await d.click(mid(bone(d, 'tete')));
        await d.at(4.5);
        const h = d.highlight(d.prop('X').closest('.prop-row'), '', { place: 'left' });
        const h2 = d.highlight(d.prop('Y').closest('.prop-row'), '', { place: 'left' });
        await d.at(8);
        h.remove();
        h2.remove();
        const h3 = d.highlight(d.prop('Rotation').closest('.prop-row'), '', { place: 'left' });
        await d.at(11);
        h3.remove();
        await d.at(12.5);
        await d.type(d.prop('Longueur'), '140');
      },
    },
    {
      say: 'Pour distinguer les deux côtés du corps, donnez une couleur aux os. Choisissons du bleu pour le bras gauche et l\'avant-bras gauche. La couleur ne sert qu\'à l\'affichage, elle ne change rien au personnage.',
      do: async (d) => {
        await d.at(2.5);
        await d.click(mid(bone(d, 'bras_gauche')));
        await pickColor(d, d.prop('Couleur'), '#1e88e5');
        await d.click(mid(bone(d, 'avant_bras_gauche')));
        await pickColor(d, d.prop('Couleur'), '#1e88e5');
      },
    },
    {
      say: 'Ajoutons un os pour les cheveux. Sélectionnez la tête, puis cliquez sur le bouton plus, en haut du panneau : un os enfant apparaît au bout de la tête. Renommez-le cheveux.',
      do: async (d) => {
        await d.at(1.5);
        await d.click(mid(bone(d, 'tete')));
        await d.at(4.5);
        await d.click('.panel-actions [data-cmd="add-child"]');
        await d.at(8.5);
        await d.type(d.prop('Nom'), 'cheveux');
      },
    },
    {
      say: 'Ctrl+D duplique l\'os sélectionné, avec tous ses enfants. Dupliquons le bras gauche : une copie apparaît exactement au même endroit, avec son avant-bras. C\'est pratique pour un membre identique, une queue, ou une rangée de plumes.',
      do: async (d) => {
        await d.click(mid(bone(d, 'bras_gauche')));
        await d.at(3.5);
        await d.key('Ctrl+D');
        await d.at(6.5);
        await d.key('T');
        const b = d.editor.selected;
        await d.drag(mid(b), [-130, 250], { duration: 1.2 });
      },
    },
    {
      say: 'Cette copie ne nous sert pas. La touche Suppr supprime l\'os sélectionné et tous ses enfants. On peut aussi utiliser la croix en haut du panneau.',
      do: async (d) => {
        await d.at(3);
        await d.key('Suppr');
        await d.at(6.5);
        await d.move('.panel-actions [data-cmd="delete"]', 0.6);
      },
    },
    {
      say: 'Enfin, quand il y a beaucoup d\'os, le menu Affichage permet de cacher leurs noms, les os eux-mêmes, ou les images, pour mieux voir ce qu\'on fait.',
      do: async (d) => {
        await d.at(3);
        await d.menu('Affichage', 'Afficher les noms des os', 'toggle-names');
        await d.at(8);
        await d.menu('Affichage', 'Afficher les noms des os', 'toggle-names');
        await d.key('V');
      },
    },
    outro('Bravo ! À retenir : glissez un os sur un autre dans l\'Arbre pour changer son parent. Les Propriétés règlent la longueur, la position et la rotation au chiffre près. Le bouton plus ajoute un os enfant, Ctrl+D duplique, et Suppr supprime. Dans la prochaine leçon, on accroche enfin les images aux os.'),
  ],
};

import { intro, outro } from './common.js';
import { prepareAma, saveAs } from '../runtime/rig.js';

const end = (d) => d.job.durations[d.stepIndex];

// Va à une image en cliquant dans la règle de la timeline.
const goTo = (d, frame) => d.click(d.tl(frame));

// Champ du formulaire d'un événement (onglet Anim.).
function eventField(d, label) {
  const row = [...document.querySelectorAll('#animations .prop-row')].find((r) => r.querySelector('span')?.textContent.trim() === label);
  if (!row) throw new Error(`Champ d'événement introuvable : ${label}`);
  return row.querySelector('input');
}

// Ama, avec une deuxième image dans les slots yeux et bouche, et une boule d'énergie dans la main.
export async function prepareExpressions(d) {
  await prepareAma(d);
  const ed = d.editor;
  const sk = ed.skeleton;
  for (const [slotName, extra] of [['yeux', 'yeux_fermes'], ['bouche', 'bouche_ouverte']]) {
    const slot = sk.findSlot(slotName);
    const shown = slot.attachment;
    d.ctx.actions.attachImage(extra, slot.bone, slot);
    ed.apply(() => {
      slot.attachment = shown;
    });
  }
  const p = d.placed.lueur;
  d.ctx.actions.attachImage('lueur', sk.findBone('avant_bras_droit'), null, { x: p.cx, y: p.cy });
  ed.apply(() => {
    sk.findSlot('lueur').blend = 'additive';
  });
  // Arbre : seuls les slots yeux et bouche restent dépliés.
  for (const r of [...document.querySelectorAll('#tree .tree-row')]) {
    const name = r.querySelector('.tree-label')?.textContent.trim();
    if (r.querySelector('.slot-icon') && r.querySelector('.twisty')?.textContent === '▾' && name !== 'yeux' && name !== 'bouche') {
      d.row(name, '#tree', 'slot').querySelector('.twisty').click();
    }
  }
  ed.select(sk.root);
}

export default {
  id: '11-images-couleurs-evenements',
  module: 4,
  title: 'Changer d\'image, de couleur, et les événements',
  next: 'Créer un maillage',
  goals: [
    'Animer l\'image affichée : cligner des yeux, parler',
    'Animer la couleur et la transparence d\'un slot',
    'Poser des événements pour le jeu',
  ],
  recap: [
    'Mode Animation : le rond d\'une image ou la liste Visible pose une clé d\'image',
    'Les clés d\'image changent d\'un coup, sans transition',
    'Teinte et Opacité d\'un slot s\'animent aussi, avec des courbes',
    'Onglet Anim. › Événements : créer, puis « Poser » à l\'image courante',
    'Le jeu reçoit chaque événement au bon moment (pas, coup, son)',
  ],
  async setup(d) {
    await prepareExpressions(d);
    await saveAs(d);
    const ed = d.editor;
    ed.setMode('animate');
    ed.apply(() => ed.skeleton.renameAnimation(ed.animation, 'bonjour'));
    ed.animationName = 'bonjour';
    ed.setTool('select');
    d.viewport.frameAll();
  },
  steps: [
    intro('Dans cette leçon, on anime autre chose que les os : les images, les couleurs, et on pose des événements pour le jeu.'),
    {
      say: 'Une nouvelle animation, « bonjour ». Dans l\'Arbre, le slot yeux contient les yeux ouverts et les yeux fermés. Allez à l\'image quarante-huit, et cliquez sur le rond des yeux fermés : en mode Animation, cela pose une clé d\'image, en jaune dans la timeline.',
      do: async (d) => {
        await d.at(5);
        const a = d.highlight(d.row('yeux_ouverts', '#tree', 'att'), '', { place: 'left' });
        const b = d.highlight(d.row('yeux_fermes', '#tree', 'att'), '', { place: 'left' });
        await d.at(9.5);
        a.remove();
        b.remove();
        await goTo(d, 48);
        await d.at(13);
        await d.click(d.row('yeux_fermes', '#tree', 'att').querySelector('.eye'));
        await d.wait(0.6);
        const n = d.note(d.tl(48, 'yeux'), 'clé d\'image');
        await d.at(end(d) - 0.2);
        n.remove();
      },
    },
    {
      say: 'Quatre images plus tard, à l\'image cinquante-deux, rouvrez les yeux. Une clé d\'image ne fait pas de transition : l\'image change d\'un coup. Ama cligne des yeux !',
      do: async (d) => {
        await d.at(2.5);
        await goTo(d, 52);
        await d.click(d.row('yeux_ouverts', '#tree', 'att').querySelector('.eye'));
        await d.at(8);
        d.editor.setTime(42 / d.editor.fps);
        await d.key('P');
        await d.at(end(d) + 0.5);
        await d.key('P');
      },
    },
    {
      say: 'Faisons-la parler. Sélectionnez le slot bouche : dans les Propriétés, la liste Visible a un losange de clé. À l\'image dix, choisissez la bouche ouverte. Puis on alterne, toutes les quatre images : fermée, ouverte, fermée.',
      do: async (d) => {
        await d.at(2);
        await d.click(d.row('bouche', '#tree', 'slot'));
        await d.at(4.5);
        const h = d.highlight(d.prop('Visible').closest('.prop-row'), '', { place: 'left' });
        await d.at(7.5);
        h.remove();
        await goTo(d, 10);
        await d.choose(d.prop('Visible'), 'bouche_ouverte');
        for (const [f, img] of [[14, 'bouche_sourire'], [18, 'bouche_ouverte'], [22, 'bouche_sourire']]) {
          await goTo(d, f);
          await d.choose(d.prop('Visible'), img);
        }
      },
    },
    {
      say: 'Les couleurs s\'animent aussi. Sélectionnez le slot lueur, la boule d\'énergie. À l\'image zéro, baissez son Opacité : une clé de couleur apparaît, en violet. À l\'image trente, remontez-la au maximum.',
      do: async (d) => {
        await d.click('.tab[data-tab="tree"]');
        await d.at(3);
        const row = d.row('lueur', '#tree', 'slot');
        await d.click(row);
        await d.at(6.5);
        await goTo(d, 0);
        await d.slide(d.prop('Opacité'), 0.15, { duration: 1 });
        await d.at(end(d) - 3.5);
        await goTo(d, 30);
        await d.slide(d.prop('Opacité'), 1, { duration: 1 });
      },
    },
    {
      say: 'Et à l\'image soixante, on la baisse à nouveau. Avec la Teinte, on peut aussi changer sa couleur : passons-la au rouge, pour une énergie plus menaçante. Entre deux clés de couleur, la transition est douce, et suit la courbe, comme pour les os.',
      do: async (d) => {
        await d.at(1);
        await goTo(d, 60);
        await d.slide(d.prop('Opacité'), 0.15, { duration: 0.9 });
        await d.at(5);
        await goTo(d, 30);
        await d.pickColor(d.prop('Teinte'), '#e57373');
        await d.at(end(d) - 4);
        d.editor.setTime(0);
        await d.key('P');
      },
    },
    {
      say: 'Dernière notion : les événements. Ils marquent un instant précis : un pas qui touche le sol, un coup qui frappe, un son à jouer. Le jeu les reçoit pendant l\'animation, au bon moment.',
      do: async (d) => {
        await d.at(end(d) - 1);
        await d.key('P');
      },
    },
    {
      say: 'Ouvrez l\'onglet Anim. Dans la section Événements, cliquez sur plus : un événement est créé. Double-cliquez dessus pour l\'appeler « parole ». Il peut porter un nombre entier, un décimal, un texte, et même un son.',
      do: async (d) => {
        await d.at(1);
        await d.click('.tab[data-tab="animations"]');
        await d.at(4);
        const head = [...document.querySelectorAll('#animations .anim-head')].find((h) => h.textContent.startsWith('Événements'));
        await d.click(head.querySelector('button'));
        await d.at(7);
        await d.dblclick(d.row('evenement', '#animations'));
        await d.wait(0.3);
        const input = d.$('#animations .tree-rename');
        await d.type(input, 'parole', { enter: false });
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await d.wait(0.4);
        await d.click(d.row('parole', '#animations'));
        await d.at(end(d) - 1.5);
        await d.type(eventField(d, 'Texte'), 'Bonjour !');
      },
    },
    {
      say: 'Allez à l\'image dix, où la bouche s\'ouvre, et cliquez sur « Poser parole à l\'image courante ». La clé apparaît sur la ligne Événements de la timeline.',
      do: async (d) => {
        await d.at(2);
        await goTo(d, 10);
        await d.at(4);
        const put = [...document.querySelectorAll('#animations .prop-button')].find((b) => b.textContent.startsWith('Poser'));
        await d.click(put);
        await d.wait(0.5);
        const n = d.note(d.tl(10, 'Événements'), 'événement');
        await d.at(end(d) - 0.2);
        n.remove();
      },
    },
    {
      say: 'Pendant la lecture, son nom s\'affiche dans la vue au moment où il est déclenché. Si vous lui avez donné un son, Worldnime2D le joue aussi.',
      do: async (d) => {
        d.editor.setTime(0);
        await d.key('P');
        await d.at(end(d) + 1.5);
        await d.key('P');
        await d.key('Ctrl+S', 'save');
      },
    },
    outro('Bravo ! À retenir : en mode Animation, le rond d\'une image, ou la liste Visible, pose une clé d\'image, qui change d\'un coup. La teinte et l\'opacité d\'un slot s\'animent en douceur. Et les événements marquent les instants importants pour le jeu. Dans le prochain module, on découvre les maillages, pour déformer les images.'),
  ],
};

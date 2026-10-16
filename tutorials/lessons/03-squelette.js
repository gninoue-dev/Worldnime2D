import { intro, outro } from './common.js';
import { importAma, AMA_BONES } from '../runtime/rig.js';

const BONE = Object.fromEntries(AMA_BONES.map(([name, parent, a, b]) => [name, { parent, a, b }]));

// Crée un os d'Ama à la souris (outil Création), puis le renomme dans les Propriétés.
async function draw(d, name, { duration = 1 } = {}) {
  const { a, b } = BONE[name];
  await d.drag(a, b, { duration });
  await d.type(d.prop('Nom'), name);
}

// Clic sur le milieu d'un os : avec l'outil Création, un simple clic le sélectionne.
async function pick(d, name) {
  const bone = d.editor.skeleton.findBone(name);
  await d.click([(bone.worldX + bone.tipX) / 2, (bone.worldY + bone.tipY) / 2]);
}

export default {
  id: '03-squelette',
  module: 2,
  title: 'Construire le squelette',
  next: 'Organiser le squelette',
  goals: [
    'Comprendre les os et leur hiérarchie',
    'Créer les os avec l\'outil Création',
    'Nommer les os et corriger une erreur',
  ],
  recap: [
    'Outil Création (C) : cliquer-glisser de l\'articulation vers le bout du membre',
    'Commencer sur un os = créer son enfant ; sinon, enfant de l\'os sélectionné',
    'Renommer : champ Nom des Propriétés, ou double-clic dans l\'Arbre',
    'Ctrl+Z annule · Échap annule le geste · Maj : angle par pas de 15°',
  ],
  async setup(d) {
    await importAma(d);
    d.editor.setTool('select');
  },
  steps: [
    intro('Dans cette leçon, on construit le squelette d\'Ama : les os qui feront bouger chaque partie de son corps.'),
    {
      say: 'Un os, c\'est un segment avec un point de départ, l\'articulation, et une direction. Les os forment un arbre : chaque os a un parent. Quand un parent tourne, tous ses enfants suivent. Le bras entraîne l\'avant-bras, comme dans un vrai corps.',
      do: async (d) => {
        const c = d.card({
          kicker: 'Le principe',
          title: 'Des os en arbre',
          html: `<div style="display:flex; gap:56px; align-items:center; margin-top:28px">
            <svg viewBox="0 0 260 300" width="300" height="340">
              <g stroke-linecap="round" fill="none">
                <path d="M130 270 L130 200" stroke="#9fb3c8" stroke-width="10"/>
                <path d="M130 200 L130 100" stroke="#9fb3c8" stroke-width="12"/>
                <path d="M130 96 L130 30" stroke="#9fb3c8" stroke-width="10"/>
                <path d="M130 110 L70 170" stroke="#ffca28" stroke-width="10"/>
                <path d="M70 170 L40 240" stroke="#ff8a50" stroke-width="8"/>
              </g>
              <g fill="#fff"><circle cx="130" cy="270" r="7"/><circle cx="130" cy="200" r="7"/><circle cx="130" cy="96" r="7"/>
                <circle cx="130" cy="110" r="6"/><circle cx="70" cy="170" r="6"/></g>
            </svg>
            <ul style="margin:0"><li>Un os part d'une <b>articulation</b></li><li>Chaque os a un <b>parent</b></li>
              <li>Le parent bouge → les <b>enfants</b> suivent</li><li>Bras <span style="color:#ffca28">■</span> → avant-bras <span style="color:#ff8a50">■</span></li></ul></div>`,
        });
        const dur = d.job.durations[d.stepIndex];
        await d.wait(1);
        await c.reveal(dur / 6);
        await d.at(dur - 0.3);
        await c.remove();
      },
    },
    {
      say: 'Voici Ama, importée à la leçon précédente. On commence par le centre du corps : les hanches. Choisissez l\'outil Création d\'os, avec la touche C, puis cliquez-glissez depuis le bassin, vers le haut.',
      do: async (d) => {
        await d.at(5.5);
        await d.move('.tool[data-tool="create"]', 0.6);
        await d.key('C');
        await d.at(9.5);
        await d.drag(BONE.hanches.a, BONE.hanches.b, { duration: 1.2 });
      },
    },
    {
      say: 'Le nouvel os s\'appelle bone. Renommez-le tout de suite : dans les Propriétés, champ Nom, tapez hanches, puis Entrée. Des noms clairs vous feront gagner beaucoup de temps.',
      do: async (d) => {
        const h = d.highlight(d.prop('Nom').closest('.prop-row'), '', { place: 'left' });
        await d.at(3);
        await d.type(d.prop('Nom'), 'hanches');
        await d.at(8);
        h.remove();
      },
    },
    {
      say: 'Pour le torse, partez du bout des hanches. Quand on commence le geste sur un os, le nouvel os devient son enfant.',
      do: async (d) => {
        await d.at(1);
        await draw(d, 'torse');
      },
    },
    {
      say: 'Même chose pour la tête, depuis le bout du torse, jusqu\'au sommet du crâne.',
      do: async (d) => {
        await draw(d, 'tete');
      },
    },
    {
      say: 'Pour l\'épaule, c\'est différent : le point de départ n\'est sur aucun os. Dans ce cas, le nouvel os devient l\'enfant de l\'os sélectionné. Cliquez donc d\'abord sur le torse pour le sélectionner, puis glissez de l\'épaule jusqu\'au coude.',
      do: async (d) => {
        await d.at(8.5);
        await pick(d, 'torse');
        const n = d.note(BONE.torse.b, 'Torse sélectionné', 3);
        await d.at(12.5);
        await draw(d, 'bras_gauche');
        n.remove();
      },
    },
    {
      say: 'L\'avant-bras part du coude, au bout du bras : il devient automatiquement l\'enfant du bras.',
      do: async (d) => {
        await d.at(0.8);
        await draw(d, 'avant_bras_gauche');
      },
    },
    {
      say: 'On fait pareil de l\'autre côté : on sélectionne le torse, puis on trace le bras et l\'avant-bras.',
      do: async (d) => {
        await pick(d, 'torse');
        await draw(d, 'bras_droit', { duration: 0.8 });
        await draw(d, 'avant_bras_droit', { duration: 0.8 });
      },
    },
    {
      say: 'Pour les jambes, sélectionnez les hanches, puis tracez la cuisse et la jambe. Et on recommence pour l\'autre jambe.',
      do: async (d) => {
        await pick(d, 'hanches');
        await draw(d, 'cuisse_gauche', { duration: 0.8 });
        await draw(d, 'jambe_gauche', { duration: 0.8 });
        await pick(d, 'hanches');
        await draw(d, 'cuisse_droite', { duration: 0.8 });
        await draw(d, 'jambe_droite', { duration: 0.8 });
      },
    },
    {
      say: 'Le squelette est prêt ! Regardez l\'Arbre : il montre la hiérarchie. Le torse est un enfant des hanches, et les bras et la tête sont des enfants du torse.',
      do: async (d) => {
        d.ctx.setTab('tree');
        const h = d.highlight('#tree', '', { place: 'left' });
        await d.at(4.5);
        await d.move(d.row('hanches', '#tree', 'bone'), 0.6);
        await d.at(6.5);
        await d.move(d.row('torse', '#tree', 'bone'), 0.6);
        await d.at(8.5);
        await d.move(d.row('bras_gauche', '#tree', 'bone'), 0.6);
        await d.move(d.row('tete', '#tree', 'bone'), 0.6);
        await d.at(11);
        h.remove();
      },
    },
    {
      say: 'On peut aussi renommer un os en double-cliquant sur son nom dans l\'Arbre.',
      do: async (d) => {
        await d.dblclick(d.row('tete', '#tree', 'bone'));
        const input = document.querySelector('#tree .tree-rename');
        await d.wait(0.3);
        input.value = '';
        for (const ch of 'tete') {
          input.value += ch;
          await d.wait(0.08);
        }
        await d.wait(0.2);
        await d.key('Entrée');
      },
    },
    {
      say: 'Un os raté ? Pas de panique : Ctrl+Z annule la dernière action. Pendant le geste, Échap l\'annule, et la touche Maj aligne l\'angle par pas de quinze degrés.',
      do: async (d) => {
        await d.drag([90, 360], [150, 420], { duration: 0.8 });
        await d.at(3);
        await d.key('Ctrl+Z');
        await d.at(6);
        d.showKeys('Échap', 1.4);
        await d.at(8.5);
        await d.holding('Maj', () => d.wait(1.6));
      },
    },
    {
      say: 'Testons la hiérarchie. Prenez l\'outil Rotation, touche R, et faites tourner le haut du bras : l\'avant-bras suit, car c\'est son enfant. Les images ne bougent pas encore : elles sont toujours sur l\'os racine. On les accrochera bientôt.',
      do: async (d) => {
        await d.at(3);
        await d.key('R');
        await d.at(5.5);
        const { a, b } = BONE.bras_gauche;
        await d.drag([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], [-100, 262], { duration: 1.4 });
        await d.at(10);
        await d.drag([-100, 262], [-80, 240], { duration: 1 });
        await d.at(15);
        await d.key('Ctrl+Z');
        await d.key('Ctrl+Z');
      },
    },
    outro('Bravo, Ama a un squelette ! À retenir : avec l\'outil Création, on glisse de l\'articulation vers le bout du membre. Commencer sur un os crée son enfant ; sinon, le nouvel os est l\'enfant de l\'os sélectionné. Et nommez toujours vos os. Dans la prochaine leçon, on apprend à organiser et à ajuster le squelette.'),
  ],
};

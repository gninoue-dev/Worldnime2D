import { intro, outro } from './common.js';
import { importAma, addAmaBones, AMA_SLOTS, workDir } from '../runtime/rig.js';
import { writeCharacter } from '../runtime/character.js';

const mid = (b) => [(b.worldX + b.tipX) / 2, (b.worldY + b.tipY) / 2];

// Accroche un slot à son os depuis les Propriétés : clic sur le slot dans l'Arbre, puis liste « Os ».
async function attach(d, slot, boneName, { quick = false } = {}) {
  await d.click(d.row(slot, '#tree', 'slot'), { duration: quick ? 0.4 : 0.6 });
  await d.choose(d.prop('Os'), boneName);
}

export default {
  id: '05-images',
  module: 3,
  title: 'Accrocher les images aux os',
  next: 'Transformer les os',
  goals: [
    'Comprendre les slots',
    'Accrocher chaque image à son os',
    'Ajouter une nouvelle image et l\'ajuster',
  ],
  recap: [
    'Os → slot → image : le slot est l\'emplacement de l\'image sur l\'os',
    'Glisser un slot sur un os dans l\'Arbre, ou choisir son Os dans les Propriétés',
    'Onglet Images : glisser une image sur la vue l\'accroche à l\'os sélectionné',
    'Image sélectionnée : les outils la décalent par rapport à son os',
  ],
  async setup(d) {
    await importAma(d);
    addAmaBones(d, { skip: ['echarpe*'] });
    // Une image de plus dans le dossier, pour la fin de la leçon.
    d.hat = (await writeCharacter(d.api, workDir(d, 'ama/images'), ['chapeau'])).chapeau;
    await d.ctx.library.reload();
    // Arbre plus lisible : chaque slot sur une seule ligne (pièces jointes repliées).
    for (const r of [...document.querySelectorAll('#tree .tree-row')]) {
      if (r.querySelector('.slot-icon') && r.querySelector('.twisty')?.textContent === '▾') {
        d.row(r.querySelector('.tree-label').textContent, '#tree', 'slot').querySelector('.twisty').click();
      }
    }
    d.editor.select(d.editor.skeleton.root);
    d.editor.setTool('select');
  },
  steps: [
    intro('Dans cette leçon, on accroche chaque image à son os, pour que le dessin suive enfin le squelette.'),
    {
      say: 'Pour l\'instant, si on fait tourner le bras, l\'os tourne… mais l\'image reste en place. Elle n\'est accrochée à rien, à part l\'os racine.',
      do: async (d) => {
        await d.at(2);
        await d.key('R');
        const b = d.editor.skeleton.findBone('bras_gauche');
        await d.drag(mid(b), [-100, 262], { duration: 1.2 });
        await d.wait(1);
        await d.key('Ctrl+Z');
        await d.key('V');
      },
    },
    {
      say: 'Rappel du principe. Chaque image est rangée dans un slot, un emplacement. Le slot est accroché à un os. Quand l\'os bouge, le slot suit, et l\'image avec lui. Un slot peut contenir plusieurs images, mais n\'en affiche qu\'une à la fois.',
      do: async (d) => {
        const c = d.card({
          kicker: 'Le principe',
          title: 'Os → slot → image',
          html: `<div style="display:flex; gap:26px; align-items:center; margin-top:40px; font-size:30px">
            <div style="padding:22px 30px; border-radius:12px; background:#2c3e50; border:2px solid #9fb3c8">🦴 Os<br><small style="font-size:18px; color:#9fb3c8">bouge</small></div>
            <div style="font-size:40px; color:#ffca28">→</div>
            <div style="padding:22px 30px; border-radius:12px; background:#2c3e50; border:2px solid #9fb3c8">▢ Slot<br><small style="font-size:18px; color:#9fb3c8">emplacement, ordre d'affichage</small></div>
            <div style="font-size:40px; color:#ffca28">→</div>
            <div style="padding:22px 30px; border-radius:12px; background:#2c3e50; border:2px solid #9fb3c8">🖼 Image<br><small style="font-size:18px; color:#9fb3c8">une visible à la fois</small></div></div>`,
        });
        await d.at(d.job.durations[d.stepIndex] - 0.3);
        await c.remove();
      },
    },
    {
      say: 'Première méthode : dans l\'Arbre, glissez le slot sur l\'os. Ici, le slot bassin, sur l\'os hanches. Le slot passe sous l\'os, et l\'image ne bouge pas d\'un pixel.',
      do: async (d) => {
        await d.at(3);
        await d.dragDrop(d.row('bassin', '#tree', 'slot'), d.row('hanches', '#tree', 'bone'), { duration: 1.4 });
        await d.at(8);
        d.row('bassin', '#tree', 'slot');
        const h = d.highlight(d.row('hanches', '#tree', 'bone'), '', { place: 'left' });
        await d.at(11);
        h.remove();
      },
    },
    {
      say: 'Deuxième méthode, plus pratique quand l\'Arbre est long : cliquez sur le slot, puis choisissez son os dans la liste Os des Propriétés. La tête va sur l\'os tête, et les yeux et la bouche aussi, pour suivre la tête.',
      do: async (d) => {
        await d.at(3.5);
        await attach(d, 'tete', 'tete');
        await attach(d, 'yeux_ouverts', 'tete');
        await attach(d, 'bouche_sourire', 'tete');
      },
    },
    {
      say: 'On continue avec le torse, puis chaque morceau des bras et des jambes, chacun sur l\'os du même nom.',
      do: async (d) => {
        await attach(d, 'torse', 'torse', { quick: true });
        for (const s of ['bras_gauche', 'avant_bras_gauche', 'bras_droit', 'avant_bras_droit']) await attach(d, s, AMA_SLOTS[s], { quick: true });
      },
    },
    {
      say: 'Et les jambes. L\'ombre, elle, reste sur l\'os racine : elle ne doit pas bouger avec le corps. Quant à l\'écharpe, on lui donnera ses propres os plus tard ; pour l\'instant, elle suit le torse.',
      do: async (d) => {
        for (const s of ['cuisse_gauche', 'jambe_gauche', 'cuisse_droite', 'jambe_droite']) await attach(d, s, AMA_SLOTS[s], { quick: true });
        await attach(d, 'echarpe', 'torse', { quick: true });
      },
    },
    {
      say: 'Testons ! Outil Rotation : le bras entraîne maintenant son image, et l\'avant-bras suit. Avec l\'outil Déplacement, on bouge les hanches… et tout le corps suit, sauf l\'ombre.',
      do: async (d) => {
        await d.at(1.5);
        await d.key('R');
        const sk = d.editor.skeleton;
        await d.drag(mid(sk.findBone('bras_gauche')), [-100, 262], { duration: 1.2 });
        await d.drag(mid(sk.findBone('avant_bras_gauche')), [-120, 200], { duration: 1 });
        await d.at(7.5);
        await d.key('T');
        await d.drag(mid(sk.findBone('hanches')), [30, 175], { duration: 1.2 });
        await d.wait(1.2);
        for (let i = 0; i < 3; i++) await d.key('Ctrl+Z');
        await d.key('V');
      },
    },
    {
      say: 'Pour ajouter une nouvelle image, comme ce chapeau, sélectionnez d\'abord l\'os qui doit la porter : la tête. Ouvrez l\'onglet Images, et glissez le chapeau sur la vue, à l\'endroit voulu. Un nouveau slot est créé sur l\'os sélectionné.',
      do: async (d) => {
        const sk = d.editor.skeleton;
        await d.at(5);
        await d.click(mid(sk.findBone('tete')));
        await d.at(7.5);
        await d.click('.tab[data-tab="images"]');
        await d.at(10);
        const cell = [...document.querySelectorAll('#images .image-cell')].find((c) => c.textContent.trim() === 'chapeau');
        cell.scrollIntoView({ block: 'nearest' });
        await d.dragDrop(cell, [d.hat.cx, d.hat.cy + 22], { duration: 1.4 });
        await d.wait(0.5);
        d.ctx.setTab('tree');
      },
    },
    {
      say: 'L\'image est sélectionnée. Les outils agissent alors sur elle, et non sur l\'os : on peut la décaler, la tourner ou la redimensionner par rapport à son os. Décalons un peu le chapeau, puis penchons-le, au chiffre près, avec sa Rotation dans les Propriétés.',
      do: async (d) => {
        await d.at(4);
        await d.key('T');
        await d.drag([d.hat.cx, d.hat.cy + 22], [d.hat.cx + 6, d.hat.cy + 25], { duration: 0.8 });
        await d.at(10);
        const rot = d.prop('Rotation');
        await d.type(rot, String(Math.round(Number(rot.value) - 10)));
      },
    },
    {
      say: 'Et faisons tourner la tête : le chapeau suit, puisqu\'il est accroché à l\'os de la tête. Astuce : un double-clic sur une image de l\'onglet Images l\'accroche aussi à l\'os sélectionné.',
      do: async (d) => {
        const sk = d.editor.skeleton;
        await d.key('R');
        await d.drag(mid(sk.findBone('tete')), [-30, 370], { duration: 1.2 });
        await d.wait(1.5);
        await d.key('Ctrl+Z');
        await d.key('V');
      },
    },
    outro('Bravo, Ama est entièrement montée ! À retenir : un os porte des slots, et chaque slot affiche une image. Glissez un slot sur un os dans l\'Arbre, ou choisissez son os dans les Propriétés. Pour une nouvelle image, sélectionnez l\'os, puis glissez l\'image depuis l\'onglet Images. Dans la prochaine leçon, on maîtrise les outils de transformation.'),
  ],
};

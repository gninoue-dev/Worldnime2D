import { intro, outro } from './common.js';
import { prepareAma, rotateTo } from '../runtime/rig.js';

const bone = (d, name) => d.editor.skeleton.findBone(name);
const mid = (b) => [(b.worldX + b.tipX) / 2, (b.worldY + b.tipY) / 2];
const end = (d) => d.job.durations[d.stepIndex];

// Point (ou poignée) n du chemin, en coordonnées du monde (le chemin est sur l'os racine).
function pathPoint(d, slotName, n) {
  const sk = d.editor.skeleton;
  const slot = sk.findSlot(slotName);
  const p = sk.getAttachment(slot, slotName).vertices[n];
  const w = slot.bone.localToWorld(p[0], p[1]);
  return [w.x, w.y];
}

export default {
  id: '16-transformation-chemin',
  module: 6,
  title: 'Contraintes de transformation et de chemin',
  next: 'La physique : ressorts et inertie',
  goals: [
    'Faire copier à un os la rotation, la position ou l\'échelle d\'un autre',
    'Faire suivre une courbe à une chaîne d\'os',
  ],
  recap: [
    'Transformation : un os copie un autre os, dosé par les curseurs de mélange',
    'Relatif : l\'os garde sa pose et ajoute les changements de la cible',
    'Chemin : une courbe de Bézier, ses points et ses poignées se glissent dans la vue',
    'Position et espacement placent la chaîne le long du chemin, et s\'animent',
  ],
  async setup(d) {
    await prepareAma(d);
    d.editor.setTool('select');
  },
  steps: [
    intro('Dans cette leçon, on découvre deux autres contraintes : la transformation, pour lier deux os, et le chemin, pour suivre une courbe.'),
    {
      say: 'Contrainte de transformation : un os copie la rotation, la position, l\'échelle ou le cisaillement d\'un autre os. Exemple : faisons bouger les deux bras ensemble. Sélectionnez le bras droit, et cliquez sur « Contrainte de transformation ».',
      do: async (d) => {
        await d.at(8);
        await d.click(mid(bone(d, 'bras_droit')));
        await d.at(10.5);
        await d.click(d.propButton('＋ Contrainte de transformation'));
      },
    },
    {
      say: 'Choisissez la Cible : le bras gauche. Les curseurs de mélange sont à zéro : rien ne bouge encore. Montez le mélange de Rotation à cent pour cent : le bras droit prend l\'orientation du bras gauche.',
      do: async (d) => {
        await d.at(1);
        await d.choose(d.prop('Cible'), 'bras_gauche');
        await d.at(4.5);
        const rows = ['Rotation', 'X', 'Y', 'Échelle X', 'Échelle Y', 'Cisaillement Y'].map((l) => d.prop(l).closest('.prop-row'));
        const hs = rows.map((r) => d.highlight(r, '', { place: 'left', pad: 1 }));
        await d.at(8);
        hs.forEach((h) => h.remove());
        await d.slide(d.prop('Rotation'), 1, { duration: 1.3 });
      },
    },
    {
      say: 'Cochez Relatif : le bras droit garde sa propre pose, et ajoute seulement les changements du bras gauche. Faites tourner le bras gauche : le bras droit l\'accompagne. Les décalages, plus bas, ajoutent un écart fixe.',
      do: async (d) => {
        await d.at(1);
        await d.click(d.prop('Relatif'));
        await d.at(4.5);
        await d.key('R');
        await rotateTo(d, 'bras_gauche', -150, { duration: 1.3 });
        await d.wait(0.4);
        await rotateTo(d, 'bras_gauche', -60, { duration: 1.3 });
        await d.wait(0.6);
        await d.key('Ctrl+Z');
        await d.key('Ctrl+Z');
        await d.key('V');
      },
    },
    {
      say: 'On s\'en sert pour des mouvements mécaniques, des engrenages, des roues, ou pour qu\'un objet suive une main sans en être l\'enfant. Supprimons cette contrainte, avec son bouton en bas des Propriétés.',
      do: async (d) => {
        await d.at(6);
        await d.click(d.row('bras_droit_transform'));
        await d.at(8);
        await d.click(d.propButton('✕ Supprimer la contrainte'));
      },
    },
    {
      say: 'Passons au chemin. Une contrainte de chemin place une chaîne d\'os le long d\'une courbe. Sélectionnez le premier os de l\'écharpe, et cliquez sur « Contrainte de chemin ». Un chemin est créé, une courbe à trois points, et l\'écharpe s\'aligne dessus.',
      do: async (d) => {
        await d.at(6);
        await d.click(mid(bone(d, 'echarpe')));
        await d.at(9.5);
        await d.click(d.propButton('＋ Contrainte de chemin'));
        await d.wheel(mid(bone(d, 'echarpe')), 3);
      },
    },
    {
      say: 'Pour modifier la courbe, sélectionnez le chemin dans l\'Arbre : ses points et ses poignées apparaissent. Glissez le dernier point : l\'écharpe le suit. Glissez une poignée : la courbe s\'arrondit, et l\'écharpe avec elle.',
      do: async (d) => {
        await d.at(2);
        await d.click(d.row('echarpe_chemin', '#tree', 'att'));
        await d.at(6.5);
        let p = pathPoint(d, 'echarpe_chemin', 7);
        await d.drag(p, [p[0] + 40, p[1] + 10], { duration: 1.3 });
        await d.at(10.5);
        p = pathPoint(d, 'echarpe_chemin', 5);
        await d.drag(p, [p[0] + 30, p[1] + 25], { duration: 1.3 });
      },
    },
    {
      say: 'Sélectionnez la contrainte. Position fait glisser la chaîne le long du chemin, et Espacement règle l\'écart entre les os. Ces valeurs s\'animent : un serpent qui avance, un train sur ses rails, un texte qui suit une courbe.',
      do: async (d) => {
        await d.at(1);
        await d.click(d.row('echarpe_path'));
        await d.at(3);
        await d.type(d.prop('Position', 1), '0.3');
        await d.wait(0.8);
        await d.type(d.prop('Position', 1), '0');
        await d.at(7);
        const h = d.highlight(d.prop('Espacement', 1).closest('.prop-row'), '', { place: 'left' });
        await d.at(10);
        h.remove();
      },
    },
    {
      say: 'La liste Rotation décide comment les os s\'orientent : selon la tangente de la courbe, ou en chaîne. Et les curseurs de mélange dosent l\'effet, comme pour les autres contraintes.',
      do: async (d) => {
        await d.at(0.5);
        const h = d.highlight(d.prop('Rotation').closest('.prop-row'), '', { place: 'left' });
        await d.at(6);
        h.remove();
        await d.slide(d.prop('Mélange rot.'), 0.3, { duration: 1 });
        await d.wait(0.4);
        await d.slide(d.prop('Mélange rot.'), 1, { duration: 0.8 });
        await d.key('F');
      },
    },
    outro('Bravo ! À retenir : la contrainte de transformation fait copier à un os les mouvements d\'un autre, dosés par les mélanges ; cochez Relatif pour garder sa pose. La contrainte de chemin aligne une chaîne d\'os sur une courbe, qu\'on modifie dans la vue, et Position fait glisser la chaîne. Dans la prochaine leçon, on donne de la vie aux os avec la physique.'),
  ],
};

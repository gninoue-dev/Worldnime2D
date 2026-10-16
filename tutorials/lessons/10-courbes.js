import { intro, outro } from './common.js';
import { prepareAma, setKeys } from '../runtime/rig.js';

const end = (d) => d.job.durations[d.stepIndex];

// Point écran d'une clé (ou d'une poignée) dans l'éditeur de courbes.
function graphPoint(d, label, keyIndex, handle = null) {
  const t = d.ctx.timeline;
  t.draw();
  const g = t.graph;
  const c = g.lastChannels.find((x) => x.label.endsWith(label));
  if (!c) throw new Error(`Courbe introuvable : ${label}`);
  const r = t.canvas.getBoundingClientRect();
  if (handle != null) {
    const h = g.handles(c, keyIndex)[handle];
    return { x: r.left + h.x, y: r.top + h.y };
  }
  const k = c.keys[keyIndex];
  return { x: r.left + g.timeToX(k.time), y: r.top + g.valueToY(k[c.field]) };
}

// Point écran d'une valeur (à l'instant donné, en images) dans l'éditeur de courbes.
function graphValue(d, frame, value) {
  const t = d.ctx.timeline;
  t.draw();
  const r = t.canvas.getBoundingClientRect();
  return { x: r.left + t.frameToX(frame), y: r.top + t.graph.valueToY(value) };
}

async function play(d, sec) {
  d.editor.setTime(0);
  await d.key('P');
  await d.wait(sec);
  await d.key('P');
}

export default {
  id: '10-courbes',
  module: 4,
  title: 'Les courbes d\'animation',
  next: 'Changer d\'image, de couleur, et les événements',
  goals: [
    'Comprendre l\'interpolation entre deux clés',
    'Les courbes toutes prêtes : accélération, ralentissement, palier…',
    'L\'éditeur de courbes et ses poignées',
  ],
  recap: [
    'Losange = linéaire · rond = courbe de Bézier · carré = palier',
    'La liste Courbe applique un préréglage aux clés sélectionnées',
    'G : éditeur de courbes — pente forte = rapide, pente douce = lent',
    'Glisser une poignée façonne la courbe ; glisser une clé change sa valeur',
  ],
  async setup(d) {
    await prepareAma(d);
    const ed = d.editor;
    ed.setMode('animate');
    ed.apply(() => ed.skeleton.renameAnimation(ed.animation, 'saut'));
    ed.animationName = 'saut';
    setKeys(d, 'hanches', 'translate', [[0, [0, 0]], [12, [0, 80]], [24, [0, 0]]]);
    setKeys(d, 'bras_gauche', 'rotate', [[0, 0], [12, -55], [24, 0]]);
    setKeys(d, 'bras_droit', 'rotate', [[0, 0], [12, 55], [24, 0]]);
    ed.setTime(0);
    ed.refreshPose();
    ed.select(ed.skeleton.findBone('hanches'));
    ed.setTool('select');
    d.viewport.frameAll();
    d.viewport.zoomAt(d.viewport.width / 2, d.viewport.height / 2, 0.85);
  },
  steps: [
    intro('Dans cette leçon, on découvre les courbes d\'animation, qui donnent du poids et du caractère aux mouvements.'),
    {
      say: 'Voici un saut tout simple : trois clés sur les hanches. En bas, en haut, puis en bas. Regardez : le mouvement est raide, comme un robot. Ama monte et descend à vitesse constante.',
      do: async (d) => {
        await d.at(2);
        await play(d, end(d) - 2);
      },
    },
    {
      say: 'Entre deux clés, Worldnime2D calcule les images intermédiaires : c\'est l\'interpolation. Par défaut, elle est linéaire, le losange. Avec la pelure d\'oignon, on voit des écarts tous égaux : aucune accélération.',
      do: async (d) => {
        await d.at(4);
        const h = d.note(d.tl(0, 'hanches'), 'linéaire');
        await d.at(8);
        h.remove();
        d.editor.setTime(6 / d.editor.fps);
        await d.click(d.ctx.timeline.onionBtn);
      },
    },
    {
      say: 'Dans la réalité, on part vite, et on ralentit en montant. Sélectionnez la clé de départ, et choisissez la courbe Ralentissement. La clé devient un rond : c\'est une courbe de Bézier.',
      do: async (d) => {
        await d.at(4);
        await d.click(d.tl(0, 'hanches'));
        await d.at(6);
        await d.choose(d.ctx.timeline.curveSelect, 'easeOut');
        d.editor.setTime(6 / d.editor.fps);
      },
    },
    {
      say: 'Au sommet, on redescend en accélérant. Sélectionnez la clé du haut, et choisissez Accélération. La pelure d\'oignon le montre : les écarts se resserrent près du sommet.',
      do: async (d) => {
        await d.at(3);
        await d.click(d.tl(12, 'hanches'));
        await d.choose(d.ctx.timeline.curveSelect, 'easeIn');
        d.editor.setTime(16 / d.editor.fps);
        await d.at(end(d) - 0.5);
        await d.click(d.ctx.timeline.onionBtn);
      },
    },
    {
      say: 'Faisons de même pour les bras. Et relançons : le saut a enfin du poids !',
      do: async (d) => {
        const a = d.tl(3, 'bras_gauche');
        const b = d.tl(-0.7, 'bras_droit');
        await d.drag({ x: a.x, y: a.y - 8 }, { x: b.x, y: b.y + 8 }, { duration: 0.8 });
        await d.choose(d.ctx.timeline.curveSelect, 'easeOut');
        await play(d, end(d) + 2);
      },
    },
    {
      say: 'Autre courbe : le Palier, le carré. La valeur ne change pas jusqu\'à la clé suivante, puis saute d\'un coup. On s\'en sert pour les changements d\'image, ou pour un style saccadé, image par image.',
      do: async (d) => {
        await d.at(2);
        await d.click(d.tl(0, 'hanches'));
        await d.choose(d.ctx.timeline.curveSelect, 'stepped');
        await d.at(6.5);
        await play(d, 2.4);
        await d.key('Ctrl+Z');
      },
    },
    {
      say: 'Pour aller plus loin, ouvrez l\'éditeur de courbes : touche G, ou le bouton Courbes. Il trace la valeur de chaque canal de l\'os sélectionné dans le temps. Ici, la position Y des hanches : la bosse du saut.',
      do: async (d) => {
        await d.click(d.tl(28, 'hanches'));
        await d.at(3);
        await d.key('G');
        await d.at(9);
        const p = graphPoint(d, 'Position Y', 1);
        const n = d.note(p, 'Position Y');
        await d.at(end(d) - 0.3);
        n.remove();
      },
    },
    {
      say: 'Lisez la pente : là où la courbe est raide, le mouvement est rapide ; là où elle est plate, il est lent. Au sommet, la courbe s\'aplatit : Ama flotte un instant en l\'air.',
      do: async (d) => {
        await d.at(1);
        const a = graphPoint(d, 'Position Y', 0);
        const top = graphPoint(d, 'Position Y', 1);
        await d.move({ x: a.x + (top.x - a.x) * 0.15, y: a.y + (top.y - a.y) * 0.45 }, 0.8);
        const n1 = d.note(d.pos, 'raide = rapide');
        await d.at(6);
        await d.move({ x: top.x - 6, y: top.y + 6 }, 0.8);
        const n2 = d.note(d.pos, 'plat = lent');
        await d.at(end(d) - 0.3);
        n1.remove();
        n2.remove();
      },
    },
    {
      say: 'Cliquez sur une clé : ses poignées apparaissent. Glissez une poignée pour façonner la courbe à la main. Ici, on rend le départ encore plus explosif.',
      do: async (d) => {
        await d.at(1.5);
        await d.click(graphPoint(d, 'Position Y', 0));
        await d.at(5);
        const h = graphPoint(d, 'Position Y', 0, 0);
        // Poignée montée aux deux tiers de la hauteur du saut, sans dépasser le sommet.
        await d.drag(h, graphValue(d, 1, 55), { duration: 1.3 });
      },
    },
    {
      say: 'On peut aussi glisser une clé vers le haut ou le bas, pour changer sa valeur. Montons la clé du sommet : Ama saute plus haut. Avec Alt, on la déplacerait dans le temps.',
      do: async (d) => {
        await d.at(3.5);
        const p = graphPoint(d, 'Position Y', 1);
        await d.drag(p, { x: p.x, y: graphValue(d, 12, 110).y }, { duration: 1.1 });
        await d.at(end(d) - 1);
        await play(d, 1.8);
      },
    },
    {
      say: 'Deux préréglages amusants pour finir, sur la clé de départ. Dépassement : la valeur va trop loin, puis revient, comme un ressort. Et Anticipation : un petit recul avant de partir, comme quand on plie les genoux avant de sauter. Testez-les sur vos animations !',
      do: async (d) => {
        await d.at(1.5);
        await d.click(graphPoint(d, 'Position Y', 0));
        await d.choose(d.ctx.timeline.curveSelect, 'overshoot');
        await d.at(9);
        await d.choose(d.ctx.timeline.curveSelect, 'anticipation');
        await d.at(end(d) - 1.2);
        await d.key('Ctrl+Z');
        await d.key('Ctrl+Z');
        await d.key('G');
      },
    },
    outro('Bravo ! À retenir : entre deux clés, la courbe décide du rythme. Le losange est linéaire, le rond est une courbe de Bézier, le carré un palier. La liste Courbe propose des préréglages, et la touche G ouvre l\'éditeur de courbes, où l\'on façonne les poignées à la main. Dans la prochaine leçon, on anime les images, les couleurs, et on pose des événements.'),
  ],
};

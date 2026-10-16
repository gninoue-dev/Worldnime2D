import { intro, outro } from './common.js';
import { prepareFlag, meshVerts } from '../runtime/rig.js';

const end = (d) => d.job.durations[d.stepIndex];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const shift = (p, dx, dy) => [p[0] + dx, p[1] + dy];

export default {
  id: '12-maillage',
  module: 5,
  title: 'Créer un maillage',
  next: 'Les poids : lier un maillage aux os',
  goals: [
    'Comprendre la différence entre une image simple et un maillage',
    'Convertir une image en maillage et modifier ses sommets',
    'Le contour automatique et la grille de points',
  ],
  recap: [
    'Un maillage découpe l\'image en triangles : elle peut se déformer',
    'Image sélectionnée › Convertir en maillage, puis ✎ Modifier le maillage',
    'Clic sur le contour ou dans l\'image : nouveau sommet · Alt+clic : supprimer',
    'Le rayon doux entraîne les sommets voisins',
    'Contour automatique : un contour qui suit le dessin',
  ],
  async setup(d) {
    const { placed } = await prepareFlag(d, { chain: false, extra: ['chapeau'] });
    // Le foulard, à droite du mât : pour le contour automatique.
    d.ctx.actions.attachImage('chapeau', d.editor.skeleton.root, null, { x: 190, y: 330 });
    d.hat = { x: 190, y: 330, w: placed.chapeau.width };
    d.editor.select(d.editor.skeleton.root);
    d.viewport.frameAll();
    d.editor.setTool('select');
  },
  steps: [
    intro('Dans ce module, on apprend à déformer les images, grâce aux maillages. Notre modèle : un drapeau accroché à son mât.'),
    {
      say: 'Jusqu\'ici, chaque image était un rectangle rigide : on peut le tourner ou l\'étirer, mais pas le plier. Un maillage découpe l\'image en triangles. Quand on déplace leurs sommets, l\'image se déforme avec eux : idéal pour un drapeau, une cape, des cheveux, ou un visage.',
      do: async (d) => {
        const c = d.card({
          kicker: 'Le principe',
          title: 'Image simple ou maillage ?',
          html: `<div style="display:flex; gap:80px; align-items:center; margin-top:34px; font-size:24px">
            <div style="text-align:center"><svg width="220" height="150" viewBox="0 0 220 150">
              <rect x="20" y="20" width="180" height="110" fill="#f08a24" stroke="#fff" stroke-width="3"/></svg>
              <br>Image simple<br><small style="font-size:18px; color:#9fb3c8">4 coins, toujours un rectangle</small></div>
            <div style="text-align:center"><svg width="220" height="150" viewBox="0 0 220 150">
              <path d="M20 20 Q110 0 200 30 L200 140 Q110 110 20 130 Z" fill="#f08a24" stroke="#fff" stroke-width="3"/>
              <g stroke="#fff" stroke-width="1.5" fill="none" opacity=".85">
              <path d="M80 12 L80 120 M140 14 L140 122 M20 75 Q110 55 200 85 M20 20 L80 66 L140 70 L200 30 M20 130 L80 66 M140 70 L200 140"/></g>
              <g fill="#ffca28">${[[20, 20], [80, 12], [140, 14], [200, 30], [200, 140], [140, 122], [80, 120], [20, 130], [80, 66], [140, 70]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5"/>`).join('')}</g></svg>
              <br>Maillage<br><small style="font-size:18px; color:#9fb3c8">des sommets, des triangles : il se plie</small></div></div>`,
        });
        await d.at(end(d) - 0.3);
        await c.remove();
      },
    },
    {
      say: 'Cliquez sur le drapeau pour sélectionner son image. Dans les Propriétés, cliquez sur Convertir en maillage. Rien ne change à l\'écran : pour l\'instant, le maillage n\'a que quatre sommets, les quatre coins.',
      do: async (d) => {
        await d.at(1);
        await d.click([-100, 420]);
        await d.at(5);
        await d.click(d.propButton('▦ Convertir en maillage'));
        await d.at(end(d) - 3);
        const h = d.highlight(document.querySelector('#props .world-info'), '', { place: 'left' });
        await d.at(end(d) - 0.3);
        h.remove();
      },
    },
    {
      say: 'Cliquez sur Modifier le maillage. Les sommets apparaissent, en jaune, reliés par les arêtes des triangles. Glissez un coin : l\'image se déforme pour le suivre. Ctrl+Z pour revenir.',
      do: async (d) => {
        await d.at(0.5);
        await d.click(d.propButton('✎ Modifier le maillage'));
        await d.at(6);
        const tl = meshVerts(d, 'drapeau')[3];
        await d.drag(tl, shift(tl, -30, 40), { duration: 1.4 });
        await d.at(end(d) - 1);
        await d.key('Ctrl+Z');
      },
    },
    {
      say: 'Pour ajouter des sommets, cliquez sur une arête du contour : un sommet de contour. Cliquez à l\'intérieur de l\'image : un sommet intérieur. Les triangles sont recalculés tout seuls. Et Alt plus clic sur un sommet le supprime.',
      do: async (d) => {
        await d.at(3);
        let v = meshVerts(d, 'drapeau');
        await d.click(lerp(v[0], v[1], 0.5));
        await d.wait(0.3);
        v = meshVerts(d, 'drapeau');
        await d.click(lerp(v[2], v[3], 0.5));
        await d.at(6.5);
        v = meshVerts(d, 'drapeau');
        await d.click(lerp(lerp(v[0], v[2], 0.5), v[3], 0.15));
        await d.at(end(d) - 2.5);
        const last = meshVerts(d, 'drapeau').at(-1);
        await d.holding('Alt', () => d.click(last, { mods: { alt: true } }));
      },
    },
    {
      say: 'Pour un drapeau qui ondule, il faut beaucoup de sommets bien répartis. Le bouton « Ajouter des points intérieurs » pose une grille régulière. Attention : plus il y a de sommets, plus le calcul est lourd pour le jeu. Gardez juste ce qu\'il faut.',
      do: async (d) => {
        await d.at(2);
        await d.click(d.propButton('Ajouter des points intérieurs'));
        await d.at(6);
        const h = d.highlight(document.querySelector('#props .world-info'), '', { place: 'left' });
        await d.at(9.5);
        h.remove();
      },
    },
    {
      say: 'Le Rayon doux entraîne aussi les sommets voisins, de moins en moins avec la distance. Mettez-le à quatre-vingts, et glissez un sommet : toute une zone se courbe en douceur, sans faire de pointe.',
      do: async (d) => {
        await d.at(3);
        await d.type(d.prop('Rayon doux'), '80');
        await d.at(6.5);
        const v = meshVerts(d, 'drapeau');
        // Sommet du bord libre (à gauche), au milieu.
        const left = v.reduce((a, b) => (Math.abs(b[0] - -150) + Math.abs(b[1] - 372) < Math.abs(a[0] - -150) + Math.abs(a[1] - 372) ? b : a));
        await d.drag(left, shift(left, 10, -35), { duration: 1.4 });
        await d.at(end(d) - 0.8);
        await d.key('Ctrl+Z');
        await d.type(d.prop('Rayon doux'), '0');
      },
    },
    {
      say: 'Pour une image découpée, comme ce foulard, le contour automatique est plus pratique. Sélectionnez son image, convertissez-la en maillage, et cliquez sur Contour automatique.',
      do: async (d) => {
        await d.key('Échap');
        await d.at(2.5);
        await d.click([d.hat.x, d.hat.y]);
        await d.at(6);
        await d.click(d.propButton('▦ Convertir en maillage'));
        await d.click(d.propButton('✎ Modifier le maillage'));
        await d.at(end(d) - 1.6);
        await d.click(d.propButton('Contour automatique'));
      },
    },
    {
      say: 'Le contour suit maintenant la forme du dessin, d\'après sa transparence. Résultat : moins de pixels transparents à dessiner, et une déformation qui colle au foulard. On peut ensuite ajouter des points intérieurs, comme pour le drapeau.',
      do: async (d) => {
        await d.wheel([d.hat.x, d.hat.y], 3);
        await d.at(9);
        await d.click(d.propButton('Ajouter des points intérieurs'));
        await d.at(end(d) - 0.4);
        await d.key('F');
      },
    },
    {
      say: 'Sachez enfin que « Revenir au rectangle » efface tous les sommets, et que « Revenir à une image simple » annule la conversion. Appuyez sur Échap, ou recliquez sur Modifier le maillage, pour quitter ce mode.',
      do: async (d) => {
        await d.at(1);
        let h = d.highlight(d.propButton('Revenir au rectangle'), '', { place: 'left' });
        await d.at(4);
        h.remove();
        h = d.highlight(d.propButton('Revenir à une image simple'), '', { place: 'left' });
        await d.at(8);
        h.remove();
        await d.key('Échap');
      },
    },
    outro('Bravo ! À retenir : un maillage découpe une image en triangles, pour qu\'elle puisse se déformer. Convertissez l\'image, puis modifiez le maillage : clic pour ajouter un sommet, Alt plus clic pour le supprimer. Le rayon doux entraîne les voisins, et le contour automatique suit le dessin. Dans la prochaine leçon, on lie le drapeau à des os, avec les poids.'),
  ],
};

import { intro, outro } from './common.js';
import { prepareFlag, rotateTo, meshVerts } from '../runtime/rig.js';

const end = (d) => d.job.durations[d.stepIndex];

// Ondulation : chaque os du drapeau tourne un peu, en alternance.
async function wave(d, angles, duration = 0.9) {
  for (const [name, deg] of angles) await rotateTo(d, name, deg, { duration });
}

export default {
  id: '13-poids',
  module: 5,
  title: 'Les poids : lier un maillage aux os',
  next: 'Déformation libre et maillages liés',
  goals: [
    'Lier un maillage à plusieurs os',
    'Les poids automatiques',
    'Peindre, lisser et élaguer les poids',
  ],
  recap: [
    'Chaque sommet suit un mélange d\'os : ce sont ses poids',
    'Poids › cocher les os, puis « Lier aux os cochés »',
    'Pinceau : choisir l\'os, peindre (Alt : retirer), régler rayon et force',
    'Lisser adoucit les transitions ; Élaguer retire les petites influences',
  ],
  async setup(d) {
    await prepareFlag(d, { mesh: true });
    d.editor.setTool('select');
  },
  steps: [
    intro('Dans cette leçon, on lie le maillage du drapeau à une chaîne d\'os, pour le faire onduler avec les poids.'),
    {
      say: 'Le drapeau est déjà un maillage, avec une grille de sommets. Le long du drapeau, on a ajouté trois os, de drapeau un à drapeau trois. Mais si on les fait tourner, rien ne se passe : le maillage ne suit que l\'os du mât.',
      do: async (d) => {
        await d.at(5);
        const h = d.note([-60, 372], 'drapeau1 → drapeau3');
        await d.at(9);
        h.remove();
        await d.key('R');
        await rotateTo(d, 'drapeau2', 160, { duration: 1.2 });
        await d.wait(1);
        await d.key('Ctrl+Z');
        await d.key('V');
      },
    },
    {
      say: 'Il faut lier les sommets aux os, avec des poids. Un poids dit combien un os entraîne un sommet : cent pour cent, il le suit entièrement ; cinquante pour cent, il se partage entre deux os. C\'est ce qui permet les courbes douces.',
      do: async (d) => {
        const c = d.card({
          kicker: 'Le principe',
          title: 'Les poids',
          html: `<div style="display:flex; gap:40px; align-items:flex-end; margin-top:40px; font-size:22px">
            ${[['100 % mât', '#ef5350'], ['50 % / 50 %', '#ffa726'], ['100 % drapeau3', '#42a5f5']].map(([t, col]) => `<div style="text-align:center">
              <div style="width:150px; height:90px; border-radius:10px; background:${col}; opacity:.9"></div><br>${t}</div>`).join('')}</div>
            <p class="sub" style="margin-top:30px">Chaque sommet a une liste d'os et de poids, dont la somme fait 100 %.</p>`,
        });
        await d.at(end(d) - 0.3);
        await c.remove();
      },
    },
    {
      say: 'Sélectionnez l\'image du drapeau. Dans la section Poids, cochez les os à lier : le mât, et les trois os du drapeau. Puis cliquez sur Lier aux os cochés. Les poids sont calculés automatiquement, selon la distance de chaque sommet aux os.',
      do: async (d) => {
        await d.at(1);
        await d.click([-120, 420]);
        await d.at(4);
        for (const name of ['drapeau1', 'drapeau2', 'drapeau3']) {
          const box = [...document.querySelectorAll('#props .checklist input')].find((b) => b.value === name);
          box.scrollIntoView({ block: 'nearest' });
          await d.check(box);
        }
        await d.at(11);
        await d.click(d.propButton('Lier aux os cochés'));
      },
    },
    {
      say: 'Testons, avec l\'outil Rotation. Tournons les os du drapeau, chacun un peu : le tissu ondule en douceur. Bien mieux qu\'une image rigide !',
      do: async (d) => {
        await d.key('R');
        await d.at(3);
        await wave(d, [['drapeau1', 170], ['drapeau2', 200], ['drapeau3', 160]]);
        await d.wait(1.2);
        for (let i = 0; i < 3; i++) await d.key('Ctrl+Z');
      },
    },
    {
      say: 'Pour voir les poids, sélectionnez à nouveau l\'image, choisissez l\'os à peindre, drapeau trois, et cliquez sur Peindre les poids. Chaque sommet prend une couleur : rouge, il suit beaucoup cet os ; bleu, pas du tout.',
      do: async (d) => {
        await d.key('V');
        await d.click([-120, 420]);
        await d.at(4.5);
        await d.choose(d.prop('Os à peindre'), 'drapeau3');
        await d.at(7);
        await d.click(d.propButton('🖌 Peindre les poids'));
        await d.wheel([-60, 372], 3);
      },
    },
    {
      say: 'Peignez sur les sommets pour augmenter l\'influence de l\'os choisi. Le rayon du pinceau et sa force se règlent dans les Propriétés. Avec Alt, le pinceau retire du poids au lieu d\'en ajouter.',
      do: async (d) => {
        await d.at(1);
        const v = meshVerts(d, 'drapeau').filter(([x]) => x < -90 && x > -125);
        const top = v.reduce((a, b) => (b[1] > a[1] ? b : a));
        const bottom = v.reduce((a, b) => (b[1] < a[1] ? b : a));
        await d.drag(top, bottom, { duration: 1.6, path: [bottom, top, bottom] });
        await d.at(5.5);
        const r = d.highlight(d.prop('Rayon pinceau').closest('.prop-row'), '', { place: 'left' });
        const f = d.highlight(d.prop('Force').closest('.prop-row'), '', { place: 'left' });
        await d.at(9);
        r.remove();
        f.remove();
        await d.holding('Alt', () => d.drag(top, bottom, { mods: { alt: true }, duration: 1.2 }));
      },
    },
    {
      say: 'Après avoir peint, les transitions peuvent être brusques. Le bouton Lisser les poids les adoucit. Élaguer retire les très petites influences, inutiles et coûteuses. Et la liste Os max par sommet limite le nombre d\'os qui agissent sur chaque sommet.',
      do: async (d) => {
        await d.at(3.5);
        await d.click(d.propButton('Lisser les poids'));
        await d.at(6.5);
        await d.click(d.propButton('Élaguer'));
        await d.at(10.5);
        const h = d.highlight(d.prop('Os max / sommet').closest('.prop-row'), '', { place: 'left' });
        await d.at(end(d) - 0.2);
        h.remove();
      },
    },
    {
      say: 'Quittez le pinceau, avec Échap, et vérifiez le résultat en faisant onduler le drapeau. Si une zone se plie mal, retournez peindre : on fait souvent plusieurs allers-retours.',
      do: async (d) => {
        await d.key('Échap');
        await d.key('F');
        await d.key('R');
        await d.at(3.5);
        await wave(d, [['drapeau1', 190], ['drapeau2', 160], ['drapeau3', 200]]);
        await d.wait(1);
        for (let i = 0; i < 3; i++) await d.key('Ctrl+Z');
        await d.key('V');
      },
    },
    {
      say: 'Bon à savoir : un maillage lié à des os ne se modifie plus à la main dans la vue, ce sont les os qui le déplacent. Pour retoucher ses sommets, utilisez Modifier le maillage : les poids des nouveaux sommets sont mélangés à ceux de leurs voisins.',
      do: async (d) => {
        await d.at(1);
        await d.click([-120, 420]);
        await d.at(9);
        const h = d.highlight(d.propButton('✎ Modifier le maillage'), '', { place: 'left' });
        await d.at(end(d) - 0.2);
        h.remove();
      },
    },
    outro('Bravo ! À retenir : les poids disent combien chaque os entraîne chaque sommet. Cochez les os, liez-les avec les poids automatiques, puis affinez au pinceau, et lissez. Votre drapeau ondule maintenant comme un vrai tissu. Dans la prochaine leçon, on anime directement les sommets, avec la déformation libre.'),
  ],
};

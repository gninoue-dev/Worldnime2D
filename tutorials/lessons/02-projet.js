import { intro, outro } from './common.js';
import { workDir } from '../runtime/rig.js';
import { BODY, writeOra, partDataUrl, compositeDataUrl } from '../runtime/character.js';

// Carte : le dessin d'Ama et sa pile de calques (le premier de la liste est celui du dessus).
async function layersCard(d) {
  const art = await compositeDataUrl();
  const rows = [];
  for (const n of [...BODY].reverse()) rows.push(`<div class="lay" data-l="${n}"><img src="${await partDataUrl(n)}" alt="">${n}</div>`);
  return d.card({
    kicker: 'Avant de commencer',
    title: 'Un dessin découpé en calques',
    html: `<div class="tuto-layers"><div class="art"><img src="${art}" alt=""></div>
      <div class="stack"><div class="h">Calques — ama.ora</div>${rows.join('')}</div></div>`,
  });
}

export default {
  id: '02-projet',
  module: 1,
  title: 'Mon premier projet',
  next: 'Construire le squelette',
  goals: [
    'Préparer les dessins dans un logiciel de dessin',
    'Importer un fichier à calques (ORA ou PSD)',
    'Enregistrer, fermer et rouvrir le projet',
  ],
  recap: [
    'Un calque par morceau qui bouge, avec un nom clair',
    'Fichier › Importer un fichier à calques (Ctrl+I)',
    'Chaque calque devient une image dans le dossier d\'images',
    'Ctrl+S enregistre un fichier .wn2d : gardez le dossier d\'images à côté',
  ],
  async setup(d) {
    d.ora = await writeOra(d.api, workDir(d, 'dessins'), 'ama.ora');
    d.oraPath = workDir(d, 'dessins/ama.ora');
    d.imagesDir = workDir(d, 'projet/images');
    d.projectPath = workDir(d, 'projet/ama.wn2d');
    await d.ctx.command('new');
    d.viewport.centerView();
  },
  steps: [
    intro('Dans cette leçon, on crée notre premier projet : on prépare les dessins, on les importe dans Worldnime2D, puis on enregistre notre travail.'),
    {
      say: 'Tout commence dans votre logiciel de dessin préféré : Krita, GIMP ou Photoshop. Dessinez le personnage de face, bien droit, les bras légèrement écartés du corps.',
      do: async (d) => {
        d.layers = await layersCard(d);
        await d.wait(0.6);
        for (const el of d.layers.el.querySelectorAll('.lay')) {
          el.classList.add('on');
          await d.wait(0.12);
        }
      },
    },
    {
      say: 'La règle d\'or : chaque morceau qui doit bouger est sur son propre calque. Ici, la tête, le torse, le haut du bras, l\'avant-bras, la cuisse, la jambe… Donnez à chaque calque un nom clair, sans espace : ce nom deviendra le nom de l\'image.',
      do: async (d) => {
        const hot = ['tete', 'torse', 'bras_gauche', 'avant_bras_gauche', 'cuisse_gauche', 'jambe_gauche'];
        for (const [i, n] of hot.entries()) {
          await d.at(4 + i * 1.4);
          d.layers.el.querySelectorAll('.lay.hot').forEach((e) => e.classList.remove('hot'));
          d.layers.el.querySelector(`[data-l="${n}"]`).classList.add('hot');
        }
        await d.at(15);
        d.layers.el.querySelectorAll('.lay.hot').forEach((e) => e.classList.remove('hot'));
      },
    },
    {
      say: 'Pensez aussi aux parties cachées : sous le bras, le torse doit être dessiné en entier, sinon un trou apparaîtra quand le bras bougera. Enregistrez ensuite au format ORA, dans Krita ou GIMP, ou au format PSD, dans Photoshop.',
      do: async (d) => {
        await d.at(Math.max(1, d.job.durations[d.stepIndex] - 1.2));
        await d.layers.remove();
      },
    },
    {
      say: 'De retour dans Worldnime2D, le projet est vide. Ouvrez le menu Fichier, puis Importer un fichier à calques. Le raccourci est Ctrl+I.',
      do: async (d) => {
        await d.move([0, 120], 1);
        await d.at(3.5);
        await d.menu('Fichier', 'Importer un fichier à calques (ORA, PSD)…');
      },
    },
    {
      say: 'Choisissez votre fichier, ici ama.ora. Worldnime2D demande ensuite dans quel dossier ranger les images : créez un dossier images, à côté de l\'endroit où vous enregistrerez le projet.',
      do: async (d) => {
        await d.fileDialog('Importer un fichier à calques', d.oraPath, 'Ouvrir');
        await d.at(5.5);
        await d.fileDialog('Dossier où enregistrer les images des calques', d.imagesDir, 'Sélectionner');
        await d.answerNext(d.oraPath, d.imagesDir);
        await d.ctx.command('import-layers');
      },
    },
    {
      say: 'Et voilà Ama ! Chaque calque est devenu une image, placée exactement comme dans le dessin. Les pieds du personnage tombent sur l\'origine de la scène, la croix au centre.',
      do: async (d) => {
        await d.at(4);
        const n = d.note([0, 0], 'L\'origine');
        await d.move([30, -20], 0.8);
        await d.at(9);
        n.remove();
      },
    },
    {
      say: 'Dans l\'onglet Images, on retrouve un fichier PNG par calque : Worldnime2D les a écrits dans le dossier choisi.',
      do: async (d) => {
        await d.click('.tab[data-tab="images"]');
        const h = d.highlight('#images', '', { place: 'left' });
        await d.at(6);
        h.remove();
      },
    },
    {
      say: 'Dans l\'Arbre, chaque image est rangée dans un slot, une sorte d\'emplacement. Pour l\'instant, tous les slots sont accrochés à l\'os racine, root. Dans les prochaines leçons, on construira le squelette et on accrochera chaque morceau à son os.',
      do: async (d) => {
        await d.click('.tab[data-tab="tree"]');
        const h = d.highlight('#tree', '', { place: 'left' });
        await d.at(4.5);
        await d.click('#tree .tree-row:nth-child(1)', { duration: 0.5 });
        await d.move({ el: '#tree', fx: 0.4, fy: 0.5 }, 1.2);
        await d.at(12);
        h.remove();
      },
    },
    {
      say: 'Petite astuce : si le squelette existe déjà et qu\'un os porte le même nom qu\'un calque, l\'image s\'y accroche directement à l\'import. Et si vous retouchez le dessin, réimportez-le : les images sont mises à jour.',
    },
    {
      say: 'Enregistrons. Appuyez sur Ctrl+S, ou cliquez sur Enregistrer. Choisissez un nom, ici ama.wn2d, dans le dossier qui contient le dossier images.',
      do: async (d) => {
        await d.at(1.6);
        d.showKeys('Ctrl+S');
        await d.at(3.4);
        await d.move('.file-actions [data-cmd="save"]', 0.6);
        await d.at(6);
        await d.fileDialog('Enregistrer le projet', d.projectPath, 'Enregistrer');
        await d.answerNext(d.projectPath);
        await d.ctx.command('save');
      },
    },
    {
      say: 'Le fichier .wn2d contient le squelette, les slots et les animations, mais pas les dessins : il mémorise seulement où se trouve le dossier d\'images. Gardez donc toujours le projet et son dossier images ensemble, par exemple pour les copier sur une clé USB.',
      do: async (d) => {
        const c = d.card({
          kicker: 'Le dossier du projet',
          title: 'projet/',
          html: `<div style="font: 28px/1.7 ui-monospace, monospace; margin-top: 24px; color: #dfe7ef">
            📄 ama.wn2d <span style="color:#9fb3c8">— squelette, slots, animations</span><br>
            📁 images/ <span style="color:#9fb3c8">— tete.png, torse.png, bras_gauche.png…</span></div>`,
        });
        await d.at(d.job.durations[d.stepIndex] - 0.4);
        await c.remove();
      },
    },
    {
      say: 'Vérifions : cliquez sur Nouveau pour repartir de zéro, puis sur Ouvrir, et choisissez ama.wn2d. Ama revient, avec toutes ses images.',
      do: async (d) => {
        await d.at(2);
        await d.click('.file-actions [data-cmd="new"]');
        await d.at(4.5);
        await d.click('.file-actions [data-cmd="open"]');
        await d.answerNext(d.projectPath);
        await d.fileDialog('Ouvrir un projet', d.projectPath, 'Ouvrir');
        await d.ctx.command('open');
      },
    },
    {
      say: 'Si un jour les images sont introuvables, par exemple après avoir déplacé le dossier, utilisez Fichier, Choisir le dossier d\'images. Et si vous modifiez un PNG pendant que le projet est ouvert, l\'image se met à jour toute seule.',
      do: async (d) => {
        await d.at(3);
        await d.menu('Fichier', 'Choisir le dossier d\'images…');
      },
    },
    outro('Bravo, votre premier projet est créé ! À retenir : un calque par morceau qui bouge, avec un nom clair. Importez le fichier avec Ctrl+I, et enregistrez avec Ctrl+S, en gardant le dossier d\'images à côté du projet. Dans la prochaine leçon, on construit le squelette.'),
  ],
};

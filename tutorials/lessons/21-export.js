import { intro, outro } from './common.js';
import { workDir, saveAs } from '../runtime/rig.js';
import { prepareAnimations } from './20-melanges.js';

const end = (d) => d.job.durations[d.stepIndex];
const $ = (id) => document.getElementById(id);

// Image écrite par l'export, en adresse « data: » pour l'afficher dans une carte.
async function dataUrl(d, file, type) {
  const bytes = await d.api.readBinary(file);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${type};base64,${btoa(s)}`;
}

export default {
  id: '21-export',
  module: 8,
  title: 'Exporter : jeux, images, GIF et vidéo',
  next: 'Dans un jeu Godot',
  goals: [
    'Exporter le squelette et l\'atlas de textures pour un jeu',
    'Exporter une animation en images, en GIF ou en vidéo',
  ],
  recap: [
    'Fichier › Exporter (Ctrl+E) : un dossier, un nom, et ce qu\'on veut',
    'Pour les jeux : squelette JSON + atlas de textures (une ou plusieurs pages PNG)',
    'Rogner et tourner les images remplit mieux l\'atlas',
    'Images : séquence PNG, planche de sprites, GIF animé, vidéo WebM',
  ],
  async setup(d) {
    await prepareAnimations(d);
    await saveAs(d);
    d.editor.setMode('setup');
    d.editor.select(d.editor.skeleton.root);
  },
  steps: [
    intro('Dans cette leçon, on exporte Ama : pour un jeu, et en images, en GIF ou en vidéo.'),
    {
      say: 'Ouvrez le menu Fichier, et choisissez Exporter, ou appuyez sur Ctrl+E. La fenêtre d\'export a trois parties : la destination, l\'export pour les jeux, et les images de l\'animation.',
      do: async (d) => {
        await d.at(1);
        await d.menu('Fichier', 'Exporter (jeux, images, GIF, vidéo)…', 'export');
        await d.at(6.5);
        const fs = [...document.querySelectorAll('#export fieldset')];
        for (const f of fs) {
          const h = d.highlight(f, '', { place: 'left' });
          await d.wait(1.3);
          h.remove();
        }
      },
    },
    {
      say: 'Destination : cliquez sur Choisir le dossier, et prenez un dossier pour l\'export. Puis donnez un nom aux fichiers : « ama ».',
      do: async (d) => {
        await d.at(1);
        await d.answerNext(workDir(d, 'export'));
        await d.click('#ex-dir');
        await d.fileDialog('Dossier d\'export', `${workDir(d, 'export')}/`, 'Sélectionner');
        await d.at(end(d) - 2.2);
        await d.type('#ex-name', 'ama');
      },
    },
    {
      say: 'La partie Pour les jeux écrit le squelette, en JSON, et un atlas de textures : toutes les images rangées dans une seule grande image, c\'est bien plus rapide à charger. Rogner les bords transparents, et autoriser la rotation, remplissent mieux l\'atlas.',
      do: async (d) => {
        await d.at(1);
        const h = d.highlight($('ex-data').closest('legend'), '', { place: 'left' });
        await d.at(9);
        h.remove();
        const a = d.highlight($('ex-trim').closest('label'), '', { place: 'left' });
        const b = d.highlight($('ex-rot').closest('label'), '', { place: 'left' });
        await d.at(end(d) - 0.3);
        a.remove();
        b.remove();
      },
    },
    {
      say: 'L\'échelle des textures réduit les images, pour un jeu sur téléphone par exemple, sans changer la taille du personnage. Et la taille maximale des pages limite chaque page de l\'atlas : au-delà, une deuxième page est créée.',
      do: async (d) => {
        await d.at(3);
        await d.choose('#ex-tscale', '0.5');
        await d.at(9);
        const h = d.highlight($('ex-max').closest('label'), '', { place: 'left' });
        await d.at(end(d) - 0.3);
        h.remove();
      },
    },
    {
      say: 'Dans la partie Images de l\'animation, choisissez l\'animation : salut. Cochez Planche de sprites, et GIF animé. Vous pouvez aussi exporter une séquence de PNG, ou une vidéo WebM, et régler les images par seconde, l\'échelle, et le fond.',
      do: async (d) => {
        await d.at(3);
        await d.choose('#ex-anim', 'salut');
        await d.at(6);
        await d.check('#ex-sheet');
        await d.check('#ex-gif');
        await d.at(end(d) - 4);
        const h = d.highlight($('ex-fps').closest('label'), '', { place: 'left' });
        await d.at(end(d) - 0.3);
        h.remove();
      },
    },
    {
      say: 'Cliquez sur Exporter. La progression s\'affiche en bas de la fenêtre, puis le nombre de fichiers écrits.',
      do: async (d) => {
        await d.at(1);
        await d.click('#ex-go');
        for (let i = 0; i < 100 && !/écrit/.test($('ex-progress').textContent); i++) await d.wait(0.2);
        const h = d.highlight($('ex-progress'), '', { place: 'above' });
        await d.at(end(d) - 0.3);
        h.remove();
      },
    },
    {
      say: 'Voici ce qu\'on obtient. L\'atlas, où les images sont rognées, et parfois tournées, pour prendre le moins de place. Le fichier JSON qui décrit le squelette et les animations. Et le GIF du salut, prêt à partager.',
      do: async (d) => {
        const dir = workDir(d, 'export');
        $('export').close();
        const atlas = await dataUrl(d, `${dir}/ama.png`, 'image/png');
        const gif = await dataUrl(d, `${dir}/ama_salut.gif`, 'image/gif');
        const c = d.card({
          kicker: 'Dans le dossier d\'export',
          title: 'ama.json · ama.atlas.json · ama.png · ama_salut.gif',
          html: `<div style="display:flex; gap:50px; align-items:center; margin-top:26px">
            <div style="text-align:center"><img src="${atlas}" style="max-width:520px; max-height:420px; background:repeating-conic-gradient(#3a3f47 0 25%, #2c3038 0 50%) 0 0/20px 20px; border-radius:8px"><br><small style="font-size:18px; color:#9fb3c8">ama.png : l'atlas</small></div>
            <div style="text-align:center"><img src="${gif}" style="max-height:420px; background:#fff; border-radius:8px"><br><small style="font-size:18px; color:#9fb3c8">ama_salut.gif</small></div></div>`,
        });
        await d.at(end(d) + 1.5);
        await c.remove();
      },
    },
    {
      say: 'Le format JSON est documenté dans le dossier docs du projet, pour qui voudrait écrire son propre lecteur. Et pour Godot, un lecteur est déjà fourni : c\'est l\'objet de la dernière leçon.',
      do: async (d) => {
        await d.at(end(d) - 0.5);
      },
    },
    outro('Bravo ! À retenir : Fichier, Exporter, ouvre la fenêtre d\'export. Pour les jeux, on obtient le squelette en JSON et un atlas de textures. Pour partager, on exporte une animation en séquence PNG, en planche de sprites, en GIF ou en vidéo. Dans la dernière leçon, on fait jouer Ama dans un jeu Godot.'),
  ],
};

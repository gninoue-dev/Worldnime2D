import { intro, outro } from './common.js';
import { prepareAnimations } from './20-melanges.js';

const end = (d) => d.job.durations[d.stepIndex];

// Fichier binaire en adresse « data: » (pour une image dans une carte).
async function dataUrl(d, file, type) {
  const bytes = await d.api.readBinary(file);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${type};base64,${btoa(s)}`;
}

const CODE = 'font-family:\'DejaVu Sans Mono\', monospace; font-size:21px; line-height:1.55; text-align:left; background:#1e1e1e; border:1px solid #3c3c3c; border-radius:10px; padding:22px 28px; margin-top:26px; white-space:pre; color:#d4d4d4';
const kw = (s) => `<span style="color:#569cd6">${s}</span>`;
const str = (s) => `<span style="color:#ce9178">${s}</span>`;
const com = (s) => `<span style="color:#6a9955">${s}</span>`;
const fn = (s) => `<span style="color:#dcdcaa">${s}</span>`;

// Étapes numérotées d'une carte.
const steps = (list) => `<ol style="text-align:left; font-size:24px; line-height:1.7; margin-top:26px">${list.map((x) => `<li>${x}</li>`).join('')}</ol>`;

export default {
  id: '22-godot',
  module: 8,
  title: 'Dans un jeu Godot',
  goals: [
    'Installer le runtime Worldnime2D dans un projet Godot 4',
    'Jouer, enchaîner et superposer les animations en GDScript',
    'Réagir aux événements, aux collisions et aux points',
  ],
  recap: [
    'Copier addons/worldnime2d dans le projet Godot',
    'Nœud Worldnime2DSkeleton + fichier .json exporté (avec son atlas)',
    'set_animation, add_animation, set_empty_animation : pistes et fondus',
    'Signaux event_triggered et animation_completed',
    'get_bounding_boxes(), get_point(), skins : collisions, tirs, tenues',
  ],
  async setup(d) {
    await prepareAnimations(d);
    d.godotClip = await dataUrl(d, `${d.job.work}/../godot-ama.webp`, 'image/webp');
  },
  steps: [
    intro('Dernière leçon ! On fait jouer Ama dans un vrai jeu, avec le moteur Godot 4.'),
    {
      say: 'Worldnime2D fournit un lecteur pour Godot 4, qu\'on appelle un runtime. Il se trouve dans le dossier runtimes slash godot du projet. Il lit le squelette exporté, et le joue dans le jeu, avec tout ce qu\'on a vu : maillages, contraintes, skins et mélanges.',
      do: async (d) => {
        const c = d.card({
          kicker: 'Le runtime Godot',
          title: 'runtimes/godot/addons/worldnime2d',
          html: steps(['Os, images et maillages avec poids et déformations', 'Couleurs, fusion, ordre d\'affichage, découpes', 'IK, transformation, chemin et physique', 'Skins, événements, fondus et pistes superposées']),
        });
        await d.at(end(d) - 0.3);
        await c.remove();
      },
    },
    {
      say: 'Installation, en quatre étapes. Un : copiez le dossier addons slash worldnime2d dans votre projet Godot. Deux : exportez votre personnage pour les jeux, comme dans la leçon précédente. Trois : copiez les fichiers exportés dans le projet, ensemble. Quatre : ajoutez un nœud Worldnime2DSkeleton à la scène, et choisissez le fichier JSON.',
      do: async (d) => {
        const c = d.card({
          kicker: 'Installation',
          title: 'Quatre étapes',
          html: steps([
            'Copier <b>addons/worldnime2d</b> dans le dossier <b>addons/</b> du projet Godot',
            'Worldnime2D › Fichier › Exporter : « Pour les jeux »',
            'Copier <b>ama.json</b>, <b>ama.atlas.json</b> et <b>ama.png</b> dans le projet, ensemble',
            'Ajouter un nœud <b>Worldnime2DSkeleton</b>, et choisir <b>ama.json</b> dans « Skeleton File »',
          ]),
        });
        const items = [...c.el.querySelectorAll('ol li')];
        items.forEach((li) => { li.style.opacity = '0.25'; });
        for (const [i, t] of [[0, 3], [1, 8], [2, 13], [3, 19]]) {
          await d.at(t);
          items[i].style.opacity = '1';
        }
        await d.at(end(d) - 0.3);
        await c.remove();
      },
    },
    {
      say: 'Dans votre script, quelques fonctions suffisent. set_animation lance une animation sur une piste, avec un fondu. add_animation l\'enchaîne après celle en cours. Et set_empty_animation vide une piste en douceur. Exactement comme l\'aperçu des mélanges.',
      do: async (d) => {
        const c = d.card({
          kicker: 'GDScript',
          title: 'Jouer les animations',
          html: `<div style="${CODE}">${kw('@onready var')} perso: Worldnime2DSkeleton = $Perso

${kw('func')} ${fn('_ready')}():
    perso.${fn('set_mix')}(${str('"repos"')}, ${str('"saut"')}, 0.2)   ${com('# durée du fondu')}
    perso.${fn('set_animation')}(0, ${str('"repos"')}, ${kw('true')})  ${com('# piste 0, en boucle')}

${kw('func')} ${fn('sauter')}():
    perso.${fn('set_animation')}(0, ${str('"saut"')}, ${kw('false')})
    perso.${fn('add_animation')}(0, ${str('"repos"')}, ${kw('true')})  ${com('# puis retour au repos')}

${kw('func')} ${fn('saluer')}():
    perso.${fn('set_animation')}(1, ${str('"salut"')}, ${kw('false')}) ${com('# piste 1, par-dessus')}</div>`,
        });
        await d.at(end(d) - 0.3);
        await c.remove();
      },
    },
    {
      say: 'Et voici le résultat, dans Godot : Ama respire, salue sur la piste un, puis saute, et revient au repos. C\'est l\'export de la leçon précédente, joué par le runtime.',
      do: async (d) => {
        const c = d.card({
          kicker: 'Dans Godot 4',
          title: '',
          html: `<img src="${d.godotClip}" style="width:1100px; max-width:100%; border-radius:10px; margin-top:8px; box-shadow:0 10px 40px rgba(0,0,0,.5)">`,
        });
        await d.at(end(d) + 2);
        await c.remove();
      },
      pause: 0.2,
    },
    {
      say: 'Le runtime prévient aussi votre jeu. Le signal event_triggered arrive à chaque événement posé dans la timeline : un pas, un coup qui frappe. animation_completed signale la fin d\'une animation. get_bounding_boxes donne les boîtes de collision, get_point la position d\'un point, pour lancer un projectile. Et la propriété skins change la tenue.',
      do: async (d) => {
        const c = d.card({
          kicker: 'GDScript',
          title: 'Événements, collisions, points et skins',
          html: `<div style="${CODE}">perso.event_triggered.${fn('connect')}(${fn('_on_event')})

${kw('func')} ${fn('_on_event')}(piste, nom, donnees):
    ${kw('if')} nom == ${str('"coup"')}:
        ${fn('verifier_touche')}(perso.${fn('get_bounding_boxes')}())

${kw('var')} tir: Transform2D = perso.${fn('get_point')}(${str('"avant_bras_droit_point"')})
perso.skins = [${str('"fete"')}]   ${com('# tenue de fête')}</div>`,
        });
        await d.at(end(d) - 0.3);
        await c.remove();
      },
    },
    {
      say: 'Un dernier mot sur la fiabilité : un script de vérification joue le même scénario dans l\'éditeur et dans Godot, puis compare les poses, os par os, sommet par sommet. Il tourne automatiquement à chaque nouvelle version.',
      do: async (d) => {
        const c = d.card({
          kicker: 'Vérification',
          title: 'node scripts/godot-check.mjs',
          subtitle: 'Éditeur (JavaScript) et runtime (GDScript) comparés : os, sommets, couleurs, ordre d\'affichage, événements.',
        });
        await d.at(end(d) - 0.3);
        await c.remove();
      },
    },
    {
      say: 'Et voilà, la formation est terminée ! Vous savez construire un squelette, accrocher les images, animer, déformer avec les maillages, utiliser les contraintes et les skins, puis exporter vers votre jeu. À vous de créer vos personnages. Merci d\'avoir suivi cette formation !',
      do: async (d) => {
        const c = d.card({
          kicker: 'Formation Worldnime2D',
          title: 'Félicitations !',
          bullets: ['Squelette et images', 'Animation et courbes', 'Maillages et poids', 'Contraintes et skins', 'Export et Godot'],
        });
        await d.wait(1.5);
        await c.reveal(1.4);
        await d.at(end(d) - 0.3);
        await c.remove();
      },
    },
    outro('À retenir : copiez le runtime dans votre projet Godot, ajoutez un nœud Worldnime2DSkeleton avec votre fichier JSON, et pilotez-le en GDScript, avec les pistes, les fondus et les signaux. Bonne création !'),
  ],
};

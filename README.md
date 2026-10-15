<p align="center">
  <img src="build/icon.png" width="120" alt="Logo Worldnime2D">
</p>

<h1 align="center">Worldnime2D</h1>

<p align="center">
  Éditeur d'animation 2D par squelette, libre et open source, pour Windows et Linux.
</p>

---

## Le projet

Worldnime2D est un éditeur d'animation 2D par os (animation « squelettale »), dans l'esprit de logiciels comme Spine.
On découpe un personnage en morceaux, on construit un squelette, puis on anime les os.

L'objectif à terme est d'offrir le même ensemble de fonctionnalités qu'un éditeur professionnel de ce type :
os, slots, maillages déformables, poids, contraintes IK, skins, timeline, courbes, export pour les moteurs de jeu.
C'est un gros chantier, alors j'avance par étapes. La liste complète est dans la **[feuille de route](ROADMAP.md)**.

Je construis ce projet pour apprendre (Electron, rendu WebGL avec PixiJS, mathématiques des transformations 2D)
et parce que j'en ai besoin pour mes propres jeux.

> **État actuel : v0.1 — le squelette.** On peut construire et enregistrer un squelette.
> Les images, les maillages et l'animation arrivent dans les prochaines versions.

![Capture de Worldnime2D](docs/capture.png)

## Ce que fait la v0.1

- Création d'os à la souris (cliquer-glisser), os de longueur nulle, hiérarchie parent / enfants
- Outils Sélection, Rotation, Déplacement, Échelle, Cisaillement (Maj pour aimanter à 15°)
- Arbre des os : renommer (double-clic), changer de parent par glisser-déposer, réordonner, dupliquer, supprimer
- Panneau de propriétés : position, rotation, longueur, échelle, cisaillement, mode d'héritage, couleur
- Cinq modes d'héritage de la transformation du parent (normal, position seulement, sans rotation, sans échelle…)
- Annuler / rétablir (200 étapes), Échap pour annuler un geste en cours
- Vue avec grille, zoom à la molette, déplacement (clic droit, clic molette ou Espace)
- Projets enregistrés au format `.wn2d` (JSON lisible, [décrit ici](docs/FORMAT.md)), ouverture par double-clic

## Installation

Les installeurs sont sur la page **[Releases](https://github.com/gninoue-dev/Worldnime2D/releases)**.

| Système | Fichier | Installation |
|---|---|---|
| Windows 10 / 11 | `Worldnime2D-Setup-x.y.z.exe` | Double-clic, puis suivre l'assistant. Windows peut afficher « Windows a protégé votre ordinateur » car l'installeur n'est pas signé : cliquer sur *Informations complémentaires* puis *Exécuter quand même*. |
| Ubuntu / Debian | `worldnime2d_x.y.z_amd64.deb` | `sudo apt install ./worldnime2d_x.y.z_amd64.deb` |
| Autres Linux | `Worldnime2D-x.y.z.AppImage` | `chmod +x Worldnime2D-*.AppImage` puis double-clic |

## Développer

Il faut [Node.js](https://nodejs.org) 20 ou plus récent.

```bash
git clone https://github.com/gninoue-dev/Worldnime2D.git
cd Worldnime2D
npm install
npm start            # lance l'éditeur
npm test             # tests du modèle (squelette, maths, format de fichier)
npm run selftest     # test automatique de l'interface (pilote la souris et prend des captures)
npm run dist:linux   # construit l'AppImage et le .deb dans release/
npm run dist:win     # construit l'installeur Windows (sous Windows, ou via GitHub Actions)
```

Sous Linux, `npm start` lance Electron avec `--no-sandbox`, car le bac à sable de Chromium
demande des droits root sur la version de développement. Les versions installées gardent le bac à sable.

À chaque étiquette `v*` poussée sur GitHub, [GitHub Actions](.github/workflows/build.yml) lance les tests,
construit les installeurs Windows et Linux et les publie dans une Release.

### Organisation du code

```
src/main/             processus principal d'Electron (fenêtre, menus, fichiers)
src/renderer/js/
  model/              squelette, os, calcul des transformations, format .wn2d (sans dépendance, testé)
  editor/             état de l'éditeur, sélection, outils, annuler/rétablir
  view/               zone de dessin PixiJS et gestion de la souris
  ui/                 panneaux Arbre et Propriétés
tests/                tests du modèle (node --test)
```

## Remarque

Worldnime2D est un projet indépendant. Il n'est pas affilié à Esoteric Software, l'éditeur de Spine,
et ne contient aucun code de Spine. Le format `.wn2d` est un format propre au projet.

## Licence

[MIT](LICENSE) — libre d'utilisation, de modification et de redistribution.

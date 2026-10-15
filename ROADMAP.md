# Feuille de route

L'objectif : couvrir **toutes** les fonctionnalités d'un éditeur d'animation squelettale professionnel comme Spine,
version par version. Chaque case cochée est faite et testée. Les autres sont prévues.

## v0.1 — Squelette (mode Configuration) ✅

- [x] Os : création à la souris, longueur, position, rotation, échelle, cisaillement
- [x] Hiérarchie parent / enfants, racine unique
- [x] Modes d'héritage : normal, position seulement, sans rotation ni reflet, sans échelle, sans échelle ni reflet
- [x] Couleur des os
- [x] Outils Sélection, Création, Rotation, Déplacement, Échelle, Cisaillement, aimantation (Maj)
- [x] Arbre : renommer, glisser-déposer pour changer de parent, réordonner, dupliquer, supprimer
- [x] Panneau de propriétés, valeurs monde affichées
- [x] Annuler / rétablir
- [x] Vue : grille, zoom, déplacement, tout cadrer
- [x] Format de projet `.wn2d`, ouverture par double-clic
- [x] Installeurs Windows (NSIS) et Linux (AppImage, .deb)

## v0.2 — Images, slots et ordre d'affichage ✅

- [x] Import d'images PNG, JPG et WebP depuis un dossier (sous-dossiers compris), surveillé en continu
- [x] Slots : un ou plusieurs slots par os, plusieurs pièces jointes par slot
- [x] Pièce jointe « région » (image) : position, rotation, échelle, taille
- [x] Ordre d'affichage (draw order) et réordonnancement par glisser-déposer
- [x] Couleur et transparence des slots et des images, couleur sombre (« tint black »)
- [x] Modes de fusion : normal, additif, produit, écran
- [x] Import d'un fichier PSD ou ORA découpé en calques (Krita, Photoshop, GIMP)
- [x] Fond de référence (image derrière le personnage)

## v0.3 — Animation (mode Animation) ✅

- [x] Passage Configuration / Animation, plusieurs animations par projet
- [x] Timeline (dopesheet) : clés de rotation, position, échelle, cisaillement
- [x] Clés de pièce jointe, de couleur, de couleur sombre et d'ordre d'affichage
- [x] Lecture, boucle, vitesse, plage de lecture, images par seconde
- [x] Clé automatique, copier / coller de clés, déplacement et mise à l'échelle de clés
- [x] Pelure d'oignon (ghosting)
- [x] Événements (entier, décimal, texte, son) posés sur la timeline, joués pendant la lecture

## v0.4 — Courbes

- [ ] Interpolations linéaire, palier (stepped) et Bézier
- [ ] Éditeur de courbes (graph editor) avec poignées
- [ ] Préréglages de courbes

## v0.5 — Maillages et poids

- [ ] Pièce jointe « maillage » : sommets, triangulation automatique, arêtes
- [ ] Contour automatique d'après la transparence de l'image
- [ ] Poids (skinning) : liaison de plusieurs os, peinture des poids, poids automatiques, lissage, élagage
- [ ] Déformation libre (FFD) animable
- [ ] Maillages liés (linked meshes) qui partagent les poids

## v0.6 — Contraintes

- [ ] IK à 1 ou 2 os : sens de pliage, mélange, souplesse, étirement, compression
- [ ] Contrainte de transformation (copier rotation / position / échelle / cisaillement d'un autre os)
- [ ] Contrainte de chemin (path) et pièce jointe « chemin »
- [ ] Contrainte physique (ressorts, inertie, gravité, vent)
- [ ] Ordre d'évaluation des contraintes

## v0.7 — Skins et autres pièces jointes

- [ ] Skins : plusieurs tenues pour un même squelette, emplacements de skin
- [ ] Os et contraintes propres à une skin
- [ ] Boîtes de collision (bounding box), découpe (clipping), points

## v0.8 — Prévisualisation et export

- [ ] Mélange d'animations (mix) et pistes superposées dans l'aperçu
- [ ] Empaqueteur de textures (atlas), avec rognage et rotation
- [ ] Export JSON documenté pour les moteurs de jeu
- [ ] Export en images PNG (séquences, planches de sprites), GIF et vidéo
- [ ] Runtime **Godot 4** (lecture des animations dans un jeu)

## Ensuite

- [ ] Runtimes Unity, web (PixiJS) et autres moteurs
- [ ] Format binaire compact
- [ ] Scripts et lignes de commande pour l'export automatique
- [ ] Traductions de l'interface (anglais d'abord)
- [ ] Version macOS

# Runtime Worldnime2D pour Godot 4

Ce dossier permet d'afficher et d'animer dans un jeu Godot 4 les personnages exportés par Worldnime2D.

## Installation

1. Copier le dossier `addons/worldnime2d` dans le dossier `addons/` de votre projet Godot.
2. Dans Worldnime2D : **Fichier → Exporter** (Ctrl+E), cocher « Pour les jeux : squelette JSON + atlas ».
3. Copier les fichiers exportés (`<nom>.json`, `<nom>.atlas.json`, `<nom>.png`…) dans votre projet,
   dans un même dossier.
4. Ajouter un nœud **Worldnime2DSkeleton** à la scène et choisir le fichier `<nom>.json` dans
   « Skeleton File ».

## Utilisation

```gdscript
@onready var perso: Worldnime2DSkeleton = $Perso

func _ready():
    perso.set_mix("marche", "saut", 0.15)          # durée du fondu entre deux animations
    perso.set_animation(0, "marche", true)          # piste 0, en boucle
    perso.event_triggered.connect(_on_event)
    perso.animation_completed.connect(func(track, anim): print(anim, " terminée"))

func sauter():
    perso.set_animation(0, "saut", false)
    perso.add_animation(0, "marche", true)          # reprend la marche après le saut

func saluer():
    perso.set_animation(1, "salut", false)          # piste 1 : par-dessus la piste 0
    perso.set_empty_animation(1, 0.2)               # puis l'effacer en fondu

func _on_event(track, event_name, data):
    if event_name == "coup":
        verifier_touche(perso.get_bounding_boxes())
```

| Fonction | Rôle |
|---|---|
| `set_animation(piste, nom, boucle)` | Lance une animation (fondu depuis l'animation en cours) |
| `add_animation(piste, nom, boucle, délai)` | Enchaîne après l'animation en cours |
| `set_empty_animation(piste, fondu)` | Efface la piste en fondu |
| `set_mix(de, vers, durée)` | Durée du fondu entre deux animations (`default_mix` sinon) |
| `skins` | Skins actives (propriété, combinables) |
| `get_bone_position(nom)`, `get_bone_rotation_degrees(nom)` | Position et angle d'un os (repère du nœud) |
| `get_bounding_boxes()` | Polygones des boîtes de collision visibles (zones de touche) |
| `get_point(slot)` | Transform2D d'une pièce jointe « point » (sortie d'un tir, d'un effet) |
| Signal `event_triggered(piste, nom, données)` | Événements posés dans la timeline |
| Signal `animation_completed(piste, nom)` | Fin d'une animation non bouclée |

## Ce que le runtime gère

Os (tous les modes d'héritage), images et maillages (avec poids, maillages liés, déformations),
couleurs et couleur sombre, modes de fusion (normal, additif, produit, écran), ordre d'affichage,
découpes, boîtes de collision, points, skins (combinées, os et contraintes de skin), toutes les
timelines et courbes, événements, contraintes IK, transformation, chemin et physique, fondus entre
animations et pistes superposées.

## Vérification

`node scripts/godot-check.mjs` joue un même scénario avec l'éditeur (JavaScript) et avec ce runtime
(Godot sans fenêtre), puis compare les poses : os, sommets, couleurs, ordre d'affichage, événements.

Le dossier `demo/` contient un petit projet Godot avec un personnage d'exemple.

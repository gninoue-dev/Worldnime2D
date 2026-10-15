# Format de projet `.wn2d`

Un projet Worldnime2D est un fichier texte JSON (UTF-8) à l'extension `.wn2d`.

## Repère

- X vers la droite, **Y vers le haut**.
- Angles en **degrés**, sens anti-horaire, 0° = vers la droite.
- Toutes les valeurs d'un os sont **locales** : relatives à son parent.

## Exemple

```json
{
  "format": "worldnime2d",
  "formatVersion": 2,
  "app": "0.2.0",
  "skeleton": {
    "name": "heros",
    "images": "images",
    "reference": { "path": "croquis.png", "x": 0, "y": 400, "scale": 1, "alpha": 0.5, "visible": true }
  },
  "bones": [
    { "name": "root" },
    { "name": "hanches", "parent": "root", "y": 90, "rotation": 90, "length": 40 },
    { "name": "bras", "parent": "hanches", "x": 35, "rotation": -100, "length": 30, "inherit": "noScale" }
  ],
  "slots": [
    { "name": "bras", "bone": "bras", "attachment": "bras" },
    { "name": "reflet", "bone": "hanches", "attachment": "reflet", "color": "#ffffffb3", "blend": "additive" }
  ],
  "skins": [
    {
      "name": "default",
      "attachments": {
        "bras": { "bras": { "x": 15, "rotation": 100, "width": 38, "height": 92 } },
        "reflet": { "reflet": { "path": "effets/reflet", "width": 64, "height": 64 } }
      }
    }
  ],
  "ik": [], "transform": [], "path": [], "physics": [],
  "events": {}, "animations": {}
}
```

`skeleton.images` est le dossier des images, relatif au fichier `.wn2d` (ou absolu).
`skeleton.reference` (facultatif) est l'image de fond d'aide au montage ; elle n'est jamais exportée.

## `bones`

Liste ordonnée : la racine en premier, et chaque parent avant ses enfants.
Les champs absents prennent leur valeur par défaut.

| Champ | Type | Défaut | Rôle |
|---|---|---|---|
| `name` | texte | — | Nom unique de l'os (obligatoire) |
| `parent` | texte | — | Nom du parent. Absent seulement pour la racine. |
| `length` | nombre | 0 | Longueur de l'os |
| `x`, `y` | nombre | 0 | Position dans le repère du parent |
| `rotation` | nombre | 0 | Rotation en degrés |
| `scaleX`, `scaleY` | nombre | 1 | Échelle |
| `shearX`, `shearY` | nombre | 0 | Cisaillement en degrés |
| `inherit` | texte | `normal` | `normal`, `onlyTranslation`, `noRotationOrReflection`, `noScale`, `noScaleOrReflection` |
| `color` | texte | `#9b9b9b` | Couleur d'affichage, `#rrggbb` |

## `slots`

Liste ordonnée : c'est **l'ordre d'affichage**. Le premier slot est dessiné au fond, le dernier devant.

| Champ | Type | Défaut | Rôle |
|---|---|---|---|
| `name` | texte | — | Nom unique du slot |
| `bone` | texte | — | Os auquel le slot est accroché |
| `attachment` | texte | aucun | Pièce jointe visible dans la pose de base |
| `color` | texte | `#ffffffff` | Teinte et opacité, `#rrggbbaa` |
| `dark` | texte | aucun | Couleur sombre (« tint black »), `#rrggbb` |
| `blend` | texte | `normal` | `normal`, `additive`, `multiply`, `screen` |

## `skins`

Pour l'instant, seule la skin `default` est utilisée. `attachments` associe à chaque nom de slot
ses pièces jointes, par nom. Type `region` (une image), le seul en v0.2 :

| Champ | Type | Défaut | Rôle |
|---|---|---|---|
| `type` | texte | `region` | Type de pièce jointe |
| `path` | texte | le nom | Image dans le dossier d'images, sans extension (`bras/main_g`) |
| `x`, `y` | nombre | 0 | Centre de l'image dans le repère de l'os |
| `rotation` | nombre | 0 | Rotation en degrés, relative à l'os |
| `scaleX`, `scaleY` | nombre | 1 | Échelle |
| `width`, `height` | nombre | 32 | Taille de l'image en pixels |
| `color` | texte | `#ffffffff` | Teinte et opacité de l'image |

Couleur affichée d'un pixel : `image × (slot.color × attachment.color) + (1 − image) × slot.dark`.

## Sections réservées

`ik`, `transform`, `path`, `physics`, `events` et `animations` sont vides en v0.2.
Elles seront remplies par les versions suivantes.

## Versions du format

- `1` : v0.1, os seulement.
- `2` : v0.2, slots, skins, dossier d'images, image de référence.

Une version de l'éditeur lit tous les fichiers plus anciens. `formatVersion` augmente quand le format change. Une version de l'éditeur refuse un fichier
dont le `formatVersion` est plus récent que ce qu'elle connaît.

## Calcul de la transformation monde

Pour un os d'héritage `normal`, avec `(pa, pb, pc, pd, px, py)` la matrice monde du parent :

```
la = cos(rotation + shearX) * scaleX     lb = cos(rotation + 90 + shearY) * scaleY
lc = sin(rotation + shearX) * scaleX     ld = sin(rotation + 90 + shearY) * scaleY

a = pa*la + pb*lc     b = pa*lb + pb*ld
c = pc*la + pd*lc     d = pc*lb + pd*ld
worldX = pa*x + pb*y + px
worldY = pc*x + pd*y + py
```

Les autres modes sont dans `src/renderer/js/model/bone.js`.

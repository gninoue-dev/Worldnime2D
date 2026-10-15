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
  "formatVersion": 1,
  "app": "0.1.0",
  "skeleton": { "name": "heros" },
  "bones": [
    { "name": "root" },
    { "name": "hanches", "parent": "root", "y": 90, "rotation": 90, "length": 40 },
    { "name": "bras", "parent": "hanches", "x": 35, "rotation": -100, "length": 30, "inherit": "noScale" }
  ],
  "slots": [], "skins": [], "ik": [], "transform": [], "path": [], "physics": [],
  "events": {}, "animations": {}
}
```

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

## Sections réservées

`slots`, `skins`, `ik`, `transform`, `path`, `physics`, `events` et `animations` sont vides en v0.1.
Elles seront remplies par les versions suivantes. Un fichier v0.1 restera lisible.

`formatVersion` augmente quand le format change. Une version de l'éditeur refuse un fichier
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

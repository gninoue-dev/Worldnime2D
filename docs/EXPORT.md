# Export

**Fichier → Exporter** (Ctrl+E).

## Pour les jeux

- `<nom>.json` : le squelette, au même format que les projets `.wn2d` (voir [FORMAT.md](FORMAT.md)),
  sans les réglages propres à l'éditeur, avec `"export": { "atlas": "<nom>.atlas.json" }`.
- `<nom>.atlas.json` + `<nom>.png`, `<nom>_2.png`… : l'atlas de textures.

### Atlas

```json
{
  "format": "worldnime2d-atlas", "version": 1, "scale": 0.5,
  "pages": [ { "file": "heros.png", "width": 512, "height": 256 } ],
  "regions": {
    "bras_d": { "page": 0, "x": 10, "y": 2, "width": 25, "height": 120, "rotated": true,
                "offsetX": 0, "offsetY": 4, "trimmedWidth": 50, "trimmedHeight": 236,
                "originalWidth": 50, "originalHeight": 240 }
  }
}
```

- Une région par image utilisée (clé = chemin de l'image dans le projet).
- `x, y, width, height` : rectangle dans la page (pixels de la page). `width × height` est la taille
  avant rotation : une région tournée occupe `height × width` dans la page.
- `rotated` : l'image est tournée de 90° dans le sens horaire (sa largeur descend le long de Y).
- `offsetX, offsetY, trimmedWidth, trimmedHeight` : zone conservée de l'image d'origine
  (bords transparents retirés), en pixels de l'image d'origine, origine en haut à gauche.
- `scale` : réduction des textures. Les coordonnées du squelette ne changent pas.

Point `(u, v)` de l'image d'origine (0 à 1) → page :

```
rx = (u × originalWidth − offsetX) / trimmedWidth
ry = (v × originalHeight − offsetY) / trimmedHeight
sans rotation : px = x + rx × width            py = y + ry × height
avec rotation : px = x + (1 − ry) × height     py = y + rx × width
```

Les images de maillage ne sont jamais rognées.

## Images

Pour une animation (ou toutes) : séquence PNG, planche de sprites (PNG + JSON décrivant chaque image),
GIF animé (boucle infinie, transparence) et vidéo WebM. Réglages : images par seconde, échelle,
marge, fond transparent ou couleur.

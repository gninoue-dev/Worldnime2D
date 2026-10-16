# Tutoriels vidéo

Les vidéos de la formation sont fabriquées par Worldnime2D lui-même : un script pilote la vraie fenêtre de l'éditeur (curseur, clics, clavier), une voix de synthèse lit la narration, puis ffmpeg assemble l'image, la voix et les sous-titres.

## Prérequis

- **ffmpeg** (avec `libx264` et le filtre `drawtext`)
- **Piper** 1.2 et la voix française `fr_FR-siwis-medium`, rangés par défaut dans `~/.local/share/wn2d-tts` :

```
~/.local/share/wn2d-tts/piper/piper
~/.local/share/wn2d-tts/voices/fr_FR-siwis-medium.onnx (+ .onnx.json)
```

Piper : https://github.com/rhasspy/piper/releases — voix : https://huggingface.co/rhasspy/piper-voices (dossier `fr/fr_FR/siwis/medium`).

## Utilisation

```
node tutorials/make.mjs --list          # liste des leçons
node tutorials/make.mjs                 # toutes les leçons
node tutorials/make.mjs 03 05           # seulement ces leçons
node tutorials/make.mjs --rapide 03     # répétition accélérée (×4, sans voix) pour vérifier une leçon
```

Les vidéos (`.mp4`, avec sous-titres intégrés) et les sous-titres (`.srt`) arrivent dans `tutorials/output/`.

Variables utiles : `WN2D_TTS_DIR`, `WN2D_PIPER`, `WN2D_VOICE`, `WN2D_VOICE_SPEED` (voix) ; `WN2D_SIGNATURE` (signature incrustée, `dev_gninoue` par défaut) ; `WN2D_TUTORIAL_STATS=1` (statistiques d'enregistrement).

Sur une machine qui a peu de mémoire, on peut limiter l'enregistrement par sécurité :

```
systemd-run --user --scope -p MemoryMax=4G node tutorials/make.mjs
```

## Organisation

- `lessons/` : une leçon par fichier. Chaque étape a une narration (`say`) et des actions (`do`) jouées pendant la narration.
- `runtime/director.js` : le « réalisateur » (curseur, clics, glisser, touches, encadrés, cartes).
- `runtime/character.js` et `runtime/rig.js` : Ama, le personnage de démonstration, dessiné par le code, et son squelette.
- `make.mjs` : voix, enregistrement, assemblage.

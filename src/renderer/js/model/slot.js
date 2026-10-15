// Un slot : un emplacement d'affichage accroché à un os.
// Il montre au plus une pièce jointe à la fois. L'ordre des slots dans le squelette
// est l'ordre d'affichage (le premier est dessiné au fond).

import { WHITE } from './color.js';

export const BLEND_MODES = Object.freeze({
  normal: 'normal',
  additive: 'additive',
  multiply: 'multiply',
  screen: 'screen',
});

export const BLEND_LABELS = {
  normal: 'Normal',
  additive: 'Additif',
  multiply: 'Produit',
  screen: 'Écran',
};

export class Slot {
  constructor(name, bone) {
    this.name = name;
    this.bone = bone;
    this.color = WHITE;
    // Couleur sombre (« tint black ») : null = désactivée.
    this.dark = null;
    // Nom de la pièce jointe visible dans la pose de base (null = rien).
    this.attachment = null;
    this.blend = BLEND_MODES.normal;
    // Pose courante (modifiée par les animations).
    this.pose = { color: WHITE, dark: null, attachment: null };
  }

  setToSetupPose() {
    this.pose.color = this.color;
    this.pose.dark = this.dark;
    this.pose.attachment = this.attachment;
  }
}

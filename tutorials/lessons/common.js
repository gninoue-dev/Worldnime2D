// Étapes communes à toutes les leçons : carte d'ouverture et récapitulatif.

export const MODULES = {
  1: 'Premiers pas',
  2: 'Le squelette',
  3: 'Les images',
  4: 'Animer',
  5: 'Maillages et poids',
  6: 'Les contraintes',
  7: 'Skins et pièces jointes spéciales',
  8: 'Aperçu et export',
};

// Carte d'ouverture : module, numéro, titre, objectifs (qui apparaissent un à un).
export function intro(say, { goalsAt = 0.35 } = {}) {
  return {
    say,
    do: async (d) => {
      const l = d.lesson;
      d.setTag('');
      const card = d.card({
        kicker: `Module ${l.module} · ${MODULES[l.module]} — Leçon ${d.job.index + 1} sur ${d.job.count}`,
        title: l.title,
        subtitle: 'Dans cette leçon :',
        bullets: l.goals,
      });
      const dur = d.job.durations[0] ?? 6;
      await d.wait(dur * goalsAt);
      await card.reveal(Math.min(1.2, (dur * (1 - goalsAt) - 0.6) / Math.max(1, l.goals.length)));
      await d.at(dur + 0.2);
      await card.remove();
      d.setTag(`${d.job.index + 1}. ${l.title}`);
    },
  };
}

// Récapitulatif final : « À retenir » et leçon suivante.
export function outro(say) {
  return {
    say,
    pause: 1.2,
    do: async (d) => {
      const l = d.lesson;
      d.clearHighlights();
      const card = d.card({
        kicker: 'À retenir',
        title: l.title,
        bullets: l.recap,
        footer: d.job.next ? `Leçon suivante : ${d.job.next}` : 'Fin de la formation — bravo !',
      });
      await d.wait(0.8);
      await card.reveal(1.1);
    },
  };
}

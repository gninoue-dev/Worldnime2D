// Point d'entrée des tutoriels dans la page (dist/tutorial.js, chargé seulement en mode tutoriel).
// Joue une leçon : préparation hors caméra, puis chaque étape pendant la durée de sa narration.

import { Director } from './director.js';
import { LESSONS } from '../lessons/index.js';

async function main() {
  const ctx = window.wn2dTutorial;
  const job = await ctx.api.tutorialJob();
  const lesson = LESSONS.find((l) => l.id === job.lesson);
  if (!lesson) throw new Error(`Leçon inconnue : ${job.lesson}`);
  const d = new Director(ctx, job, lesson);

  // Préparation hors caméra (projet de départ, images de démonstration…).
  await d.wait(0.5);
  if (lesson.setup) await lesson.setup(d);
  await d.wait(0.6);

  await ctx.api.tutorialStart();
  await d.wait(0.3);
  for (let i = 0; i < lesson.steps.length; i++) {
    const step = lesson.steps[i];
    const narration = job.durations[i] ?? 0;
    // La narration démarre ici ; les actions de l'étape se déroulent en même temps.
    await ctx.api.tutorialMark(`step-${i}`);
    d.stepStart = performance.now();
    const actions = step.do ? Promise.resolve(step.do(d)) : Promise.resolve();
    await Promise.all([actions, d.wait(narration)]);
    await d.wait(step.pause ?? 0.45);
  }
  await d.wait(0.8);
  await ctx.api.tutorialFinish({ ok: true });
}

main().catch(async (err) => {
  console.error(`ÉCHEC DU TUTORIEL : ${err.stack || err.message}`);
  await window.wn2dTutorial.api.tutorialFinish({ ok: false, error: err.message });
});

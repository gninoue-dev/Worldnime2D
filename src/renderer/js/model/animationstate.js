// Lecture de plusieurs animations à la fois, avec fondus (l'équivalent de l'AnimationState de Spine).
//
// Pistes : la piste 0 donne la pose de base, les pistes suivantes s'appliquent par-dessus (avec leur alpha).
// Changer d'animation sur une piste fait un fondu de mixDuration secondes depuis l'animation précédente.
// Une piste a une file d'attente : addAnimation() enchaîne quand l'animation courante se termine.

export class TrackEntry {
  constructor(animation, loop) {
    this.animation = animation;
    this.loop = loop;
    this.time = 0;
    this.lastTime = -1;
    this.timeScale = 1;
    this.alpha = 1;
    this.delay = 0;
    this.mixDuration = 0;
    this.mixTime = 0;
    // Entrée dont on vient (pendant le fondu) et entrée suivante (file d'attente).
    this.from = null;
    this.next = null;
  }

  get mix() {
    return this.mixDuration > 0 ? Math.min(1, this.mixTime / this.mixDuration) : 1;
  }

  // L'animation non bouclée est terminée.
  get complete() {
    return !this.animation || (!this.loop && this.time >= this.animation.duration);
  }
}

export class AnimationState {
  constructor(skeleton, { defaultMix = 0.2 } = {}) {
    this.skeleton = skeleton;
    this.defaultMix = defaultMix;
    this.mixes = new Map();
    this.tracks = [];
    // Appelé pour chaque événement d'animation déclenché : (piste, clé d'événement).
    this.onEvent = null;
  }

  setMix(from, to, duration) {
    this.mixes.set(`${from}\u0000${to}`, duration);
  }

  getMix(from, to) {
    return this.mixes.get(`${from}\u0000${to}`) ?? this.defaultMix;
  }

  // Remplace l'animation de la piste (avec fondu depuis l'animation actuelle).
  setAnimation(track, animation, loop = true) {
    const entry = new TrackEntry(animation, loop);
    const current = this.tracks[track];
    if (current) {
      entry.from = current.animation ? current : current.from;
      if (entry.from) entry.from.next = null;
      entry.mixDuration = entry.from?.animation && animation ? this.getMix(entry.from.animation.name, animation.name) : this.defaultMix;
    }
    this.tracks[track] = entry;
    return entry;
  }

  // Fait disparaître la piste en fondu.
  setEmptyAnimation(track, mixDuration = this.defaultMix) {
    const e = this.setAnimation(track, null, false);
    e.mixDuration = mixDuration;
    return e;
  }

  // Enchaîne une animation après la dernière de la file de la piste. delay (secondes) : avant de
  // commencer ; pour une animation non bouclée, delay compte depuis sa fin (fondu inclus si delay ≤ 0).
  addAnimation(track, animation, loop = true, delay = 0) {
    let last = this.tracks[track];
    if (!last) return this.setAnimation(track, animation, loop);
    while (last.next) last = last.next;
    const entry = new TrackEntry(animation, loop);
    entry.mixDuration = last.animation && animation ? this.getMix(last.animation.name, animation.name) : this.defaultMix;
    // Le départ se mesure en temps de l'entrée précédente.
    const d = last.animation?.duration ?? 0;
    entry.delay = last.loop ? delay : Math.max(0, d + delay - (delay <= 0 ? entry.mixDuration : 0));
    last.next = entry;
    return entry;
  }

  clearTracks() {
    this.tracks = [];
  }

  update(dt) {
    this.tracks.forEach((e, i) => {
      if (!e) return;
      e.lastTime = e.time;
      e.time += dt * e.timeScale;
      if (e.from) {
        e.from.lastTime = e.from.time;
        e.from.time += dt * e.from.timeScale;
        e.mixTime += dt;
        if (e.mixTime >= e.mixDuration) e.from = null;
      }
      // Entrée suivante de la file.
      if (e.next && e.time >= e.next.delay) {
        const next = e.next;
        next.from = e;
        next.time = e.time - next.delay;
        next.lastTime = -1;
        e.next = null;
        this.tracks[i] = next;
      }
      // Piste vide terminée.
      if (!this.tracks[i].animation && !this.tracks[i].from) this.tracks[i] = null;
    });
  }

  // Applique toutes les pistes à la pose courante du squelette (qui est d'abord remise à la pose de base).
  apply(skeleton = this.skeleton) {
    skeleton.setToSetupPose();
    this.tracks.forEach((e, i) => {
      if (!e) return;
      const base = i === 0 ? 1 : e.alpha;
      const events = [];
      if (e.from?.animation) {
        // L'animation précédente s'efface pendant que la nouvelle apparaît.
        // (Avec l'alpha de l'animation qui s'efface, pas celui de la nouvelle.)
        const fromBase = i === 0 ? 1 : e.from.alpha;
        const fromAlpha = i === 0 && e.animation ? 1 : fromBase * (1 - e.mix);
        e.from.animation.apply(skeleton, e.from.time, { loop: e.from.loop, alpha: fromAlpha, lastTime: e.from.lastTime, events: e.mix < 0.5 ? events : null });
      }
      if (e.animation) {
        e.animation.apply(skeleton, e.time, { loop: e.loop, alpha: base * e.mix, lastTime: e.lastTime, events });
      }
      if (this.onEvent) for (const k of events) this.onEvent(i, k);
    });
  }
}

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Skeleton } from '../src/renderer/js/model/skeleton.js';
import { AnimationState } from '../src/renderer/js/model/animationstate.js';

const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

function setup() {
  const sk = new Skeleton();
  const bras = sk.addBone('bras', sk.root);
  bras.length = 50;
  const marche = sk.addAnimation('marche');
  marche.setKey('bone', 'bras', 'rotate', { time: 0, value: 10 });
  marche.setKey('bone', 'bras', 'rotate', { time: 1, value: 10 });
  const saut = sk.addAnimation('saut');
  saut.setKey('bone', 'bras', 'rotate', { time: 0, value: 90 });
  saut.setKey('bone', 'bras', 'rotate', { time: 0.5, value: 90 });
  saut.setKey('events', '', 'events', { time: 0.25, name: 'decolle' });
  const salut = sk.addAnimation('salut');
  salut.setKey('bone', 'bras', 'translate', { time: 0, x: 0, y: 30 });
  sk.posed = true;
  return { sk, bras, marche, saut, salut };
}

function run(state, sk, dt) {
  state.update(dt);
  state.apply(sk);
  sk.updateWorldTransform();
}

test('fondu entre deux animations sur la même piste', () => {
  const { sk, bras, marche, saut } = setup();
  const st = new AnimationState(sk, { defaultMix: 0.4 });
  st.setAnimation(0, marche, true);
  run(st, sk, 0.1);
  close(bras.pose.rotation, 10);
  st.setAnimation(0, saut, false);
  run(st, sk, 0.2);
  // À mi-fondu : entre 10 et 90.
  close(bras.pose.rotation, 50);
  run(st, sk, 0.3);
  close(bras.pose.rotation, 90);
  assert.equal(st.tracks[0].from, null);
});

test('mélange réglé par paire, rotation par le plus court chemin', () => {
  const { sk, bras, marche } = setup();
  const tourne = sk.addAnimation('tourne');
  tourne.setKey('bone', 'bras', 'rotate', { time: 0, value: -20 + 360 });
  const st = new AnimationState(sk);
  st.setMix('marche', 'tourne', 1);
  st.setAnimation(0, marche, true);
  run(st, sk, 0.01);
  st.setAnimation(0, tourne, true);
  run(st, sk, 0.5);
  // De 10° à 340° (= -20°) : on passe par -5°, pas par 175°.
  close(((bras.pose.rotation % 360) + 540) % 360 - 180, -5, 0.01);
});

test('file d\'attente, piste supérieure, événements, piste vidée', () => {
  const { sk, bras, marche, saut, salut } = setup();
  const st = new AnimationState(sk, { defaultMix: 0 });
  const events = [];
  st.onEvent = (track, k) => events.push(`${track}:${k.name}`);
  st.setAnimation(0, saut, false);
  st.addAnimation(0, marche, true, 0);
  run(st, sk, 0.3);
  assert.deepEqual(events, ['0:decolle']);
  close(bras.pose.rotation, 90);
  run(st, sk, 0.3);
  assert.equal(st.tracks[0].animation, marche);
  close(bras.pose.rotation, 10);
  // Piste 1 par-dessus, à moitié.
  const e = st.setAnimation(1, salut, true);
  e.alpha = 0.5;
  run(st, sk, 0.1);
  close(bras.pose.y, 15);
  close(bras.pose.rotation, 10);
  st.setEmptyAnimation(1, 0.2);
  run(st, sk, 0.1);
  close(bras.pose.y, 7.5);
  run(st, sk, 0.2);
  assert.equal(st.tracks[1], null);
  close(bras.pose.y, 0);
});

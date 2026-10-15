import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Skeleton } from '../src/renderer/js/model/skeleton.js';
import { RegionAttachment } from '../src/renderer/js/model/attachment.js';
import { Animation } from '../src/renderer/js/model/animation.js';
import { evaluateCurve } from '../src/renderer/js/model/curve.js';
import { parseProject, projectToText } from '../src/renderer/js/model/format.js';

const close = (a, b, eps = 1e-4) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

function rig() {
  const sk = new Skeleton();
  const bras = sk.addBone('bras', sk.root);
  bras.rotation = 30;
  bras.length = 100;
  bras.x = 10;
  bras.scaleX = 2;
  const sA = sk.addSlot('a', bras);
  const sB = sk.addSlot('b', bras);
  for (const n of ['ouvert', 'ferme']) sk.addAttachment(sA, new RegionAttachment(n));
  sA.attachment = 'ouvert';
  sB.color = '#ffffffff';
  const anim = sk.addAnimation('marche');
  return { sk, bras, sA, sB, anim };
}

function pose(sk, anim, time, opts) {
  sk.posed = true;
  sk.setToSetupPose();
  anim.apply(sk, time, opts);
  sk.updateWorldTransform();
}

test('courbes : linéaire, palier, Bézier', () => {
  close(evaluateCurve(undefined, 0.3), 0.3);
  close(evaluateCurve('stepped', 0.9), 0);
  close(evaluateCurve([0.42, 0, 0.58, 1], 0.5), 0.5, 1e-3);
  assert.ok(evaluateCurve([0.42, 0, 1, 1], 0.25) < 0.25);
  assert.ok(evaluateCurve([0, 0, 0.58, 1], 0.25) > 0.25);
  // Dépassement : la valeur passe au-delà de 1.
  assert.ok(Math.max(...[0.6, 0.7, 0.8].map((p) => evaluateCurve([0.34, 1.56, 0.64, 1], p))) > 1);
});

test('rotation relative à la pose de base, interpolée', () => {
  const { sk, bras, anim } = rig();
  anim.setKey('bone', 'bras', 'rotate', { time: 0, value: 0 });
  anim.setKey('bone', 'bras', 'rotate', { time: 1, value: 90 });
  pose(sk, anim, 0.5);
  close(bras.pose.rotation, 75);
  close(bras.worldRotationX, 75);
  // Retoucher la pose de base décale toute l'animation.
  bras.rotation = 0;
  pose(sk, anim, 1);
  close(bras.pose.rotation, 90);
});

test('position ajoutée, échelle multipliée, cisaillement ajouté', () => {
  const { sk, bras, anim } = rig();
  anim.setKey('bone', 'bras', 'translate', { time: 0, x: 5, y: -5 });
  anim.setKey('bone', 'bras', 'scale', { time: 0, x: 0.5, y: 3 });
  anim.setKey('bone', 'bras', 'shear', { time: 0, x: 0, y: 20 });
  pose(sk, anim, 0);
  close(bras.pose.x, 15);
  close(bras.pose.y, -5);
  close(bras.pose.scaleX, 1);
  close(bras.pose.scaleY, 3);
  close(bras.pose.shearY, 20);
});

test('avant la première clé : pose de base ; après la dernière : dernière valeur', () => {
  const { sk, bras, anim } = rig();
  anim.setKey('bone', 'bras', 'rotate', { time: 0.5, value: 10 });
  anim.setKey('bone', 'bras', 'rotate', { time: 1, value: 20 });
  pose(sk, anim, 0.2);
  close(bras.pose.rotation, 30);
  pose(sk, anim, 5);
  close(bras.pose.rotation, 50);
});

test('palier : la valeur saute à la clé suivante', () => {
  const { sk, bras, anim } = rig();
  anim.setKey('bone', 'bras', 'rotate', { time: 0, value: 0, curve: 'stepped' });
  anim.setKey('bone', 'bras', 'rotate', { time: 1, value: 90 });
  pose(sk, anim, 0.99);
  close(bras.pose.rotation, 30);
  pose(sk, anim, 1);
  close(bras.pose.rotation, 120);
});

test('remplacer une clé au même instant garde sa courbe', () => {
  const { anim } = rig();
  anim.setKey('bone', 'bras', 'rotate', { time: 0, value: 0, curve: 'stepped' });
  anim.setKey('bone', 'bras', 'rotate', { time: 0, value: 45 });
  const keys = anim.timeline('bone', 'bras', 'rotate');
  assert.equal(keys.length, 1);
  assert.equal(keys[0].curve, 'stepped');
  assert.equal(keys[0].value, 45);
});

test('pièce jointe et couleur des slots', () => {
  const { sk, sA, sB, anim } = rig();
  anim.setKey('slot', 'a', 'attachment', { time: 0.5, name: 'ferme' });
  anim.setKey('slot', 'a', 'attachment', { time: 1, name: null });
  anim.setKey('slot', 'b', 'rgba', { time: 0, color: '#000000ff' });
  anim.setKey('slot', 'b', 'rgba', { time: 1, color: '#ffffff00' });
  pose(sk, anim, 0.25);
  assert.equal(sA.pose.attachment, 'ouvert');
  pose(sk, anim, 0.5);
  assert.equal(sk.currentAttachment(sA).name, 'ferme');
  assert.equal(sB.pose.color, '#80808080');
  pose(sk, anim, 1);
  assert.equal(sA.pose.attachment, null);
});

test('couleur sombre animée', () => {
  const { sk, sB, anim } = rig();
  anim.setKey('slot', 'b', 'rgba2', { time: 0, light: '#ffffffff', dark: '#000000' });
  anim.setKey('slot', 'b', 'rgba2', { time: 1, light: '#ffffffff', dark: '#ff0000' });
  pose(sk, anim, 0.5);
  assert.equal(sB.pose.dark, '#800000');
});

test('ordre d\'affichage animé, slot ajouté après coup placé correctement', () => {
  const { sk, anim, sA, sB } = rig();
  anim.setKey('drawOrder', '', 'drawOrder', { time: 0.5, order: ['b', 'a'] });
  pose(sk, anim, 0);
  assert.deepEqual(sk.drawOrder.map((s) => s.name), ['a', 'b']);
  pose(sk, anim, 0.6);
  assert.deepEqual(sk.drawOrder.map((s) => s.name), ['b', 'a']);
  sk.addSlot('c', sk.root);
  pose(sk, anim, 0.6);
  assert.deepEqual(sk.drawOrder.map((s) => s.name), ['b', 'a', 'c']);
  assert.ok(sA && sB);
});

test('événements, y compris au tour de boucle', () => {
  const { anim } = rig();
  anim.setKey('events', '', 'events', { time: 0, name: 'debut' });
  anim.setKey('events', '', 'events', { time: 0.5, name: 'pas' });
  anim.setKey('bone', 'bras', 'rotate', { time: 1, value: 0 });
  const sk = new Skeleton();
  const got = (t, lt) => {
    const ev = [];
    anim.apply(sk, t, { loop: true, lastTime: lt, events: ev });
    return ev.map((e) => e.name);
  };
  assert.deepEqual(got(0, -1), ['debut']);
  assert.deepEqual(got(0.6, 0.1), ['pas']);
  assert.deepEqual(got(1.2, 0.8), ['debut']);
  assert.deepEqual(got(1.55, 1.2), ['pas']);
});

test('renommer ou supprimer un os, un slot, une pièce jointe met à jour les animations', () => {
  const { sk, bras, sA, anim } = rig();
  anim.setKey('bone', 'bras', 'rotate', { time: 0, value: 1 });
  anim.setKey('slot', 'a', 'attachment', { time: 0, name: 'ferme' });
  anim.setKey('drawOrder', '', 'drawOrder', { time: 0, order: ['b', 'a'] });
  sk.renameBone(bras, 'epaule');
  sk.renameSlot(sA, 'main');
  sk.renameAttachment(sA, 'ferme', 'poing');
  assert.ok(anim.timeline('bone', 'epaule', 'rotate'));
  assert.equal(anim.timeline('slot', 'main', 'attachment')[0].name, 'poing');
  assert.deepEqual(anim.drawOrder[0].order, ['b', 'main']);
  sk.removeSlot(sA);
  assert.equal(anim.slots.size, 0);
  assert.deepEqual(anim.drawOrder[0].order, ['b']);
  sk.removeBone(sk.findBone('epaule'));
  assert.equal(anim.bones.size, 0);
});

test('durée = dernière clé ; copie indépendante', () => {
  const { anim } = rig();
  anim.setKey('bone', 'bras', 'rotate', { time: 0.4, value: 1 });
  anim.setKey('slot', 'a', 'attachment', { time: 1.25, name: 'ferme' });
  close(anim.duration, 1.25);
  const c = anim.copy('copie');
  c.setKey('bone', 'bras', 'rotate', { time: 2, value: 1 });
  close(anim.duration, 1.25);
  close(c.duration, 2);
});

test('enregistrement et relecture des animations et événements', () => {
  const { sk, anim } = rig();
  sk.fps = 24;
  const ev = sk.addEvent('pas');
  ev.int = 3;
  ev.audio = 'sons/pas.ogg';
  anim.setKey('bone', 'bras', 'rotate', { time: 0, value: 0, curve: [0.42, 0, 0.58, 1] });
  anim.setKey('bone', 'bras', 'scale', { time: 0.5, x: 1.2, y: 0.8, curve: 'stepped' });
  anim.setKey('slot', 'a', 'attachment', { time: 0.5, name: 'ferme' });
  anim.setKey('slot', 'b', 'rgba2', { time: 0.5, light: '#ff8800ff', dark: '#112233' });
  anim.setKey('drawOrder', '', 'drawOrder', { time: 0.25, order: ['b', 'a'] });
  anim.setKey('events', '', 'events', { time: 0.3, name: 'pas', int: 3 });
  const text = projectToText(sk, { appVersion: 't' });
  const sk2 = parseProject(text);
  assert.equal(projectToText(sk2, { appVersion: 't' }), text);
  assert.equal(sk2.fps, 24);
  assert.equal(sk2.events.get('pas').audio, 'sons/pas.ogg');
  assert.deepEqual(sk2.findAnimation('marche').timeline('bone', 'bras', 'rotate')[0].curve, [0.42, 0, 0.58, 1]);
});

test('animations invalides refusées', () => {
  const base = { format: 'worldnime2d', formatVersion: 3, bones: [{ name: 'root' }] };
  const t = (animations) => JSON.stringify({ ...base, animations });
  assert.throws(() => parseProject(t({ a: { bones: { root: { tourne: [] } } } })), /inconnue/);
  assert.throws(() => parseProject(t({ a: { bones: { root: { rotate: [{ time: -1, value: 0 }] } } } })), /négatif/);
  assert.throws(() => parseProject(t({ a: { bones: { root: { rotate: [{ time: 0, value: 0, curve: [2, 0, 0, 1] }] } } } })), /Courbe/);
  assert.throws(() => parseProject(t({ a: { slots: { s: { rgba: [{ time: 0, color: 'rouge' }] } } } })), /Couleur/);
});

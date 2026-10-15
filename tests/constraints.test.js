import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Skeleton } from '../src/renderer/js/model/skeleton.js';
import { straightPath } from '../src/renderer/js/model/path.js';
import { parseProject, projectToText } from '../src/renderer/js/model/format.js';

const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

// Bras de deux os de 100, le long de X, et une cible.
function bras() {
  const sk = new Skeleton();
  const haut = sk.addBone('haut', sk.root);
  haut.length = 100;
  const bas = sk.addBone('bas', haut);
  bas.x = 100;
  bas.length = 100;
  const cible = sk.addBone('cible', sk.root);
  cible.x = 120;
  cible.y = 80;
  return { sk, haut, bas, cible };
}

test('IK à un os : l\'os pointe vers la cible, la pose de base ne change pas', () => {
  const { sk, haut, cible } = bras();
  const ik = sk.addConstraint('ik', 'ik_haut');
  ik.bones = ['haut'];
  ik.target = 'cible';
  sk.updateWorldTransform();
  close(haut.worldRotationX, Math.atan2(80, 120) * 180 / Math.PI);
  assert.equal(haut.rotation, 0);
  // Mélange à 50 %.
  ik.mix = 0.5;
  sk.updateWorldTransform();
  close(haut.worldRotationX, Math.atan2(80, 120) * 90 / Math.PI);
  assert.ok(cible);
});

test('IK à un os : étirement et compression', () => {
  const { sk, haut, cible } = bras();
  const ik = sk.addConstraint('ik', 'ik');
  ik.bones = ['haut'];
  ik.target = 'cible';
  ik.stretch = true;
  cible.x = 300;
  cible.y = 0;
  sk.updateWorldTransform();
  close(haut.tipX, 300, 0.01);
  ik.stretch = false;
  ik.compress = true;
  cible.x = 50;
  sk.updateWorldTransform();
  close(haut.tipX, 50, 0.01);
});

test('IK à deux os : le bout de la chaîne atteint la cible, sens de pliage', () => {
  const { sk, haut, bas, cible } = bras();
  const ik = sk.addConstraint('ik', 'ik_bras');
  ik.bones = ['haut', 'bas'];
  ik.target = 'cible';
  sk.updateWorldTransform();
  close(bas.tipX, cible.worldX, 0.05);
  close(bas.tipY, cible.worldY, 0.05);
  const coudeY = bas.worldY;
  ik.bendPositive = false;
  sk.updateWorldTransform();
  close(bas.tipX, cible.worldX, 0.05);
  close(bas.tipY, cible.worldY, 0.05);
  // L'autre sens de pliage met le coude de l'autre côté de la ligne épaule-cible.
  const side = (y, x) => Math.sign(80 * x - 120 * y);
  assert.notEqual(side(coudeY, haut.worldX + 0), 0);
  assert.ok(Math.abs(bas.worldY - coudeY) > 10);
});

test('IK à deux os : cible hors de portée, souplesse, étirement', () => {
  const { sk, bas, cible } = bras();
  const ik = sk.addConstraint('ik', 'ik');
  ik.bones = ['haut', 'bas'];
  ik.target = 'cible';
  cible.x = 400;
  cible.y = 0;
  sk.updateWorldTransform();
  close(bas.tipX, 200, 0.05);
  // Souplesse : près de l'extension, la chaîne ne se tend pas complètement.
  cible.x = 199;
  ik.softness = 20;
  sk.updateWorldTransform();
  assert.ok(bas.tipX < 199 && bas.tipX > 180, String(bas.tipX));
  ik.softness = 0;
  ik.stretch = true;
  cible.x = 300;
  sk.updateWorldTransform();
  close(bas.tipX, 300, 0.5);
});

test('contrainte de transformation : monde absolu et local relatif', () => {
  const { sk, haut, cible } = bras();
  cible.rotation = 30;
  cible.scaleX = 2;
  const tc = sk.addConstraint('transform', 'copie');
  tc.bones = ['haut'];
  tc.target = 'cible';
  sk.updateWorldTransform();
  close(haut.worldX, 120);
  close(haut.worldY, 80);
  close(haut.worldRotationX, 30);
  close(haut.worldScaleX, 2);
  tc.local = true;
  tc.relative = true;
  tc.mixX = 0;
  tc.mixY = 0;
  tc.mixScaleX = 0;
  haut.rotation = 10;
  sk.updateWorldTransform();
  close(haut.worldRotationX, 40);
});

test('contrainte de chemin : les os se placent le long du chemin', () => {
  const { sk, haut, bas } = bras();
  const support = sk.addBone('support', sk.root);
  support.y = 50;
  support.rotation = 90;
  const slot = sk.addSlot('chemin', support);
  const path = straightPath('chemin', 300, 4);
  sk.addAttachment(slot, path);
  slot.attachment = 'chemin';
  const pc = sk.addConstraint('path', 'suivre');
  pc.bones = ['haut', 'bas'];
  pc.target = 'chemin';
  pc.position = 0.1;
  sk.updateWorldTransform();
  // Chemin vertical de (0, 50) à (0, 350) ; 10 % = 30 → origine du premier os en (0, 80).
  close(haut.worldX, 0, 0.5);
  close(haut.worldY, 80, 0.5);
  close(haut.worldRotationX, 90, 0.5);
  close(bas.worldY, 180, 0.5);
});

test('contrainte physique : l\'os se balance puis revient', () => {
  const sk = new Skeleton();
  const corps = sk.addBone('corps', sk.root);
  const queue = sk.addBone('queue', corps);
  queue.length = 100;
  const ph = sk.addConstraint('physics', 'balancement');
  ph.bones = ['queue'];
  ph.rotate = 1;
  ph.strength = 60;
  ph.damping = 0.9;
  sk.updateWorldTransform('reset');
  // On déplace brusquement le corps : la queue traîne derrière.
  corps.y = 50;
  let maxAngle = 0;
  for (let i = 0; i < 60; i++) {
    sk.time += 1 / 60;
    sk.updateWorldTransform('update');
    maxAngle = Math.max(maxAngle, Math.abs(queue.worldRotationX));
  }
  assert.ok(maxAngle > 5, `balancement ${maxAngle}`);
  for (let i = 0; i < 600; i++) {
    sk.time += 1 / 60;
    sk.updateWorldTransform('update');
  }
  assert.ok(Math.abs(queue.worldRotationX) < 1, `revenu : ${queue.worldRotationX}`);
});

test('ordre d\'évaluation, renommer, supprimer, animations des contraintes', () => {
  const { sk } = bras();
  const a = sk.addConstraint('ik', 'a');
  a.bones = ['bas'];
  a.target = 'cible';
  const b = sk.addConstraint('transform', 'b');
  assert.equal(b.order, a.order + 1);
  b.bones = ['haut'];
  b.target = 'cible';
  const anim = sk.addAnimation('anim');
  anim.setKey('ik', 'a', 'ik', { time: 0, mix: 1, softness: 0, bendPositive: true });
  anim.setKey('ik', 'a', 'ik', { time: 1, mix: 0, softness: 10, bendPositive: false });
  sk.posed = true;
  sk.setToSetupPose();
  anim.apply(sk, 0.5);
  close(a.pose.mix, 0.5);
  close(a.pose.softness, 5);
  assert.equal(a.pose.bendPositive, true);
  sk.renameConstraint(a, 'ik_bas');
  assert.ok(anim.timeline('ik', 'ik_bas', 'ik'));
  sk.renameBone(sk.findBone('cible'), 'but');
  assert.equal(b.target, 'but');
  sk.removeBone(sk.findBone('but'));
  assert.equal(sk.constraints.length, 0);
  assert.equal(anim.constraints.size, 0);
});

test('enregistrement et relecture des contraintes, des chemins et de leurs clés', () => {
  const { sk } = bras();
  const ik = sk.addConstraint('ik', 'ik');
  ik.bones = ['haut', 'bas'];
  ik.target = 'cible';
  ik.softness = 4;
  const slot = sk.addSlot('chemin', sk.root);
  const p = straightPath('chemin', 100, 3);
  p.closed = true;
  sk.addAttachment(slot, p);
  const pc = sk.addConstraint('path', 'suivi');
  pc.bones = ['haut'];
  pc.target = 'chemin';
  pc.rotateMode = 'chain';
  const ph = sk.addConstraint('physics', 'phys');
  ph.bones = ['bas'];
  ph.gravity = 3;
  const anim = sk.addAnimation('a');
  anim.setKey('path', 'suivi', 'position', { time: 0, position: 0.25, curve: 'stepped' });
  anim.setKey('physics', 'phys', 'physics', { time: 0.5, inertia: 1, strength: 50, damping: 1, mass: 1, wind: 2, gravity: 0, mix: 1 });
  anim.setKey('physicsReset', '', 'physicsReset', { time: 0.75, name: 'phys' });
  const text = projectToText(sk, { appVersion: 't' });
  const sk2 = parseProject(text);
  assert.equal(projectToText(sk2, { appVersion: 't' }), text);
  assert.equal(sk2.findConstraint('suivi').rotateMode, 'chain');
  assert.equal(sk2.getAttachment(sk2.findSlot('chemin'), 'chemin').closed, true);
  assert.throws(() => parseProject(text.replace('"target": "cible"', '"target": "nulle_part"')), /cible inconnu/);
});

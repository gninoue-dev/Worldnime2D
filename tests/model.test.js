import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Skeleton } from '../src/renderer/js/model/skeleton.js';
import { INHERIT } from '../src/renderer/js/model/bone.js';
import { parseProject, projectToText } from '../src/renderer/js/model/format.js';
import { wrapDeg, distToSegment } from '../src/renderer/js/model/math.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

function bras() {
  const sk = new Skeleton();
  const epaule = sk.addBone('epaule', sk.root);
  epaule.x = 10;
  epaule.y = 20;
  epaule.rotation = 90;
  epaule.length = 50;
  const coude = sk.addBone('coude', epaule);
  coude.x = 50;
  coude.rotation = 90;
  coude.length = 40;
  sk.updateWorldTransform();
  return { sk, epaule, coude };
}

test('la racine existe et ne peut pas être supprimée', () => {
  const sk = new Skeleton();
  assert.equal(sk.bones.length, 1);
  assert.equal(sk.root.name, 'root');
  assert.throws(() => sk.removeBone(sk.root));
});

test('transformations monde en chaîne', () => {
  const { epaule, coude } = bras();
  close(epaule.worldX, 10);
  close(epaule.worldY, 20);
  close(epaule.tipX, 10);
  close(epaule.tipY, 70);
  close(coude.worldX, 10);
  close(coude.worldY, 70);
  close(coude.worldRotationX, 180);
  close(coude.tipX, -30);
  close(coude.tipY, 70);
});

test('l\'échelle du parent se transmet, sauf en mode noScale', () => {
  const { sk, epaule, coude } = bras();
  epaule.scaleX = 2;
  epaule.scaleY = 2;
  sk.updateWorldTransform();
  close(coude.worldY, 120);
  close(coude.worldScaleX, 2);
  coude.inherit = INHERIT.noScale;
  sk.updateWorldTransform();
  close(coude.worldScaleX, 1);
  close(coude.worldRotationX, 180);
});

test('onlyTranslation ignore la rotation du parent', () => {
  const { sk, coude } = bras();
  coude.inherit = INHERIT.onlyTranslation;
  sk.updateWorldTransform();
  close(coude.worldRotationX, 90);
  close(coude.worldX, 10);
  close(coude.worldY, 70);
});

test('noRotationOrReflection garde la rotation locale à l\'écran', () => {
  const { sk, coude } = bras();
  coude.inherit = INHERIT.noRotationOrReflection;
  coude.rotation = 30;
  sk.updateWorldTransform();
  close(coude.worldRotationX, 30);
});

test('cisaillement : les axes ne sont plus perpendiculaires', () => {
  const sk = new Skeleton();
  sk.root.shearY = 30;
  sk.updateWorldTransform();
  const angleY = Math.atan2(sk.root.d, sk.root.b) * 180 / Math.PI;
  close(angleY, 120);
});

test('worldToLocal / localToWorld sont réciproques', () => {
  const { coude } = bras();
  const w = coude.localToWorld(12, -7);
  const l = coude.worldToLocal(w.x, w.y);
  close(l.x, 12);
  close(l.y, -7);
});

test('changer de parent garde la position et l\'angle à l\'écran', () => {
  const { sk, coude } = bras();
  const avant = { x: coude.worldX, y: coude.worldY, r: coude.worldRotationX };
  sk.reparent(coude, sk.root);
  close(coude.worldX, avant.x);
  close(coude.worldY, avant.y);
  close(wrapDeg(coude.worldRotationX - avant.r), 0);
  assert.equal(coude.parent, sk.root);
});

test('interdit les boucles de parenté', () => {
  const { sk, epaule, coude } = bras();
  assert.throws(() => sk.reparent(epaule, coude));
  assert.throws(() => sk.reparent(epaule, epaule));
});

test('supprimer un os supprime ses descendants', () => {
  const { sk, epaule } = bras();
  const removed = sk.removeBone(epaule);
  assert.equal(removed.length, 2);
  assert.equal(sk.bones.length, 1);
  assert.equal(sk.root.children.length, 0);
});

test('noms uniques', () => {
  const sk = new Skeleton();
  sk.addBone('bone', sk.root);
  assert.equal(sk.uniqueBoneName('bone'), 'bone2');
  assert.throws(() => sk.addBone('bone', sk.root));
  const b = sk.findBone('bone');
  assert.throws(() => sk.renameBone(b, 'root'));
  assert.throws(() => sk.renameBone(b, '  '));
  sk.renameBone(b, ' bras ');
  assert.equal(b.name, 'bras');
});

test('ordre : parent toujours avant ses enfants', () => {
  const { sk, epaule, coude } = bras();
  const main = sk.addBone('main', coude);
  sk.addBone('tete', sk.root);
  sk.reparent(epaule, sk.findBone('tete'));
  const idx = (b) => sk.bones.indexOf(b);
  assert.ok(idx(sk.findBone('tete')) < idx(epaule));
  assert.ok(idx(epaule) < idx(coude));
  assert.ok(idx(coude) < idx(main));
});

test('sauvegarde puis ouverture donne le même squelette', () => {
  const { sk, coude } = bras();
  coude.scaleY = 0.5;
  coude.shearX = 12;
  coude.inherit = INHERIT.noScaleOrReflection;
  coude.color = '#ff8800';
  sk.updateWorldTransform();
  const texte = projectToText(sk, { appVersion: '0.1.0' });
  const sk2 = parseProject(texte);
  assert.equal(projectToText(sk2, { appVersion: '0.1.0' }), texte);
  const c2 = sk2.findBone('coude');
  assert.equal(c2.parent.name, 'epaule');
  close(c2.tipX, sk.findBone('coude').tipX);
});

test('les fichiers invalides sont refusés avec un message clair', () => {
  assert.throws(() => parseProject('pas du json'), /JSON/);
  assert.throws(() => parseProject('{"format":"autre"}'), /pas un projet/);
  assert.throws(() => parseProject('{"format":"worldnime2d","formatVersion":99,"bones":[{"name":"root"}]}'), /plus récente/);
  assert.throws(
    () => parseProject('{"format":"worldnime2d","formatVersion":1,"bones":[{"name":"root"},{"name":"a","parent":"x"}]}'),
    /Parent introuvable/,
  );
  assert.throws(
    () => parseProject('{"format":"worldnime2d","formatVersion":1,"bones":[{"name":"root","x":"12"}]}'),
    /invalide/,
  );
});

test('outils mathématiques', () => {
  close(wrapDeg(190), -170);
  close(wrapDeg(-180), 180);
  close(distToSegment(5, 5, 0, 0, 10, 0), 5);
  close(distToSegment(-3, 4, 0, 0, 10, 0), 5);
});

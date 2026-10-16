import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Editor } from '../src/renderer/js/editor/editor.js';
import { RegionAttachment } from '../src/renderer/js/model/attachment.js';

function setup() {
  const editor = new Editor('test');
  const sk = editor.skeleton;
  editor.apply(() => {
    const bras = sk.addBone('bras', sk.root);
    bras.length = 50;
    const main = sk.addBone('main', bras);
    main.x = 50;
    const slot = sk.addSlot('bras', bras);
    sk.addAttachment(slot, new RegionAttachment('bras'));
    slot.attachment = 'bras';
    sk.addSlot('main', main);
  });
  return { editor, sk: () => editor.skeleton };
}

test('dupliquer un os copie ses descendants et leurs slots', () => {
  const { editor, sk } = setup();
  editor.select(sk().findBone('bras'));
  editor.duplicateSelected();
  assert.equal(editor.selected.name, 'bras2');
  assert.ok(sk().findBone('main2'));
  const copy = sk().findSlot('bras2');
  assert.equal(copy.bone, sk().findBone('bras2'));
  assert.equal(copy.attachment, 'bras');
  assert.ok(sk().getAttachment(copy, 'bras'));
  assert.ok(sk().findSlot('main2'));
});

test('dupliquer une pièce jointe garde la même image', () => {
  const { editor, sk } = setup();
  editor.selectAttachment(sk().findSlot('bras'), 'bras');
  editor.duplicateSelected();
  assert.equal(editor.selectedAttachment, 'bras2');
  assert.equal(editor.attachment.imagePath, 'bras');
});

test('supprimer une pièce jointe, puis un slot, puis annuler', () => {
  const { editor, sk } = setup();
  editor.selectAttachment(sk().findSlot('bras'), 'bras');
  editor.deleteSelected();
  assert.equal(sk().findSlot('bras').attachment, null);
  assert.equal(editor.selectionKind, 'slot');
  editor.deleteSelected();
  assert.equal(sk().findSlot('bras'), null);
  editor.undo();
  editor.undo();
  assert.equal(sk().findSlot('bras').attachment, 'bras');
  assert.equal(editor.selectionKind, 'attachment');
  assert.equal(editor.selectedAttachment, 'bras');
});

test('changer la sélection ne marque pas le projet comme modifié', () => {
  const { editor, sk } = setup();
  editor.markSaved('/tmp/x.wn2d');
  editor.selectSlot(sk().findSlot('main'));
  assert.equal(editor.dirty, false);
});

test('mode Animation : création de l\'animation, clés depuis la pose, pose de base intacte', () => {
  const { editor, sk } = setup();
  editor.setMode('animate');
  assert.equal(editor.animation.name, 'animation');
  const bras = sk().findBone('bras');
  editor.setFrame(15);
  editor.apply(() => {
    bras.pose.rotation = 40;
    editor.keyBone(bras, ['rotate']);
  });
  assert.equal(bras.rotation, 0);
  assert.equal(editor.animation.timeline('bone', 'bras', 'rotate')[0].value, 40);
  assert.equal(editor.keyState('bone', 'bras', 'rotate'), 'key');
  editor.setFrame(0);
  assert.equal(editor.keyState('bone', 'bras', 'rotate'), 'timeline');
  // Avant la première clé : pose de base.
  assert.equal(bras.pose.rotation, 0);
  editor.setMode('setup');
  assert.equal(sk().posed, false);
});

test('lecture en boucle et événements', () => {
  const { editor, sk } = setup();
  editor.setMode('animate');
  editor.apply(() => {
    sk().addEvent('pas');
    editor.animation.setKey('events', '', 'events', { time: 0.5, name: 'pas' });
    editor.animation.setKey('bone', 'bras', 'rotate', { time: 1, value: 90 });
  });
  const fired = [];
  editor.addEventListener('events', (e) => fired.push(...e.detail.map((k) => k.name)));
  editor.togglePlay();
  editor.step(0.4);
  assert.deepEqual(fired, []);
  editor.step(0.2);
  assert.deepEqual(fired, ['pas']);
  editor.step(0.6);
  assert.ok(Math.abs(editor.time - 0.2) < 1e-9);
  editor.step(0.4);
  assert.deepEqual(fired, ['pas', 'pas']);
  editor.loop = false;
  editor.step(5);
  assert.equal(editor.playing, false);
  assert.equal(editor.time, 1);
});

test('déplacer, copier, coller, supprimer des clés ; annuler', () => {
  const { editor, sk } = setup();
  editor.setMode('animate');
  const anim = editor.animation;
  editor.apply(() => {
    anim.setKey('bone', 'bras', 'rotate', { time: 0, value: 0 });
    anim.setKey('bone', 'bras', 'rotate', { time: 10 / 30, value: 45 });
  });
  const k = anim.timeline('bone', 'bras', 'rotate')[1];
  editor.selectKeys([{ owner: 'bone', name: 'bras', type: 'rotate', key: k }]);
  editor.begin();
  editor.moveSelectedKeys(5);
  editor.commit();
  assert.ok(Math.abs(k.time - 0.5) < 1e-9);
  editor.copySelectedKeys();
  editor.setFrame(30);
  editor.pasteKeys();
  assert.equal(editor.animation.timeline('bone', 'bras', 'rotate').length, 3);
  editor.setCurve('stepped');
  assert.equal(editor.animation.timeline('bone', 'bras', 'rotate')[2].curve, 'stepped');
  editor.deleteSelectedKeys();
  assert.equal(editor.animation.timeline('bone', 'bras', 'rotate').length, 2);
  editor.undo();
  editor.undo();
  editor.undo();
  assert.equal(editor.animation.timeline('bone', 'bras', 'rotate').length, 2);
  assert.ok(Math.abs(editor.animation.timeline('bone', 'bras', 'rotate')[1].time - 0.5) < 1e-9);
  editor.undo();
  assert.ok(Math.abs(editor.animation.timeline('bone', 'bras', 'rotate')[1].time - 10 / 30) < 1e-5);
  assert.ok(sk());
});

test('étirer des clés dans le temps et plage de lecture', () => {
  const { editor } = setup();
  editor.setMode('animate');
  const anim = editor.animation;
  editor.apply(() => {
    anim.setKey('bone', 'bras', 'rotate', { time: 10 / 30, value: 0 });
    anim.setKey('bone', 'bras', 'rotate', { time: 20 / 30, value: 10 });
    anim.setKey('bone', 'bras', 'rotate', { time: 40 / 30, value: 20 });
  });
  const keys = anim.timeline('bone', 'bras', 'rotate');
  editor.selectKeys(keys.map((key) => ({ owner: 'bone', name: 'bras', type: 'rotate', key })));
  const originals = new Map(keys.map((k) => [k, k.time]));
  editor.scaleSelectedKeys(2, 10 / 30, originals);
  assert.deepEqual(keys.map((k) => Math.round(k.time * 30)), [10, 30, 70]);
  editor.scaleSelectedKeys(0.5, 10 / 30, originals);
  assert.deepEqual(keys.map((k) => Math.round(k.time * 30)), [10, 15, 25]);

  editor.setRange(10, 20);
  editor.setFrame(18);
  editor.togglePlay();
  editor.step(4 / 30);
  assert.equal(editor.frame, 12);
  editor.setRange(null);
  assert.equal(editor.range, null);
});

test("pièce jointe d'une skin désactivée : la sélection retombe sur le slot", () => {
  const { editor, sk } = setup();
  editor.apply(() => {
    const fete = sk().addSkin('fete');
    sk().addAttachment(sk().findSlot('main'), new RegionAttachment('foulard'), fete);
    sk().activeSkins = ['fete'];
  });
  editor.selectAttachment(sk().findSlot('main'), 'foulard');
  assert.equal(editor.selectionKind, 'attachment');
  editor.apply(() => { sk().activeSkins = []; });
  assert.equal(editor.attachment, null);
  assert.equal(editor.selectionKind, 'slot');
  editor.apply(() => { sk().activeSkins = ['fete']; });
  assert.equal(editor.selectionKind, 'attachment');
});

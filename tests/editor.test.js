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

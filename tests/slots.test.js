import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Skeleton } from '../src/renderer/js/model/skeleton.js';
import { RegionAttachment, quadContains } from '../src/renderer/js/model/attachment.js';
import { parseProject, projectToText } from '../src/renderer/js/model/format.js';
import { hexToRgba, rgbaToHex, joinAlpha, splitAlpha } from '../src/renderer/js/model/color.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

function perso() {
  const sk = new Skeleton();
  const corps = sk.addBone('corps', sk.root);
  corps.y = 100;
  corps.rotation = 90;
  corps.length = 80;
  const tete = sk.addBone('tete', corps);
  tete.x = 80;
  sk.updateWorldTransform();
  const sCorps = sk.addSlot('corps', corps);
  const sTete = sk.addSlot('tete', tete);
  const att = new RegionAttachment('tete');
  att.width = 40;
  att.height = 20;
  att.x = 10;
  sk.addAttachment(sTete, att);
  sTete.attachment = 'tete';
  return { sk, corps, tete, sCorps, sTete, att };
}

test('ordre d\'affichage : ajout devant, déplacement', () => {
  const { sk, sCorps, sTete } = perso();
  assert.deepEqual(sk.slots.map((s) => s.name), ['corps', 'tete']);
  sk.moveSlot(sTete, 0);
  assert.deepEqual(sk.slots.map((s) => s.name), ['tete', 'corps']);
  sk.moveSlot(sCorps, 99);
  assert.equal(sk.slots.at(-1), sCorps);
  const fond = sk.addSlot('fond', sk.root, 0);
  assert.equal(sk.slots[0], fond);
});

test('coins d\'une image dans le monde', () => {
  const { sk, sTete, tete } = perso();
  const v = sk.getAttachment(sTete, 'tete').worldVertices(tete);
  // L'os tête est à (0, 180), tourné de 90° : l'axe X local pointe vers le haut.
  // Centre de l'image : 10 le long de l'os → (0, 190). Largeur 40 le long de l'os, hauteur 20 en travers.
  close(v[0], 10); close(v[1], 170); // bas-gauche
  close(v[4], -10); close(v[5], 210); // haut-droite
  assert.ok(quadContains(v, 0, 190));
  assert.ok(!quadContains(v, 30, 190));
});

test('noms de slots uniques, renommage propagé à la skin', () => {
  const { sk, sTete } = perso();
  assert.throws(() => sk.addSlot('tete', sk.root));
  assert.equal(sk.uniqueSlotName('tete'), 'tete2');
  sk.renameSlot(sTete, 'visage');
  assert.ok(sk.getAttachment(sTete, 'tete'));
  assert.equal(sk.defaultSkin.attachmentsOf('tete').size, 0);
});

test('renommer une pièce jointe garde le chemin de l\'image', () => {
  const { sk, sTete } = perso();
  sk.renameAttachment(sTete, 'tete', 'tete_face');
  const att = sk.getAttachment(sTete, 'tete_face');
  assert.equal(att.imagePath, 'tete');
  assert.equal(sTete.attachment, 'tete_face');
  sk.renameAttachment(sTete, 'tete_face', 'tete');
  assert.equal(att.path, null);
});

test('supprimer un os supprime ses slots et leurs images', () => {
  const { sk, corps } = perso();
  sk.removeBone(corps);
  assert.equal(sk.slots.length, 0);
  assert.equal(sk.defaultSkin.attachments.size, 0);
});

test('changer l\'os d\'un slot garde l\'image à sa place', () => {
  const { sk, sTete, tete, att } = perso();
  const avant = att.worldVertices(tete);
  sk.setSlotBone(sTete, sk.root);
  const apres = att.worldVertices(sk.root);
  for (let i = 0; i < 8; i++) close(apres[i], avant[i], 1e-4);
});

test('sauvegarde et relecture des slots, couleurs et images', () => {
  const { sk, sTete, sCorps } = perso();
  sTete.color = '#ff000080';
  sTete.dark = '#202040';
  sTete.blend = 'additive';
  sk.images = './images/';
  sk.reference = { path: 'ref.png', x: 5, y: -3, scale: 0.5, alpha: 0.4, visible: true };
  const deux = new RegionAttachment('corps_b');
  deux.path = 'variantes/corps';
  sk.addAttachment(sCorps, deux);
  const texte = projectToText(sk, { appVersion: 'test' });
  const sk2 = parseProject(texte);
  assert.equal(projectToText(sk2, { appVersion: 'test' }), texte);
  const s2 = sk2.findSlot('tete');
  assert.equal(s2.blend, 'additive');
  assert.equal(s2.dark, '#202040');
  assert.equal(sk2.getAttachment(sk2.findSlot('corps'), 'corps_b').imagePath, 'variantes/corps');
  assert.equal(sk2.images, './images/');
  assert.equal(sk2.reference.scale, 0.5);
});

test('un projet v0.1 (formatVersion 1) s\'ouvre toujours', () => {
  const sk = parseProject('{"format":"worldnime2d","formatVersion":1,"bones":[{"name":"root"},{"name":"a","parent":"root","length":10}],"slots":[],"skins":[]}');
  assert.equal(sk.bones.length, 2);
  assert.equal(sk.slots.length, 0);
});

test('slots invalides refusés', () => {
  const base = { format: 'worldnime2d', formatVersion: 2, bones: [{ name: 'root' }] };
  const t = (extra) => JSON.stringify({ ...base, ...extra });
  assert.throws(() => parseProject(t({ slots: [{ name: 's', bone: 'x' }] })), /Os introuvable/);
  assert.throws(() => parseProject(t({ slots: [{ name: 's', bone: 'root', color: 'rouge' }] })), /Couleur/);
  assert.throws(() => parseProject(t({ slots: [{ name: 's', bone: 'root', blend: 'magie' }] })), /fusion/);
  assert.throws(() => parseProject(t({ skins: [{ name: 'default', attachments: { s: {} } }] })), /Slot introuvable/);
});

test('une pièce jointe visible manquante est ignorée', () => {
  const sk = parseProject(JSON.stringify({
    format: 'worldnime2d', formatVersion: 2, bones: [{ name: 'root' }],
    slots: [{ name: 's', bone: 'root', attachment: 'fantome' }],
  }));
  assert.equal(sk.findSlot('s').attachment, null);
});

test('couleurs', () => {
  assert.deepEqual(hexToRgba('#ff000080').map((v) => Math.round(v * 255)), [255, 0, 0, 128]);
  assert.equal(rgbaToHex(1, 0.5, 0, 1), '#ff8000ff');
  assert.equal(joinAlpha('#336699', 0.5), '#33669980');
  assert.deepEqual(splitAlpha('#336699ff'), { rgb: '#336699', alpha: 1 });
});

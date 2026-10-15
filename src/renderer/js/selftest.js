// Test automatique de l'interface, lancé avec la variable WN2D_SELFTEST=<dossier>.
// Il simule la souris et le clavier comme un utilisateur, vérifie le résultat et prend des captures.

import { TOOLS } from './editor/editor.js';
import { parseProject } from './model/format.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

export async function runSelftest({ editor, viewport, api, ...extra }) {
  const checks = [];
  const check = (name, ok, detail = '') => checks.push({ name, ok: Boolean(ok), detail: String(detail) });
  const canvas = viewport.canvas;

  const client = (wx, wy) => {
    const s = viewport.toScreen(wx, wy);
    const r = canvas.getBoundingClientRect();
    return { clientX: r.left + s.x, clientY: r.top + s.y };
  };
  const pointer = (type, wx, wy, extra = {}) => {
    canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true, pointerId: 1, button: 0, buttons: type === 'pointerup' ? 0 : 1, ...client(wx, wy), ...extra,
    }));
  };
  const dragWorld = async (from, to, extra = {}) => {
    pointer('pointerdown', from[0], from[1], extra);
    for (let i = 1; i <= 6; i++) {
      const t = i / 6;
      pointer('pointermove', from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, extra);
    }
    pointer('pointerup', to[0], to[1], extra);
    await frame();
  };
  const near = (a, b, eps = 0.5) => Math.abs(a - b) <= eps;

  try {
    await wait(300);
    viewport.centerView();
    const sk = () => editor.skeleton;

    // 1. Création d'une chaîne d'os à la souris.
    editor.setTool(TOOLS.create);
    editor.select(sk().root);
    await dragWorld([0, 0], [0, 120]);
    const b1 = sk().findBone('bone');
    check('création d\'un os', b1 && b1.parent === sk().root, b1?.name);
    check('longueur et angle', b1 && near(b1.length, 120) && near(b1.rotation, 90), `${b1?.length} ${b1?.rotation}`);

    await dragWorld([0, 120], [80, 180]);
    const b2 = sk().findBone('bone2');
    check('enfant de l\'os sélectionné', b2 && b2.parent === b1);
    check('bout de l\'os enfant au bon endroit', b2 && near(b2.tipX, 80, 1) && near(b2.tipY, 180, 1), `${b2?.tipX} ${b2?.tipY}`);

    pointer('pointerdown', 150, 60);
    pointer('pointerup', 150, 60);
    const b3 = sk().findBone('bone3');
    check('clic simple = os de longueur nulle', b3 && b3.length === 0 && near(b3.worldX, 150) && near(b3.worldY, 60));

    await dragWorld([-60, 0], [-160, -40]);
    check('os créé depuis un point vide', sk().bones.length === 5);
    await frame();
    await api.selftestCapture('01-creation');

    // 2. Rotation à la souris, avec annulation par Échap puis validation.
    editor.setTool(TOOLS.rotate);
    const bone2 = sk().findBone('bone2');
    editor.select(bone2);
    const rotBefore = bone2.rotation;
    pointer('pointerdown', 100, 120);
    pointer('pointermove', 100, 200);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    pointer('pointerup', 100, 200);
    check('Échap annule le geste', near(sk().findBone('bone2').rotation, rotBefore));

    await dragWorld([80, 180], [0, 220]);
    const rotated = sk().findBone('bone2');
    check('rotation à la souris', !near(rotated.rotation, rotBefore, 5), `${rotBefore} → ${rotated.rotation}`);
    check('la rotation ne déplace pas l\'origine', near(rotated.worldX, 0) && near(rotated.worldY, 120));

    // 3. Annuler / rétablir.
    const afterRotation = sk().findBone('bone2').rotation;
    editor.undo();
    check('annuler', near(sk().findBone('bone2').rotation, rotBefore));
    editor.redo();
    check('rétablir', near(sk().findBone('bone2').rotation, afterRotation));

    // 4. Déplacement et échelle.
    editor.setTool(TOOLS.translate);
    const b3t = sk().findBone('bone3');
    const [ox, oy] = [b3t.worldX, b3t.worldY];
    await dragWorld([ox, oy], [ox + 20, oy - 30]);
    const b3m = sk().findBone('bone3');
    check('déplacement', editor.selected === b3m && near(b3m.worldX, ox + 20) && near(b3m.worldY, oy - 30), `${b3m.worldX} ${b3m.worldY}`);

    editor.setTool(TOOLS.scale);
    editor.select(sk().findBone('bone'));
    await dragWorld([0, 60], [0, 90]);
    const b1s = sk().findBone('bone');
    check('échelle le long de l\'os', near(b1s.scaleX, 1.5, 0.02), b1s.scaleX);
    editor.undo();

    // 5. Panneau de propriétés : modification d'un champ.
    editor.select(sk().findBone('bone'));
    const fields = document.querySelectorAll('.props input[type="number"]');
    const rotField = [...fields][3];
    rotField.value = '45';
    rotField.dispatchEvent(new Event('change'));
    check('champ Rotation', near(sk().findBone('bone').rotation, 45));

    // 6. Changement de parent en gardant la position.
    const child = sk().findBone('bone2');
    const wx = child.worldX;
    const wy = child.worldY;
    editor.apply(() => sk().reparent(child, sk().root));
    const moved = sk().findBone('bone2');
    check('changer de parent garde la position', moved.parent === sk().root && near(moved.worldX, wx) && near(moved.worldY, wy));

    // 7. Renommer et supprimer.
    editor.apply(() => sk().renameBone(sk().findBone('bone'), 'torse'));
    check('renommer', sk().findBone('torse') && !sk().findBone('bone'));
    editor.select(sk().findBone('bone3'));
    const count = sk().bones.length;
    const family = 1 + sk().descendants(sk().findBone('bone3')).length;
    editor.deleteSelected();
    check('supprimer (avec les descendants)', sk().bones.length === count - family && !sk().findBone('bone3'));

    // 8. Sauvegarde : le texte relu donne le même squelette.
    const text = editor.toText();
    const reread = parseProject(text);
    check('format .wn2d relisible', reread.bones.length === sk().bones.length && reread.findBone('torse'));
    check('projet marqué modifié', editor.dirty);

    viewport.frameAll();
    editor.setTool(TOOLS.select);
    editor.select(sk().findBone('bone2'));
    await frame();
    await wait(100);
    await api.selftestCapture('02-edition');

    document.getElementById('help').showModal();
    await frame();
    await api.selftestCapture('03-aide');
    document.getElementById('help').close();

    if (extra.info?.selftestOra) await testV02({ editor, viewport, api, check, near, pointer, dragWorld, ...extra });
    if (extra.info?.selftestOra) await testV03({ editor, viewport, api, check, near, pointer, dragWorld, ...extra });
    if (extra.info?.selftestOra) await testV05({ editor, viewport, api, check, near, pointer, dragWorld, ...extra });
    await testV06({ editor, viewport, api, check, near, pointer, dragWorld, ...extra });
    if (extra.info?.selftestOra) await testV07({ editor, viewport, api, check, near, pointer, dragWorld, ...extra });
    if (extra.info?.selftestOra) await testV08({ editor, viewport, api, check, near, pointer, dragWorld, ...extra });
  } catch (err) {
    check('exception', false, err.stack || err.message);
  }

  const ok = checks.every((c) => c.ok);
  await api.selftestDone({ ok, checks });
}

// --- v0.2 : images, slots, ordre d'affichage, couleurs, import ORA ---------------------------

// Couleur [r, g, b] du pixel de la vue au point monde (wx, wy).
function pixelAt(viewport, wx, wy) {
  viewport.app.renderer.render(viewport.app.stage);
  const src = viewport.app.canvas;
  const s = viewport.toScreen(wx, wy);
  const ratio = src.width / viewport.width;
  const c = new OffscreenCanvas(1, 1);
  const ctx = c.getContext('2d');
  ctx.drawImage(src, Math.round(s.x * ratio), Math.round(s.y * ratio), 1, 1, 0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2]];
}

async function waitFor(fn, ms = 4000) {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    if (fn()) return true;
    await wait(50);
  }
  return false;
}

async function testV02({ editor, viewport, api, check, near, pointer, dragWorld, library, actions, importLayers, info, setTab }) {
  const sk = () => editor.skeleton;
  const { Skeleton } = await import('./model/skeleton.js');
  editor.reset(new Skeleton());
  await wait(100);

  // 1. Import d'un fichier ORA (un calque « tete » au-dessus des autres est attendu).
  const imagesDir = `${info.selftestDir}/images`;
  const res = await importLayers(info.selftestOra, imagesDir);
  const n = res?.count ?? 0;
  check('import ORA : calques importés', n > 1, n);
  check('import ORA : une image par calque', library.list.length === n, library.list.length);
  check('import ORA : un slot par calque', sk().slots.length === n, sk().slots.length);
  check('ordre d\'affichage = ordre des calques (tête devant)', sk().slots.at(-1).name === 'tete', sk().slots.at(-1).name);
  const tete = sk().findSlot('tete');
  const attTete = sk().visibleAttachment(tete);
  const others = sk().slots.filter((s) => s !== tete).map((s) => sk().visibleAttachment(s).y);
  check('placement : la tête est au-dessus des autres pièces', others.every((y) => attTete.y > y), `${attTete.y}`);
  check('placement : les pièces sont au-dessus de l\'origine', Math.min(...others) > 0, Math.min(...others));
  const size = actions.imageSize('tete');
  check('taille réelle de l\'image', size && attTete.width === size.width && attTete.height === size.height);

  viewport.frameAll();
  await frame();
  // Point d'échantillonnage : dans la tête, à l'écart de l'axe vertical de la grille.
  const probe = { x: attTete.x + attTete.width * 0.15, y: attTete.y + attTete.height * 0.1 };
  viewport.attachments.visible = false;
  viewport.render();
  const bg = pixelAt(viewport, probe.x, probe.y);
  viewport.attachments.visible = true;
  viewport.render();
  const px = pixelAt(viewport, probe.x, probe.y);
  check('l\'image est vraiment dessinée (shader)', Math.abs(px[0] - bg[0]) + Math.abs(px[1] - bg[1]) + Math.abs(px[2] - bg[2]) > 30, `${px} vs ${bg}`);
  await api.selftestCapture('04-import-ora');

  // 2. Clic sur l'image de la tête : sélection de la pièce jointe.
  editor.setTool('select');
  pointer('pointerdown', attTete.x, attTete.y);
  pointer('pointerup', attTete.x, attTete.y);
  check('clic sur une image = sélection', editor.selectionKind === 'attachment' && editor.selectedSlot?.name === 'tete', editor.selectionKind);

  // 3. Rotation de l'image à la souris, puis annulation.
  editor.setTool('rotate');
  const r0 = editor.attachment.rotation;
  await dragWorld([attTete.x + 100, attTete.y], [attTete.x, attTete.y + 100]);
  check('rotation d\'une image', near(sk().findSlot('tete') && sk().visibleAttachment(sk().findSlot('tete')).rotation, r0 + 90, 1),
    sk().visibleAttachment(sk().findSlot('tete')).rotation);
  editor.undo();
  check('annuler la rotation de l\'image', near(sk().visibleAttachment(sk().findSlot('tete')).rotation, r0));

  // 4. Couleur, transparence, teinte sombre et fusion.
  const before = pixelAt(viewport, probe.x, probe.y);
  editor.apply(() => {
    const s = sk().findSlot('tete');
    s.color = '#ff0000ff';
  });
  await frame();
  const red = pixelAt(viewport, probe.x, probe.y);
  check('teinte rouge appliquée', red[1] < before[1] * 0.5 + 5 && red[2] < before[2] * 0.5 + 5, `${before} → ${red}`);
  editor.apply(() => {
    const s = sk().findSlot('tete');
    s.color = '#ffffffff';
    s.dark = '#00ff00';
  });
  await frame();
  const dark = pixelAt(viewport, probe.x, probe.y);
  if (viewport.rendererName === 'webgl') {
    check('teinte sombre appliquée (WebGL)', dark[1] > before[1] + 20, `${before} → ${dark}`);
  } else {
    check(`mode de secours (${viewport.rendererName}) : la teinte sombre est ignorée sans erreur`, dark[1] === before[1], `${before} → ${dark}`);
  }
  editor.apply(() => {
    const s = sk().findSlot('tete');
    s.dark = null;
    s.blend = 'additive';
  });
  await frame();
  await api.selftestCapture('05-couleurs');
  editor.apply(() => {
    sk().findSlot('tete').blend = 'normal';
  });

  // 5. Un os pour la tête, puis le slot change d'os sans bouger à l'écran.
  editor.apply(() => {
    const b = sk().addBone('tete', sk().root);
    b.x = attTete.x;
    b.y = attTete.y - 120;
    b.rotation = 80;
    b.length = 150;
  });
  const t = sk().findSlot('tete');
  const v0 = sk().visibleAttachment(t).worldVertices(t.bone);
  editor.apply(() => sk().setSlotBone(sk().findSlot('tete'), sk().findBone('tete')));
  const t2 = sk().findSlot('tete');
  const v1 = sk().visibleAttachment(t2).worldVertices(t2.bone);
  check('changer l\'os d\'un slot garde l\'image en place', [...v0].every((v, i) => near(v, v1[i], 0.05)));
  editor.setTool('rotate');
  editor.select(sk().findBone('tete'));
  await dragWorld([sk().findBone('tete').tipX, sk().findBone('tete').tipY], [attTete.x + 200, attTete.y]);
  const moved = sk().visibleAttachment(sk().findSlot('tete')).worldVertices(sk().findBone('tete'));
  check('l\'image suit la rotation de son os', !near(moved[0], v1[0], 1));

  // 6. Dépôt d'une image sur la vue : nouveau slot sur l'os sélectionné.
  editor.select(sk().root);
  const dropped = library.list[0].path;
  viewport.onDropImage(dropped, { x: 400, y: 300 });
  const drop = sk().findSlot(`${dropped}2`);
  check('dépôt d\'une image : nouveau slot', drop && near(sk().visibleAttachment(drop).x, 400) && sk().slots.at(-1) === drop);

  // 7. Ordre d'affichage par l'onglet Ordre.
  setTab('draworder');
  editor.apply(() => sk().moveSlot(drop, 0));
  check('déplacer dans l\'ordre d\'affichage', sk().slots[0] === drop);
  await frame();
  await api.selftestCapture('06-ordre');
  setTab('images');
  await frame();
  await api.selftestCapture('07-images');
  setTab('tree');

  // 8. Enregistrement sur disque, chemins relatifs, puis réouverture.
  const projectFile = `${info.selftestDir}/heroine.wn2d`;
  sk().images = await api.relativePath(projectFile, library.dir);
  check('chemin des images relatif au projet', sk().images === 'images', sk().images);
  await api.writeText(projectFile, editor.toText());
  editor.markSaved(projectFile);
  const text = editor.toText();
  editor.reset(new Skeleton());
  await waitFor(() => library.dir === null);
  editor.loadText(text, projectFile);
  const reloaded = await waitFor(() => library.dir && library.list.length === n);
  check('réouverture : images retrouvées', reloaded && sk().slots.length === n + 1);
  check('réouverture : rien de modifié', !editor.dirty);

  // 9. Image de référence.
  editor.apply(() => {
    sk().reference = { path: `images/${library.list[0].file}`, x: 600, y: 700, scale: 1, alpha: 0.4, visible: true };
  });
  editor.emit('reset');
  const refOk = await waitFor(() => viewport.referenceSprite.visible);
  check('image de référence affichée', refOk);

  // 10. Propriétés d'un slot dans le panneau.
  const other = sk().slots.find((s) => s.name !== 'tete');
  editor.selectSlot(other);
  await frame();
  const blendSelect = [...document.querySelectorAll('.props select')].find((sel) => [...sel.options].some((o) => o.value === 'screen'));
  blendSelect.value = 'screen';
  blendSelect.dispatchEvent(new Event('change'));
  check('panneau : mode de fusion du slot', sk().findSlot(other.name).blend === 'screen');

  editor.selectAttachment(sk().findSlot('tete'), sk().findSlot('tete').attachment);
  viewport.frameAll();
  await frame();
  await wait(100);
  await api.selftestCapture('08-final');

  // 11. Import PSD : calques dans un groupe, calque caché ignoré, mode produit et opacité.
  if (info.selftestPsd) {
    editor.reset(new Skeleton());
    await waitFor(() => library.dir === null);
    const psd = await importLayers(info.selftestPsd, `${info.selftestDir}/images_psd`);
    check('import PSD : 4 calques visibles (groupe compris, caché ignoré)', psd?.count === 4, psd?.count);
    check('import PSD : ordre (tête devant, jambes au fond)', sk().slots.at(-1).name === 'tete' && sk().slots[0].name === 'jambes',
      sk().slots.map((x) => x.name).join(','));
    const ombre = sk().findSlot('ombre_torse');
    check('import PSD : mode produit et opacité 50 %', ombre?.blend === 'multiply' && ombre.color === '#ffffff80', `${ombre?.blend} ${ombre?.color}`);
    const head = sk().visibleAttachment(sk().findSlot('tete'));
    check('import PSD : recadrage sur les pixels (70 × 110)', head.width === 70 && head.height === 110, `${head.width}×${head.height}`);
    // Document 300 × 500, tête de x 115 à 185, y 30 à 140 → centre (150 ; 85) → monde (0 ; 415).
    check('import PSD : position de la tête', near(head.x, 0) && near(head.y, 415), `${head.x} ${head.y}`);
    viewport.frameAll();
    await frame();
    const px = pixelAt(viewport, head.x + 15, head.y + 10);
    check('import PSD : couleur de la tête affichée', Math.abs(px[0] - 235) < 6 && Math.abs(px[1] - 190) < 6, String(px));
    await api.selftestCapture('09-import-psd');
  }
}

// --- v0.3 : animation ---------------------------------------------------------------------

async function testV03({ editor, viewport, api, check, near, dragWorld, library, importLayers, info, setTab, timeline }) {
  const sk = () => editor.skeleton;
  const { Skeleton } = await import('./model/skeleton.js');
  editor.setMode('setup');
  editor.reset(new Skeleton());
  await waitFor(() => library.dir === null);
  await importLayers(info.selftestOra, `${info.selftestDir}/images_anim`);

  // Un os pour la tête, avec le slot de la tête dessus.
  const head = sk().visibleAttachment(sk().findSlot('tete'));
  editor.apply(() => {
    const b = sk().addBone('cou', sk().root);
    b.x = head.x;
    b.y = head.y - head.height / 2;
    b.rotation = 90;
    b.length = head.height;
    sk().updateWorldTransform();
    sk().setSlotBone(sk().findSlot('tete'), b);
  });
  viewport.frameAll();

  // 1. Passage en mode Animation par le bouton.
  document.querySelector('.mode-btn[data-mode="animate"]').click();
  await frame();
  check('mode Animation : animation créée, timeline affichée', editor.animating && editor.animation && !document.getElementById('timeline').hidden);
  editor.setTool('rotate');
  const cou = () => sk().findBone('cou');
  editor.select(cou());

  // 2. Clé automatique à l'image 0 en tournant l'os.
  const tip0 = { x: cou().tipX, y: cou().tipY };
  await dragWorld([tip0.x, tip0.y], [tip0.x - 60, tip0.y]);
  const keys = () => editor.animation.timeline('bone', 'cou', 'rotate') ?? [];
  check('clé automatique à l\'image 0', keys().length === 1 && keys()[0].time === 0 && Math.abs(keys()[0].value) > 5, keys()[0]?.value);
  check('la pose de base n\'est pas modifiée', near(cou().rotation, 90));

  // 3. Clic dans la règle de la timeline : image 15.
  await frame();
  const tc = timeline.canvas;
  const tr = tc.getBoundingClientRect();
  const fx = (f) => tr.left + timeline.frameToX(f);
  const tpointer = (type, x, y, extra = {}) => tc.dispatchEvent(new PointerEvent(type, {
    bubbles: true, pointerId: 2, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y, ...extra,
  }));
  tpointer('pointerdown', fx(15), tr.top + 10);
  tpointer('pointerup', fx(15), tr.top + 10);
  check('clic dans la règle : image 15', editor.frame === 15, editor.frame);

  const tip1 = { x: cou().tipX, y: cou().tipY };
  await dragWorld([tip1.x, tip1.y], [tip1.x + 120, tip1.y - 20]);
  check('deuxième clé à l\'image 15', keys().length === 2 && near(keys()[1].time, 0.5, 1e-6));
  const r0 = keys()[0].value + 90;
  const r1 = keys()[1].value + 90;
  editor.setFrame(7);
  const mid = cou().pose.rotation;
  check('interpolation entre les clés', (mid - r0) * (mid - r1) < 0, `${r0} < ${mid} < ${r1}`);

  // 4. Pièce jointe animée par le rond de l'arbre, ordre d'affichage animé.
  setTab('tree');
  editor.setFrame(10);
  await frame();
  const eye = [...document.querySelectorAll('#tree .eye.on')][0];
  eye.click();
  const attKeys = [...editor.animation.slots.values()].some((t) => t.attachment?.some((k) => k.name === null));
  check('clé de pièce jointe (cacher une image)', attKeys);
  editor.selectSlot(sk().findSlot('tete'));
  setTab('draworder');
  document.querySelector('[data-cmd="move-down"]').click();
  check('clé d\'ordre d\'affichage', editor.animation.drawOrder.length === 1);

  // 5. Événement posé, puis lecture : l'événement est déclenché.
  setTab('animations');
  editor.apply(() => sk().addEvent('pas'));
  editor.setFrame(5);
  editor.apply(() => editor.animation.setKey('events', '', 'events', { time: editor.time, name: 'pas' }));
  const fired = [];
  const onEvents = (e) => fired.push(...e.detail.map((k) => k.name));
  editor.addEventListener('events', onEvents);
  editor.setFrame(0);
  editor.loop = true;
  editor.togglePlay();
  await wait(700);
  editor.togglePlay();
  editor.removeEventListener('events', onEvents);
  check('lecture : le temps avance', editor.time > 0.1, editor.time);
  check('lecture : événement déclenché', fired.includes('pas'), fired.join(','));

  // 6. Pelure d'oignon.
  editor.setFrame(8);
  editor.onion = true;
  editor.emit('onion');
  await frame();
  check('pelure d\'oignon affichée', viewport.ghostLayer.visible && viewport.ghostLayer.children.length >= 2, viewport.ghostLayer.children.length);
  await api.selftestCapture('10-animation-oignon');
  editor.onion = false;
  editor.emit('onion');

  // 7. Sélection d'une clé dans la timeline (clic sur le losange), puis glisser de 5 images.
  editor.select(cou());
  await frame();
  timeline.draw();
  const rows = timeline.rows();
  const ri = rows.findIndex((r) => r.kind === 'bone' && r.bone.name === 'cou');
  const ry = tr.top + 22 + ri * 20 + 10 - timeline.scrollY;
  tpointer('pointerdown', fx(15), ry);
  check('clic sur une clé : sélection', editor.selectedKeys.length === 1 && near(editor.selectedKeys[0].key.time, 0.5, 1e-6), editor.selectedKeys.length);
  tpointer('pointermove', fx(18), ry);
  tpointer('pointermove', fx(20), ry);
  tpointer('pointerup', fx(20), ry);
  check('glisser une clé : image 15 → 20', near(keys()[1].time, 20 / 30, 1e-6), keys()[1].time * 30);
  editor.undo();
  check('annuler le déplacement de la clé', near(keys()[1].time, 0.5, 1e-6));

  // 8. Courbe en palier sur la première clé.
  editor.selectKeys([{ owner: 'bone', name: 'cou', type: 'rotate', key: keys()[0] }]);
  editor.setCurve('stepped');
  editor.setFrame(10);
  check('courbe en palier', near(cou().pose.rotation, r0, 0.01), `${cou().pose.rotation} ≠ ${r0}`);

  // 9. Copier / coller.
  editor.copySelectedKeys();
  editor.setFrame(25);
  editor.pasteKeys();
  check('copier-coller de clé', keys().length === 3 && near(keys()[2].time, 25 / 30, 1e-6));

  // 10. Enregistrement / relecture des animations.
  const text = editor.toText();
  const { parseProject } = await import('./model/format.js');
  const again = parseProject(text);
  check('animations enregistrées et relues', again.findAnimation(editor.animationName).timeline('bone', 'cou', 'rotate').length === 3
    && again.events.has('pas'));

  await frame();
  await wait(80);
  await api.selftestCapture('11-timeline');

  // --- v0.4 : éditeur de courbes ---
  timeline.toggleView();
  editor.select(cou());
  editor.selectKeys([{ owner: 'bone', name: 'cou', type: 'rotate', key: keys()[1] }]);
  editor.setCurve('linear');
  editor.selectKeys([{ owner: 'bone', name: 'cou', type: 'rotate', key: keys()[1] }]);
  timeline.draw();
  const ch = timeline.graph.lastChannels.find((c) => c.type === 'rotate');
  check('courbes : la rotation de l\'os est tracée', Boolean(ch));
  // Poignée de sortie de la clé 2 (vers la clé 3) : on la tire vers le haut à droite.
  const hs = timeline.graph.handles(ch, 1);
  tpointer('pointerdown', tr.left + hs[0].x, tr.top + hs[0].y);
  tpointer('pointermove', tr.left + hs[0].x + 10, tr.top + hs[0].y - 30);
  tpointer('pointerup', tr.left + hs[0].x + 10, tr.top + hs[0].y - 30);
  const curved = keys()[1].curve;
  check('courbes : glisser une poignée crée une courbe de Bézier', Array.isArray(curved) && curved.length === 4, JSON.stringify(curved));
  // La pose entre les deux clés suit la courbe (différente du linéaire).
  editor.setFrame(20);
  const bez = cou().pose.rotation;
  const k1 = keys()[1];
  const k2 = keys()[2];
  const lin = 90 + k1.value + (k2.value - k1.value) * ((20 / 30 - k1.time) / (k2.time - k1.time));
  check('courbes : l\'interpolation suit la courbe', Math.abs(bez - lin) > 0.5, `${bez} vs linéaire ${lin}`);
  // Glisser le point de la clé vers le bas : la valeur change.
  const v1 = keys()[1].value;
  const kx = timeline.graph.timeToX(keys()[1].time);
  const ky = timeline.graph.valueToY(v1);
  tpointer('pointerdown', tr.left + kx, tr.top + ky);
  tpointer('pointermove', tr.left + kx, tr.top + ky + 25);
  tpointer('pointerup', tr.left + kx, tr.top + ky + 25);
  check('courbes : glisser une clé change sa valeur', keys()[1].value < v1 - 1, `${v1} → ${keys()[1].value}`);
  editor.undo();
  check('courbes : annuler', Math.abs(keys()[1].value - v1) < 0.01);
  await frame();
  await wait(60);
  await api.selftestCapture('12-courbes');
  timeline.toggleView();

  // 11. Retour en mode Configuration : pose de base.
  document.querySelector('.mode-btn[data-mode="setup"]').click();
  await frame();
  check('retour en Configuration : pose de base, timeline cachée', near(cou().pose.rotation, 90) && document.getElementById('timeline').hidden);
}

// --- v0.5 : maillages et poids --------------------------------------------------------------

function clickButton(text) {
  const b = [...document.querySelectorAll('.props button')].find((x) => x.textContent.includes(text));
  if (!b) throw new Error(`Bouton introuvable : ${text}`);
  b.click();
  return b;
}

async function testV05({ editor, viewport, api, check, near, pointer, dragWorld, library, importLayers, info, setTab }) {
  const sk = () => editor.skeleton;
  const { Skeleton } = await import('./model/skeleton.js');
  const { MeshAttachment } = await import('./model/mesh.js');
  editor.setMode('setup');
  editor.reset(new Skeleton());
  await waitFor(() => library.dir === null);
  await importLayers(info.selftestOra, `${info.selftestDir}/images_mesh`);
  setTab('tree');
  viewport.frameAll();
  const slot = () => sk().findSlot('torse');
  const att = () => sk().getAttachment(slot(), 'torse');
  editor.selectAttachment(slot(), 'torse');
  await frame();
  const regionVerts = Array.from(sk().attachmentVertices(slot(), att()));

  // 1. Conversion en maillage : même place à l'écran.
  clickButton('Convertir en maillage');
  check('maillage : conversion depuis une image', att() instanceof MeshAttachment && att().vertexCount === 4);
  const mv = sk().attachmentVertices(slot(), att());
  check('maillage : même place que l\'image', regionVerts.every((v, i) => near(v, mv[i], 0.01)));

  // 2. Contour automatique, points intérieurs.
  await frame();
  clickButton('Contour automatique');
  check('maillage : contour automatique', att().hull > 4, att().hull);
  await frame();
  clickButton('points intérieurs');
  check('maillage : points intérieurs', att().vertexCount > att().hull && att().triangles.length >= 3 * att().hull, att().vertexCount);
  // L'image reste dessinée (pixels au centre du torse).
  const c = (() => {
    const v = sk().attachmentVertices(slot(), att());
    let x = 0;
    let y = 0;
    for (let i = 0; i < v.length; i += 2) {
      x += v[i];
      y += v[i + 1];
    }
    return { x: (x * 2) / v.length + 13, y: (y * 2) / v.length + 9 };
  })();
  viewport.attachments.visible = false;
  viewport.render();
  const bg = pixelAt(viewport, c.x, c.y);
  viewport.attachments.visible = true;
  viewport.render();
  const px = pixelAt(viewport, c.x, c.y);
  check(`maillage : dessiné (${viewport.rendererName})`, Math.abs(px[0] - bg[0]) + Math.abs(px[1] - bg[1]) + Math.abs(px[2] - bg[2]) > 30, `${px} vs ${bg}`);

  // 3. Outil « Modifier le maillage » : glisser un sommet, en ajouter un, en supprimer un.
  clickButton('Modifier le maillage');
  check('maillage : outil Modifier actif', editor.meshTool === 'edit');
  editor.setTool('select');
  const v0 = sk().attachmentVertices(slot(), att());
  const vx = v0[0];
  const vy = v0[1];
  await dragWorld([vx, vy], [vx - 30, vy - 20]);
  const v1 = sk().attachmentVertices(slot(), att());
  check('maillage : glisser un sommet', near(v1[0], vx - 30, 0.5) && near(v1[1], vy - 20, 0.5), `${v1[0]},${v1[1]}`);
  const count = att().vertexCount;
  pointer('pointerdown', c.x + 3, c.y - 25);
  pointer('pointerup', c.x + 3, c.y - 25);
  check('maillage : clic = nouveau sommet', att().vertexCount === count + 1);
  const added = sk().attachmentVertices(slot(), att());
  const ai = [...viewport.mesh.selected][0];
  pointer('pointerdown', added[ai * 2], added[ai * 2 + 1], { altKey: true });
  pointer('pointerup', added[ai * 2], added[ai * 2 + 1], { altKey: true });
  check('maillage : Alt + clic = supprimer le sommet', att().vertexCount === count);
  // Ctrl + clic sur deux sommets du contour non voisins : arête imposée.
  const ev = sk().attachmentVertices(slot(), att());
  const h = att().hull;
  const ea = 0;
  const eb = Math.floor(h / 2);
  pointer('pointerdown', ev[ea * 2], ev[ea * 2 + 1], { ctrlKey: true });
  pointer('pointerup', ev[ea * 2], ev[ea * 2 + 1], { ctrlKey: true });
  pointer('pointerdown', ev[eb * 2], ev[eb * 2 + 1], { ctrlKey: true });
  pointer('pointerup', ev[eb * 2], ev[eb * 2 + 1], { ctrlKey: true });
  check('maillage : Ctrl + clic = arête', att().edges.length === 1);
  editor.setMeshTool('edit');

  // 4. Deux os le long du torse, liaison automatique.
  const box = (() => {
    const v = sk().attachmentVertices(slot(), att());
    const ys = [];
    for (let i = 1; i < v.length; i += 2) ys.push(v[i]);
    return { top: Math.max(...ys), bottom: Math.min(...ys) };
  })();
  editor.apply(() => {
    const haut = sk().addBone('torse_bas', sk().root);
    haut.x = c.x;
    haut.y = box.bottom;
    haut.rotation = 90;
    haut.length = (box.top - box.bottom) / 2;
    const bas = sk().addBone('torse_haut', haut);
    bas.x = haut.length;
    bas.length = haut.length;
  });
  editor.selectAttachment(slot(), 'torse');
  await frame();
  const boxes = [...document.querySelectorAll('.checklist input')];
  for (const cb of boxes) {
    if (['torse_bas', 'torse_haut'].includes(cb.value) !== cb.checked) cb.click();
  }
  const before = Array.from(sk().attachmentVertices(slot(), att()));
  clickButton('Lier aux os cochés');
  check('poids : liaison automatique', Boolean(att().weights) && att().weights.every((l) => l.length >= 1));
  const after = sk().attachmentVertices(slot(), att());
  check('poids : le maillage ne bouge pas à la liaison', before.every((v, i) => near(v, after[i], 0.05)));
  // On plie l'os du haut : le haut du torse suit, le bas reste.
  editor.apply(() => {
    sk().findBone('torse_haut').rotation = 40;
  });
  const bent = sk().attachmentVertices(slot(), att());
  let topMoved = 0;
  let bottomMoved = 0;
  for (let i = 0; i < bent.length; i += 2) {
    const d = Math.hypot(bent[i] - before[i], bent[i + 1] - before[i + 1]);
    if (before[i + 1] > box.top - 30) topMoved = Math.max(topMoved, d);
    if (before[i + 1] < box.bottom + 30) bottomMoved = Math.max(bottomMoved, d);
  }
  check('poids : le maillage suit les os', topMoved > 20 && bottomMoved < topMoved / 3, `haut ${topMoved.toFixed(1)}, bas ${bottomMoved.toFixed(1)}`);
  await frame();
  await wait(50);
  await api.selftestCapture('13-maillage-poids');
  editor.undo();

  // 5. Pinceau de poids, lissage, élagage.
  editor.selectAttachment(slot(), 'torse');
  await frame();
  editor.brush.bone = 'torse_haut';
  clickButton('Peindre les poids');
  check('poids : outil pinceau actif', editor.meshTool === 'weights');
  const wOf = (i, b) => att().weights[i].find((e) => e.bone === b)?.w ?? 0;
  const vb = sk().attachmentVertices(slot(), att());
  let lowest = 0;
  for (let i = 1; i < vb.length / 2; i++) if (vb[i * 2 + 1] < vb[lowest * 2 + 1]) lowest = i;
  const w0 = wOf(lowest, 'torse_haut');
  await dragWorld([vb[lowest * 2] - 5, vb[lowest * 2 + 1]], [vb[lowest * 2] + 5, vb[lowest * 2 + 1]]);
  check('poids : le pinceau augmente le poids', wOf(lowest, 'torse_haut') > w0 + 0.05, `${w0} → ${wOf(lowest, 'torse_haut')}`);
  await frame();
  await api.selftestCapture('14-pinceau-poids');
  editor.setMeshTool('weights');
  clickButton('Lisser les poids');
  clickButton('Élaguer');
  check('poids : lissés et élagués, normalisés', att().weights.every((l) => Math.abs(l.reduce((s2, e) => s2 + e.w, 0) - 1) < 1e-3 && l.every((e) => e.w >= 0.049)));

  // 6. Mode Animation : déformation libre (FFD) avec clé.
  editor.setMode('animate');
  editor.selectSlot(slot());
  await frame();
  clickButton('Déformer le maillage');
  check('déformation : outil actif', editor.meshTool === 'deform');
  editor.setFrame(10);
  const d0 = sk().attachmentVertices(slot(), att());
  await dragWorld([d0[0], d0[1]], [d0[0] + 25, d0[1] + 10]);
  const d1 = sk().attachmentVertices(slot(), att());
  check('déformation : le sommet suit la souris', near(d1[0], d0[0] + 25, 0.5) && near(d1[1], d0[1] + 10, 0.5), `${d1[0] - d0[0]}`);
  const dk = [...editor.animation.deform.values()][0];
  check('déformation : clé posée', dk?.length === 1 && near(dk[0].time, 10 / 30, 1e-6));
  editor.setFrame(0);
  const atZero = sk().attachmentVertices(slot(), att());
  check('déformation : animée (avant la clé : forme d\'origine)', !near(atZero[0], d1[0], 1));
  editor.setFrame(10);
  await frame();
  await api.selftestCapture('15-deformation');
  editor.setMeshTool('deform');
  editor.setMode('setup');

  // 7. Maillage lié.
  editor.selectAttachment(slot(), 'torse');
  await frame();
  clickButton('Créer un maillage lié');
  const linked = editor.attachment;
  check('maillage lié : créé et sélectionné', linked?.parent === 'torse');
  const lv = sk().attachmentVertices(slot(), linked);
  const pv = sk().attachmentVertices(slot(), att());
  check('maillage lié : même géométrie que le parent', lv.length === pv.length && lv.every((v, i) => near(v, pv[i], 1e-3)));

  // 8. Enregistrement et relecture.
  const { parseProject } = await import('./model/format.js');
  const again = parseProject(editor.toText());
  const s2 = again.findSlot('torse');
  check('maillages enregistrés et relus', again.getAttachment(s2, 'torse').weights && again.getAttachment(s2, linked.name).parent === 'torse'
    && again.animations[0].deform.size === 1);
}

// --- v0.6 : contraintes -------------------------------------------------------------------------

function setField(label, value) {
  const row = [...document.querySelectorAll('.props .prop-row')].find((r) => r.querySelector('span')?.textContent.trim().endsWith(label));
  if (!row) throw new Error(`Champ introuvable : ${label}`);
  const input = row.querySelector('input, select');
  if (input.type === 'checkbox') {
    if (input.checked !== value) input.click();
    return;
  }
  input.value = String(value);
  input.dispatchEvent(new Event('input'));
  input.dispatchEvent(new Event('change'));
}

async function testV06({ editor, viewport, api, check, near, dragWorld, library, setTab }) {
  const sk = () => editor.skeleton;
  const { Skeleton } = await import('./model/skeleton.js');
  editor.setMode('setup');
  editor.reset(new Skeleton());
  await waitFor(() => library.dir === null);
  setTab('tree');
  editor.apply(() => {
    const haut = sk().addBone('haut', sk().root);
    haut.length = 100;
    const bas = sk().addBone('bas', haut);
    bas.x = 100;
    bas.length = 100;
  });
  viewport.centerView();
  viewport.zoom = 1.5;
  viewport.render();

  // 1. Contrainte IK créée depuis l'os « bas » : os cible au bout, chaîne de 2 os.
  editor.select(sk().findBone('bas'));
  await frame();
  clickButton('Contrainte IK');
  const ik = sk().constraints.find((c) => c.kind === 'ik');
  check('IK : contrainte créée (2 os, cible au bout)', ik && ik.bones.join() === 'haut,bas' && sk().findBone(ik.target));
  check('IK : visible dans l\'arbre', [...document.querySelectorAll('#tree .tree-label')].some((l) => l.textContent === ik.name));

  // 2. On déplace la cible à la souris : le bout du bras la suit.
  editor.setTool('translate');
  const t = sk().findBone(ik.target);
  await dragWorld([t.worldX, t.worldY], [120, 90]);
  const bas = sk().findBone('bas');
  check('IK : le bout du bras suit la cible', near(bas.tipX, 120, 1) && near(bas.tipY, 90, 1), `${bas.tipX.toFixed(1)}, ${bas.tipY.toFixed(1)}`);
  check('IK : la pose de base des os ne change pas', sk().findBone('haut').rotation === 0 && bas.rotation === 0);
  const elbow1 = bas.worldY;
  editor.selectConstraint(ik.name);
  await frame();
  setField('Pliage positif', false);
  check('IK : sens de pliage inversé', Math.abs(sk().findBone('bas').worldY - elbow1) > 10);
  await frame();
  await api.selftestCapture('16-ik');

  // 3. Mode Animation : mélange à 0 avec une clé.
  editor.setMode('animate');
  editor.selectConstraint(ik.name);
  await frame();
  setField('mix', 0);
  check('IK animée : clé de mélange', editor.keyState('ik', ik.name, 'ik') === 'key' && near(sk().findBone('bas').tipX, 200, 0.01));
  editor.setMode('setup');

  // 4. Contrainte de transformation : « bas » copie la rotation de la cible.
  editor.select(sk().findBone('bas'));
  await frame();
  clickButton('Contrainte de transformation');
  const tc = editor.constraint;
  check('transformation : créée, sans effet tant que les mélanges sont à 0', tc?.kind === 'transform' && tc.mixRotate === 0);
  editor.apply(() => sk().removeConstraint(tc));

  // 5. Chemin : une chaîne de 3 os suit un chemin ; on déplace un point du chemin.
  editor.apply(() => {
    const c1 = sk().addBone('c1', sk().root);
    c1.x = -150;
    c1.y = -100;
    c1.length = 40;
    const c2 = sk().addBone('c2', c1);
    c2.x = 40;
    c2.length = 40;
    const c3 = sk().addBone('c3', c2);
    c3.x = 40;
    c3.length = 40;
  });
  editor.select(sk().findBone('c1'));
  await frame();
  clickButton('Contrainte de chemin');
  const pc = editor.constraint;
  check('chemin : contrainte et chemin créés', pc?.kind === 'path' && pc.bones.join() === 'c1,c2,c3' && sk().findSlot(pc.target));
  const pslot = sk().findSlot(pc.target);
  const path = sk().getAttachment(pslot, pc.target);
  editor.selectAttachment(pslot, path.name);
  await frame();
  const c3y0 = sk().findBone('c3').worldY;
  const lastPt = path.worldVertices(pslot.bone)[4];
  editor.setTool('select');
  await dragWorld([lastPt[0], lastPt[1]], [lastPt[0], lastPt[1] + 120]);
  check('chemin : déplacer un point du chemin courbe la chaîne', sk().findBone('c3').worldY > c3y0 + 5, `${c3y0} → ${sk().findBone('c3').worldY}`);
  await frame();
  await api.selftestCapture('17-chemin');

  // 6. Physique : un os « queue » se balance quand son parent bouge.
  editor.apply(() => {
    const corps = sk().addBone('corps', sk().root);
    corps.x = 200;
    corps.y = -50;
    const queue = sk().addBone('queue', corps);
    queue.length = 80;
  });
  editor.select(sk().findBone('queue'));
  await frame();
  clickButton('Contrainte physique');
  check('physique : contrainte créée', editor.constraint?.kind === 'physics');
  editor.resetPhysics();
  await wait(100);
  editor.apply(() => {
    sk().findBone('corps').y += 60;
  });
  let swing = 0;
  for (let i = 0; i < 20; i++) {
    await wait(25);
    swing = Math.max(swing, Math.abs(sk().findBone('queue').worldRotationX));
  }
  check('physique : la queue se balance en direct', swing > 3, swing.toFixed(1));

  // 7. Enregistrement et relecture.
  const { parseProject } = await import('./model/format.js');
  const again = parseProject(editor.toText());
  check('contraintes enregistrées et relues', again.constraints.length === 3 && again.findConstraint(ik.name).bendPositive === false);
  await frame();
  await api.selftestCapture('18-contraintes');
}

// --- v0.7 : skins et pièces jointes spéciales -----------------------------------------------------

async function testV07({ editor, viewport, api, check, near, pointer, dragWorld, library, importLayers, info, setTab }) {
  const sk = () => editor.skeleton;
  const { Skeleton } = await import('./model/skeleton.js');
  editor.setMode('setup');
  editor.reset(new Skeleton());
  await waitFor(() => library.dir === null);
  await importLayers(info.selftestOra, `${info.selftestDir}/images_skins`);
  viewport.frameAll();
  const tete = () => sk().findSlot('tete');
  const head = sk().currentAttachment(tete());
  const probe = { x: head.x + head.width * 0.15, y: head.y + head.height * 0.1 };
  const colorOf = () => pixelAt(viewport, probe.x, probe.y);
  const before = colorOf();

  // 1. Nouvelle skin par le panneau Skins.
  setTab('skins');
  await frame();
  document.querySelector('#skins .anim-head button').click();
  check('skins : nouvelle skin créée et sélectionnée', sk().skins.length === 2 && sk().editSkin.name === 'skin' && sk().activeSkins.includes('skin'));

  // 2. Version de la tête pour cette skin (même nom, autre image).
  setTab('tree');
  editor.selectAttachment(tete(), 'tete');
  await frame();
  clickButton('Créer la version de la skin');
  const v = sk().findSkin('skin').get('tete', 'tete');
  check('skins : version créée dans la skin', Boolean(v) && sk().currentAttachment(tete()) === v);
  editor.apply(() => {
    v.path = 'torse';
  });
  await frame();
  const skinned = colorOf();
  check('skins : la skin change l\'image affichée', Math.abs(skinned[0] - before[0]) + Math.abs(skinned[1] - before[1]) + Math.abs(skinned[2] - before[2]) > 40, `${before} → ${skinned}`);
  setTab('skins');
  await frame();
  const box = [...document.querySelectorAll('#skins input[type="checkbox"]')].find((c) => !c.disabled);
  box.click();
  await frame();
  const off = colorOf();
  check('skins : décocher la skin revient à « default »', Math.abs(off[0] - before[0]) + Math.abs(off[1] - before[1]) + Math.abs(off[2] - before[2]) < 10, `${off}`);
  setTab('tree');

  // 3. Découpe : placée au fond, elle masque tout ce qui est dessiné après, hors de son polygone.
  editor.select(sk().root);
  await frame();
  clickButton('Découpe (clipping)');
  const clipSlot = editor.selectedSlot;
  check('découpe : créée', editor.attachment?.type === 'clipping');
  editor.apply(() => sk().moveSlot(clipSlot, 0));
  await frame();
  const clipped = colorOf();
  const bg = (() => {
    viewport.attachments.visible = false;
    viewport.render();
    const c = colorOf();
    viewport.attachments.visible = true;
    viewport.render();
    return c;
  })();
  check(`découpe : la tête (hors du polygone) est masquée (${viewport.rendererName})`, Math.abs(clipped[0] - bg[0]) + Math.abs(clipped[1] - bg[1]) + Math.abs(clipped[2] - bg[2]) < 12, `${clipped} vs fond ${bg}`);
  await frame();
  await api.selftestCapture('19-decoupe');
  editor.apply(() => sk().removeSlot(clipSlot));

  // 4. Boîte de collision : clic sur une arête = nouveau sommet.
  editor.select(sk().root);
  await frame();
  clickButton('Boîte de collision');
  const bb = editor.attachment;
  check('collision : créée (4 sommets)', bb?.type === 'boundingbox' && bb.vertices.length === 4);
  const bv = bb.worldVertices(editor.selectedSlot.bone);
  editor.setTool('select');
  const mx = (bv[0] + bv[2]) / 2;
  const my = (bv[1] + bv[3]) / 2;
  await dragWorld([mx, my], [mx, my - 30]);
  check('collision : clic sur une arête ajoute un sommet', bb.vertices.length === 5);

  // 5. Point : déplacé à la souris.
  editor.select(sk().root);
  await frame();
  clickButton('Point sur cet os');
  const pt = editor.attachment;
  const pw = pt.world(editor.selectedSlot.bone);
  editor.setTool('translate');
  await dragWorld([pw.x, pw.y], [pw.x + 40, pw.y + 15]);
  check('point : déplacé', near(pt.x, 40, 0.5) && near(pt.y, 15, 0.5), `${pt.x}, ${pt.y}`);
  await frame();
  await api.selftestCapture('20-speciaux');

  // 6. Enregistrement et relecture.
  const { parseProject } = await import('./model/format.js');
  const again = parseProject(editor.toText());
  check('skins et pièces spéciales enregistrées et relues', again.findSkin('skin')?.get('tete', 'tete')
    && [...again.attachmentsOf(again.findSlot(bb.name)).values()][0].att.type === 'boundingbox');
}

// --- v0.8 : aperçu des mélanges et export --------------------------------------------------------

async function testV08({ editor, viewport, api, check, near, library, importLayers, info, setTab, runExport }) {
  const sk = () => editor.skeleton;
  const { Skeleton } = await import('./model/skeleton.js');
  editor.setMode('setup');
  editor.reset(new Skeleton());
  await waitFor(() => library.dir === null);
  await importLayers(info.selftestOra, `${info.selftestDir}/images_export`);
  // Un os « bras » pour le bras droit, et deux animations.
  editor.apply(() => {
    const b = sk().addBone('bras', sk().root);
    const slot = sk().findSlot('bras_d');
    const att = sk().visibleAttachment(slot);
    b.x = att.x;
    b.y = att.y + att.height / 2;
    b.rotation = -90;
    b.length = att.height;
    sk().updateWorldTransform();
    sk().setSlotBone(slot, b);
    const leve = sk().addAnimation('leve');
    leve.setKey('bone', 'bras', 'rotate', { time: 0, value: 0 });
    leve.setKey('bone', 'bras', 'rotate', { time: 0.5, value: 120 });
    leve.setKey('bone', 'bras', 'rotate', { time: 1, value: 0 });
    const repos = sk().addAnimation('repos');
    repos.setKey('bone', 'bras', 'rotate', { time: 0, value: -20 });
    repos.setKey('bone', 'bras', 'rotate', { time: 1, value: -20 });
  });
  sk().name = 'heros';

  // 1. Aperçu des mélanges : « repos » puis fondu vers « leve ».
  editor.setMode('animate');
  editor.setAnimation('repos');
  setTab('animations');
  await frame();
  const st = editor.startPreview();
  st.defaultMix = 0.5;
  st.setAnimation(0, sk().findAnimation('repos'), true);
  editor.step(0.1);
  const r0 = sk().findBone('bras').pose.rotation;
  st.setAnimation(0, sk().findAnimation('leve'), true);
  editor.step(0.25);
  const mid = sk().findBone('bras').pose.rotation;
  check('aperçu : fondu entre deux animations', near(r0, -110, 0.01) && mid > -110 + 5 && st.tracks[0].from, `${r0} → ${mid}`);
  editor.step(0.5);
  check('aperçu : fondu terminé', !st.tracks[0].from);
  editor.stopPreview();
  editor.setMode('setup');

  // 2. Export complet.
  const dir = `${info.selftestDir}/export`;
  const files = await runExport({
    dir, name: 'heros', data: true, textureScale: 0.5, maxSize: 512, padding: 2, trim: true, rotate: true, pot: false,
    animation: 'leve', png: true, sheet: true, gif: true, webm: true, fps: 12, scale: 0.5, margin: 4, transparent: true, background: '#ffffff',
  });
  check('export : fichiers écrits', files.includes('heros.json') && files.includes('heros.atlas.json') && files.includes('heros.png')
    && files.includes('heros_leve.gif') && files.includes('heros_leve.webm') && files.includes('heros_leve_planche.png'), files.join(', '));
  const read = async (f) => api.readBinary(`${dir}/${f}`);
  const json = JSON.parse(new TextDecoder().decode(await read('heros.json')));
  const atlas = JSON.parse(new TextDecoder().decode(await read('heros.atlas.json')));
  const { parseProject } = await import('./model/format.js');
  check('export : le squelette JSON se relit', Boolean(parseProject(JSON.stringify(json)).findAnimation('leve')) && json.export.atlas === 'heros.atlas.json'
    && !json.skeleton.images);
  check('export : une région par image utilisée', Object.keys(atlas.regions).length === library.list.length, Object.keys(atlas.regions).length);

  // 3. Chaque région de l'atlas contient bien son image (rognée, réduite, éventuellement tournée).
  const pages = await Promise.all(atlas.pages.map(async (p) => createImageBitmap(new Blob([await read(p.file)], { type: 'image/png' }))));
  const pixel = (bmp, x, y) => {
    const c = new OffscreenCanvas(1, 1);
    const ctx = c.getContext('2d');
    ctx.drawImage(bmp, Math.floor(x), Math.floor(y), 1, 1, 0, 0, 1, 1);
    return ctx.getImageData(0, 0, 1, 1).data;
  };
  let good = 0;
  let total = 0;
  for (const [path, r] of Object.entries(atlas.regions)) {
    const src = library.get(path).bitmap;
    // Centre de la zone rognée, dans l'image source et dans la page.
    const sx = r.offsetX + r.trimmedWidth * 0.5;
    const sy = r.offsetY + r.trimmedHeight * 0.5;
    const u = 0.5;
    const v = 0.5;
    const px = r.rotated ? r.x + r.height * (1 - v) : r.x + r.width * u;
    const py = r.rotated ? r.y + r.width * u : r.y + r.height * v;
    const a = pixel(src, sx, sy);
    const b = pixel(pages[r.page], px, py);
    total++;
    if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 40 && Math.abs(a[3] - b[3]) < 60) good++;
  }
  check('export : contenu des régions de l\'atlas', good === total, `${good}/${total}`);
  const rotated = Object.values(atlas.regions).some((r) => r.rotated);
  // (Les images importées d'un ORA sont déjà rognées : la zone rognée ne peut pas dépasser l'original.)
  check('export : zones rognées cohérentes, réduites à 50 %', Object.values(atlas.regions).every((r) => r.trimmedWidth <= r.originalWidth
    && Math.abs(r.width - Math.round(r.trimmedWidth * 0.5)) <= 1), `rotation utilisée : ${rotated}`);

  // 4. GIF : décodé par le navigateur, une image par pas de temps.
  const gifBytes = await read('heros_leve.gif');
  let gifFrames = -1;
  if (typeof ImageDecoder !== 'undefined') {
    const dec = new ImageDecoder({ data: gifBytes, type: 'image/gif' });
    await dec.tracks.ready;
    gifFrames = dec.tracks.selectedTrack.frameCount;
    const first = await dec.decode({ frameIndex: 0 });
    check('export GIF : première image décodable', first.image.displayWidth > 0);
    first.image.close();
    dec.close();
  }
  check('export GIF : 12 images (1 s à 12 images/s)', gifFrames === 12, gifFrames);
  const sheetMeta = JSON.parse(new TextDecoder().decode(await read('heros_leve_planche.json')));
  check('export : planche de sprites (12 images)', sheetMeta.frames.length === 12);
  const webm = await read('heros_leve.webm');
  check('export : vidéo WebM (en-tête EBML)', webm.length > 500 && webm[0] === 0x1a && webm[1] === 0x45 && webm[2] === 0xdf && webm[3] === 0xa3, webm.length);
  const png0 = await createImageBitmap(new Blob([await read('heros_leve_000.png')], { type: 'image/png' }));
  check('export : séquence PNG', png0.width > 10 && png0.height > 10, `${png0.width}×${png0.height}`);
}

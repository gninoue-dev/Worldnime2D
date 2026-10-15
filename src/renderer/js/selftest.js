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

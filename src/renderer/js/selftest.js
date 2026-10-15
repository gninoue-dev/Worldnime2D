// Test automatique de l'interface, lancé avec la variable WN2D_SELFTEST=<dossier>.
// Il simule la souris et le clavier comme un utilisateur, vérifie le résultat et prend des captures.

import { TOOLS } from './editor/editor.js';
import { parseProject } from './model/format.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

export async function runSelftest({ editor, viewport, api }) {
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
  } catch (err) {
    check('exception', false, err.stack || err.message);
  }

  const ok = checks.every((c) => c.ok);
  await api.selftestDone({ ok, checks });
}

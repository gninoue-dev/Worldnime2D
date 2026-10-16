// Point d'entrée de la page : assemble l'éditeur, les panneaux et les commandes.

import { Editor, TOOLS, TOOL_INFO } from './editor/editor.js';
import { Viewport, isTyping } from './view/viewport.js';
import { TreePanel, DrawOrderPanel, ImagesPanel } from './ui/tree.js';
import { PropertiesPanel } from './ui/properties.js';
import { TimelinePanel } from './ui/timeline.js';
import { AnimationsPanel } from './ui/animations.js';
import { SkinsPanel } from './ui/skins.js';
import { Skeleton } from './model/skeleton.js';
import { RegionAttachment } from './model/attachment.js';
import { round } from './model/math.js';
import { ImageLibrary, decodeImage, baseName } from './io/images.js';
import { readLayerFile, canvasToPng, safeFileName } from './io/layers.js';
import { runSelftest } from './selftest.js';
import { exportData, renderFrames, exportPngSequence, exportSpriteSheet, exportGif, exportWebm } from './io/export.js';

const api = window.worldnime;

const TOOL_ICONS = {
  select: '<path d="M5 3l12 7-5 1.5L9.5 17z"/>',
  create: '<path d="M4 16l9-9"/><circle cx="4" cy="16" r="2"/><path d="M15 3v6M12 6h6"/>',
  rotate: '<path d="M16 10a6 6 0 1 1-2-4.5"/><path d="M16 3v4h-4"/>',
  translate: '<path d="M10 2v16M2 10h16M10 2l-2.5 2.5M10 2l2.5 2.5M10 18l-2.5-2.5M10 18l2.5-2.5M2 10l2.5-2.5M2 10l2.5 2.5M18 10l-2.5-2.5M18 10l-2.5 2.5"/>',
  scale: '<rect x="3" y="9" width="8" height="8"/><path d="M9 3h8v8M17 3l-7 7"/>',
  shear: '<path d="M6 16h10l-2-12H4z"/>',
};

function dirname(file) {
  return file.replace(/[\\/][^\\/]*$/, '');
}

async function start() {
  const info = await api.info();
  const editor = new Editor(info.version);
  const library = new ImageLibrary(api);
  window.wn2dEditor = editor;

  // --- Messages ----------------------------------------------------------------------
  const toastEl = document.getElementById('toast');
  let toastTimer = null;
  const notify = (message, kind = 'error') => {
    toastEl.textContent = message;
    toastEl.className = `toast show ${kind}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.className = 'toast';
    }, 3600);
  };

  // --- Vue ----------------------------------------------------------------------------
  const statusEl = document.getElementById('status');
  const viewport = new Viewport(editor, document.getElementById('viewport'), library, (s) => {
    statusEl.replaceChildren();
    const parts = [
      `x ${round(s.x, 1)}  y ${round(s.y, 1)}`,
      `zoom ${Math.round(s.zoom * 100)} %`,
      `${editor.skeleton.bones.length} os · ${editor.skeleton.slots.length} slots`,
      s.hover ? `survol : ${s.hover}` : '',
      editor.animating ? `animation : ${editor.animationName} · image ${editor.frame}` : 'mode Configuration',
      `outil : ${TOOL_INFO[editor.tool].label}`,
      `rendu : ${viewport.rendererName === 'webgl' ? 'WebGL' : `${viewport.rendererName} (secours)`}`,
    ];
    for (const p of parts) {
      const span = document.createElement('span');
      span.textContent = p;
      statusEl.appendChild(span);
    }
    const grow = document.createElement('span');
    grow.className = 'grow';
    const ver = document.createElement('span');
    ver.textContent = `v${info.version}`;
    statusEl.append(grow, ver);
  });
  await viewport.init(info.renderer);
  viewport.notify = notify;
  if (viewport.rendererName !== 'webgl') {
    notify('Accélération graphique (WebGL) indisponible : aperçu simplifié, la teinte sombre ne s\'affiche pas.', 'info');
  }

  // --- Chemins du projet (dossier d'images, image de référence) ------------------------
  // Dans le fichier, les chemins sont relatifs au .wn2d ; ici on garde les chemins absolus.
  let referenceAbs = null;
  let referenceKey = null;

  const syncPaths = async () => {
    const sk = editor.skeleton;
    const imagesAbs = sk.images ? await api.resolvePath(editor.filePath, sk.images) : null;
    if (imagesAbs !== library.dir) await library.setDir(imagesAbs);

    const ref = sk.reference;
    const key = ref ? `${editor.filePath}|${ref.path}` : null;
    if (key === referenceKey) return;
    referenceKey = key;
    referenceAbs = null;
    if (!ref) {
      viewport.setReferenceTexture(null, null);
      return;
    }
    try {
      const abs = await api.resolvePath(editor.filePath, ref.path);
      const entry = await decodeImage(await api.readBinary(abs), { file: abs });
      referenceAbs = abs;
      viewport.setReferenceTexture(ref.path, entry.texture);
    } catch (err) {
      viewport.setReferenceTexture(null, null);
      notify(`Image de référence introuvable : ${ref.path}`);
    }
  };

  const chooseImagesDir = async () => {
    const dir = await api.chooseFolder('Dossier des images du personnage', library.dir || (editor.filePath && dirname(editor.filePath)));
    if (!dir) return;
    const rel = await api.relativePath(editor.filePath, dir);
    editor.apply(() => {
      editor.skeleton.images = rel;
    });
    await syncPaths();
  };

  const chooseReference = async () => {
    const file = await api.chooseFile('Image de référence', 'image');
    if (!file) return;
    const rel = await api.relativePath(editor.filePath, file);
    editor.apply(() => {
      editor.skeleton.reference = { path: rel, x: 0, y: 0, scale: 1, alpha: 0.5, visible: true };
    });
    await syncPaths();
  };

  // --- Actions partagées par les panneaux -------------------------------------------
  const actions = {
    hasImage: (path) => Boolean(library.get(path)),
    imagePaths: () => library.list.map((e) => e.path),
    imageAlpha: (path) => library.alphaInfo(path),
    imageSize: (path) => {
      const e = library.get(path);
      return e ? { width: e.width, height: e.height } : null;
    },
    chooseImagesDir,

    // Attache une image du dossier : dans le slot donné, sinon dans un nouveau slot de l'os.
    // worldPos : point du monde où placer le centre de l'image (sinon, l'origine de l'os).
    attachImage: (path, bone, slot, worldPos = null) => {
      const entry = library.get(path);
      if (!entry) {
        notify(`Image introuvable : ${path}`);
        return;
      }
      const sk = editor.skeleton;
      editor.apply(() => {
        sk.updateWorldTransform();
        let target = slot;
        if (!target) target = sk.addSlot(sk.uniqueSlotName(baseName(path)), bone);
        const b = target.bone;
        let att = sk.getAttachment(target, path);
        if (!att) {
          att = new RegionAttachment(path);
          att.width = entry.width;
          att.height = entry.height;
          // L'image garde sa taille et reste droite à l'écran, quelle que soit la pose de l'os.
          att.rotation = -b.worldRotationX;
          att.scaleX = 1 / (b.worldScaleX || 1);
          att.scaleY = 1 / (b.worldScaleY || 1);
          const current = slot && sk.currentAttachment(slot);
          if (worldPos) {
            const l = b.worldToLocal(worldPos.x, worldPos.y);
            att.x = l.x;
            att.y = l.y;
          } else if (current instanceof RegionAttachment) {
            // Nouvelle image d'un slot qui en a déjà une : elle prend la même place (ex. yeux ouverts / fermés).
            Object.assign(att, { x: current.x, y: current.y, rotation: current.rotation, scaleX: current.scaleX, scaleY: current.scaleY });
          }
          sk.addAttachment(target, att);
        }
        target.attachment = att.name;
        editor.selected = b;
        editor.selectedSlot = target;
        editor.selectedAttachment = att.name;
      });
    },

    addSlot: (bone) => {
      const sk = editor.skeleton;
      editor.apply(() => {
        const slot = sk.addSlot(sk.uniqueSlotName(bone.name), bone);
        editor.selectedSlot = slot;
        editor.selectedAttachment = null;
      });
    },
  };

  viewport.onDropImage = (path, worldPos) => {
    actions.attachImage(path, editor.selected ?? editor.skeleton.root, null, worldPos);
  };

  // --- Sons des événements ------------------------------------------------------------
  // Le chemin du son est relatif au fichier du projet. Les sons décodés sont gardés en cache.
  let audioCtx = null;
  const sounds = new Map();
  const playEventSound = async (key) => {
    const data = editor.skeleton.events.get(key.name);
    if (!data?.audio) return;
    try {
      audioCtx ??= new AudioContext();
      const abs = await api.resolvePath(editor.filePath, data.audio);
      if (!abs) return;
      if (!sounds.has(abs)) sounds.set(abs, audioCtx.decodeAudioData((await api.readBinary(abs)).buffer.slice(0)));
      const buffer = await sounds.get(abs);
      const src = audioCtx.createBufferSource();
      src.buffer = buffer;
      const gain = audioCtx.createGain();
      gain.gain.value = key.volume ?? data.volume;
      const pan = audioCtx.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, key.balance ?? data.balance));
      src.connect(gain).connect(pan).connect(audioCtx.destination);
      src.start();
    } catch (err) {
      sounds.delete(data.audio);
      notify(`Son introuvable pour l'événement « ${key.name} » : ${data.audio}`);
    }
  };
  editor.addEventListener('events', (e) => e.detail.forEach((k) => playEventSound(k)));

  // --- Panneaux -------------------------------------------------------------------------
  const tree = new TreePanel(editor, document.getElementById('tree'), notify, actions);
  // Les images se chargent après le projet : l'arbre doit retirer les « image manquante ».
  library.addEventListener('change', () => tree.render());
  new DrawOrderPanel(editor, document.getElementById('draworder'), notify);
  new ImagesPanel(editor, library, document.getElementById('images'), actions);
  new PropertiesPanel(editor, document.getElementById('props'), notify, actions);
  new AnimationsPanel(editor, document.getElementById('animations'), notify, {
    chooseAudio: async () => {
      const file = await api.chooseFile('Son de l\'événement', 'audio');
      return file ? api.relativePath(editor.filePath, file) : null;
    },
  });
  new SkinsPanel(editor, document.getElementById('skins'), notify);
  const timelineEl = document.getElementById('timeline');
  const timeline = new TimelinePanel(editor, timelineEl, notify);

  let activeTab = 'tree';
  const setTab = (tab) => {
    activeTab = tab;
    for (const b of document.querySelectorAll('.tab')) {
      const on = b.dataset.tab === tab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    }
    for (const id of ['tree', 'draworder', 'images', 'animations', 'skins']) document.getElementById(id).hidden = id !== tab;
  };
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  setTab('tree');

  // --- Barre d'outils -----------------------------------------------------------------------
  const toolsEl = document.getElementById('tools');
  for (const tool of Object.values(TOOLS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tool';
    b.dataset.tool = tool;
    b.title = `${TOOL_INFO[tool].label} (${TOOL_INFO[tool].key})`;
    b.setAttribute('aria-label', TOOL_INFO[tool].label);
    b.innerHTML = `<svg viewBox="0 0 20 20">${TOOL_ICONS[tool]}</svg>`;
    b.addEventListener('click', () => editor.setTool(tool));
    toolsEl.appendChild(b);
  }

  const refreshChrome = () => {
    for (const b of toolsEl.children) {
      b.classList.toggle('active', b.dataset.tool === editor.tool);
      b.disabled = editor.animating && b.dataset.tool === TOOLS.create;
    }
    for (const b of document.querySelectorAll('.mode-btn')) b.classList.toggle('active', b.dataset.mode === editor.mode);
    document.body.classList.toggle('animating', editor.animating);
    if (timelineEl.hidden === editor.animating) {
      timelineEl.hidden = !editor.animating;
      requestAnimationFrame(() => timeline.draw());
    }
    document.getElementById('btn-undo').disabled = !editor.canUndo;
    document.getElementById('btn-redo').disabled = !editor.canRedo;
    document.title = editor.title;
    api.setDirty(editor.dirty);
  };
  document.querySelectorAll('.mode-btn').forEach((b) => b.addEventListener('click', () => editor.setMode(b.dataset.mode)));

  // Boucle de lecture.
  let lastFrame = performance.now();
  const tick = (now) => {
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    if (editor.playing) editor.step(dt);
    // Physique en continu (hors lecture) : les os physiques se balancent quand on bouge le squelette.
    // (Sauf pendant un geste en mode Animation sans clé automatique : la pose non enregistrée serait perdue.)
    else if (editor.physicsLive && editor.hasPhysics && !(viewport.drag?.target && editor.animating && !editor.autoKey)) {
      editor.stepPhysics(dt);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  editor.addEventListener('change', (e) => {
    const reason = e.detail.reason;
    if (reason !== 'drag' && reason !== 'physics' && !(reason === 'time' && editor.playing)) refreshChrome();
    if (['reset', 'undo', 'redo', 'cancel', 'saved'].includes(reason)) syncPaths().catch((err) => notify(err.message));
  });
  refreshChrome();

  // --- Fichiers -------------------------------------------------------------------------

  const confirmDiscard = async () => !editor.dirty || api.confirmDiscard();

  const loadFile = async (res) => {
    if (!res) return;
    if (res.error) {
      notify(`Impossible d'ouvrir ${res.path} : ${res.error}`);
      return;
    }
    try {
      editor.loadText(res.text, res.path);
      await syncPaths();
      viewport.frameAll();
    } catch (err) {
      notify(err.message);
    }
  };

  const save = async (saveAs = false) => {
    try {
      let target = editor.filePath;
      if (!target || saveAs) target = await api.chooseSavePath(editor.filePath);
      if (!target) return;
      // Les chemins sont réécrits relativement au fichier enregistré.
      const sk = editor.skeleton;
      sk.images = library.dir ? await api.relativePath(target, library.dir) : '';
      if (sk.reference && referenceAbs) sk.reference.path = await api.relativePath(target, referenceAbs);
      for (const ev of sk.events.values()) {
        if (!ev.audio) continue;
        const abs = await api.resolvePath(editor.filePath, ev.audio);
        if (abs) ev.audio = await api.relativePath(target, abs);
      }
      await api.writeText(target, editor.toText());
      referenceKey = sk.reference ? `${target}|${sk.reference.path}` : null;
      editor.markSaved(target);
      notify('Projet enregistré.', 'info');
    } catch (err) {
      notify(`Échec de l'enregistrement : ${err.message}`);
    }
  };

  // Importe un fichier ORA ou PSD : un PNG par calque dans le dossier d'images,
  // un slot par calque (sur l'os du même nom s'il existe, sinon la racine), dans l'ordre des calques.
  // Réimporter le même fichier met à jour les images et leur placement.
  const importLayers = async (file = null, outDir = null) => {
    const source = file ?? (await api.chooseFile('Importer un fichier à calques', 'layers'));
    if (!source) return null;
    let dir = outDir ?? library.dir;
    if (!dir) {
      dir = await api.chooseFolder('Dossier où enregistrer les images des calques', dirname(source));
      if (!dir) return null;
    }
    const doc = await readLayerFile(source, await api.readBinary(source));
    if (doc.layers.length === 0) throw new Error('Aucun calque visible à importer.');

    const written = [];
    const used = new Set();
    for (const layer of doc.layers) {
      let base = safeFileName(layer.name);
      for (let i = 2; used.has(base); i++) base = `${safeFileName(layer.name)}_${i}`;
      used.add(base);
      await api.writeImage(dir, `${base}.png`, await canvasToPng(layer.canvas));
      written.push({ layer, path: base });
    }

    const rel = await api.relativePath(editor.filePath, dir);
    if (dir !== library.dir) {
      editor.apply(() => {
        editor.skeleton.images = rel;
      });
    }
    await library.setDir(dir);
    await library.reload();

    const sk = editor.skeleton;
    editor.apply(() => {
      sk.updateWorldTransform();
      for (const { layer, path } of written) {
        // Origine au milieu du bas du document : les pieds du personnage tombent sur l'origine.
        const wx = layer.left + layer.width / 2 - doc.width / 2;
        const wy = doc.height - (layer.top + layer.height / 2);
        let slot = sk.findSlot(path);
        if (!slot) slot = sk.addSlot(path, sk.findBone(layer.name) ?? sk.findBone(path) ?? sk.root);
        const bone = slot.bone;
        let att = sk.getAttachment(slot, path);
        if (!att) {
          att = new RegionAttachment(path);
          sk.addAttachment(slot, att);
        }
        att.width = layer.width;
        att.height = layer.height;
        att.rotation = -bone.worldRotationX;
        att.scaleX = 1 / (bone.worldScaleX || 1);
        att.scaleY = 1 / (bone.worldScaleY || 1);
        const l = bone.worldToLocal(wx, wy);
        att.x = l.x;
        att.y = l.y;
        slot.attachment = path;
        slot.blend = layer.blend;
        if (layer.opacity < 1) slot.color = `#ffffff${Math.round(layer.opacity * 255).toString(16).padStart(2, '0')}`;
      }
      // L'ordre des calques donne l'ordre d'affichage.
      written.forEach(({ path }, i) => sk.moveSlot(sk.findSlot(path), i));
    });
    viewport.frameAll();
    const extra = doc.skipped ? ` (${doc.skipped} calque(s) caché(s) ou vide(s) ignoré(s))` : '';
    notify(`${written.length} calques importés${extra}.`, 'info');
    return { count: written.length, dir };
  };

  // --- Export ------------------------------------------------------------------------------------
  const exportDialog = document.getElementById('export');
  const $ = (id) => document.getElementById(id);
  let exportDir = null;

  // Lance l'export selon les options ; renvoie la liste des fichiers écrits.
  const runExport = async (opts, onStatus = () => {}) => {
    const sk = editor.skeleton;
    const written = [];
    const safe = (s) => s.replace(/[\\/:*?"<>|]/g, '_');
    if (opts.data) {
      onStatus('Atlas et squelette…');
      const r = await exportData({
        skeleton: sk, library, api, dir: opts.dir, name: opts.name, appVersion: info.version,
        atlasOptions: { scale: opts.textureScale, padding: opts.padding, maxSize: opts.maxSize, rotate: opts.rotate, pot: opts.pot, trim: opts.trim },
      });
      written.push(...r.files);
    }
    const kinds = ['png', 'sheet', 'gif', 'webm'].filter((k) => opts[k]);
    if (kinds.length) {
      const anims = opts.animation === '*' ? sk.animations.map((a) => a.name) : [opts.animation];
      for (const animName of anims) {
        const result = await renderFrames(sk, library, animName, {
          fps: opts.fps, scale: opts.scale, margin: opts.margin, background: opts.transparent ? null : opts.background,
          renderer: viewport.rendererName === 'webgl' ? 'webgl' : 'canvas',
          onProgress: (i, n) => onStatus(`« ${animName} » : image ${i}/${n}…`),
        });
        const base = `${opts.name}_${safe(animName)}`;
        const ctx = { result, api, dir: opts.dir, base };
        if (opts.png) written.push(...(await exportPngSequence(ctx)));
        if (opts.sheet) written.push(...(await exportSpriteSheet(ctx)));
        if (opts.gif) {
          onStatus(`« ${animName} » : GIF…`);
          written.push(...(await exportGif(ctx)));
        }
        if (opts.webm) {
          onStatus(`« ${animName} » : vidéo…`);
          written.push(...(await exportWebm({ ...ctx, background: opts.background })));
        }
      }
    }
    return written;
  };

  const openExport = () => {
    const sk = editor.skeleton;
    $('ex-name').value ||= sk.name || 'squelette';
    const sel = $('ex-anim');
    sel.replaceChildren(new Option('Toutes les animations', '*'), ...sk.animations.map((a) => new Option(a.name, a.name)));
    if (editor.animationName) sel.value = editor.animationName;
    $('ex-dir-label').textContent = exportDir ?? 'Aucun dossier';
    $('ex-progress').textContent = '';
    exportDialog.showModal();
  };
  $('ex-dir').addEventListener('click', async () => {
    const d = await api.chooseFolder('Dossier d\'export', exportDir || (editor.filePath && dirname(editor.filePath)));
    if (d) {
      exportDir = d;
      $('ex-dir-label').textContent = d;
    }
  });
  $('ex-go').addEventListener('click', async () => {
    if (!exportDir) {
      $('ex-progress').textContent = 'Choisissez d\'abord un dossier.';
      return;
    }
    const opts = {
      dir: exportDir, name: $('ex-name').value.trim() || 'squelette',
      data: $('ex-data').checked, textureScale: Number($('ex-tscale').value), maxSize: Number($('ex-max').value),
      padding: Number($('ex-pad').value) || 0, trim: $('ex-trim').checked, rotate: $('ex-rot').checked, pot: $('ex-pot').checked,
      animation: $('ex-anim').value, png: $('ex-png').checked, sheet: $('ex-sheet').checked, gif: $('ex-gif').checked, webm: $('ex-webm').checked,
      fps: Number($('ex-fps').value) || 30, scale: Number($('ex-scale').value), margin: Number($('ex-margin').value) || 0,
      transparent: $('ex-transparent').checked, background: $('ex-bg').value,
    };
    if ((opts.png || opts.sheet || opts.gif || opts.webm) && !editor.skeleton.animations.length) {
      $('ex-progress').textContent = 'Aucune animation à exporter en images.';
      return;
    }
    $('ex-go').disabled = true;
    try {
      const files = await runExport(opts, (m) => {
        $('ex-progress').textContent = m;
      });
      $('ex-progress').textContent = `${files.length} fichier(s) écrit(s) dans le dossier.`;
      notify(`Export terminé : ${files.length} fichier(s).`, 'info');
    } catch (err) {
      $('ex-progress').textContent = `Échec : ${err.message}`;
    } finally {
      $('ex-go').disabled = false;
    }
  });

  // --- Commandes ----------------------------------------------------------------------------

  // Les commandes qui changent la structure du squelette ne marchent qu'en mode Configuration.
  const setupOnly = (fn) => () => {
    if (editor.animating) {
      notify('Cette action se fait en mode Configuration (Ctrl+1).');
      return undefined;
    }
    return fn();
  };

  const addChild = () => {
    const parent = editor.selected ?? editor.skeleton.root;
    editor.apply(() => {
      const sk = editor.skeleton;
      const bone = sk.addBone(sk.uniqueBoneName('bone'), parent);
      bone.x = parent.length;
      bone.length = 50;
      editor.selected = bone;
      editor.selectedSlot = null;
      editor.selectedAttachment = null;
    });
  };

  // ▲ / ▼ : dans l'onglet Ordre (ou si un slot est sélectionné), avance ou recule le slot ;
  // sinon, déplace l'os parmi ses frères.
  const move = (dir) => {
    const sk = editor.skeleton;
    const slot = editor.selectedSlot;
    if (slot && (activeTab === 'draworder' || editor.selectionKind !== 'bone')) {
      if (editor.animating) {
        // Mode Animation : on réordonne l'ordre courant et on pose une clé d'ordre d'affichage.
        const order = [...sk.drawOrder];
        const i = order.indexOf(slot);
        const j = Math.max(0, Math.min(order.length - 1, i + (dir < 0 ? 1 : -1)));
        if (i === j) return;
        order.splice(i, 1);
        order.splice(j, 0, slot);
        editor.apply(() => {
          sk.drawOrder = order;
          editor.keyDrawOrder();
        });
        return;
      }
      editor.apply(() => sk.moveSlot(slot, sk.slots.indexOf(slot) + (dir < 0 ? 1 : -1)));
      return;
    }
    if (editor.animating) return;
    const bone = editor.selected;
    if (!bone?.parent) return;
    editor.apply(() => sk.moveAmongSiblings(bone, dir));
  };

  const commands = {
    new: async () => {
      if (await confirmDiscard()) {
        editor.reset(new Skeleton());
        viewport.centerView();
      }
    },
    open: async () => {
      if (await confirmDiscard()) await loadFile(await api.open());
    },
    'open-pending': async () => {
      if (await confirmDiscard()) await loadFile(await api.pendingFile());
    },
    save: () => save(false),
    'save-as': () => save(true),
    'import-layers': setupOnly(() => importLayers()),
    export: () => openExport(),
    'choose-images': chooseImagesDir,
    'reload-images': () => library.reload(),
    'choose-reference': chooseReference,
    undo: () => editor.undo(),
    redo: () => editor.redo(),
    duplicate: () => editor.duplicateSelected(),
    delete: () => {
      if (editor.meshTool === 'edit' && viewport.mesh.deleteSelected()) return;
      if (!editor.deleteSelected() && editor.selected && !editor.selected.parent) {
        notify('La racine ne peut pas être supprimée.');
      }
    },
    'add-child': setupOnly(addChild),
    'mode-setup': () => editor.setMode('setup'),
    'mode-animate': () => editor.setMode('animate'),
    play: () => editor.togglePlay(),
    'prev-frame': () => editor.setFrame(editor.frame - 1),
    'next-frame': () => editor.setFrame(editor.frame + 1),
    'prev-key': () => timeline.jumpKey(-1),
    'next-key': () => timeline.jumpKey(1),
    'key-bone': () => timeline.keySelected(),
    'copy-keys': () => {
      const n = editor.copySelectedKeys();
      if (n) notify(`${n} clé(s) copiée(s).`, 'info');
    },
    'paste-keys': () => {
      const n = editor.pasteKeys();
      if (n) notify(`${n} clé(s) collée(s).`, 'info');
    },
    'move-up': () => move(-1),
    'move-down': () => move(1),
    frame: () => viewport.frameAll(),
    center: () => viewport.centerView(),
    'toggle-names': () => {
      viewport.showNames = !viewport.showNames;
      viewport.render();
    },
    'toggle-bones': () => {
      viewport.showBones = !viewport.showBones;
      viewport.render();
    },
    'toggle-images': () => {
      viewport.attachments.visible = !viewport.attachments.visible;
      viewport.render();
    },
    'zoom-in': () => viewport.zoomAt(viewport.width / 2, viewport.height / 2, 1.25),
    'zoom-out': () => viewport.zoomAt(viewport.width / 2, viewport.height / 2, 0.8),
    help: () => document.getElementById('help').showModal(),
  };

  const run = (cmd) => {
    const fn = commands[cmd];
    if (!fn) return;
    Promise.resolve(fn()).catch((err) => notify(err.message));
  };

  api.onMenu(run);
  document.querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('click', () => run(b.dataset.cmd)));

  window.addEventListener('keydown', (e) => {
    if (isTyping(e) || document.querySelector('dialog[open]')) return;
    if (e.key === 'Escape' && editor.meshTool && !viewport.drag) {
      editor.setMeshTool(editor.meshTool);
      return;
    }
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (ctrl && key === 'z' && !e.shiftKey) run('undo');
    else if (ctrl && (key === 'y' || (key === 'z' && e.shiftKey))) run('redo');
    else if (ctrl && key === 'd') run('duplicate');
    else if (ctrl && key === 'c' && editor.animating) run('copy-keys');
    else if (ctrl && key === 'v' && editor.animating) run('paste-keys');
    else if (ctrl && key === '1') run('mode-setup');
    else if (ctrl && key === '2') run('mode-animate');
    else if (editor.animating && !ctrl && !e.altKey && key === 'p') run('play');
    else if (editor.animating && !ctrl && !e.altKey && key === 'k') run('key-bone');
    else if (editor.animating && !ctrl && !e.altKey && key === 'g') timeline.toggleView();
    else if (editor.animating && !ctrl && key === 'arrowleft') run(e.shiftKey ? 'prev-key' : 'prev-frame');
    else if (editor.animating && !ctrl && key === 'arrowright') run(e.shiftKey ? 'next-key' : 'next-frame');
    else if (ctrl || e.altKey) return;
    else if (key === 'delete' || key === 'backspace') run('delete');
    else if (key === 'f') run('frame');
    else if (key === 'home') run('center');
    else {
      const tool = Object.keys(TOOL_INFO).find((t) => TOOL_INFO[t].key.toLowerCase() === key);
      if (!tool) return;
      editor.setTool(tool);
    }
    e.preventDefault();
  });

  // Fichier passé en argument (double-clic sur un .wn2d).
  await loadFile(await api.pendingFile());

  if (info.selftest) {
    runSelftest({ editor, viewport, api, library, actions, importLayers, info, setTab, timeline, runExport });
  }

  // Tutoriels vidéo (tutorials/make.mjs) : le script des leçons est chargé à part.
  if (info.tutorial) {
    window.wn2dTutorial = {
      editor, viewport, api, library, actions, importLayers, info, setTab, timeline, runExport, notify,
      command: (cmd) => Promise.resolve(commands[cmd]()),
    };
    const script = document.createElement('script');
    script.src = 'tutorial.js';
    document.body.appendChild(script);
  }
}

start().catch((err) => {
  document.body.textContent = `Erreur au démarrage : ${err.message}`;
  console.error(err);
});

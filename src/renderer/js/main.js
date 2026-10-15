// Point d'entrée de la page : assemble l'éditeur, les panneaux et les commandes.

import { Editor, TOOLS, TOOL_INFO } from './editor/editor.js';
import { Viewport, isTyping } from './view/viewport.js';
import { TreePanel } from './ui/tree.js';
import { PropertiesPanel } from './ui/properties.js';
import { Skeleton } from './model/skeleton.js';
import { round } from './model/math.js';
import { runSelftest } from './selftest.js';

const api = window.worldnime;

const TOOL_ICONS = {
  select: '<path d="M5 3l12 7-5 1.5L9.5 17z"/>',
  create: '<path d="M4 16l9-9"/><circle cx="4" cy="16" r="2"/><path d="M15 3v6M12 6h6"/>',
  rotate: '<path d="M16 10a6 6 0 1 1-2-4.5"/><path d="M16 3v4h-4"/>',
  translate: '<path d="M10 2v16M2 10h16M10 2l-2.5 2.5M10 2l2.5 2.5M10 18l-2.5-2.5M10 18l2.5-2.5M2 10l2.5-2.5M2 10l2.5 2.5M18 10l-2.5-2.5M18 10l-2.5 2.5"/>',
  scale: '<rect x="3" y="9" width="8" height="8"/><path d="M9 3h8v8M17 3l-7 7"/>',
  shear: '<path d="M6 16h10l-2-12H4z"/>',
};

async function start() {
  const info = await api.info();
  const editor = new Editor(info.version);
  window.wn2dEditor = editor;

  const toastEl = document.getElementById('toast');
  let toastTimer = null;
  const notify = (message, kind = 'error') => {
    toastEl.textContent = message;
    toastEl.className = `toast show ${kind}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.className = 'toast';
    }, 3200);
  };

  const statusEl = document.getElementById('status');
  const viewport = new Viewport(editor, document.getElementById('viewport'), (s) => {
    const bone = editor.selected;
    statusEl.innerHTML = '';
    const parts = [
      `x ${round(s.x, 1)}  y ${round(s.y, 1)}`,
      `zoom ${Math.round(s.zoom * 100)} %`,
      `${editor.skeleton.bones.length} os`,
      bone ? `sélection : ${bone.name}` : '',
      `outil : ${TOOL_INFO[editor.tool].label}`,
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
  await viewport.init();
  new TreePanel(editor, document.getElementById('tree'), notify);
  new PropertiesPanel(editor, document.getElementById('props'), notify);

  // Barre d'outils.
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
    for (const b of toolsEl.children) b.classList.toggle('active', b.dataset.tool === editor.tool);
    document.getElementById('btn-undo').disabled = !editor.canUndo;
    document.getElementById('btn-redo').disabled = !editor.canRedo;
    document.title = editor.title;
    api.setDirty(editor.dirty);
  };
  editor.addEventListener('change', (e) => {
    if (e.detail.reason !== 'drag') refreshChrome();
  });
  refreshChrome();

  // --- Commandes -------------------------------------------------------------

  const confirmDiscard = async () => !editor.dirty || api.confirmDiscard();

  const loadFile = (res) => {
    if (!res) return;
    if (res.error) {
      notify(`Impossible d'ouvrir ${res.path} : ${res.error}`);
      return;
    }
    try {
      editor.loadText(res.text, res.path);
      viewport.frameAll();
    } catch (err) {
      notify(err.message);
    }
  };

  const save = async (saveAs = false) => {
    try {
      const path = await api.save(editor.toText(), editor.filePath, saveAs);
      if (path) {
        editor.markSaved(path);
        notify('Projet enregistré.', 'info');
      }
    } catch (err) {
      notify(`Échec de l'enregistrement : ${err.message}`);
    }
  };

  const addChild = () => {
    const parent = editor.selected ?? editor.skeleton.root;
    editor.apply(() => {
      const sk = editor.skeleton;
      const bone = sk.addBone(sk.uniqueBoneName('bone'), parent);
      bone.x = parent.length;
      bone.length = 50;
      editor.selected = bone;
    });
  };

  const moveSibling = (delta) => {
    const bone = editor.selected;
    if (!bone?.parent) return;
    editor.apply(() => editor.skeleton.moveAmongSiblings(bone, delta));
  };

  const commands = {
    new: async () => {
      if (await confirmDiscard()) {
        editor.reset(new Skeleton());
        viewport.centerView();
      }
    },
    open: async () => {
      if (await confirmDiscard()) loadFile(await api.open());
    },
    'open-pending': async () => {
      if (await confirmDiscard()) loadFile(await api.pendingFile());
    },
    save: () => save(false),
    'save-as': () => save(true),
    undo: () => editor.undo(),
    redo: () => editor.redo(),
    duplicate: () => editor.duplicateSelected(),
    delete: () => {
      if (!editor.deleteSelected() && editor.selected && !editor.selected.parent) {
        notify('La racine ne peut pas être supprimée.');
      }
    },
    'add-child': addChild,
    'move-up': () => moveSibling(-1),
    'move-down': () => moveSibling(1),
    frame: () => viewport.frameAll(),
    center: () => viewport.centerView(),
    'toggle-names': () => {
      viewport.showNames = !viewport.showNames;
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
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (ctrl && key === 'z' && !e.shiftKey) run('undo');
    else if (ctrl && (key === 'y' || (key === 'z' && e.shiftKey))) run('redo');
    else if (ctrl && key === 'd') run('duplicate');
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
  loadFile(await api.pendingFile());

  if (info.selftest) runSelftest({ editor, viewport, api });
}

start().catch((err) => {
  document.body.textContent = `Erreur au démarrage : ${err.message}`;
  console.error(err);
});

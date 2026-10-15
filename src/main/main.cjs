// Processus principal d'Electron : fenêtre, menus, dialogues et accès aux fichiers.
// Le rendu (l'éditeur) n'a pas accès direct au disque : il passe par preload.cjs.

const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');

const FILE_FILTERS = [
  { name: 'Projet Worldnime2D', extensions: ['wn2d'] },
  { name: 'Tous les fichiers', extensions: ['*'] },
];
const IMAGE_RE = /\.(png|jpe?g|webp)$/i;
const REPO_URL = 'https://github.com/gninoue-dev/Worldnime2D';
const SELFTEST_DIR = process.env.WN2D_SELFTEST || null;

let win = null;
let rendererDirty = false;
let forceClose = false;
let pendingFile = fileFromArgs(process.argv);

function fileFromArgs(argv) {
  const f = argv.slice(1).find((a) => a.toLowerCase().endsWith('.wn2d'));
  return f ? path.resolve(f) : null;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1e1e1e',
    title: 'Worldnime2D',
    icon: path.join(__dirname, '..', '..', 'dist', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));

  if (SELFTEST_DIR) {
    win.webContents.on('console-message', (event) => {
      process.stdout.write(`[page] ${event.message}\n`);
    });
  }

  // Les liens externes s'ouvrent dans le navigateur, jamais dans l'éditeur.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  win.on('close', (e) => {
    if (forceClose || !rendererDirty) return;
    e.preventDefault();
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['Quitter sans enregistrer', 'Annuler'],
      defaultId: 1,
      cancelId: 1,
      title: 'Modifications non enregistrées',
      message: 'Le projet contient des modifications non enregistrées.',
      detail: 'Si vous quittez maintenant, elles seront perdues.',
    });
    if (choice === 0) {
      forceClose = true;
      win.close();
    }
  });
  win.on('closed', () => {
    win = null;
  });
}

function send(command) {
  win?.webContents.send('menu', command);
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  // Les raccourcis marqués registerAccelerator: false sont gérés par la page,
  // pour ne pas gêner la saisie dans les champs de texte.
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: '&Fichier',
      submenu: [
        { label: 'Nouveau', accelerator: 'CmdOrCtrl+N', click: () => send('new') },
        { label: 'Ouvrir…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
        { type: 'separator' },
        { label: 'Enregistrer', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: 'Enregistrer sous…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('save-as') },
        { type: 'separator' },
        { label: 'Importer un fichier à calques (ORA, PSD)…', accelerator: 'CmdOrCtrl+I', click: () => send('import-layers') },
        { label: 'Choisir le dossier d\'images…', click: () => send('choose-images') },
        { label: 'Recharger les images', accelerator: 'F5', click: () => send('reload-images') },
        { type: 'separator' },
        { label: 'Quitter', accelerator: 'CmdOrCtrl+Q', click: () => win?.close() },
      ],
    },
    {
      label: '&Édition',
      submenu: [
        { label: 'Annuler', accelerator: 'CmdOrCtrl+Z', registerAccelerator: false, click: () => send('undo') },
        { label: 'Rétablir', accelerator: 'CmdOrCtrl+Y', registerAccelerator: false, click: () => send('redo') },
        { type: 'separator' },
        { label: 'Dupliquer l\'os', accelerator: 'CmdOrCtrl+D', registerAccelerator: false, click: () => send('duplicate') },
        { label: 'Supprimer l\'os', accelerator: 'Delete', registerAccelerator: false, click: () => send('delete') },
      ],
    },
    {
      label: '&Affichage',
      submenu: [
        { label: 'Tout cadrer', accelerator: 'F', registerAccelerator: false, click: () => send('frame') },
        { label: 'Centrer la vue', accelerator: 'Home', registerAccelerator: false, click: () => send('center') },
        { label: 'Afficher les noms des os', type: 'checkbox', checked: true, click: () => send('toggle-names') },
        { label: 'Afficher les os', type: 'checkbox', checked: true, click: () => send('toggle-bones') },
        { label: 'Afficher les images', type: 'checkbox', checked: true, click: () => send('toggle-images') },
        { type: 'separator' },
        { label: 'Image de référence…', click: () => send('choose-reference') },
        { type: 'separator' },
        { label: 'Zoom avant', accelerator: 'CmdOrCtrl+=', click: () => send('zoom-in') },
        { label: 'Zoom arrière', accelerator: 'CmdOrCtrl+-', click: () => send('zoom-out') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein écran' },
        { role: 'toggleDevTools', label: 'Outils de développement' },
      ],
    },
    {
      label: '&Aide',
      submenu: [
        { label: 'Raccourcis clavier', accelerator: 'F1', click: () => send('help') },
        { label: 'Page GitHub du projet', click: () => shell.openExternal(REPO_URL) },
        {
          label: 'À propos de Worldnime2D',
          click: () => dialog.showMessageBox(win, {
            type: 'info',
            title: 'À propos',
            message: `Worldnime2D ${app.getVersion()}`,
            detail: 'Éditeur d\'animation 2D par squelette, libre et open source (licence MIT).\n' +
              `Electron ${process.versions.electron} · ${process.platform}\n${REPO_URL}`,
          }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// --- Échanges avec la page ------------------------------------------------------

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  selftest: Boolean(SELFTEST_DIR),
  selftestDir: SELFTEST_DIR,
  selftestOra: process.env.WN2D_SELFTEST_ORA || null,
  selftestPsd: process.env.WN2D_SELFTEST_PSD || null,
  // Pour tester le mode de secours sans WebGL : WN2D_RENDERER=canvas.
  renderer: process.env.WN2D_RENDERER || 'webgl',
}));

ipcMain.handle('app:pending-file', async () => {
  const file = pendingFile;
  pendingFile = null;
  if (!file) return null;
  try {
    return { path: file, text: await fs.readFile(file, 'utf8') };
  } catch (err) {
    return { path: file, error: err.message };
  }
});

ipcMain.on('state:dirty', (_e, dirty) => {
  rendererDirty = Boolean(dirty);
});

ipcMain.handle('dialog:confirm-discard', () => {
  const choice = dialog.showMessageBoxSync(win, {
    type: 'warning',
    buttons: ['Continuer sans enregistrer', 'Annuler'],
    defaultId: 1,
    cancelId: 1,
    title: 'Modifications non enregistrées',
    message: 'Le projet contient des modifications non enregistrées.',
    detail: 'Elles seront perdues si vous continuez.',
  });
  return choice === 0;
});

ipcMain.handle('dialog:open', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Ouvrir un projet',
    filters: FILE_FILTERS,
    properties: ['openFile'],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  const file = res.filePaths[0];
  return { path: file, text: await fs.readFile(file, 'utf8') };
});

ipcMain.handle('dialog:save-path', async (_e, { filePath }) => {
  const res = await dialog.showSaveDialog(win, {
    title: 'Enregistrer le projet',
    defaultPath: filePath || 'projet.wn2d',
    filters: FILE_FILTERS,
  });
  if (res.canceled || !res.filePath) return null;
  let target = res.filePath;
  if (!path.extname(target)) target += '.wn2d';
  return target;
});

ipcMain.handle('file:write-text', async (_e, { filePath, text }) => {
  // Écriture dans un fichier temporaire puis renommage : pas de projet à moitié écrit en cas de panne.
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, text, 'utf8');
  await fs.rename(tmp, filePath);
  return filePath;
});

// --- Chemins -------------------------------------------------------------------------

// Résout un chemin écrit dans le projet (relatif au fichier .wn2d) en chemin absolu.
ipcMain.handle('path:resolve', (_e, { projectFile, p }) => {
  if (!p) return null;
  if (path.isAbsolute(p)) return path.normalize(p);
  if (!projectFile) return null;
  return path.resolve(path.dirname(projectFile), p);
});

// Chemin à écrire dans le projet : relatif au fichier .wn2d, avec des « / ».
ipcMain.handle('path:relative', (_e, { projectFile, abs }) => {
  if (!abs) return '';
  if (!projectFile) return abs;
  const rel = path.relative(path.dirname(projectFile), abs);
  // Sous Windows, un autre lecteur (D: au lieu de C:) donne un chemin absolu : on le garde tel quel.
  if (path.isAbsolute(rel)) return abs;
  return (rel || '.').split(path.sep).join('/');
});

// --- Images ----------------------------------------------------------------------------

function insideDir(dir, rel) {
  const full = path.resolve(dir, rel);
  const root = path.resolve(dir) + path.sep;
  if (!full.startsWith(root)) throw new Error(`Chemin hors du dossier d'images : ${rel}`);
  return full;
}

// Liste les images d'un dossier (et de ses sous-dossiers).
ipcMain.handle('images:list', async (_e, dir) => {
  const out = [];
  const walk = async (sub) => {
    let entries;
    try {
      entries = await fs.readdir(path.join(dir, sub), { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith('.')) continue;
      const rel = sub ? `${sub}/${ent.name}` : ent.name;
      if (ent.isDirectory()) await walk(rel);
      else if (IMAGE_RE.test(ent.name)) {
        const stat = await fs.stat(path.join(dir, rel));
        out.push({ file: rel, path: rel.replace(IMAGE_RE, ''), mtime: stat.mtimeMs });
      }
    }
  };
  await walk('');
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
});

ipcMain.handle('images:read', async (_e, { dir, file }) => fs.readFile(insideDir(dir, file)));

ipcMain.handle('images:write', async (_e, { dir, file, bytes }) => {
  const full = insideDir(dir, file);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, Buffer.from(bytes));
  return full;
});

let imageWatcher = null;
let watchTimer = null;
ipcMain.handle('images:watch', (_e, dir) => {
  imageWatcher?.close();
  imageWatcher = null;
  if (!dir) return false;
  try {
    imageWatcher = fsSync.watch(dir, { recursive: true }, () => {
      clearTimeout(watchTimer);
      watchTimer = setTimeout(() => win?.webContents.send('images:changed'), 400);
    });
    imageWatcher.on('error', () => {});
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('dialog:choose-folder', async (_e, { title, defaultPath }) => {
  const res = await dialog.showOpenDialog(win, {
    title,
    defaultPath: defaultPath || undefined,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  return res.filePaths[0];
});

ipcMain.handle('dialog:choose-file', async (_e, { title, kind }) => {
  const filters = kind === 'layers'
    ? [{ name: 'Fichiers à calques (OpenRaster, Photoshop)', extensions: ['ora', 'psd'] }]
    : [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }];
  const res = await dialog.showOpenDialog(win, { title, filters, properties: ['openFile'] });
  if (res.canceled || !res.filePaths[0]) return null;
  return res.filePaths[0];
});

// Lecture d'un fichier image ou à calques choisi par l'utilisateur.
ipcMain.handle('file:read-binary', async (_e, file) => {
  if (!/\.(png|jpe?g|webp|ora|psd)$/i.test(file)) throw new Error('Type de fichier non pris en charge.');
  return fs.readFile(file);
});

// Mode test automatique : la page envoie des captures, puis on quitte.
ipcMain.handle('selftest:capture', async (_e, name) => {
  if (!SELFTEST_DIR || !/^[\w-]+$/.test(name)) return false;
  const image = await win.webContents.capturePage();
  await fs.mkdir(SELFTEST_DIR, { recursive: true });
  await fs.writeFile(path.join(SELFTEST_DIR, `${name}.png`), image.toPNG());
  return true;
});

ipcMain.handle('selftest:done', async (_e, report) => {
  if (!SELFTEST_DIR) return;
  await fs.writeFile(path.join(SELFTEST_DIR, 'report.json'), JSON.stringify(report, null, 2));
  forceClose = true;
  app.exit(report && report.ok ? 0 : 1);
});

// --- Démarrage ----------------------------------------------------------------------

if (!SELFTEST_DIR && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const file = fileFromArgs(argv);
    if (file) {
      pendingFile = file;
      send('open-pending');
    }
  });

  app.whenReady().then(() => {
    buildMenu();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

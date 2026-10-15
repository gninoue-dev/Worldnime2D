// Processus principal d'Electron : fenêtre, menus, dialogues et accès aux fichiers.
// Le rendu (l'éditeur) n'a pas accès direct au disque : il passe par preload.cjs.

const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const FILE_FILTERS = [
  { name: 'Projet Worldnime2D', extensions: ['wn2d'] },
  { name: 'Tous les fichiers', extensions: ['*'] },
];
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

ipcMain.handle('file:save', async (_e, { text, filePath, saveAs }) => {
  let target = filePath;
  if (!target || saveAs) {
    const res = await dialog.showSaveDialog(win, {
      title: 'Enregistrer le projet',
      defaultPath: filePath || 'projet.wn2d',
      filters: FILE_FILTERS,
    });
    if (res.canceled || !res.filePath) return null;
    target = res.filePath;
    if (!path.extname(target)) target += '.wn2d';
  }
  // Écriture dans un fichier temporaire puis renommage : pas de projet à moitié écrit en cas de panne.
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, text, 'utf8');
  await fs.rename(tmp, target);
  return target;
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

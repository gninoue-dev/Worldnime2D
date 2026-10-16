// Mode « tutoriel vidéo » : actif seulement avec la variable WN2D_TUTORIAL=<fichier de tâche JSON>.
// La fenêtre est rendue hors écran à la taille de la vidéo ; chaque image est envoyée à ffmpeg
// à cadence fixe. Les dialogues natifs (invisibles hors écran) répondent avec des chemins préparés
// par la leçon. Voir tutorials/README.md.

const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');

function loadJob(file) {
  // Lecture synchrone : la tâche doit être connue avant de créer la fenêtre.
  return JSON.parse(require('node:fs').readFileSync(file, 'utf8'));
}

function setupTutorial({ ipcMain, dialog, Menu, app, getWin, jobFile }) {
  const job = loadJob(jobFile);
  const fps = job.fps ?? 30;
  const width = job.width ?? 1920;
  const height = job.height ?? 1080;

  // --- Dialogues natifs remplacés par une file de réponses -------------------------------
  const answers = [];
  const next = () => (answers.length ? answers.shift() : null);
  dialog.showOpenDialog = async () => {
    const a = next();
    return a ? { canceled: false, filePaths: [a] } : { canceled: true, filePaths: [] };
  };
  dialog.showSaveDialog = async () => {
    const a = next();
    return a ? { canceled: false, filePath: a } : { canceled: true };
  };
  dialog.showMessageBoxSync = () => 0;
  dialog.showMessageBox = async () => ({ response: 0 });
  ipcMain.handle('tutorial:answer', (_e, list) => {
    answers.push(...list);
  });

  // --- Enregistrement ----------------------------------------------------------------------
  let latest = null;
  let painted = null;
  let ffmpeg = null;
  let ffmpegDone = null;
  let t0 = 0;
  let written = 0;
  let timer = null;
  const marks = [];
  const stats = { paints: 0, converted: 0, convertMs: 0, size: null };

  const toFrame = (image) => {
    const size = image.getSize();
    const img = size.width === width && size.height === height ? image : image.resize({ width, height });
    return img.toBitmap();
  };

  // Tampon d'écriture vers ffmpeg plafonné (≈ 1 s d'images) : si l'encodeur prend du retard,
  // on n'empile pas les images en mémoire (8 Mo chacune en 1080p) ; les images dues sont
  // rattrapées dès que le tampon se vide, avec l'image la plus récente.
  const maxBuffered = fps * width * height * 4;
  let late = 0;
  const pump = () => {
    if (painted) {
      const a = performance.now();
      latest = toFrame(painted);
      painted = null;
      stats.convertMs += performance.now() - a;
      stats.converted++;
    }
    if (!latest) return;
    const due = Math.floor(((performance.now() - t0) / 1000) * fps);
    while (written < due) {
      if (ffmpeg.stdin.writableLength > maxBuffered) {
        late++;
        return;
      }
      ffmpeg.stdin.write(latest);
      written++;
    }
  };

  const windowOptions = {
    width,
    height,
    useContentSize: true,
    enableLargerThanScreen: true,
    show: false,
    webPreferences: { offscreen: true },
  };

  const attach = (win) => {
    win.webContents.setFrameRate(fps);
    // La conversion en image brute se fait au moment d'écrire, une seule fois par image peinte.
    win.webContents.on('paint', (_e, _dirty, image) => {
      painted = image;
      stats.paints++;
      stats.size = image.getSize();
    });
    // Sans cela, la fenêtre est ramenée à la taille de l'écran (ex. 1366×768 sur un portable).
    win.setContentSize(width, height);
    win.webContents.on('did-finish-load', () => win.webContents.setZoomFactor(job.zoom ?? 1.25));
    win.webContents.on('console-message', (event) => process.stdout.write(`[page] ${event.message}\n`));
    win.webContents.on('render-process-gone', (_e, d) => {
      process.stderr.write(`Page arrêtée : ${d.reason}\n`);
      app.exit(2);
    });
  };

  ipcMain.handle('tutorial:job', () => {
    // Les menus réels, pour que la leçon puisse les montrer (ils n'existent pas hors écran).
    const menus = Menu.getApplicationMenu().items.map((m) => ({
      label: m.label.replace('&', ''),
      items: m.submenu.items.map((s) => ({ label: s.label, accelerator: s.accelerator ?? '', separator: s.type === 'separator' })),
    }));
    return { ...job, menus };
  });

  ipcMain.handle('tutorial:start', () => {
    ffmpeg = spawn(job.ffmpeg || 'ffmpeg', [
      '-y', '-loglevel', 'error',
      '-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', `${width}x${height}`, '-r', String(fps), '-i', '-',
      // Encodage rapide (le fichier est réencodé à l'assemblage, voir make.mjs).
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '16', '-pix_fmt', 'yuv420p', job.video,
    ], { stdio: ['pipe', 'inherit', 'inherit'] });
    ffmpegDone = new Promise((resolve) => ffmpeg.on('close', resolve));
    t0 = performance.now();
    written = 0;
    late = 0;
    timer = setInterval(pump, 1000 / fps / 2);
    if (process.env.WN2D_TUTORIAL_STATS) setInterval(() => {
      const m = (performance.now() - t0) / 1000;
      process.stdout.write(`[stats] ${m.toFixed(0)} s : ${written} images écrites (${(written / fps).toFixed(0)} s), ${stats.paints} paint, `
        + `${(stats.convertMs / Math.max(1, stats.converted)).toFixed(1)} ms/conversion, taille ${JSON.stringify(stats.size)}, tampon ${(ffmpeg.stdin.writableLength / 1e6).toFixed(0)} Mo\n`);
    }, 5000);
    return true;
  });

  // Repère temporel (en secondes depuis le début de l'enregistrement).
  ipcMain.handle('tutorial:mark', (_e, label) => {
    const t = (performance.now() - t0) / 1000;
    marks.push({ label, t });
    return t;
  });

  ipcMain.handle('tutorial:finish', async (_e, report) => {
    if (!ffmpeg) {
      await fs.writeFile(job.timeline, JSON.stringify({ ...report, marks }, null, 2));
      app.exit(1);
      return;
    }
    pump();
    clearInterval(timer);
    ffmpeg.stdin.end();
    const code = await ffmpegDone;
    const duration = written / fps;
    await fs.writeFile(job.timeline, JSON.stringify({ ...report, marks, duration, fps, late }, null, 2));
    app.exit(code === 0 && report?.ok !== false ? 0 : 1);
  });

  return { windowOptions, attach };
}

module.exports = { setupTutorial };

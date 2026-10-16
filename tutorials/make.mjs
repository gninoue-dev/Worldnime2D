// Fabrique les tutoriels vidéo de Worldnime2D.
//
//   node tutorials/make.mjs                 toutes les leçons
//   node tutorials/make.mjs 03 05-images    seulement ces leçons (numéro ou identifiant)
//   node tutorials/make.mjs --list          liste des leçons
//
// Pour chaque leçon : 1) la narration est lue par une voix de synthèse (Piper), étape par étape ;
// 2) l'éditeur est lancé hors écran et la leçon le pilote, chaque étape durant au moins sa narration ;
// 3) ffmpeg assemble l'image, la voix et les sous-titres dans tutorials/output/.
// Voir tutorials/README.md pour installer Piper et la voix française.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';
import { LESSONS } from './lessons/index.js';
import { forSpeech, subtitleChunks } from './speech.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const out = resolve(here, 'output');
const cache = join(out, '.voix');
const TTS = process.env.WN2D_TTS_DIR || join(homedir(), '.local/share/wn2d-tts');
const PIPER = process.env.WN2D_PIPER || join(TTS, 'piper/piper');
const VOICE = process.env.WN2D_VOICE || join(TTS, 'voices/fr_FR-siwis-medium.onnx');
const SPEED = Number(process.env.WN2D_VOICE_SPEED || 1.06);
// Signature incrustée en bas à droite de chaque vidéo.
const SIGNATURE = process.env.WN2D_SIGNATURE || 'dev_gninoue';
const FONT = process.env.WN2D_FONT || '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const WATERMARK = `drawtext=fontfile=${FONT}:text=${SIGNATURE}:fontsize=30:fontcolor=white@0.75:`
  + 'shadowcolor=black@0.6:shadowx=2:shadowy=2:x=w-tw-36:y=h-th-30';

const args = process.argv.slice(2);
if (args.includes('--list')) {
  for (const l of LESSONS) console.log(`${l.id.padEnd(28)} ${l.title}`);
  process.exit(0);
}
const wanted = args.filter((a) => !a.startsWith('--'));
const lessons = wanted.length ? LESSONS.filter((l) => wanted.some((w) => l.id === w || l.id.startsWith(`${w}-`))) : LESSONS;
if (!lessons.length) {
  console.error('Aucune leçon ne correspond.');
  process.exit(1);
}
if (!existsSync(PIPER) || !existsSync(VOICE)) {
  console.error(`Piper ou la voix est introuvable (${PIPER}, ${VOICE}). Voir tutorials/README.md.`);
  process.exit(1);
}

const run = (cmd, argv, opts = {}) => {
  const r = spawnSync(cmd, argv, { stdio: 'inherit', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} a échoué (code ${r.status})`);
  return r;
};

// --- Voix ----------------------------------------------------------------------------------

function readWav(file) {
  const buf = readFileSync(file);
  // En-tête WAV PCM 16 bits : on cherche le bloc « data ».
  const rate = buf.readUInt32LE(24);
  let p = 12;
  while (p < buf.length - 8) {
    const id = buf.toString('ascii', p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    if (id === 'data') return { rate, samples: new Int16Array(buf.buffer.slice(buf.byteOffset + p + 8, buf.byteOffset + p + 8 + size)) };
    p += 8 + size;
  }
  throw new Error(`WAV illisible : ${file}`);
}

function speak(text) {
  mkdirSync(cache, { recursive: true });
  const spoken = forSpeech(text);
  const key = createHash('sha1').update(`${VOICE}|${SPEED}|${spoken}`).digest('hex').slice(0, 16);
  const file = join(cache, `${key}.wav`);
  if (!existsSync(file)) {
    run(PIPER, ['-m', VOICE, '-f', file, '--length_scale', String(SPEED), '--sentence_silence', '0.3'], {
      input: spoken, stdio: ['pipe', 'ignore', 'ignore'],
    });
  }
  const wav = readWav(file);
  return { file, wav, duration: wav.samples.length / wav.rate };
}

// --- Assemblage ----------------------------------------------------------------------------

function writeWav(file, samples, rate) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + samples.length * 2, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(samples.length * 2, 40);
  writeFileSync(file, Buffer.concat([header, Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength)]));
}

const srtTime = (t) => {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  return `${h}:${m}:${s},${String(ms % 1000).padStart(3, '0')}`;
};

function makeLesson(lesson) {
  const index = LESSONS.indexOf(lesson);
  console.log(`\n=== ${lesson.id} : ${lesson.title}`);
  const voices = lesson.steps.map((s) => (s.say ? speak(s.say) : null));
  const durations = voices.map((v) => v?.duration ?? 0);
  const total = durations.reduce((a, b) => a + b, 0);
  console.log(`Narration : ${lesson.steps.length} étapes, ${Math.round(total)} s`);

  const work = join(out, 'travail', lesson.id);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const job = {
    lesson: lesson.id,
    index,
    count: LESSONS.length,
    next: LESSONS[index + 1]?.title ?? null,
    fps: 30,
    width: 1920,
    height: 1080,
    zoom: 1.25,
    durations,
    work,
    video: join(work, 'image.mp4'),
    timeline: join(work, 'timeline.json'),
  };
  const jobFile = join(work, 'job.json');
  writeFileSync(jobFile, JSON.stringify(job, null, 2));

  const argv = ['.', '--no-sandbox', '--force-device-scale-factor=1'];
  if (process.env.WN2D_ELECTRON_ARGS) argv.push(...process.env.WN2D_ELECTRON_ARGS.split(' ').filter(Boolean));
  const r = spawnSync(electron, argv, {
    cwd: root, stdio: 'inherit', env: { ...process.env, WN2D_TUTORIAL: jobFile }, timeout: 30 * 60 * 1000,
  });
  const timeline = existsSync(job.timeline) ? JSON.parse(readFileSync(job.timeline, 'utf8')) : null;
  if (r.status !== 0 || !timeline?.ok) throw new Error(`Enregistrement de « ${lesson.id} » échoué : ${timeline?.error ?? `code ${r.status}`}`);

  // Piste de voix : chaque narration posée à l'instant où son étape a commencé.
  const rate = voices.find(Boolean)?.wav.rate ?? 22050;
  const audio = new Int16Array(Math.ceil((timeline.duration + 1) * rate));
  const srt = [];
  lesson.steps.forEach((step, i) => {
    const v = voices[i];
    if (!v) return;
    const start = timeline.marks.find((m) => m.label === `step-${i}`).t;
    audio.set(v.wav.samples.subarray(0, Math.max(0, Math.min(v.wav.samples.length, audio.length - Math.round(start * rate)))), Math.round(start * rate));
    for (const c of subtitleChunks(step.say, v.duration)) srt.push({ from: start + c.from, to: start + c.to, text: c.text });
  });
  const wavFile = join(work, 'voix.wav');
  writeWav(wavFile, audio, rate);
  const srtText = srt.map((c, i) => `${i + 1}\n${srtTime(c.from)} --> ${srtTime(c.to)}\n${c.text}\n`).join('\n');
  const base = join(out, lesson.id);
  writeFileSync(`${base}.srt`, srtText);

  run('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', job.video, '-i', wavFile, '-i', `${base}.srt`,
    '-map', '0:v', '-map', '1:a', '-map', '2:s',
    '-vf', WATERMARK, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
    '-c:s', 'mov_text', '-metadata:s:s:0', 'language=fra', '-metadata:s:a:0', 'language=fra',
    '-metadata', `title=Worldnime2D — ${lesson.title}`, '-shortest', '-movflags', '+faststart', `${base}.mp4`,
  ]);
  if (timeline.late) console.warn(`  (encodeur en retard : ${timeline.late} rattrapages d'images)`);
  console.log(`✔ ${base}.mp4 (${Math.round(timeline.duration)} s)`);
  return { id: lesson.id, duration: timeline.duration };
}

mkdirSync(out, { recursive: true });
run('npm', ['run', 'build', '--silent'], { cwd: root });
const done = [];
const failed = [];
for (const lesson of lessons) {
  try {
    done.push(makeLesson(lesson));
  } catch (err) {
    console.error(`✘ ${err.message}`);
    failed.push(lesson.id);
  }
}
const minutes = done.reduce((a, d) => a + d.duration, 0) / 60;
console.log(`\n${done.length} vidéo(s) faite(s), ${minutes.toFixed(1)} min au total.${failed.length ? ` Échecs : ${failed.join(', ')}` : ''}`);
process.exit(failed.length ? 1 : 0);

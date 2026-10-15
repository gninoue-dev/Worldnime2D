// Lance l'éditeur en mode test automatique et affiche le résultat.
// Usage : npm run selftest [dossier-des-captures]
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import electron from 'electron';

const out = resolve(process.argv[2] || 'selftest-output');
const args = ['.'];
if (process.platform === 'linux') args.push('--no-sandbox');
spawnSync(electron, args, { stdio: 'inherit', env: { ...process.env, WN2D_SELFTEST: out }, timeout: 120000 });

const report = JSON.parse(readFileSync(resolve(out, 'report.json'), 'utf8'));
for (const c of report.checks) console.log(`${c.ok ? '✔' : '✘'} ${c.name}${c.ok ? '' : ` — ${c.detail}`}`);
console.log(report.ok ? `\nOK (${report.checks.length} vérifications, captures dans ${out})` : '\nÉCHEC');
process.exit(report.ok ? 0 : 1);

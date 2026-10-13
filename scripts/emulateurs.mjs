/**
 * Lance les émulateurs Firebase en conservant les données entre deux sessions
 * (dossier .donnees-emulateurs/, non versionné). Compatible Windows/macOS/Linux.
 */
import { mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';

const dossier = '.donnees-emulateurs';
mkdirSync(dossier, { recursive: true });
const p = spawn(
  'firebase',
  ['emulators:start', '--project', 'demo-ynov-rh', `--import=./${dossier}`, '--export-on-exit'],
  { stdio: 'inherit', shell: true },
);
p.on('exit', (code) => process.exit(code ?? 0));

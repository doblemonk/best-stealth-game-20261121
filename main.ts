// Shadow Vault — make.fun entrypoint.
//
// Packages the game for submission: copies the game/ folder (and any
// screenshots/) into the output directory, then writes dossier.json
// describing the bundle via the shared make.fun dossier builder.
//
// Run locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR || '/output';

mkdirSync(out, { recursive: true });

// Copy the playable game into the output bundle.
cpSync(join(repoDir, 'game'), join(out, 'game'), { recursive: true });

// Include screenshots when the folder exists next to this file.
const screenshotsDir = join(repoDir, 'screenshots');
if (existsSync(screenshotsDir)) {
  const outScreenshots = join(out, 'screenshots');
  mkdirSync(outScreenshots, { recursive: true });
  cpSync(screenshotsDir, outScreenshots, { recursive: true });
}

// Write the submission dossier describing the packaged game.
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
// buildDossier returns the dossier as canonical JSON *bytes* (a
// Uint8Array): write those bytes verbatim. Never JSON.stringify them —
// that would serialise the byte array itself instead of the dossier.
writeFileSync(join(out, 'dossier.json'), dossier);

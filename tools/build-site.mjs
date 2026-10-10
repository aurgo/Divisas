#!/usr/bin/env node
/*
 * Prepara _site/, lo que se publica en GitHub Pages: sólo los ficheros de la
 * app (ni pruebas, ni herramientas), y en sw.js la lista de banderas a guardar
 * y una versión que cambia cuando cambia la app.
 *
 * La versión no incluye rates.json: los tipos cambian a diario y eso no debe
 * obligar a reinstalar la app; el service worker ya los pide a la red.
 */
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, '_site');
const FILES = ['index.html', 'styles.css', 'app.js', 'core.js', 'i18n.js', 'currencies.js', 'manifest.webmanifest', 'rates.json', 'sw.js'];
const DIRS = ['icons', 'fonts', 'flags'];

async function walk(dir) {
  const out = [];
  for (const e of await readdir(join(ROOT, dir), { withFileTypes: true })) {
    const p = dir + '/' + e.name;
    if (e.isDirectory()) out.push(...await walk(p)); else out.push(p);
  }
  return out.sort();
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
for (const f of FILES) await cp(join(ROOT, f), join(OUT, f));
for (const d of DIRS) await cp(join(ROOT, d), join(OUT, d), { recursive: true });

const assets = [...FILES, ...(await Promise.all(DIRS.map(walk))).flat()];
const hash = createHash('sha256');
for (const f of assets) if (f !== 'rates.json' && f !== 'sw.js') hash.update(f).update(await readFile(join(ROOT, f)));
hash.update(await readFile(join(ROOT, 'sw.js')));
const version = hash.digest('hex').slice(0, 12);

const flags = (await walk('flags')).filter((f) => f.endsWith('.svg'));
let sw = await readFile(join(ROOT, 'sw.js'), 'utf8');
if (!sw.includes('__VERSION__') || !sw.includes('/*FLAGS*/')) throw new Error('sw.js no tiene los huecos __VERSION__ y /*FLAGS*/');
sw = sw.replace('__VERSION__', version).replace('/*FLAGS*/', flags.map((f) => `'${f}'`).join(', '));
await writeFile(join(OUT, 'sw.js'), sw);

console.log(`_site/ listo: ${assets.length} ficheros, versión ${version}, ${flags.length} banderas.`);

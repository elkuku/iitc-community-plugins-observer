/**
 * Copy data/ into site/public/data/ so Vite can serve/bundle them,
 * then invoke the Vite build.
 */

import { cp, mkdir } from 'fs/promises';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const ROOT = resolve(fileURLToPath(import.meta.url), '../..');
const DATA_SRC = join(ROOT, 'data');
const DATA_DEST = join(ROOT, 'site', 'public', 'data');

console.log(`Copying ${DATA_SRC} → ${DATA_DEST}`);
await mkdir(DATA_DEST, { recursive: true });
await cp(DATA_SRC, DATA_DEST, { recursive: true });

console.log('Running vite build…');
execSync('npm run build', { cwd: join(ROOT, 'site'), stdio: 'inherit' });

console.log('Site build complete.');

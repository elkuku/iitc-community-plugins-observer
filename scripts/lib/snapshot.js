/**
 * Read and write snapshot files under data/plugins/{id_hash}/.
 */

import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..');
export const DATA_DIR = join(ROOT, 'data');
export const PLUGINS_DIR = join(DATA_DIR, 'plugins');

/**
 * Derive a filesystem-safe id_hash from a plugin id.
 * "barcodes@3ch01c" → "barcodes-by-3ch01c"
 * The upstream meta.json already provides id_hash; this is a fallback.
 */
export function toIdHash(id) {
  return id.replace('@', '-by-');
}

/**
 * Load the versions.json for a plugin, or return null if it doesn't exist.
 */
export async function loadVersions(idHash) {
  const file = join(PLUGINS_DIR, idHash, 'versions.json');
  if (!existsSync(file)) return null;
  return JSON.parse(await readFile(file, 'utf8'));
}

/**
 * Save the versions.json for a plugin (creates directory if needed).
 */
export async function saveVersions(idHash, data) {
  const dir = join(PLUGINS_DIR, idHash);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'versions.json'), JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/**
 * Write a raw source snapshot file.
 */
export async function saveSnapshot(idHash, date, content) {
  const dir = join(PLUGINS_DIR, idHash);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${date}.user.js`), content, 'utf8');
}

/**
 * List all id_hash directories currently stored in data/plugins/.
 */
export async function listStoredPlugins() {
  if (!existsSync(PLUGINS_DIR)) return [];
  const entries = await readdir(PLUGINS_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

/**
 * Save data/manifest.json.
 */
export async function saveManifest(manifest) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(
    join(DATA_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf8'
  );
}

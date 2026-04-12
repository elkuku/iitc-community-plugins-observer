/**
 * Main fetch pipeline.
 *
 * 1. Fetch upstream dist/meta.json
 * 2. For each plugin, fetch source and compare against last snapshot
 * 3. Write new snapshot files when version or content changed
 * 4. Rebuild data/manifest.json
 */

import { parseMeta } from 'lib-iitc-manager';
import {
  fetchPluginList,
  fetchUpstreamCommit,
  fetchPluginSource,
} from './lib/community-plugins.js';
import {
  toIdHash,
  loadVersions,
  saveVersions,
  saveSnapshot,
  listStoredPlugins,
  saveManifest,
} from './lib/snapshot.js';

const CONCURRENCY = 10;
const MAX_RETRIES = 3;

// --- helpers ----------------------------------------------------------------

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function withRetry(fn, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      const wait = attempt * 1000;
      console.warn(`  retry ${attempt}/${retries - 1} after ${wait}ms — ${err.message}`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

async function runConcurrent(items, fn, concurrency) {
  const results = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const item = items[i++];
      results.push(await fn(item).catch((err) => ({ __error: err, item })));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

// --- per-plugin processing --------------------------------------------------

async function processPlugin(plugin) {
  // Prefer upstream-provided id_hash; fall back to deriving it
  const idHash = plugin.id_hash ?? toIdHash(plugin.id);
  const downloadURL = plugin.downloadURL;

  if (!downloadURL) {
    console.warn(`  [${plugin.id}] no downloadURL, skipping`);
    return null;
  }

  // Fetch source
  let source;
  try {
    source = await withRetry(() => fetchPluginSource(downloadURL));
  } catch (err) {
    console.error(`  [${plugin.id}] fetch failed: ${err.message}`);
    return null;
  }

  // Parse @version from source
  let parsedMeta = {};
  try {
    parsedMeta = parseMeta(source.text) || {};
  } catch {
    // parseMeta may throw on malformed headers — keep going
  }
  const version = parsedMeta.version || plugin.version || 'unknown';

  // Load existing snapshot record
  const existing = await loadVersions(idHash);
  const lastEntry = existing?.versions?.at(-1);

  const changed =
    !lastEntry ||
    lastEntry.version !== version ||
    lastEntry.sha256 !== source.sha256;

  const date = today();
  const fetchedAt = new Date().toISOString();

  if (changed) {
    console.log(`  [${plugin.id}] new version ${version} (was ${lastEntry?.version ?? 'none'})`);
    await saveSnapshot(idHash, date, source.text);

    const record = existing ?? {
      id: plugin.id,
      id_hash: idHash,
      author: plugin.author,
      name: plugin.name,
      category: plugin.category,
      description: plugin.description,
      downloadURL,
      versions: [],
    };

    // Keep metadata fresh
    record.author = plugin.author;
    record.name = plugin.name;
    record.category = plugin.category;
    record.description = plugin.description;
    record.downloadURL = downloadURL;

    record.versions.push({ version, date, snapshotFile: `${date}.user.js`, sha256: source.sha256, fetchedAt });
    await saveVersions(idHash, record);
    return { ...record, latestVersion: version, latestDate: date, changed: true };
  }

  // No change — return summary from existing record for manifest rebuild
  return {
    id: plugin.id,
    id_hash: idHash,
    author: existing.author,
    name: existing.name,
    category: existing.category,
    description: existing.description,
    latestVersion: lastEntry.version,
    latestDate: lastEntry.date,
    snapshotCount: existing.versions.length,
    firstSeen: existing.versions[0]?.date,
    status: 'active',
    changed: false,
  };
}

// --- manifest builder -------------------------------------------------------

async function buildManifest(upstreamCommit, activeIdHashes, pluginSummaries) {
  // Mark removed plugins
  const storedHashes = await listStoredPlugins();
  const activeHashes = new Set(activeIdHashes);

  const removed = [];
  for (const hash of storedHashes) {
    if (!activeHashes.has(hash)) {
      const existing = await loadVersions(hash);
      if (existing && existing.status !== 'removed') {
        existing.status = 'removed';
        await saveVersions(hash, existing);
        console.log(`  [${hash}] marked as removed`);
      }
      if (existing) {
        removed.push({
          id: existing.id,
          id_hash: hash,
          author: existing.author,
          name: existing.name,
          category: existing.category,
          description: existing.description,
          latestVersion: existing.versions.at(-1)?.version,
          latestDate: existing.versions.at(-1)?.date,
          snapshotCount: existing.versions.length,
          firstSeen: existing.versions[0]?.date,
          status: 'removed',
        });
      }
    }
  }

  const allPlugins = [
    ...pluginSummaries.map((p) => ({
      id: p.id,
      id_hash: p.id_hash,
      author: p.author,
      name: p.name,
      category: p.category,
      description: p.description,
      latestVersion: p.latestVersion,
      latestDate: p.latestDate,
      snapshotCount: p.snapshotCount ?? p.versions?.length ?? 1,
      firstSeen: p.firstSeen ?? p.versions?.[0]?.date ?? today(),
      status: 'active',
    })),
    ...removed,
  ];

  await saveManifest({
    generatedAt: new Date().toISOString(),
    upstreamCommit,
    pluginCount: allPlugins.length,
    plugins: allPlugins,
  });
}

// --- main -------------------------------------------------------------------

async function main() {
  console.log('Fetching upstream plugin list…');
  const [pluginList, upstreamCommit] = await Promise.all([
    fetchPluginList(),
    fetchUpstreamCommit(),
  ]);

  console.log(`Found ${pluginList.length} plugins (upstream commit: ${upstreamCommit ?? 'unknown'})`);

  console.log(`Processing plugins with concurrency=${CONCURRENCY}…`);
  const results = await runConcurrent(pluginList, processPlugin, CONCURRENCY);

  const successful = results.filter((r) => r && !r.__error);
  const errors = results.filter((r) => r?.__error);
  const changed = successful.filter((r) => r.changed);

  console.log(`\nResults: ${successful.length} processed, ${changed.length} updated, ${errors.length} errors`);

  console.log('Rebuilding manifest…');
  await buildManifest(
    upstreamCommit,
    pluginList.map((p) => p.id_hash ?? toIdHash(p.id)),
    successful
  );

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

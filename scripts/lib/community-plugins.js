/**
 * Fetch and parse the upstream IITC-CE Community-plugins index.
 */

const META_URL =
  'https://raw.githubusercontent.com/IITC-CE/Community-plugins/master/dist/meta.json';
const COMMITS_API =
  'https://api.github.com/repos/IITC-CE/Community-plugins/commits/master';

/**
 * Fetch the full plugin list from upstream dist/meta.json.
 * Returns an array of plugin metadata objects.
 * The upstream format is { plugins: [...], version: "..." }.
 */
export async function fetchPluginList() {
  const res = await fetch(META_URL);
  if (!res.ok) throw new Error(`Failed to fetch meta.json: ${res.status} ${res.statusText}`);
  const data = await res.json();
  // Handle both wrapped { plugins: [] } and bare array formats
  return Array.isArray(data) ? data : (data.plugins ?? []);
}

/**
 * Fetch the latest commit SHA of the upstream repo (used for provenance).
 * Requires GITHUB_TOKEN env var in CI to avoid rate limiting.
 */
export async function fetchUpstreamCommit() {
  const headers = { Accept: 'application/vnd.github.sha' };
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const res = await fetch(COMMITS_API, { headers });
  if (!res.ok) {
    console.warn(`Could not fetch upstream commit SHA: ${res.status}`);
    return null;
  }
  return (await res.text()).trim();
}

/**
 * Fetch the raw source of a single plugin.
 * Returns { text, sha256 } or throws on error.
 */
export async function fetchPluginSource(downloadURL) {
  const res = await fetch(downloadURL, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const text = await res.text();
  const sha256 = await computeSha256(text);
  return { text, sha256 };
}

async function computeSha256(text) {
  const bytes = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

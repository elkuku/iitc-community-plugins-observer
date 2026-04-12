/**
 * Plugin list page logic.
 */

const MANIFEST_URL = import.meta.env.BASE_URL + 'data/manifest.json';
const RECENT_DAYS = 14;

let allPlugins = [];
let sortKey = 'latestDate';
let sortDir = -1; // -1 = descending

async function init() {
  let manifest;
  try {
    const res = await fetch(MANIFEST_URL);
    manifest = await res.json();
  } catch {
    document.getElementById('plugin-tbody').innerHTML =
      '<tr><td colspan="7" class="loading">Failed to load manifest.json</td></tr>';
    return;
  }

  allPlugins = manifest.plugins ?? [];

  // Stats bar
  document.getElementById('stat-total').textContent = `${allPlugins.length} plugins`;
  const today = new Date().toISOString().slice(0, 10);
  const updatedToday = allPlugins.filter((p) => p.latestDate === today).length;
  document.getElementById('stat-updated').textContent = `${updatedToday} updated today`;
  const generated = manifest.generatedAt
    ? new Date(manifest.generatedAt).toLocaleString()
    : '—';
  document.getElementById('stat-generated').textContent = `last checked: ${generated}`;

  // Recent changes
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RECENT_DAYS);
  const recent = allPlugins
    .filter((p) => p.latestDate && new Date(p.latestDate) >= cutoff && p.status === 'active')
    .sort((a, b) => b.latestDate.localeCompare(a.latestDate))
    .slice(0, 20);
  const recentList = document.getElementById('recent-list');
  if (recent.length === 0) {
    recentList.innerHTML = '<li>No changes in the last 14 days.</li>';
  } else {
    recentList.innerHTML = recent
      .map(
        (p) =>
          `<li>
            <a class="plugin-link" href="${import.meta.env.BASE_URL}plugin.html?id=${p.id_hash}">${escHtml(p.name)}</a>
            <span class="change-meta"> · v${escHtml(p.latestVersion)} · ${p.latestDate} · by ${escHtml(p.author)}</span>
          </li>`
      )
      .join('');
  }

  // Category filter options
  const categories = [...new Set(allPlugins.map((p) => p.category).filter(Boolean))].sort();
  const sel = document.getElementById('filter-category');
  categories.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  });

  // Wire controls
  document.getElementById('search').addEventListener('input', render);
  document.getElementById('filter-category').addEventListener('change', render);
  document.getElementById('filter-status').addEventListener('change', render);
  document.querySelectorAll('th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (sortKey === key) sortDir *= -1;
      else { sortKey = key; sortDir = -1; }
      render();
    });
  });

  render();
}

function render() {
  const query = document.getElementById('search').value.toLowerCase();
  const cat = document.getElementById('filter-category').value;
  const status = document.getElementById('filter-status').value;

  let plugins = allPlugins.filter((p) => {
    if (query && !`${p.name} ${p.author} ${p.category} ${p.description}`.toLowerCase().includes(query)) return false;
    if (cat && p.category !== cat) return false;
    if (status && p.status !== status) return false;
    return true;
  });

  plugins.sort((a, b) => {
    const av = a[sortKey] ?? '';
    const bv = b[sortKey] ?? '';
    return av < bv ? sortDir : av > bv ? -sortDir : 0;
  });

  document.getElementById('plugin-tbody').innerHTML = plugins.length
    ? plugins.map(rowHtml).join('')
    : '<tr><td colspan="7" class="loading">No plugins match the current filters.</td></tr>';
}

function rowHtml(p) {
  const badge = p.status === 'removed'
    ? '<span class="badge badge-removed">removed</span>'
    : '<span class="badge badge-active">active</span>';
  return `<tr>
    <td><a href="${import.meta.env.BASE_URL}plugin.html?id=${p.id_hash}">${escHtml(p.name)}</a></td>
    <td>${escHtml(p.author ?? '')}</td>
    <td>${escHtml(p.category ?? '')}</td>
    <td class="mono">${escHtml(p.latestVersion ?? '')}</td>
    <td>${escHtml(p.latestDate ?? '')}</td>
    <td>${p.snapshotCount ?? 0}</td>
    <td>${badge}</td>
  </tr>`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

init();

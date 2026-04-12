/**
 * Plugin detail / version history page logic.
 */

const idHash = new URLSearchParams(location.search).get('id');

if (!idHash) {
  document.getElementById('plugin-name').textContent = 'Plugin not found';
}

const selectedVersions = new Set();

async function init() {
  if (!idHash) return;

  let data;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/plugins/${idHash}/versions.json`);
    if (!res.ok) throw new Error(res.statusText);
    data = await res.json();
  } catch {
    document.getElementById('plugin-name').textContent = 'Failed to load plugin data';
    return;
  }

  document.title = `${data.name} — IITC Community Plugins Observer`;
  document.getElementById('plugin-name').textContent = data.name;
  document.getElementById('back-link').href = import.meta.env.BASE_URL;

  const meta = document.getElementById('plugin-meta');
  meta.innerHTML = `by <strong>${escHtml(data.author ?? '')}</strong> · ${escHtml(data.category ?? '')}`;

  const details = document.getElementById('plugin-details');
  details.innerHTML = [
    ['ID', `<code>${escHtml(data.id)}</code>`],
    ['Description', escHtml(data.description ?? '—')],
    ['Download URL', `<a href="${escHtml(data.downloadURL)}" target="_blank">${escHtml(data.downloadURL)}</a>`],
    ['Total snapshots', data.versions.length],
    ['First seen', data.versions[0]?.date ?? '—'],
  ]
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
    .join('');

  const tbody = document.getElementById('versions-tbody');
  const rows = [...data.versions].reverse(); // newest first
  tbody.innerHTML = rows
    .map(
      (v) => `<tr>
      <td><input type="checkbox" class="ver-check" data-date="${v.date}" data-version="${escHtml(v.version)}" /></td>
      <td class="mono">${escHtml(v.version)}</td>
      <td>${escHtml(v.date)}</td>
      <td class="mono" style="font-size:0.78em;color:var(--text-muted)">${v.sha256?.slice(0, 12)}…</td>
      <td>
        <a href="${import.meta.env.BASE_URL}data/plugins/${idHash}/${v.date}.user.js" target="_blank" class="btn-view">View source</a>
      </td>
    </tr>`
    )
    .join('');

  // Checkbox selection for diff
  tbody.addEventListener('change', (e) => {
    if (!e.target.classList.contains('ver-check')) return;
    const { date, version } = e.target.dataset;
    if (e.target.checked) {
      if (selectedVersions.size >= 2) {
        e.target.checked = false;
        return;
      }
      selectedVersions.add(date);
    } else {
      selectedVersions.delete(date);
    }
    const btn = document.getElementById('compare-btn');
    btn.disabled = selectedVersions.size !== 2;
    btn.textContent = selectedVersions.size === 2
      ? 'Compare selected'
      : `Compare selected (pick ${2 - selectedVersions.size} more)`;
  });

  document.getElementById('compare-btn').addEventListener('click', () => {
    if (selectedVersions.size !== 2) return;
    const [a, b] = [...selectedVersions].sort();
    location.href = `${import.meta.env.BASE_URL}diff.html?id=${idHash}&a=${a}&b=${b}`;
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

init();

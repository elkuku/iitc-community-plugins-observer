/**
 * Diff viewer page — fetches two snapshots and renders with diff2html.
 */

import { createTwoFilesPatch } from 'diff';
import { html as diff2html } from 'diff2html';

const params = new URLSearchParams(location.search);
const idHash = params.get('id');
const dateA = params.get('a');
const dateB = params.get('b');

let currentMode = 'line-by-line'; // or 'side-by-side'

async function init() {
  if (!idHash || !dateA || !dateB) {
    document.getElementById('diff-output').innerHTML = '<p>Invalid diff URL. Expected ?id=…&a=YYYY-MM-DD&b=YYYY-MM-DD</p>';
    return;
  }

  document.getElementById('back-link').href = `${import.meta.env.BASE_URL}plugin.html?id=${idHash}`;

  // Load plugin name from versions.json for display
  let pluginName = idHash;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/plugins/${idHash}/versions.json`);
    if (res.ok) {
      const data = await res.json();
      pluginName = data.name ?? idHash;
      const vA = data.versions.find((v) => v.date === dateA);
      const vB = data.versions.find((v) => v.date === dateB);
      document.getElementById('diff-meta').textContent =
        `${vA?.version ?? dateA}  →  ${vB?.version ?? dateB}`;
    }
  } catch { /* ignore */ }

  document.title = `Diff: ${pluginName} — IITC Community Plugins Observer`;
  document.getElementById('diff-title').textContent = pluginName;

  // Fetch both snapshots
  let [srcA, srcB] = ['', ''];
  const outputEl = document.getElementById('diff-output');
  try {
    [srcA, srcB] = await Promise.all([
      fetchText(`${import.meta.env.BASE_URL}data/plugins/${idHash}/${dateA}.user.js`),
      fetchText(`${import.meta.env.BASE_URL}data/plugins/${idHash}/${dateB}.user.js`),
    ]);
  } catch (err) {
    outputEl.innerHTML = `<p class="loading">Failed to load snapshot: ${escHtml(err.message)}</p>`;
    return;
  }

  renderDiff(srcA, srcB, `${dateA}.user.js`, `${dateB}.user.js`);

  // Toggle mode button
  const toggleBtn = document.getElementById('toggle-mode');
  toggleBtn.textContent = 'Switch to Side-by-Side';
  toggleBtn.addEventListener('click', () => {
    currentMode = currentMode === 'line-by-line' ? 'side-by-side' : 'line-by-line';
    toggleBtn.textContent =
      currentMode === 'line-by-line' ? 'Switch to Side-by-Side' : 'Switch to Inline';
    renderDiff(srcA, srcB, `${dateA}.user.js`, `${dateB}.user.js`);
  });

  document.getElementById('copy-permalink').addEventListener('click', () => {
    navigator.clipboard.writeText(location.href).then(() => {
      const btn = document.getElementById('copy-permalink');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy Permalink'; }, 2000);
    });
  });
}

function renderDiff(srcA, srcB, nameA, nameB) {
  const unified = createTwoFilesPatch(nameA, nameB, srcA, srcB, dateA, dateB);
  const outputEl = document.getElementById('diff-output');

  if (unified === `--- ${nameA}\t${dateA}\n+++ ${nameB}\t${dateB}\n`) {
    outputEl.innerHTML = '<p style="padding:1.5rem;color:var(--text-muted)">No differences found between these two snapshots.</p>';
    return;
  }

  outputEl.innerHTML = diff2html(unified, {
    drawFileList: false,
    matching: 'lines',
    outputFormat: currentMode,
    renderNothingWhenEmpty: false,
    colorScheme: 'dark',
  });
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} (${url})`);
  return res.text();
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

init();

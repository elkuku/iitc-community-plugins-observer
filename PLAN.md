# IITC Community Plugins Observer — Implementation Plan

## Goal

Track every plugin listed in [IITC-CE/Community-plugins](https://github.com/IITC-CE/Community-plugins), record a versioned snapshot of each plugin's source whenever it changes, and display the full history with a diff viewer on a GitHub Pages site — updated automatically every night via GitHub Actions.

---

## 1. Tech Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Fetch pipeline | Node.js 20 ESM | Same runtime as upstream; native `fetch`; `lib-iitc-manager` available for parsing userscript headers |
| Static site | Vite + vanilla JS | Pure data-display, no state management needed; fast builds, tree-shaking |
| Diff UI | `diff2html` + `jsdiff` | Mature library, side-by-side / inline modes, syntax highlighting, client-side only |
| Storage | Plain files in-repo | No external DB; git delta-compresses similar JS files efficiently |
| CI / deploy | GitHub Actions + Pages | Free for public repos; artifact-based Pages deployment keeps `main` clean |

---

## 2. Directory Layout

```
iitc-community-plugins-observer/
├── .github/
│   └── workflows/
│       └── nightly.yml          # fetch → snapshot → build → deploy
├── scripts/
│   ├── fetch.js                 # main pipeline: fetch all plugins, write snapshots, rebuild manifest
│   ├── build-site.js            # copy data/ → site/public/data/, run vite build
│   ├── lib/
│   │   ├── snapshot.js          # read/write versions.json & .user.js files
│   │   └── community-plugins.js # fetch & parse upstream dist/meta.json
│   └── package.json
├── site/
│   ├── index.html               # plugin list page
│   ├── plugin.html              # single-plugin version timeline page
│   ├── diff.html                # diff viewer page
│   ├── js/
│   │   ├── main.js              # plugin list logic
│   │   ├── plugin.js            # version history logic
│   │   └── diff-viewer.js       # jsdiff + diff2html wiring
│   ├── css/
│   │   └── style.css
│   └── vite.config.js
├── data/
│   ├── manifest.json            # generated on every run — full plugin index
│   └── plugins/
│       └── {id_hash}/           # e.g. barcodes-by-3ch01c
│           ├── versions.json    # append-only version history
│           └── YYYY-MM-DD.user.js  # raw source snapshot (written only on version change)
├── dist/                        # Vite build output → deployed to GH Pages (not committed)
├── .gitignore
├── README.md
└── package.json                 # workspace root
```

---

## 3. Data Model

### Plugin identity key

```
id_hash = pluginId.replace("@", "-by-")
# e.g. "barcodes@3ch01c" → "barcodes-by-3ch01c"
```

Used as directory name under `data/plugins/` and as the URL slug in the static site.

### `data/plugins/{id_hash}/versions.json`

```json
{
  "id": "barcodes@3ch01c",
  "id_hash": "barcodes-by-3ch01c",
  "author": "3ch01c",
  "name": "Replace player names with more easily remembered names",
  "category": "Portal Info",
  "description": "...",
  "downloadURL": "https://raw.githubusercontent.com/IITC-CE/Community-plugins/master/dist/3ch01c/barcodes.user.js",
  "versions": [
    {
      "version": "0.1.0.20170103",
      "date": "2026-04-12",
      "snapshotFile": "2026-04-12.user.js",
      "sha256": "abc123...",
      "fetchedAt": "2026-04-12T00:03:14Z"
    }
  ]
}
```

`versions` is an **append-only** array, newest last. A new entry is written only when the `@version` field in the fetched source differs from the last recorded version. `sha256` catches content changes even when the version string is stale.

### `data/manifest.json`

Regenerated on every run from all `versions.json` files:

```json
{
  "generatedAt": "2026-04-12T00:05:00Z",
  "upstreamCommit": "abc123",
  "pluginCount": 126,
  "plugins": [
    {
      "id": "barcodes@3ch01c",
      "id_hash": "barcodes-by-3ch01c",
      "author": "3ch01c",
      "name": "Replace player names...",
      "category": "Portal Info",
      "description": "...",
      "latestVersion": "0.1.0.20170103",
      "latestDate": "2026-04-12",
      "snapshotCount": 1,
      "firstSeen": "2026-04-12",
      "status": "active"
    }
  ]
}
```

`status` is `"active"` or `"removed"` — set to `"removed"` when a plugin disappears from upstream but history is preserved.

---

## 4. Implementation Phases

### Phase 1 — Repository Bootstrap

1. `git init`, add `.gitignore` (ignoring `node_modules/`, `dist/`).
2. Create `scripts/package.json` with `"type": "module"` and dependencies:
   - `lib-iitc-manager` (upstream header parsing via `parseMeta`)
   - `diff` (jsdiff, for optional server-side diff pre-generation)
3. Create `site/package.json` with `vite`, `diff2html`, `diff`.
4. Create root `package.json` as workspace root (`"workspaces": ["scripts", "site"]`).
5. Create `data/plugins/.gitkeep` and a stub `data/manifest.json`.

### Phase 2 — Fetch Script (`scripts/fetch.js`)

Logic:

1. Fetch `https://raw.githubusercontent.com/IITC-CE/Community-plugins/master/dist/meta.json`.
2. Parse the JSON — full plugin list with metadata including `downloadURL`.
3. Record the upstream commit SHA via GitHub API (`GET /repos/IITC-CE/Community-plugins/commits/master`).
4. For each plugin in parallel (concurrency pool of 10, 5s timeout, 3 retries):
   - Load existing `versions.json` if present.
   - Fetch plugin source from `downloadURL`.
   - Parse `@version` field using `parseMeta` from `lib-iitc-manager`.
   - Compute SHA-256 of fetched content.
   - Compare version string and SHA-256 against last entry in `versions.json`.
   - If changed (or first run): write `YYYY-MM-DD.user.js`, append to `versions`, save `versions.json`.
5. After all plugins: rebuild `data/manifest.json` from all `versions.json` files.
6. Handle removed plugins: any `id_hash` in `data/plugins/` not present in new upstream list gets `status: "removed"`.

**The script must be idempotent** — running twice with the same upstream state produces zero file changes.

### Phase 3 — Site Generation (`scripts/build-site.js`)

1. Copy `data/manifest.json` → `site/public/data/manifest.json`.
2. Copy each `data/plugins/{id_hash}/versions.json` → `site/public/data/plugins/{id_hash}/versions.json`.
3. Copy source snapshots (`.user.js`) → `site/public/data/plugins/{id_hash}/` for client-side fetch.
4. Run `vite build` inside `site/`.

### Phase 4 — Static Site Pages

**Plugin List (`/`)**
- Fetches `/data/manifest.json` on load.
- Searchable, filterable table: Name, Author, Category, Latest Version, Last Updated, Snapshot Count.
- Each row links to the Plugin Detail page.

**Plugin Detail (`/plugin/{id_hash}`)**
- Fetches `/data/plugins/{id_hash}/versions.json`.
- Plugin metadata at top.
- All versions in a timeline with dates.
- Each version row: "View source" link + checkbox for diff selection.
- "Compare selected" button → navigates to diff viewer.

**Diff Viewer (`/diff/{id_hash}/{dateA}/{dateB}`)**
- Fetches both `.user.js` files from `/data/plugins/{id_hash}/{date}.user.js`.
- Computes unified diff client-side using `jsdiff`'s `createTwoFilesPatch`.
- Renders with `diff2html` in side-by-side mode (toggle to inline).
- Header shows: version A → version B, dates, file sizes.
- Permalink button copies current URL.

### Phase 5 — GitHub Actions Workflow (`.github/workflows/nightly.yml`)

```yaml
name: Nightly Plugin Fetch

on:
  schedule:
    - cron: '0 1 * * *'   # 1 AM UTC — upstream runs at midnight, give it time
  workflow_dispatch:
    inputs:
      force_rebuild:
        description: 'Force site rebuild even if no changes'
        type: boolean
        default: false

permissions:
  contents: write
  pages: write
  id-token: write

jobs:
  fetch:
    runs-on: ubuntu-latest
    outputs:
      changed: ${{ steps.check.outputs.changed }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: scripts/package-lock.json

      - name: Install script dependencies
        run: npm ci
        working-directory: scripts

      - name: Fetch plugins and record snapshots
        run: node fetch.js
        working-directory: scripts
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Detect changes
        id: check
        run: |
          git add data/
          git diff --cached --quiet \
            && echo "changed=false" >> $GITHUB_OUTPUT \
            || echo "changed=true" >> $GITHUB_OUTPUT

      - name: Commit snapshots
        if: steps.check.outputs.changed == 'true'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git commit -m "chore: snapshot $(date -u +%Y-%m-%d)"
          git push

  build-and-deploy:
    needs: fetch
    if: needs.fetch.outputs.changed == 'true' || github.event.inputs.force_rebuild == 'true'
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: main   # re-checkout to include newly committed snapshots

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: site/package-lock.json

      - name: Install site dependencies
        run: npm ci
        working-directory: site

      - name: Copy data into site
        run: node scripts/build-site.js

      - name: Build static site
        run: npm run build
        working-directory: site

      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist/

      - id: deploy
        uses: actions/deploy-pages@v4
```

`build-and-deploy` is **skipped** on nights with no plugin changes — saves ~2 min CI time and an unnecessary Pages deployment.

### Phase 6 — Edge Cases & Polish

- Removed plugins: `status: "removed"` in manifest, banner on detail page.
- Fetch errors: log warning, skip plugin for this run (don't write partial snapshot).
- Rate limiting: concurrency pool of 10, exponential backoff on 429/5xx.
- Duplicate dates: if a plugin updates twice in one day, the snapshot file is overwritten and `sha256` in the versions entry is updated.
- Recent-changes feed: homepage section showing last 14 days of changes across all plugins.
- Navigation: "Previous change" / "Next change" buttons on the diff viewer.
- Syntax highlighting: via `diff2html`'s built-in Highlight.js integration.

---

## 5. Key Architectural Decisions

### Full source storage vs. storing diffs

**Full source.** At ~40 KB average and ~3 updates/day across 126 plugins, growth is ~120 KB/day of new files. After 3 years: ~130 MB. Git's delta compression keeps the actual pack much smaller since consecutive versions of a JS file are highly similar. Storing diffs would require replaying a chain to reconstruct any version, complicates the "View source" feature, and adds fragility.

### Upstream `dist/meta.json` as the only enumeration source

The upstream IITC-CE repo already parses YAML metadata, fetches external URLs, and normalises headers into `dist/meta.json`. We piggyback on that instead of re-implementing the crawl. This also means we get plugin changes only after upstream detects them — which is acceptable (1-day lag at most).

### Scheduled at 1 AM UTC

The upstream Community-plugins nightly job runs at midnight UTC. Scheduling ours at 1 AM gives it time to finish and commit before we fetch `dist/meta.json`.

### Removed / renamed plugins

Renames are treated as a removal + addition (two separate `id_hash` entries). The `id_hash` is derived from the upstream `id` field, which is stable within the upstream repo's own conventions.

### Single repo for data + site

Keeps site and data in sync (the site is always built from the data it can see), avoids cross-repo triggers, and makes the version history visible in the same git log as the code.

### No Pages branch commit

Uses `actions/upload-pages-artifact` + `actions/deploy-pages` — the modern GitHub Pages approach. The `dist/` directory is never committed to any branch, keeping the repo history clean.

---

## 6. Implementation Sequence

| Step | Deliverable |
|------|-------------|
| 1 | Repo bootstrap: `git init`, `.gitignore`, workspace `package.json` files |
| 2 | `scripts/lib/community-plugins.js` — fetch & parse upstream `dist/meta.json` |
| 3 | `scripts/lib/snapshot.js` — read/write `versions.json` and `.user.js` files |
| 4 | `scripts/fetch.js` — full pipeline: enumerate → fetch → diff → snapshot → manifest |
| 5 | Verify fetch script locally, inspect `data/` output |
| 6 | `site/` scaffold: Vite config, plugin list page |
| 7 | Plugin detail page with version timeline |
| 8 | Diff viewer: `jsdiff` + `diff2html`, side-by-side / inline toggle |
| 9 | `scripts/build-site.js` — copy `data/` into `site/public/`, run `vite build` |
| 10 | `.github/workflows/nightly.yml` — fetch job + conditional build-and-deploy job |
| 11 | First live run, verify Pages deployment, inspect output URL |
| 12 | Edge case handling: errors, removed plugins, rate limits, recent-changes feed |

---

## 7. Critical Files

| File | Purpose |
|------|---------|
| `scripts/fetch.js` | Pipeline core: upstream polling, version comparison, snapshot writing, manifest generation |
| `scripts/lib/snapshot.js` | All filesystem I/O for `versions.json` and `.user.js`; keeps fetch logic clean |
| `scripts/lib/community-plugins.js` | Upstream meta.json fetch + commit SHA lookup |
| `site/js/diff-viewer.js` | Client-side diff: fetch two snapshots by URL, `jsdiff` → `diff2html`, toggle modes |
| `.github/workflows/nightly.yml` | Scheduling, commit authorship, conditional deploy, `GITHUB_TOKEN` scope |
| `scripts/build-site.js` | Bridge: copies `data/` into `site/public/data/`, triggers Vite build |

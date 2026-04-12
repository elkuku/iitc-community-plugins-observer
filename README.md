# IITC Community Plugins Observer

Tracks every plugin in [IITC-CE/Community-plugins](https://github.com/IITC-CE/Community-plugins), stores a versioned snapshot whenever a plugin changes, and displays the full history with a diff viewer on GitHub Pages.

## How it works

1. A **nightly GitHub Action** (1 AM UTC) fetches `dist/meta.json` from the upstream repo.
2. For each of the 126+ plugins it downloads the source, compares the `@version` field and SHA-256 against the last stored snapshot.
3. If anything changed, a new snapshot (`YYYY-MM-DD.user.js`) is written to `data/plugins/{id}/` and committed.
4. The **static site** is rebuilt with Vite and deployed to GitHub Pages.

## Pages

| Page | Description |
|------|-------------|
| `/` | Searchable, filterable list of all plugins with latest version and last-updated date |
| `/plugin.html?id={id}` | Full version timeline for a single plugin; select any two versions to compare |
| `/diff.html?id={id}&a=YYYY-MM-DD&b=YYYY-MM-DD` | Side-by-side or inline diff between two snapshots, powered by `diff2html` |

## Local development

```bash
# Install dependencies
cd scripts && npm install && cd ..
cd site && npm install && cd ..

# Fetch all plugin snapshots (writes to data/)
cd scripts && node fetch.js

# Build the site (copies data/ into site/public/, runs vite build)
node scripts/build-site.js

# Dev server with hot reload
cd site && npm run dev
```

## Project structure

```
data/
  manifest.json               # generated index of all plugins
  plugins/{id}/
    versions.json             # append-only version history
    YYYY-MM-DD.user.js        # raw source snapshots
scripts/
  fetch.js                    # main pipeline
  build-site.js               # data copy + vite build
  lib/
    community-plugins.js      # upstream meta.json fetching
    snapshot.js               # file I/O helpers
site/
  index.html / plugin.html / diff.html
  js/  main.js  plugin.js  diff-viewer.js
  css/ style.css
.github/workflows/nightly.yml # scheduled CI
```

See [PLAN.md](PLAN.md) for the full architecture and design decisions.

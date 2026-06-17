# Ellucian user-documentation repo

This repository mirrors Ellucian **user documentation** (Banner Student +
Ellucian Degree Works, SaaS) as consolidated HTML with locally-downloaded images.

- `docs/` — the HTML docs, organized `<Product>/<Book>/<file>.html` with a
  per-book `images/` subfolder, plus a generated `index.html`.
- `_docs-tooling/` — everything needed to refresh `docs/` automatically.

## If asked to update / re-sync the documentation

Follow the runbook in **[`_docs-tooling/CLAUDE.md`](./_docs-tooling/CLAUDE.md)**
exactly. In short: connect Claude in Chrome, confirm the user is logged in to
`https://resources.elluciancloud.com`, load `_docs-tooling/docs-sync-pipeline.js`,
configure from `_docs-tooling/filters.config.json`, enumerate books, build the
output groups, have the user grant write access to the `docs/` folder, download
in batches, then write index.html + report and verify on disk.

What gets synced is controlled by `_docs-tooling/filters.config.json`.

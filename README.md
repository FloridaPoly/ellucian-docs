# Ellucian Documentation

Version-controlled HTML mirror of Ellucian **user documentation** for the
SaaS releases of **Banner Student** and **Ellucian Degree Works**, with images
downloaded locally so each page renders offline.

> Looking for the OpenAPI specs instead? Those live in the separate
> `ellucian-api-specs` repo. This repo is user/end-user documentation only.

## Contents

- **`docs/`** — the documentation as consolidated HTML, organized
  `docs/<Product>/<Book>/<file>.html` with images in a per-book `images/`
  subfolder, plus a generated `index.html`.
- **`_docs-tooling/`** — documentation and the automated sync tooling. See
  [`_docs-tooling/README.md`](./_docs-tooling/README.md).

## Updating

This repo is designed to be refreshed with **Claude Cowork**. Point Cowork at
this repository, connect the **Claude in Chrome** extension, log in to
`https://resources.elluciancloud.com`, and ask:

> Update the Ellucian docs.

Claude follows the runbook in [`_docs-tooling/CLAUDE.md`](./_docs-tooling/CLAUDE.md),
consolidates topics into HTML pages with local images, and writes them into
`docs/`. You click one on-page button to grant write access. Which products/books are included is
controlled by [`_docs-tooling/filters.config.json`](./_docs-tooling/filters.config.json).

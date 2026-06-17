# Ellucian docs sync tooling

This folder contains everything needed to refresh the HTML user documentation in
[`../docs/`](../docs) with **Claude Cowork**.

## How to update the docs (short version)

1. Open **Claude Cowork** and point it at this repository.
2. Connect the **Claude in Chrome** extension and log in to
   `https://resources.elluciancloud.com`.
3. Ask: **"Update the Ellucian docs."**

Claude reads [`CLAUDE.md`](./CLAUDE.md) and does the rest: it lists every book
for the configured products, groups topics into consolidated HTML pages,
downloads their images, and writes them into `docs/`. You click one on-page
button to grant the browser write access to the `docs` folder.

When it finishes you'll have refreshed HTML plus a generated `index.html` and a
`_sync-report.json`. Commit and push as usual.

## How it works

The portal is a Fluid Topics site. Using your existing login, the tooling calls:

- `clustered-search` with `ft:isBook=true` &rarr; the books per product
- `/maps/{id}/toc` &rarr; each book's ordered topic tree
- `/maps/{id}/topics/{id}/content` &rarr; each topic's HTML

Topics are concatenated into one HTML file per book (large books split into one
file per top-level chapter), each with an in-page table of contents. Every image
— including base64 `data:` URIs — is downloaded into an `images/` subfolder and
the `<img>` tags are rewritten to relative paths, so each page renders correctly
in a browser and is easy for tools to read. Files are written straight to disk
from the browser via the File System Access API, so content never bottlenecks
through the agent. No server, no API key; auth is just your portal login.

## Files

| File | Purpose |
| --- | --- |
| `CLAUDE.md` | Step-by-step runbook Claude Cowork follows. |
| `docs-sync-pipeline.js` | Browser engine (`window.ellucianDocsSync`) that enumerates, groups, downloads images, and writes HTML. Pasted into the page by the agent. |
| `filters.config.json` | **Edit this** to control products / locale / split size. Defaults to Banner Student + Ellucian Degree Works, English. |

## Output layout

```
docs/
  index.html                         (generated navigation)
  Banner Student/
    AMEP Banner Student - Use/
      amep-banner-student-use.html
      images/
        amep-banner-student-use-1.png
    ARTS Banner Student - Reference/   (large book -> split by chapter)
      01-overview.html
      02-setup.html
      images/
  Ellucian Degree Works/
    Degree Works - Use/
      degree-works-use.html
      images/
```

Each HTML file starts with a breadcrumb, the source URL, and an in-page table of
contents, followed by every topic in order.

## Requirements

- Claude Cowork with the **Claude in Chrome** extension.
- An Ellucian portal account that can view the documentation.
- A Chromium-based browser (File System Access API).

## Notes

- Re-running is an idempotent refresh — files are overwritten.
- Topics/books removed upstream are not auto-deleted; ask Claude to prune for an
  exact mirror.
- Folder-write permission is per browser session.
- No credentials are stored anywhere in this tooling.

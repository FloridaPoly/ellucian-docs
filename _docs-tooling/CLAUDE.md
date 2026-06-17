# Runbook: sync Ellucian user documentation to HTML

This repo mirrors Ellucian (Banner Student + Degree Works, SaaS) **user
documentation** as self-contained HTML under `docs/`. This file is the operating
manual for **Claude Cowork** to refresh it. If a user says something like
*"update the Banner docs"* or *"re-sync the documentation"*, follow these steps.

## What this does

The portal (`resources.elluciancloud.com`) is a Fluid Topics site. User docs are
**books** (e.g. "Degree Works - Use") whose tables of contents hold **topics**
(HTML pages). This tooling lists every book for the configured products, groups
its topics into substantial HTML files (one file per book; books over
`splitThreshold` topics are split into one file per top-level chapter),
concatenates each group's topic HTML into one readable page with an in-page
table of contents, downloads every image (including base64 data URIs) into an
`images/` subfolder beside the HTML, rewrites `<img>` to relative paths, and
writes it all to disk via the File System Access API:

```
docs/<Product>/<Book>/<file>.html
docs/<Product>/<Book>/images/<file>-N.ext
docs/index.html            (generated navigation)
docs/_sync-report.json
```

Everything runs in **Claude in Chrome** using the user's existing login. No
server, no API key, nothing installed.

## Prerequisites

- **Claude in Chrome** connected; user **logged in** to the portal.
- A local target folder — normally the `docs/` subfolder of this repo.

## Step-by-step

> "run JS" = a `javascript_tool` call on the portal tab. Wrap awaited calls:
> `(async()=>JSON.stringify(await window.ellucianDocsSync.buildGroups()))()`

1. **Pick the browser** and **open** `https://resources.elluciancloud.com`.
   Screenshot to confirm login (ask the user to log in if needed).

2. **Load the pipeline.** Read `_docs-tooling/docs-sync-pipeline.js` and paste
   its entire contents as one `javascript_tool` call. Returns
   `"ellucianDocsSync ready (HTML mode)"`.

3. **Configure.** Read `_docs-tooling/filters.config.json` and run:
   `JSON.stringify(window.ellucianDocsSync.configure( <paste parsed JSON> ))`

4. **Auth.** `(async()=>JSON.stringify(await window.ellucianDocsSync.checkAuth()))()`
   — must be `loggedIn:true`.

5. **Enumerate books.**
   `(async()=>JSON.stringify(await window.ellucianDocsSync.enumerateBooks()))()`
   If a product reports 0 books, its `prodname_custom` needs a parent prefix
   (e.g. `Banner|Banner Student`) — fix `products` in the config and redo.

6. **Build groups (output files), resumably.** Repeatedly run:
   `(async()=>JSON.stringify(await window.ellucianDocsSync.buildGroupsChunk(20)))()`
   until `done:true`. (Each call reads ~20 books' TOCs — kept small so it never
   approaches the tool timeout or hammers the portal.) Report final `groups`
   (number of HTML files) and `totalTopics`.

7. **Grant the folder.**
   `JSON.stringify(window.ellucianDocsSync.grantFolderButton("docs folder of the repo"))`
   Tell the user to click the purple bar and select the repo's `docs` folder and
   allow write access. Verify with `folderStatus()` (permission `"granted"`).

8. **Download in batches.** Repeatedly run:
   `(async()=>JSON.stringify(await window.ellucianDocsSync.run(10)))()`
   until `processedGroupsUpTo === totalGroups`. `run` auto-stops ~35s in, so the
   number is just an upper bound; if a call drops, call it again — it resumes
   from `gidx`. Watch `imagesWritten` climb. Keep the number modest (≈10) so
   each call stays well under the tool timeout and the portal isn't hammered.
   This is a large corpus (Banner Student alone is ~12k topics); consider doing
   it product-by-product or across multiple sessions.

9. **Retry failures** if `errors > 0`:
   `(async()=>JSON.stringify(await window.ellucianDocsSync.retryErrors()))()`

10. **Navigation + report.**
    `(async()=>JSON.stringify(await window.ellucianDocsSync.writeIndexes()))()`
    then `(async()=>JSON.stringify(await window.ellucianDocsSync.writeReport()))()`

11. **Clean up.** `JSON.stringify(window.ellucianDocsSync.removeButton())`

12. **Verify on disk.** Count `docs/**/*.html`, open one in a browser (or check
    it has an in-page TOC + `<img src="images/...">` that resolve), confirm
    `images/` folders contain real binary files, and that no HTML file is a full
    portal page (auth/error leak).

## Changing scope

Edit `filters.config.json`: `products` (exact `prodname_custom` facet values —
remember the hierarchical `Parent|Child` form), `locale`, and `splitThreshold`
(topics-per-book before splitting into chapter files).

## Rate limiting (important)

The portal tar-pits (hangs) sessions that request too much too fast. The
pipeline defends itself: every request has an AbortController timeout
(`reqTimeoutMs`, default 20s) so a hung request fails fast instead of freezing
the tab, concurrency is low (default 3), and a small `throttleMs` delay sits
between requests. If `checkAuth` returns `loggedIn:false` with a hang note, or
calls start timing out, **stop and wait** (30–60+ min) before resuming — do not
keep retrying, which prolongs the block. Resume by re-loading the pipeline,
re-configuring, and continuing; enumerate/buildGroupsChunk/run all resume from
where they left off within the session (re-grant the folder after any reload).

## Notes & guardrails

- Uses the user's existing session cookies only — never request, store, or type
  a password or token; the user logs in in the browser.
- Re-running overwrites files in place (idempotent). Topics/books removed
  upstream are not auto-deleted; ask before pruning for an exact mirror.
- Images are downloaded and referenced relatively so pages render offline in a
  browser; data-URI images are decoded to real files too.
- Folder-write permission is per browser session — the user re-grants each sync.

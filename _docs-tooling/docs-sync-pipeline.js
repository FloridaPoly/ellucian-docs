/* =============================================================================
 * Ellucian user-documentation -> consolidated HTML sync pipeline
 * -----------------------------------------------------------------------------
 * Runs inside the user's authenticated browser session on the Ellucian docs
 * portal (default: https://resources.elluciancloud.com). Using the Fluid Topics
 * API it:
 *   1. lists every documentation "book" for the configured products + locale,
 *   2. reads each book's table of contents (ordered topic tree),
 *   3. GROUPS topics into substantial HTML documents (one file per book; books
 *      larger than `splitThreshold` topics are split into one file per
 *      top-level chapter),
 *   4. concatenates each group's topic HTML into a single readable page with an
 *      in-page table of contents,
 *   5. downloads every image (including base64 data: URIs) into an `images/`
 *      subfolder next to the HTML and rewrites <img src> to a relative path,
 *   6. writes everything to disk via the File System Access API as
 *        <Product>/<Book>/<file>.html  +  <Product>/<Book>/images/*
 *
 * Paste this whole file as the `text` of one Claude-in-Chrome javascript_tool
 * call. It defines `window.ellucianDocsSync` and nothing else. The agent drives
 * it step by step (see _docs-tooling/CLAUDE.md).
 *
 * RATE LIMITS: the portal will tar-pit (hang) a session that sends too many
 * requests too fast. This pipeline defends against that two ways: (a) every
 * request has an AbortController timeout (`reqTimeoutMs`) so a hung request
 * fails fast instead of freezing the tab, and (b) concurrency is deliberately
 * low and a small `throttleMs` delay sits between requests. If you still get
 * timeouts/hangs, stop, wait, and resume with even lower concurrency.
 *
 * No secrets stored; all requests reuse the browser's logged-in session cookies.
 * ========================================================================== */
(() => {
  const S = (window.ellucianDocsSync = window.ellucianDocsSync || {});
  const IMG_DIR = "images";
  const CSS = "body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.55;color:#1a1a1a;max-width:920px;margin:0 auto;padding:24px}" +
    "header{border-bottom:2px solid #5a16d6;margin-bottom:8px}h1{color:#3a0ca3}h2,h3,h4,h5,h6{margin-top:1.6em}" +
    ".crumb{color:#666;font-size:13px;margin:0}.meta{color:#888;font-size:12px}" +
    "nav.toc{background:#f6f4fc;border:1px solid #e3dcf5;border-radius:8px;padding:12px 18px;margin:18px 0}nav.toc h2{margin:.2em 0}nav.toc ul{list-style:none;padding-left:0}nav.toc a{text-decoration:none;color:#5a16d6}" +
    "section{margin:1.2em 0;padding-top:.4em}img{max-width:100%;height:auto}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}code,pre{background:#f4f4f4;border-radius:4px}pre{padding:10px;overflow:auto}";

  S.cfg = S.cfg || null;
  S.books = S.books || [];
  S.groups = S.groups || [];      // each group = one output HTML file
  S.gidx = S.gidx || 0;
  S.gdone = S.gdone || 0;
  S.tocIdx = S.tocIdx || 0;       // resume pointer for buildGroups
  S.groupsAcc = S.groupsAcc || [];
  S.topicsWritten = S.topicsWritten || 0;
  S.imagesWritten = S.imagesWritten || 0;
  S.errors = S.errors || [];
  S.dir = S.dir || null;

  const base = () => (S.cfg && S.cfg.baseUrl) || location.origin;
  const conc = () => (S.cfg && S.cfg.concurrency) || 3;
  const reqTimeout = () => (S.cfg && S.cfg.reqTimeoutMs) || 20000;
  const throttle = () => (S.cfg && S.cfg.throttleMs) || 0;
  const sane = (s) => String(s || "").replace(/[\\/:*?"<>|\r\n]/g, "_").replace(/\s+/g, " ").trim();
  const slug = (s) => String(s || "untitled").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "untitled";
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // fetch with a hard timeout so a tar-pitted request can never freeze the tab
  async function tfetch(url, opts) {
    const c = new AbortController(); const id = setTimeout(() => c.abort(), reqTimeout());
    try { return await fetch(url, Object.assign({ signal: c.signal, credentials: "include" }, opts)); }
    finally { clearTimeout(id); }
  }
  async function fetchRetry(url, opts, tries) {
    let last = 0;
    for (let i = 0; i < tries; i++) {
      try { const r = await tfetch(url, opts); if (r.status === 200) return r; last = r.status; } catch (e) { last = "abort/net:" + e; }
      await sleep(600 * (i + 1));
    }
    const e = new Error("fetch failed (last=" + last + ") " + url); e.last = last; throw e;
  }
  async function fetchBlobRetry(url, tries) {
    for (let i = 0; i < tries; i++) { try { const r = await tfetch(url, {}); if (r.status === 200) return await r.blob(); } catch (e) {} await sleep(400 * (i + 1)); }
    return null;
  }
  async function pool(items, c, fn) {
    let p = 0; const out = new Array(items.length);
    await Promise.all(Array.from({ length: c }, async () => { while (p < items.length) { const i = p++; out[i] = await fn(items[i], i); if (throttle()) await sleep(throttle()); } }));
    return out;
  }

  S.configure = (cfg) => {
    S.cfg = cfg; S.books = []; S.groups = []; S.groupsAcc = []; S.tocIdx = 0; S.gidx = 0; S.gdone = 0; S.topicsWritten = 0; S.imagesWritten = 0; S.errors = [];
    return { ok: true, baseUrl: base(), products: cfg.products, locale: cfg.locale, splitThreshold: cfg.splitThreshold || 40, concurrency: conc(), reqTimeoutMs: reqTimeout() };
  };
  S.checkAuth = async () => {
    try { const r = await tfetch(base() + "/api/khub/clustered-search", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ query: "", locale: (S.cfg && S.cfg.locale) || "en-US", paging: { page: 1, perPage: 1 }, filters: [] }) }); return { status: r.status, loggedIn: r.status === 200 }; }
    catch (e) { return { status: "hang/abort", loggedIn: false, note: "request timed out — portal may be throttling; wait and retry", err: String(e) }; }
  };

  S.enumerateBooks = async () => {
    if (!S.cfg) throw new Error("configure first");
    const loc = (S.cfg.filters && S.cfg.filters.localeValue) || "English";
    const perPage = S.cfg.perPage || 100; const out = [];
    for (const product of S.cfg.products) {
      let page = 1, last = false, guard = 0;
      while (!last && guard < 100) {
        guard++;
        const body = { query: "", locale: S.cfg.locale || "en-US", paging: { page, perPage }, filters: [{ key: "locale_custom", values: [loc] }, { key: "prodname_custom", values: [product] }, { key: "ft:isBook", values: ["true"] }] };
        const r = await fetchRetry(base() + "/api/khub/clustered-search", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) }, 4);
        const j = await r.json();
        (j.results || []).forEach((c) => (c.entries || []).forEach((e) => { const t = e.map || e.topic; if (t && t.mapId) out.push({ product: product.includes("|") ? product.split("|").pop().trim() : product, mapId: t.mapId, title: t.mapTitle || t.title }); }));
        last = j.paging ? j.paging.isLastPage : true; page++;
        if (throttle()) await sleep(throttle());
      }
    }
    const seen = {}; S.books = out.filter((b) => (seen[b.mapId] ? false : (seen[b.mapId] = true)));
    return { books: S.books.length, byProduct: [...new Set(S.books.map((b) => b.product))].map((p) => ({ product: p, books: S.books.filter((b) => b.product === p).length })) };
  };

  // Resumable: fetches TOCs for up to `maxBooks` more books per call, building
  // groups incrementally. Call repeatedly until `done` is true. Keeps each call
  // short so it never approaches the tool timeout and never hammers the portal.
  S.buildGroupsChunk = async (maxBooks) => {
    if (!S.books.length) throw new Error("enumerateBooks first");
    const TH = S.cfg.splitThreshold || 40;
    const deriveSource = (topics, b) => { const pu = (topics.find((t) => t.prettyUrl) || {}).prettyUrl; return pu ? base() + pu.split("/page/")[0] : base() + "/r/bundle/" + b.mapId; };
    const mk = (b, docTitle, fileSlug, topics) => ({ product: b.product, book: b.title, bookFolder: sane(b.title), docTitle, fileSlug, topics, sourceUrl: deriveSource(topics, b) });
    const start = S.tocIdx, end = Math.min(start + (maxBooks || 20), S.books.length);
    const slice = S.books.slice(start, end);
    const tocs = await pool(slice, Math.min(conc(), 4), async (b) => {
      try { return { b, toc: await (await fetchRetry(base() + "/api/khub/maps/" + b.mapId + "/toc", { headers: { Accept: "application/json" } }, 3)).json() }; }
      catch (e) { S.errors.push({ book: b.title, err: "toc failed: " + e }); return { b, toc: null }; }
    });
    for (const o of tocs) {
      const b = o.b, toc = o.toc; if (!toc) continue;
      let order = 0, chapIdx = -1; const flat = [], chapTitles = [];
      (function walk(nodes, depth) { (nodes || []).forEach((n) => { if (depth === 0) { chapIdx++; chapTitles[chapIdx] = n.title; } if (n.contentId) { order += 10; flat.push({ mapId: b.mapId, contentId: n.contentId, title: n.title, prettyUrl: n.prettyUrl, depth, order, chap: chapIdx }); } if (n.children && n.children.length) walk(n.children, depth + 1); }); })(toc, 0);
      if (!flat.length) continue;
      if (flat.length <= TH) { S.groupsAcc.push(mk(b, b.title, slug(b.title), flat)); }
      else { const byChap = {}; flat.forEach((t) => { (byChap[t.chap] = byChap[t.chap] || []).push(t); }); Object.keys(byChap).map(Number).sort((a, c) => a - c).forEach((ci, idx) => { const topics = byChap[ci]; const ctitle = chapTitles[ci] || ("Section " + (idx + 1)); S.groupsAcc.push(mk(b, b.title + " — " + ctitle, String(idx + 1).padStart(2, "0") + "-" + slug(ctitle), topics)); }); }
    }
    S.tocIdx = end;
    const done = end >= S.books.length;
    if (done) { S.groups = S.groupsAcc; S.gidx = 0; S.gdone = 0; S.topicsWritten = 0; S.imagesWritten = 0; }
    return { tocProcessedUpTo: end, totalBooks: S.books.length, groupsSoFar: S.groupsAcc.length, totalTopics: S.groupsAcc.reduce((a, g) => a + g.topics.length, 0), done };
  };

  S.grantFolderButton = (hint) => {
    const old = document.getElementById("__esd_grant"); if (old) old.remove();
    const b = document.createElement("button"); b.id = "__esd_grant";
    b.textContent = "Click here, then choose your target folder" + (hint ? " (" + hint + ")" : "");
    b.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:2147483647;height:64px;font-size:20px;font-weight:bold;background:#5a16d6;color:#fff;border:none;cursor:pointer;width:100%";
    S.dirReady = false; S.dirErr = null;
    b.onclick = async () => { try { b.textContent = "Opening folder picker..."; const h = await window.showDirectoryPicker({ mode: "readwrite" }); S.dir = h; S.dirReady = true; b.textContent = "Folder selected: " + h.name + ". The agent will take over."; b.style.background = "#177245"; } catch (e) { S.dirErr = String(e); b.textContent = "Error: " + e + " - click to retry"; b.style.background = "#b00020"; } };
    document.body.appendChild(b); return { injected: true };
  };
  S.folderStatus = async () => ({ dirName: S.dir && S.dir.name, permission: S.dir && S.dir.queryPermission ? await S.dir.queryPermission({ mode: "readwrite" }) : "no-dir", ready: !!S.dirReady, error: S.dirErr || null });
  S.removeButton = () => { const b = document.getElementById("__esd_grant"); if (b) b.remove(); return { removed: true }; };

  async function dirFor(parts) { let d = S.dir; for (const p of parts) d = await d.getDirectoryHandle(sane(p), { create: true }); return d; }

  S._processGroup = async (g) => {
    try {
      const parts = await pool(g.topics, conc(), async (t) => {
        try { const r = await fetchRetry(base() + "/api/khub/maps/" + t.mapId + "/topics/" + t.contentId + "/content", {}, 4); const html = await r.text(); return { t, html: (html && html.trim() && !/^\s*<(!doctype|html)[\s>]/i.test(html)) ? html : "" }; }
        catch (e) { S.errors.push({ group: g.docTitle, title: t.title, contentId: t.contentId, err: String(e) }); return { t, html: "" }; }
      });
      const minDepth = Math.min.apply(null, g.topics.map((t) => t.depth));
      const doc = document.implementation.createHTMLDocument(g.docTitle);
      const sections = [], tocItems = [];
      parts.forEach((pp) => { if (!pp) return; const t = pp.t; const lvl = Math.max(2, Math.min(6, 2 + (t.depth - minDepth))); const sec = doc.createElement("section"); sec.id = "t-" + t.order; const h = doc.createElement("h" + lvl); h.textContent = t.title || "Untitled"; sec.appendChild(h); const wrap = doc.createElement("div"); wrap.innerHTML = pp.html || ""; while (wrap.firstChild) sec.appendChild(wrap.firstChild); sections.push(sec); tocItems.push({ order: t.order, title: t.title, depth: t.depth - minDepth }); });
      const dir = await dirFor([g.product, g.bookFolder]);
      let imgDir = null; const srcMap = {}; let n = 0;
      const imgs = []; sections.forEach((sec) => sec.querySelectorAll("img").forEach((im) => imgs.push(im)));
      for (const im of imgs) {
        let src = im.getAttribute("src"); if (!src) continue; im.removeAttribute("srcset");
        if (srcMap[src]) { im.setAttribute("src", srcMap[src]); continue; }
        const orig = src;
        try {
          let blob, ext;
          if (/^data:/i.test(src)) { const head = src.slice(0, src.indexOf(",")); const mime = (head.match(/^data:([^;]+)/) || [])[1] || "image/png"; const dataPart = src.slice(src.indexOf(",") + 1); const bytes = /;base64/i.test(head) ? Uint8Array.from(atob(dataPart), (c) => c.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(dataPart)); blob = new Blob([bytes], { type: mime }); ext = (mime.split("/")[1] || "png").replace("+xml", ""); }
          else { const abs = new URL(src, base() + "/").href; blob = await fetchBlobRetry(abs, 3); if (!blob) throw new Error("img fetch failed"); ext = ((blob.type || "").split("/")[1]) || (abs.split("?")[0].split(".").pop() || "png"); ext = ext.replace("+xml", ""); if (ext.length > 5) ext = "img"; }
          if (!imgDir) imgDir = await dir.getDirectoryHandle(IMG_DIR, { create: true });
          n++; const fname = g.fileSlug + "-" + n + "." + ext.toLowerCase();
          const fh = await imgDir.getFileHandle(fname, { create: true }); const w = await fh.createWritable(); await w.write(blob); await w.close();
          const rel = IMG_DIR + "/" + fname; srcMap[orig] = rel; im.setAttribute("src", rel); S.imagesWritten++;
        } catch (e) { try { im.setAttribute("src", /^data:/i.test(orig) ? orig : new URL(orig, base() + "/").href); } catch (_) {} }
      }
      sections.forEach((sec) => sec.querySelectorAll("a[href]").forEach((a) => { const h = a.getAttribute("href"); if (h && !/^(https?:|#|mailto:|images\/)/i.test(h)) { try { a.setAttribute("href", new URL(h, base() + "/").href); } catch (_) {} } }));
      const toc = '<nav class="toc"><h2>Contents</h2><ul>' + tocItems.map((it) => '<li style="margin-left:' + (it.depth * 16) + 'px"><a href="#t-' + it.order + '">' + esc(it.title || "Untitled") + "</a></li>").join("") + "</ul></nav>";
      const body = sections.map((s) => s.outerHTML).join("\n");
      const full = "<!DOCTYPE html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>" + esc(g.docTitle) + "</title><style>" + CSS + "</style></head><body>" +
        '<header><p class="crumb">' + esc(g.product) + " &rsaquo; " + esc(g.book) + '</p><h1>' + esc(g.docTitle) + '</h1><p class="meta">Source: <a href="' + esc(g.sourceUrl) + '">' + esc(g.sourceUrl) + "</a> &middot; Retrieved " + new Date().toISOString().slice(0, 10) + "</p></header>" +
        toc + "<main>" + body + "</main></body></html>";
      const fh = await dir.getFileHandle(g.fileSlug + ".html", { create: true }); const w = await fh.createWritable(); await w.write(full); await w.close();
      S.topicsWritten += g.topics.length;
      return { ok: true };
    } catch (e) { S.errors.push({ group: g.docTitle, err: String(e) }); return { ok: false }; }
  };

  S.run = async (maxGroups) => {
    if (!S.dir) throw new Error("grantFolderButton first");
    if (!S.groups.length) throw new Error("buildGroups first");
    const start = S.gidx, t0 = Date.now(); let i = start;
    for (; i < S.groups.length && (i - start) < maxGroups; i++) { if (i > start && Date.now() - t0 > 35000) break; await S._processGroup(S.groups[i]); S.gdone++; }
    S.gidx = i;
    return { processedGroupsUpTo: i, totalGroups: S.groups.length, topicsWritten: S.topicsWritten, imagesWritten: S.imagesWritten, errors: S.errors.length };
  };

  S.retryErrors = async () => {
    const titles = [...new Set(S.errors.map((e) => e.group).filter(Boolean))];
    S.errors = S.errors.filter((e) => !titles.includes(e.group));
    let fixed = 0; for (const g of S.groups.filter((g) => titles.includes(g.docTitle))) { const r = await S._processGroup(g); if (r.ok) fixed++; }
    return { retriedGroups: titles.length, fixed, errors: S.errors.length };
  };

  S.writeIndexes = async () => {
    const byProd = {};
    S.groups.forEach((g) => { (byProd[g.product] = byProd[g.product] || {}); (byProd[g.product][g.book] = byProd[g.product][g.book] || []).push(g); });
    let html = "<!DOCTYPE html>\n<html lang=\"en\"><head><meta charset=\"utf-8\"><title>Ellucian Documentation</title><style>" + CSS + "</style></head><body><header><h1>Ellucian Documentation</h1><p class=\"meta\">Generated " + new Date().toISOString().slice(0, 10) + "</p></header><main>";
    Object.keys(byProd).sort().forEach((prod) => {
      html += "<h2>" + esc(prod) + "</h2><ul>";
      Object.keys(byProd[prod]).sort().forEach((book) => {
        const gs = byProd[prod][book];
        if (gs.length === 1) html += '<li><a href="' + esc(encodeURI(prod + "/" + sane(book) + "/" + gs[0].fileSlug + ".html")) + '">' + esc(book) + "</a></li>";
        else html += "<li>" + esc(book) + "<ul>" + gs.map((g) => '<li><a href="' + esc(encodeURI(prod + "/" + sane(book) + "/" + g.fileSlug + ".html")) + '">' + esc(g.docTitle.split("—").pop().trim()) + "</a></li>").join("") + "</ul></li>";
      });
      html += "</ul>";
    });
    html += "</main></body></html>";
    const fh = await S.dir.getFileHandle("index.html", { create: true }); const w = await fh.createWritable(); await w.write(html); await w.close();
    return { wrote: "index.html", products: Object.keys(byProd).length };
  };

  S.writeReport = async () => {
    const report = { syncedAt: new Date().toISOString(), baseUrl: base(), products: S.cfg.products, locale: S.cfg.locale, books: S.books.length, files: S.groups.length, topicsWritten: S.topicsWritten, imagesWritten: S.imagesWritten, errors: S.errors };
    const fh = await S.dir.getFileHandle("_sync-report.json", { create: true }); const w = await fh.createWritable(); await w.write(JSON.stringify(report, null, 2)); await w.close();
    return { wrote: "_sync-report.json", files: S.groups.length, topicsWritten: S.topicsWritten, imagesWritten: S.imagesWritten, errors: S.errors.length };
  };

  S.status = () => ({ configured: !!S.cfg, books: S.books.length, tocProcessed: S.tocIdx, groups: S.groups.length, groupsAcc: S.groupsAcc.length, gidx: S.gidx, topicsWritten: S.topicsWritten, imagesWritten: S.imagesWritten, errors: S.errors.length, dir: S.dir && S.dir.name });

  return "ellucianDocsSync ready (HTML mode, gentle)";
})();

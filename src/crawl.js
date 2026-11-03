(() => {
  const tree = document.getElementById("tree");
  const seeds = ["/", "/sitemap.html"];
  const skip = [];
  const KEY = "sitemap-v1";
  const TTL = 600000;

  const canon = (u) => u.pathname.replace(/index\.html$/, "");

  async function visit(path) {
    try {
      const r = await fetch(path);
      if (!r.ok || !(r.headers.get("content-type") || "").includes("text/html"))
        return null;
      const doc = new DOMParser().parseFromString(await r.text(), "text/html");
      const base = new URL(path, location.origin);
      const links = new Set();
      doc.querySelectorAll("a[href]").forEach((a) => {
        let u;
        try {
          u = new URL(a.getAttribute("href"), base);
        } catch {
          return;
        }
        if (u.origin !== location.origin) return;
        const p = canon(u);
        if (skip.includes(p)) return;
        if (p.endsWith("/") || p.endsWith(".html")) links.add(p);
      });
      const meta = doc.querySelector(
        'meta[name="description"], meta[property="og:description"]',
      );
      const ids = new Set();
      const sections = [];
      doc.querySelectorAll("main section[id]").forEach((s) => {
        if (ids.has(s.id)) return;
        ids.add(s.id);
        const h = s.querySelector("h2");
        if (h) sections.push({ id: s.id, title: h.textContent.trim() });
      });
      return {
        path,
        title: (doc.title || "").trim(),
        desc: meta ? meta.content.trim() : "",
        sections,
        links: [...links],
      };
    } catch {
      return null;
    }
  }

  async function crawl() {
    const seen = new Map();
    const queue = [];
    for (const s of seeds) {
      seen.set(s, null);
      queue.push(s);
    }
    while (queue.length) {
      const batch = queue.splice(0, 6);
      const results = await Promise.all(batch.map(visit));
      for (const r of results) {
        if (!r) continue;
        seen.set(r.path, r);
        for (const l of r.links) {
          if (seen.has(l)) continue;
          seen.set(l, null);
          queue.push(l);
        }
      }
    }
    return [...seen.values()].filter(Boolean);
  }

  function build(pages) {
    const root = { dirs: new Map(), files: [] };
    for (const p of pages) {
      const full = p.path.endsWith("/") ? p.path + "index.html" : p.path;
      const parts = full.split("/").filter(Boolean);
      const name = parts.pop();
      let n = root;
      for (const d of parts) {
        if (!n.dirs.has(d)) n.dirs.set(d, { dirs: new Map(), files: [] });
        n = n.dirs.get(d);
      }
      n.files.push({ name, page: p });
    }
    return root;
  }

  const cmp = (a, b) =>
    a.name === "index.html"
      ? -1
      : b.name === "index.html"
        ? 1
        : a.name.localeCompare(b.name);

  function fileLi(f) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = f.page.path;
    a.textContent = f.name;
    a.dataset.d = f.page.title + (f.page.desc ? ": " + f.page.desc : "");
    li.append(a);
    if (f.page.sections.length) {
      const ul = document.createElement("ul");
      for (const s of f.page.sections) {
        const sl = document.createElement("li");
        const sa = document.createElement("a");
        sa.href = f.page.path + "#" + s.id;
        sa.textContent = "#" + s.id;
        sa.dataset.d = s.title;
        sl.append(sa);
        ul.append(sl);
      }
      li.append(ul);
    }
    return li;
  }

  function render(n) {
    const frag = document.createDocumentFragment();
    for (const f of n.files.sort(cmp)) frag.append(fileLi(f));
    for (const [d, sub] of [...n.dirs].sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      const li = document.createElement("li");
      const det = document.createElement("details");
      det.open = true;
      const sm = document.createElement("summary");
      sm.textContent = d;
      sm.dataset.d = d + "/";
      const ul = document.createElement("ul");
      ul.append(render(sub));
      det.append(sm, ul);
      li.append(det);
      frag.append(li);
    }
    return frag;
  }

  async function run() {
    let pages = null;
    try {
      const c = JSON.parse(sessionStorage.getItem(KEY));
      if (c && Date.now() - c.t < TTL) pages = c.pages;
    } catch {}
    if (!pages) {
      pages = await crawl();
      if (pages.length) {
        try {
          sessionStorage.setItem(KEY, JSON.stringify({ t: Date.now(), pages }));
        } catch {}
      }
    }
    if (!pages.length) {
      tree.textContent = "crawl failed, serve the site over http";
      return;
    }
    tree.replaceChildren(render(build(pages)));
    dispatchEvent(new Event("tree-ready"));
  }

  run();
})();

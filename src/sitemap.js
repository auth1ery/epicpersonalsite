(() => {
  const tree = document.getElementById("tree");
  const q = document.getElementById("q");
  const st = document.getElementById("st");
  const seeds = [
    "/",
    "/sitemap.html",
    "/stuff/",
    "/src/onehundredquestions.html",
  ];
  const skip = [];
  const KEY = "sitemap-" + seeds.join(",");
  const TTL = 600000;
  const idle = "j/k move, h/l fold, / filter, esc clear";
  const failed = [];
  let lis = [];
  st.textContent = "crawling...";

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
      results.forEach((r, i) => {
        if (!r) failed.push(batch[i]);
      });
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
    const dirs = [...n.dirs].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [d, sub] of dirs) {
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

  const own = (li) =>
    li.querySelector(":scope > a, :scope > details > summary");

  const show = (el) => {
    const href = el.matches("a") ? el.getAttribute("href") + "  " : "";
    st.textContent = href + (el.dataset.d || "");
  };

  function filter() {
    const s = q.value.trim().toLowerCase();
    if (!s) {
      lis.forEach((li) => (li.hidden = false));
      st.textContent = idle;
      return;
    }
    lis.forEach((li) => (li.hidden = true));
    let n = 0;
    lis.forEach((li) => {
      const o = own(li);
      const text = (
        o.textContent +
        " " +
        (o.dataset.d || "") +
        " " +
        (o.getAttribute("href") || "")
      ).toLowerCase();
      if (!text.includes(s)) return;
      n++;
      li.hidden = false;
      li.querySelectorAll("li").forEach((c) => (c.hidden = false));
      const self = li.querySelector(":scope > details");
      if (self) self.open = true;
      let p = li.parentElement.closest("li");
      while (p) {
        p.hidden = false;
        const d = p.querySelector(":scope > details");
        if (d) d.open = true;
        p = p.parentElement.closest("li");
      }
    });
    st.textContent = n + (n === 1 ? " match" : " matches");
  }

  const nodes = () =>
    [...tree.querySelectorAll("summary, a")].filter(
      (el) => el.offsetParent !== null,
    );

  function move(d) {
    const list = nodes();
    if (!list.length) return;
    const i = list.indexOf(document.activeElement);
    list[Math.min(Math.max(i + d, 0), list.length - 1)].focus();
  }

  q.addEventListener("input", filter);

  tree.addEventListener("mouseover", (e) => {
    const el = e.target.closest("a, summary");
    if (el) show(el);
  });
  tree.addEventListener("focusin", (e) => {
    const el = e.target.closest("a, summary");
    if (el) show(el);
  });

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const inInput = document.activeElement === q;

    if (e.key === "Escape") {
      q.value = "";
      filter();
      q.blur();
      return;
    }
    if (inInput) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        move(1);
      }
      return;
    }
    if (e.key === "/") {
      e.preventDefault();
      q.focus();
    } else if (e.key === "j" || e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "k" || e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "l" || e.key === "h") {
      const a = document.activeElement;
      if (!a || !tree.contains(a)) return;
      if (a.matches("summary") && (e.key === "l" || a.parentElement.open)) {
        a.parentElement.open = e.key === "l";
      } else if (e.key === "h") {
        const parent = a.closest("li").parentElement.closest("li");
        if (parent) own(parent).focus();
      }
    }
  });

  async function extras(pages) {
    const get = async (u) => {
      try {
        const r = await fetch(u);
        return r.ok ? await r.json() : null;
      } catch {
        return null;
      }
    };
    const add = (path, items) => {
      const p = pages.find((x) => x.path === path);
      if (p && items.length) p.sections = [...p.sections, ...items];
    };
    const posts = await get("/notes/posts.json");
    if (Array.isArray(posts))
      add(
        "/notes/",
        posts
          .slice()
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((x) => ({ id: x.id, title: x.title + " (" + x.date + ")" })),
      );
    const ph = await get("/src/assets/p/photos.json");
    if (ph && Array.isArray(ph.folders))
      add(
        "/photographs.html",
        ph.folders.map((f) => ({
          id: encodeURIComponent(f.id),
          title: f.photos.length + " photos",
        })),
      );
  }
  async function run() {
    let pages = null;
    try {
      const c = JSON.parse(sessionStorage.getItem(KEY));
      if (c && Date.now() - c.t < TTL) pages = c.pages;
    } catch {}
    if (!pages) {
      pages = await crawl();
      if (failed.length) console.warn("sitemap: could not crawl", failed);
      if (pages.length) {
        try {
          sessionStorage.setItem(KEY, JSON.stringify({ t: Date.now(), pages }));
        } catch {}
      }
    }
    if (!pages.length) {
      tree.textContent = "crawl failed, serve the site over http";
      st.textContent = "";
      return;
    }
    await extras(pages);
    tree.replaceChildren(render(build(pages)));
    lis = [...tree.querySelectorAll("li")];
    st.textContent =
      pages.length +
      " pages" +
      (failed.length ? ", " + failed.length + " failed (see console)" : "") +
      ", " +
      idle;
    if (q.value) filter();
  }

  run();
})();

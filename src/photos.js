(function () {
  const view = document.getElementById("view");
  const nav = document.getElementById("nav");
  let folders = [];

  let current = []; // photos in the open folder: { src, name }
  let idx = -1;

  const lb = document.createElement("div");
  lb.id = "lightbox";
  lb.hidden = true;
  const lbImg = document.createElement("img");
  const lbCap = document.createElement("div");
  lbCap.className = "lb-cap";
  lb.append(lbImg, lbCap);
  document.body.appendChild(lb);

  function openAt(i) {
    if (!current.length) return;
    idx = (i + current.length) % current.length;
    lbImg.src = current[idx].src;
    lbImg.alt = current[idx].name;
    lbCap.textContent = `${idx + 1} / ${current.length}  ${current[idx].name}`;
    lb.hidden = false;
    document.body.style.overflow = "hidden";
    // preload the neighbors so arrowing feels instant
    for (const j of [idx + 1, idx - 1]) {
      new Image().src = current[(j + current.length) % current.length].src;
    }
  }

  function closeLb() {
    lb.hidden = true;
    lbImg.removeAttribute("src");
    document.body.style.overflow = "";
  }

  lb.addEventListener("click", closeLb);
  addEventListener("keydown", (e) => {
    if (lb.hidden) return;
    if (e.key === "Escape") closeLb();
    else if (e.key === "ArrowRight") openAt(idx + 1);
    else if (e.key === "ArrowLeft") openAt(idx - 1);
  });

  view.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-i]");
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    openAt(Number(a.dataset.i));
  });

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  // "01-birds_and-stuff" -> "birds and stuff" (leading number only sets order)
  function pretty(id) {
    return id.replace(/^\d+[-_ ]+/, "").replace(/[-_]+/g, " ");
  }

  function setNav(inFolder) {
    nav.innerHTML =
      '<a href="/">[back]</a>' + (inFolder ? ' <a href="#">[folders]</a>' : "");
  }

  function list() {
    document.title = "photos";
    setNav(false);
    if (!folders.length) {
      view.innerHTML = "<h1>photos</h1><p class='dim'>nothing here yet.</p>";
      return;
    }
    view.innerHTML =
      "<h1>photos</h1>" +
      folders
        .map(
          (f) =>
            `<a class="folder" href="#${encodeURIComponent(f.id)}">${esc(pretty(f.id))}/<span class="count">${f.photos.length}</span></a>`,
        )
        .join("");
  }

  function show(f) {
    document.title = pretty(f.id) + " / photos";
    setNav(true);
    const base = "src/assets/p/" + encodeURIComponent(f.id) + "/";
    current = f.photos.map((p) => ({
      src: base + encodeURIComponent(p),
      name: p,
    }));
    view.innerHTML =
      `<h1>${esc(pretty(f.id))}</h1>` +
      (f.photos.length
        ? '<div class="grid">' +
          current
            .map(
              (p, i) =>
                `<figure><a href="${p.src}" data-i="${i}" target="_blank" rel="noopener"><img src="${p.src}" alt="${esc(p.name)}" loading="lazy" /></a><figcaption>${esc(p.name)}</figcaption></figure>`,
            )
            .join("") +
          "</div>"
        : "<p class='dim'>empty folder.</p>");
    scrollTo(0, 0);
  }

  function route() {
    closeLb();
    current = [];
    const id = decodeURIComponent(location.hash.slice(1));
    const f = folders.find((x) => x.id === id);
    if (f) show(f);
    else list();
  }

  fetch("src/assets/p/photos.json")
    .then((r) => r.json())
    .then((j) => {
      folders = j.folders || [];
      route();
    })
    .catch(() => {
      view.innerHTML =
        "<h1>photos</h1><p class='dim'>couldn't load photos.</p>";
    });
  addEventListener("hashchange", route);
})();

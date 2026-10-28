(function () {
  const view = document.getElementById("view");
  const nav = document.getElementById("nav");
  let folders = [];

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
    view.innerHTML =
      `<h1>${esc(pretty(f.id))}</h1>` +
      (f.photos.length
        ? '<div class="grid">' +
          f.photos
            .map((p) => {
              const src = base + encodeURIComponent(p);
              return `<figure><a href="${src}" target="_blank" rel="noopener"><img src="${src}" alt="${esc(p)}" loading="lazy" /></a><figcaption>${esc(p)}</figcaption></figure>`;
            })
            .join("") +
          "</div>"
        : "<p class='dim'>empty folder.</p>");
    scrollTo(0, 0);
  }

  function route() {
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

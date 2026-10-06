(function () {
  const view = document.getElementById("view");
  let posts = [];

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function list() {
    document.title = "notes";
    view.innerHTML =
      "<h1>notes</h1>" +
      posts
        .map(
          (p) =>
            `<a class="entry" href="#${esc(p.id)}"><div class="t">${esc(p.title)}</div><div class="date">${esc(p.date)}</div></a>`,
        )
        .join("");
  }

  async function show(p) {
    document.title = p.title + " / notes";
    view.innerHTML = "<p class='date'>loading</p>";
    try {
      const r = await fetch("/notes/posts/" + encodeURIComponent(p.id) + ".md");
      if (!r.ok) throw 0;
      const md = await r.text();
      view.innerHTML =
        `<h1>${esc(p.title)}</h1><div class="date">${esc(p.date)}</div>` +
        `<div class="prose" style="margin-top:24px">${marked.parse(md)}</div>` +
        `<p style="margin-top:40px"><a class="back" href="#">&larr; all notes</a></p>`;
    } catch {
      view.innerHTML =
        "<p class='date'>couldn't load that post! oopsies..</p><a class='back' href='#'>&larr; all notes</a>";
    }
    scrollTo(0, 0);
  }

  function route() {
    const id = location.hash.slice(1);
    const p = posts.find((x) => x.id === id);
    if (p) show(p);
    else list();
  }

  fetch("/notes/posts.json")
    .then((r) => r.json())
    .then((j) => {
      posts = j
        .slice()
        .sort(
          (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
        );
      route();
    })
    .catch(() => {
      view.innerHTML = "<h1>notes</h1><p class='date'>couldn't load posts</p>";
    });
  addEventListener("hashchange", route);
})();

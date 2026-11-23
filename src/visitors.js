(() => {
  "use strict";
  const API = "https://auth-stats.skunkolee.workers.dev"; // do not spam this pretty please
  // be a good boi or girl or thing and do NOT spam this 

  const box = document.getElementById("vstats");
  if (!box || API.includes("YOUR-SUBDOMAIN")) return; // not configured yet: stay hidden
  const elN = document.getElementById("v-n");
  const elLive = document.getElementById("v-live");
  const elLiveLine = document.getElementById("v-live-line");
  const elYou = document.getElementById("v-you");

  // one random id per browser; that is what makes a visitor "unique"
  let id = null;
  try {
    id = localStorage.getItem("visitor-id");
    if (!id) {
      id =
        (crypto.randomUUID && crypto.randomUUID()) ||
        Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join("");
      localStorage.setItem("visitor-id", id);
    }
  } catch (e) {
    id = null; // storage blocked: we can only show the live count, not a number
  }

  function show(d) {
    if (!d || typeof d.live !== "number") return;
    if (d.n && elN) {
      elN.textContent = "#" + d.n.toLocaleString("en-US");
      elYou.hidden = false;
    }
    const n = Math.max(1, d.live);
    elLive.textContent = n.toLocaleString("en-US");
    elLiveLine.firstChild.textContent = n === 1 ? "there is " : "there are ";
    elLiveLine.lastChild.textContent =
      n === 1 ? " person on site right now" : " people on site right now";
    box.hidden = false;
  }

  async function call(path) {
    try {
      const opts = id
        ? {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id }),
            keepalive: true,
          }
        : { method: "GET" };
      const r = await fetch(API + (id ? path : "/stats"), opts);
      if (!r.ok) throw new Error(r.status);
      show(await r.json());
    } catch (e) {
      // worker unreachable: just leave whatever is on screen!!!!
    }
  }

  call("/hit");
  setInterval(() => {
    if (!document.hidden) call("/ping");
  }, 30000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) call("/ping");
  });
})();

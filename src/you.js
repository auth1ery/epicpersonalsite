(function () {
  const btn = document.getElementById("you-btn");
  if (!btn) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const root = document.createElement("div");
  root.className = "you";
  root.hidden = true;
  root.innerHTML =
    '<div class="ylines"></div><button class="yclose">close</button>';
  const hint = document.createElement("div");
  hint.className = "you-hint";
  hint.textContent = "keep going";
  document.body.append(root, hint);
  const box = root.querySelector(".ylines");

  const ua = navigator.userAgent;
  const uad = navigator.userAgentData;

  function gpu() {
    try {
      const gl = document.createElement("canvas").getContext("webgl");
      const e = gl.getExtension("WEBGL_debug_renderer_info");
      return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : "";
    } catch {
      return "";
    }
  }

  async function build() {
    const L = ["yes, you!"];
    L.push("we've probably made eye contact two years ago.");

    const firefox = /Firefox\//.test(ua);
    const name = firefox
      ? "firefox"
      : /Edg\//.test(ua)
        ? "edge"
        : /Chrome\//.test(ua)
          ? "chrome, or something built on it"
          : /Safari\//.test(ua)
            ? "safari"
            : "something i don't recognize";
    const mobile =
      uad && "mobile" in uad ? uad.mobile : /Mobi|Android/.test(ua);
    const os = /Android/i.test(ua)
      ? "android"
      : /iPhone|iPad/.test(ua)
        ? "ios"
        : /Mac/i.test(uad?.platform || navigator.platform)
          ? "macos"
          : /Win/i.test(uad?.platform || navigator.platform)
            ? "windows"
            : /Linux/i.test(uad?.platform || navigator.platform)
              ? "linux"
              : "";
    L.push(
      "you're using " +
        name +
        (os ? " on " + os : "") +
        "." +
        (os === "linux" ? " respect." : " it gets the job done."),
    );

    const t = navigator.hardwareConcurrency;
    if (t) {
      let s = "your device reports " + t + " threads";
      if (navigator.deviceMemory) {
        s +=
          " and " +
          (navigator.deviceMemory >= 8
            ? "8gb or more"
            : navigator.deviceMemory + "gb") +
          " of memory";
      }
      L.push(
        s +
          ". " +
          (t >= 8 ? "that's plenty." : "that's enough for a website, anyway."),
      );
    }

    const g = gpu();
    if (/intel/i.test(g) && !/arc/i.test(g)) {
      L.push(
        "it's running on intel integrated graphics, and you don't fuss about it.",
      );
    } else if (/nvidia|geforce|rtx|gtx|radeon/i.test(g)) {
      L.push("there's a dedicated gpu in there. nice.");
    } else if (/apple/i.test(g)) {
      L.push("apple silicon, if the graphics string is honest.");
    } else if (/adreno|mali/i.test(g)) {
      L.push(
        "a phone gpu, which has no business rendering a mandelbrot set this smoothly.",
      );
    }

    if (
      !mobile &&
      screen.width &&
      innerWidth * innerHeight < screen.width * screen.height * 0.8
    ) {
      L.push(
        "your window isn't fullscreen. you like some space around things.",
      );
    }

    L.push(
      "your screen is " +
        screen.width +
        " by " +
        screen.height +
        " at " +
        devicePixelRatio +
        "x.",
    );

    let seen = false;
    try {
      seen = !!localStorage.getItem("yv");
      localStorage.setItem("yv", "1");
    } catch {}
    L.push(
      seen
        ? "you've been here before. welcome back."
        : "you're new here, and haven't poked around much yet.",
    );

    try {
      const b = await navigator.getBattery();
      const pct = Math.round(b.level * 100);
      if (b.level === 1 && b.charging) {
        L.push("your battery is full and plugged in, or there isn't one.");
      } else if (!b.charging && b.level <= 0.2) {
        L.push(
          "your battery is at " + pct + "%. go find a charger, i'll wait.",
        );
      } else {
        L.push("your battery is at " + pct + "%.");
      }
    } catch {}

    if (navigator.globalPrivacyControl || navigator.doNotTrack === "1") {
      L.push(
        "your browser asked not to be tracked. i'm not tracking you, so it's a good thing.",
      );
    }

    if (matchMedia("(prefers-color-scheme: dark)").matches) {
      L.push("you prefer dark mode. it suits this page.");
    }

    const h = new Date().getHours();
    if (h < 5)
      L.push("it's the middle of the night where you are. go to sleep!");
    else if (h < 12) L.push("it's morning where you are.");
    else if (h < 18) L.push("it's the afternoon where you are.");
    else L.push("it's evening where you are.");

    let tz = "";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {}
    if (tz.includes("/")) {
      const place = tz.split("/").pop().replace(/_/g, " ").toLowerCase();
      L.push(
        "your clock is set to " +
          place +
          " time, so you're somewhere around there. you're safe anyways.",
      );
    }

    L.push("we shall meet again, stranger.");
    L.push({
      text: "inspired from yhvr.me's about you section which is inspired from tom from the internet's little gizmo that he used to have on his site..",
      small: true,
    });
    return L;
  }

  let token = 0;
  let skip = null;
  let isOpen = false;

  function wait(ms) {
    return new Promise((res) => {
      const id = setTimeout(res, ms);
      skip = () => {
        clearTimeout(id);
        res();
      };
    });
  }

  async function open() {
    if (isOpen) return;
    isOpen = true;
    const mine = ++token;
    box.textContent = "";
    root.hidden = false;
    document.documentElement.style.overflow = "hidden";
    requestAnimationFrame(() => root.classList.add("on"));
    const lines = await build();
    await wait(reduced ? 0 : 700);
    for (let i = 0; i < lines.length; i++) {
      if (mine !== token) return;
      const p = document.createElement("p");
      if (i === 0) p.className = "first";
      p.textContent = typeof lines[i] === "string" ? lines[i] : lines[i].text;
      if (typeof lines[i] !== "string" && lines[i].small) {
        p.classList.add("small");
      }
      box.append(p);
      requestAnimationFrame(() => p.classList.add("in"));
      p.scrollIntoView({
        block: "end",
        behavior: reduced ? "auto" : "smooth",
      });
      const text = typeof lines[i] === "string" ? lines[i] : lines[i].text;

      if (!reduced) await wait(1600 + text.length * 50);
    }
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    token++;
    if (skip) skip();
    root.classList.remove("on");
    document.documentElement.style.overflow = "";
    setTimeout(() => {
      if (!isOpen) root.hidden = true;
    }, 600);
  }

  btn.addEventListener("click", open);
  root.querySelector(".yclose").addEventListener("click", close);
  root.addEventListener("click", (e) => {
    if (e.target.closest(".yclose")) return;
    if (skip) skip();
  });
  addEventListener("keydown", (e) => {
    if (!isOpen) return;
    if (e.key === "Escape") close();
    else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (skip) skip();
    }
  });

  let acc = 0;
  let decay = 0;
  function atEnd() {
    return (
      !document.documentElement.classList.contains("exploring") &&
      innerHeight + scrollY >= document.documentElement.scrollHeight - 2
    );
  }
  function push(d) {
    if (isOpen) return;
    if (!atEnd() || d <= 0) {
      acc = 0;
      hint.style.opacity = "0";
      return;
    }
    acc += d;
    hint.style.opacity = String(Math.min(1, acc / 450));
    clearTimeout(decay);
    decay = setTimeout(() => {
      acc = 0;
      hint.style.opacity = "0";
    }, 700);
    if (acc > 450) {
      acc = 0;
      hint.style.opacity = "0";
      open();
    }
  }
  addEventListener("wheel", (e) => push(e.deltaY), { passive: true });
  let ty = 0;
  addEventListener(
    "touchstart",
    (e) => {
      ty = e.touches[0].clientY;
    },
    { passive: true },
  );
  addEventListener(
    "touchmove",
    (e) => {
      const y = e.touches[0].clientY;
      push((ty - y) * 2);
      ty = y;
    },
    { passive: true },
  );
})();

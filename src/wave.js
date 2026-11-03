(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ramp = " .,:;-~=+*#%";
  const FS = 14;
  const mouse = { x: -9999, y: -9999 };
  addEventListener("mousemove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  function make(side) {
    const c = document.createElement("canvas");
    c.className = "wave " + side;
    c.setAttribute("aria-hidden", "true");
    document.body.append(c);
    const g = c.getContext("2d");
    const left = side === "left";
    const seed = left ? 0 : 40;
    let w = 0,
      h = 0,
      cw = 0,
      ch = 0,
      cols = 0,
      rows = 0;

    function size() {
      const r = c.getBoundingClientRect();
      if (!r.width) return;
      const d = devicePixelRatio || 1;
      c.width = r.width * d;
      c.height = r.height * d;
      g.setTransform(d, 0, 0, d, 0, 0);
      g.font = FS + "px monospace";
      g.textBaseline = "top";
      cw = g.measureText("M").width;
      ch = FS * 1.3;
      w = r.width;
      h = r.height;
      cols = Math.floor(w / cw);
      rows = Math.floor(h / ch);
    }

    function draw(t) {
      g.clearRect(0, 0, w, h);
      const r = c.getBoundingClientRect();
      const px = (mouse.x - r.left) / cw;
      const py = (mouse.y - r.top) / ch;
      const tick = Math.floor(t * 3);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const e = left ? x : cols - 1 - x;
          const k = e / Math.max(cols - 1, 1);
          const s = Math.sin(y * 0.11 - t * 0.5 + e * 0.2 + seed);
          const hash =
            ((x * 73856093) ^ (y * 19349663) ^ (tick * 83492791)) >>> 0;
          const jitter = (hash % 100) / 100 - 0.5;
          let v =
            Math.sin(e * 0.45 + t * 1.3 + Math.sin(y * 0.18 + t * 0.6) * 2.2) +
            s * 0.7 +
            Math.sin((e + y) * 0.3 + t * 0.9) * 0.5 +
            jitter * 0.6;
          const dx = x - px;
          const dy = y - py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          v += Math.sin(dist * 0.9 - t * 4) * Math.max(0, 1 - dist / 16) * 1.4;
          let n = Math.min(Math.max((v + 2.2) / 4.4, 0), 1);
          n *= 1 - k * 0.75;
          const i = Math.floor(n * (ramp.length - 1));
          if (!i) continue;
          g.fillStyle =
            i > 9
              ? "#fff"
              : Math.sin(e * 0.15 + y * 0.05 + t * 0.4) > 0
                ? "#69f"
                : "#a5f";
          g.globalAlpha = 0.3 + n * 0.6;
          g.fillText(ramp[i], x * cw, y * ch);
        }
      }
      g.globalAlpha = 1;
    } // Cool!

    size();
    new ResizeObserver(() => {
      size();
      if (reduce) draw(0);
    }).observe(c);

    return { draw, dir: left ? 1 : -1 };
  }

  const waves = [make("left"), make("right")];

  if (reduce) {
    waves.forEach((w) => w.draw(0));
    return;
  }

  let last = 0;
  function frame(ms) {
    if (ms - last > 60) {
      last = ms;
      waves.forEach((w) => w.draw((ms / 1000) * w.dir));
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

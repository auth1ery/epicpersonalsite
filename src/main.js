(function () {
  const canvas = document.getElementById("fractal");
  const dock = document.getElementById("dock");
  const readout = document.getElementById("readout");
  const gl =
    canvas.getContext("webgl", { antialias: false, alpha: false }) ||
    canvas.getContext("experimental-webgl");
  if (!gl) {
    canvas.style.display = "none";
    dock.style.display = "none";
    readout.style.display = "none";
    document.body.style.background = "linear-gradient(180deg,#050818,#0a1040)";
  } else {
    const vertSrc = `
      attribute vec2 a_pos;
      void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }
    `;
    const fragSrc = `
      precision highp float;
      uniform vec2 u_res;
      uniform vec2 u_center;
      uniform float u_span;
      uniform float u_iter;
      uniform float u_bands;
      uniform float u_mode;
      uniform vec2 u_julia;

      vec3 palette(float t){
        t = clamp(t, 0.0, 1.0);
        float r = pow(t, 1.7);
        float g = pow(t, 1.3);
        float b = 0.42 + 0.58 * t;
        return vec3(r, g, b);
      }

      float tri(float x){
        return 1.0 - abs(2.0 * fract(x * 0.5) - 1.0);
      }

      void main(){
        vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
        vec2 p = u_center + uv * u_span;
        vec2 z = u_mode > 0.5 ? p : vec2(0.0);
        vec2 c = u_mode > 0.5 ? u_julia : p;
        int iter = 0;
        bool escaped = false;
        for(int i = 0; i < 1500; i++){
          if(float(i) >= u_iter) break;
          if(dot(z, z) > 16.0){ escaped = true; break; }
          z = vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y) + c;
          iter = i + 1;
        }
        vec3 col;
        if(!escaped){
          col = vec3(0.01, 0.012, 0.05);
        } else {
          float logZn = log(dot(z, z)) * 0.5;
          float nu = log(logZn / log(2.0)) / log(2.0);
          float smoothIter = float(iter) + 1.0 - nu;
          float t = (smoothIter / 260.0) * 3.1 * u_bands;
          col = palette(tri(t));
        }
        float vig = 1.0 - 0.25 * smoothstep(0.4, 1.4, length(uv));
        col *= vig;
        gl_FragColor = vec4(col, 1.0);
      }
    `;

    function compile(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s));
      }
      return s;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vertSrc));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const posLoc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const u_res = gl.getUniformLocation(prog, "u_res");
    const u_center = gl.getUniformLocation(prog, "u_center");
    const u_span = gl.getUniformLocation(prog, "u_span");
    const u_iter = gl.getUniformLocation(prog, "u_iter");
    const u_bands = gl.getUniformLocation(prog, "u_bands");
    const u_mode = gl.getUniformLocation(prog, "u_mode");
    const u_julia = gl.getUniformLocation(prog, "u_julia");

    let dirty = true;
    let saveReq = false;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      gl.viewport(0, 0, canvas.width, canvas.height);
      dirty = true;
    }
    window.addEventListener("resize", resize);
    resize();

    const stops = [
      [-0.5, 0.0, 1.6],
      [-0.745, 0.113, 0.09],
      [0.2732, -0.0068, 0.018],
      [-0.7453, 0.1127, 0.004],
      [-0.09, 0.826, 0.012],
      [-1.749, 0.0, 0.0016],
    ];

    const current = { cx: stops[0][0], cy: stops[0][1], span: stops[0][2] };
    const view = { cx: -0.5, cy: 0, span: 3.2 };
    const views = [
      { cx: -0.5, cy: 0, span: 3.2 },
      { cx: 0, cy: 0, span: 3.2 },
    ];
    const MIN_SPAN = 5e-5;
    const MAX_SPAN = 6;
    let explore = false;
    let mode = 0;
    let julia = [-0.8, 0.156];

    const tools = document.getElementById("tools");
    const btnExplore = document.getElementById("btn-explore");
    const btnSave = document.getElementById("btn-save");
    const btnMode = document.getElementById("t-mode");
    const iterEl = document.getElementById("t-iter");
    const bandsEl = document.getElementById("t-bands");

    function lerp(a, b, t) {
      return a + (b - a) * t;
    }
    function ease(t) {
      return t * t * (3 - 2 * t);
    }
    function clamp(v, lo, hi) {
      return Math.max(lo, Math.min(hi, v));
    }

    let px = 0,
      py = 0;
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      addEventListener("pointermove", (e) => {
        if (e.pointerType !== "mouse" || explore) return;
        px = e.clientX / window.innerWidth - 0.5;
        py = e.clientY / window.innerHeight - 0.5;
      });
      document.addEventListener("mouseleave", () => {
        px = 0;
        py = 0;
      });
    }

    function getTarget() {
      const scrollY = window.scrollY;
      const vh = window.innerHeight;
      const total = document.body.scrollHeight - vh;
      let progress = total > 0 ? scrollY / total : 0;
      progress = clamp(progress, 0, 1);
      const segCount = stops.length - 1;
      const segF = progress * segCount;
      let idx = Math.floor(segF);
      if (idx >= segCount) idx = segCount - 1;
      const t = ease(clamp(segF - idx, 0, 1));
      const a = stops[idx],
        b = stops[idx + 1];
      const span = Math.exp(lerp(Math.log(a[2]), Math.log(b[2]), t));
      return {
        cx: lerp(a[0], b[0], t) + px * span * 0.15,
        cy: lerp(a[1], b[1], t) - py * span * 0.15,
        span,
        segIndex: idx,
        segT: t,
      };
    }

    function toView(x, y) {
      const w = window.innerWidth,
        h = window.innerHeight;
      return [
        view.cx + ((x - w / 2) / h) * view.span,
        view.cy - ((y - h / 2) / h) * view.span,
      ];
    }

    function zoomAt(x, y, f) {
      const [qx, qy] = toView(x, y);
      const ns = clamp(view.span * f, MIN_SPAN, MAX_SPAN);
      const k = ns / view.span;
      view.cx = qx - (qx - view.cx) * k;
      view.cy = qy - (qy - view.cy) * k;
      view.span = ns;
    }

    function syncUI() {
      btnExplore.textContent = explore ? "back to tour" : "explore";
      btnMode.textContent = mode === 0 ? "julia here" : "mandelbrot";
      tools.hidden = !explore;
    }

    function setMode(m) {
      if (m === mode) return;
      views[mode] = { cx: view.cx, cy: view.cy, span: view.span };
      mode = m;
      Object.assign(view, views[m]);
      Object.assign(current, views[m]);
      dirty = true;
      syncUI();
    }

    function toJulia(x, y) {
      julia = [x, y];
      views[1] = { cx: 0, cy: 0, span: 3.2 };
      setMode(1);
    }

    function setExplore(on) {
      if (on === explore) return;
      if (on) {
        Object.assign(view, current);
        view.span = clamp(view.span, MIN_SPAN, MAX_SPAN);
      } else if (mode === 1) {
        mode = 0;
        Object.assign(current, views[0]);
      }
      explore = on;
      document.documentElement.classList.toggle("exploring", on);
      dirty = true;
      syncUI();
    }

    btnExplore.addEventListener("click", () => setExplore(!explore));
    btnSave.addEventListener("click", () => {
      saveReq = true;
    });
    btnMode.addEventListener("click", () => {
      if (mode === 0) toJulia(current.cx, current.cy);
      else setMode(0);
    });
    document.getElementById("t-in").addEventListener("click", () => {
      zoomAt(window.innerWidth / 2, window.innerHeight / 2, 0.5);
    });
    document.getElementById("t-out").addEventListener("click", () => {
      zoomAt(window.innerWidth / 2, window.innerHeight / 2, 2);
    });
    document.getElementById("t-home").addEventListener("click", () => {
      Object.assign(
        view,
        mode === 0
          ? { cx: -0.5, cy: 0, span: 3.2 }
          : { cx: 0, cy: 0, span: 3.2 },
      );
    });
    iterEl.addEventListener("input", () => {
      dirty = true;
    });
    bandsEl.addEventListener("input", () => {
      dirty = true;
    });

    const ptrs = new Map();
    let lastDist = 0;
    canvas.addEventListener("pointerdown", (e) => {
      if (!explore) return;
      canvas.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      lastDist = 0;
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!explore || !ptrs.has(e.pointerId)) return;
      const p = ptrs.get(e.pointerId);
      const dx = e.clientX - p.x,
        dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (ptrs.size === 1) {
        view.cx -= (dx / window.innerHeight) * view.span;
        view.cy += (dy / window.innerHeight) * view.span;
      } else if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (lastDist && d > 0)
          zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, lastDist / d);
        lastDist = d;
      }
    });
    function release(e) {
      ptrs.delete(e.pointerId);
      lastDist = 0;
    }
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    canvas.addEventListener(
      "wheel",
      (e) => {
        if (!explore) return;
        e.preventDefault();
        zoomAt(
          e.clientX,
          e.clientY,
          Math.exp(clamp(e.deltaY, -100, 100) * 0.0015),
        );
      },
      { passive: false },
    );
    canvas.addEventListener("dblclick", (e) => {
      if (!explore || mode !== 0) return;
      const w = window.innerWidth,
        h = window.innerHeight;
      toJulia(
        current.cx + ((e.clientX - w / 2) / h) * current.span,
        current.cy - ((e.clientY - h / 2) / h) * current.span,
      );
    });

    function saveFrame() {
      canvas.toBlob((b) => {
        if (!b) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download =
          "fractal-" +
          (mode ? "julia" : "mandelbrot") +
          "-" +
          Date.now() +
          ".png";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }, "image/png");
    }

    function fmtC(re, im, d) {
      return (
        re.toFixed(d) +
        " " +
        (im < 0 ? "-" : "+") +
        " " +
        Math.abs(im).toFixed(d) +
        "i"
      );
    }

    let lastText = "";
    function updateReadout() {
      const d = clamp(Math.ceil(-Math.log10(current.span)) + 3, 3, 9);
      const zoom = 3.2 / current.span;
      const z = zoom < 1000 ? zoom.toFixed(1) : zoom.toExponential(1);
      let text = (mode ? "julia" : "mandelbrot") + "  x" + z + "\n";
      if (mode) text += "c = " + fmtC(julia[0], julia[1], 5) + "\n";
      text += fmtC(current.cx, current.cy, d);
      if (text !== lastText) {
        readout.textContent = text;
        lastText = text;
      }
    }

    function render() {
      const target = explore ? view : getTarget();
      const moving =
        dirty ||
        saveReq ||
        Math.abs(target.cx - current.cx) / current.span > 1e-4 ||
        Math.abs(target.cy - current.cy) / current.span > 1e-4 ||
        Math.abs(Math.log(target.span / current.span)) > 1e-4;
      if (moving) {
        const smooth = explore ? 0.25 : 0.09;
        current.cx += (target.cx - current.cx) * smooth;
        current.cy += (target.cy - current.cy) * smooth;
        current.span *= Math.pow(target.span / current.span, smooth);
        gl.uniform2f(u_res, canvas.width, canvas.height);
        gl.uniform2f(u_center, current.cx, current.cy);
        gl.uniform1f(u_span, current.span);
        gl.uniform1f(u_mode, mode);
        gl.uniform2f(u_julia, julia[0], julia[1]);
        gl.uniform1f(u_iter, explore ? +iterEl.value : 260);
        gl.uniform1f(u_bands, explore ? +bandsEl.value : 1);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        dirty = false;
        if (saveReq) {
          saveReq = false;
          saveFrame();
        }
      }
      updateReadout();
      if (!explore) updateNav(target.segIndex, target.segT);
      requestAnimationFrame(render);
    }

    function updateNav(idx, t) {
      const activeIdx = t > 0.5 ? idx + 1 : idx;
      const btns = window.railBtnsExport || [];
      btns.forEach((b, i) => b.classList.toggle("active", i === activeIdx));
      const cue = document.getElementById("cue");
      if (cue) cue.style.opacity = window.scrollY > 40 ? "0" : "1";
    }

    syncUI();
    requestAnimationFrame(render);
  }

  const sectionIds = [
    "s-hero",
    "s-rng",
    "s-asterisk",
    "s-cupcake",
    "s-systems",
    "s-contact",
  ];
  const rail = document.getElementById("rail");
  const btns = sectionIds.map((id) => {
    const b = document.createElement("button");
    b.setAttribute("aria-label", id.replace("s-", ""));
    b.addEventListener("click", () => {
      document.getElementById(id).scrollIntoView({ behavior: "smooth" });
    });
    rail.appendChild(b);
    return b;
  });
  window.railBtnsExport = btns;
})();

(function () {
  const ID = "1227759305852190801";
  const el = document.getElementById("presence");
  if (!el) return;
  async function poll() {
    try {
      const r = await fetch("https://api.lanyard.rest/v1/users/" + ID);
      const { data } = await r.json();
      const act = data.activities.find((a) => a.type === 0);
      el.dataset.s = data.discord_status;
      el.querySelector(".ptxt").textContent = act
        ? "currently on " + act.name.toLowerCase()
        : data.discord_status;
      el.hidden = false;
    } catch {
      el.hidden = true;
    }
  }
  poll();
  setInterval(poll, 30000);
})();

(function () {
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  const dot = document.createElement("div");
  dot.className = "cur-dot";
  const ring = document.createElement("div");
  ring.className = "cur-ring";
  dot.style.opacity = ring.style.opacity = "0";
  document.body.append(ring, dot);
  document.documentElement.classList.add("has-cursor");

  let mx = 0,
    my = 0,
    rx = 0,
    ry = 0;
  addEventListener("pointermove", (e) => {
    mx = e.clientX;
    my = e.clientY;
    dot.style.transform = `translate(${mx}px,${my}px)`;
    dot.style.opacity = ring.style.opacity = "1";
    ring.classList.toggle(
      "hot",
      !!e.target.closest("a, button, summary, label, input"),
    );
  });
  addEventListener("pointerdown", () => ring.classList.add("down"));
  addEventListener("pointerup", () => ring.classList.remove("down"));
  document.addEventListener("mouseleave", () => {
    dot.style.opacity = ring.style.opacity = "0";
  });
  (function loop() {
    rx += (mx - rx) * 0.16;
    ry += (my - ry) * 0.16;
    ring.style.transform = `translate(${rx}px,${ry}px)`;
    requestAnimationFrame(loop);
  })();
})();

(function () {
  const io = new IntersectionObserver(
    (es) => es.forEach((e) => e.isIntersecting && e.target.classList.add("in")),
    { threshold: 0.25 },
  );
  document.querySelectorAll(".panel").forEach((p) => io.observe(p));
})();

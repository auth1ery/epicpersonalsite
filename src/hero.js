
(() => {
  "use strict";

  const root = document.documentElement;
  const canvas = document.getElementById("scene");
  if (!canvas || !root.classList.contains("hud")) return;

  const fail = (e) => {
    console.error("hero:", e);
    if (window.__heroFail) window.__heroFail();
    else root.classList.remove("hud");
  };
  try {
    start();
  } catch (e) {
    fail(e);
  }

  function start() {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const g = canvas.getContext("2d", { alpha: false });
    if (!g) throw new Error("no 2d context");

    /* ------------------------------------------------------------ palette */
    const BASE = ["#ffffff", "#6699ff", "#aa55ff", "#cc9933"];
    const COLORS = BASE.slice(); // tinted by the visitor's local time of day, see applyTimeTint()
    const WHITE = 0,
      BLUE = 1,
      VIOLET = 2,
      AMBER = 3;
    const LEVELS = [0.34, 0.56, 0.8, 1];
    const RAMP = " .,:;-~=+*#%"; // same ramp as wave.js
    const NR = RAMP.length;
    const NCH = 95; // printable ascii 32..126
    const gi = (c) => c.charCodeAt(0) - 32;
    const RAMPI = Array.from(RAMP, gi);
    const rowOf = (base, lvl) => base * 4 + (lvl < 0 ? 0 : lvl > 3 ? 3 : lvl);
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
    const lerp = (a, b, k) => a + (b - a) * k;
    const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

    function mulberry(a) {
      return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    const rnd = mulberry(20261121);

    /* ------------------------------------------------------- canvas layout */
    let maxDpr = 2;
    let atlas, dpr, FS, Wpx, Hpx, cellW, cellH, cols, rows, ox, oy;
    let zb, cb, rb, ob;

    function shade(hex, a) {
      const n = parseInt(hex.slice(1), 16);
      return `rgb(${(((n >> 16) & 255) * a) | 0},${(((n >> 8) & 255) * a) | 0},${((n & 255) * a) | 0})`;
    }

    function layout() {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      Wpx = Math.round(r.width * dpr);
      Hpx = Math.round(r.height * dpr);
      canvas.width = Wpx;
      canvas.height = Hpx;
      FS = r.width < 700 ? 11 : r.height > 1000 ? 16 : 14;
      g.font = `${FS * dpr}px monospace`;
      g.textBaseline = "top";
      cellW = Math.max(2, Math.round(g.measureText("M").width));
      cellH = Math.round(FS * dpr * 1.3);
      cols = Math.floor(Wpx / cellW);
      rows = Math.floor(Hpx / cellH);
      ox = (Wpx - cols * cellW) >> 1;
      oy = (Hpx - rows * cellH) >> 1;

      buildAtlas();

      const n = cols * rows;
      zb = new Float32Array(n);
      cb = new Uint8Array(n);
      rb = new Uint8Array(n);
      ob = new Uint8Array(n);
      buildGrid();
      rebuildRings();
      rebuildKnot();
      return true;
    }

    function buildAtlas() {
      atlas = document.createElement("canvas");
      atlas.width = NCH * cellW;
      atlas.height = 16 * cellH;
      const a = atlas.getContext("2d");
      a.font = g.font;
      a.textBaseline = "top";
      for (let b = 0; b < 4; b++)
        for (let l = 0; l < 4; l++) {
          a.fillStyle = shade(COLORS[b], LEVELS[l]);
          for (let c = 1; c < NCH; c++)
            a.fillText(
              String.fromCharCode(32 + c),
              c * cellW,
              (b * 4 + l) * cellH,
            );
        }
    }

    // night = deep indigo, dawn = peach, day = sky, dusk = rose; blended
    // gently into the blue/violet/white so it reads as a mood, not a recolour
    const TOD = [
      [0, [85, 96, 255]],
      [6, [255, 159, 122]],
      [12, [127, 208, 255]],
      [18, [255, 127, 168]],
      [24, [85, 96, 255]],
    ];
    function hex2rgb(h) {
      const n = parseInt(h.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    function mixHex(h, rgb, k) {
      const c = hex2rgb(h);
      return (
        "#" +
        c
          .map((v, i) =>
            Math.round(v + (rgb[i] - v) * k)
              .toString(16)
              .padStart(2, "0"),
          )
          .join("")
      );
    }
    function applyTimeTint() {
      const d = new Date();
      const h = d.getHours() + d.getMinutes() / 60;
      let i = 0;
      while (i < TOD.length - 2 && h >= TOD[i + 1][0]) i++;
      const [h0, c0] = TOD[i],
        [h1, c1] = TOD[i + 1];
      const f = (h - h0) / (h1 - h0);
      const T = c0.map((v, j) => v + (c1[j] - v) * f);
      COLORS[0] = mixHex(BASE[0], T, 0.14);
      COLORS[1] = mixHex(BASE[1], T, 0.4);
      COLORS[2] = mixHex(BASE[2], T, 0.28);
    }
    applyTimeTint();

    /* -------------------------------------------------------------- buffer */
    function put(x, y, z, c, r, own) {
      if (x < 0 || y < 0 || x >= cols || y >= rows) return false;
      const i = y * cols + x;
      if (z >= zb[i]) return false;
      zb[i] = z;
      cb[i] = c;
      rb[i] = r;
      ob[i] = own | 0;
      return true;
    }
    function putText(x, y, s, r, z) {
      for (let i = 0; i < s.length; i++) {
        const c = gi(s[i]);
        if (c > 0 && c < NCH) put(x + i, y, z, c, r, 0);
      }
    }

    /* ------------------------------------------------------------- 3d math */
    let camD = 9;
    let cxPx = 0,
      cyPx = 0,
      S = 100;
    let vx = 0,
      vy = 0,
      vz = 0; // transformed vertex out
    let pX = 0,
      pY = 0,
      pP = 1; // projected out (cells, perspective)

    function mat(yaw, pitch, roll, o) {
      const cy = Math.cos(yaw),
        sy = Math.sin(yaw),
        cp = Math.cos(pitch),
        sp = Math.sin(pitch),
        cr = Math.cos(roll),
        sr = Math.sin(roll);
      const a00 = cy,
        a02 = sy,
        a10 = sp * sy,
        a11 = cp,
        a12 = -sp * cy,
        a20 = -cp * sy,
        a21 = sp,
        a22 = cp * cy;
      o[0] = cr * a00 - sr * a10;
      o[1] = -sr * a11;
      o[2] = cr * a02 - sr * a12;
      o[3] = sr * a00 + cr * a10;
      o[4] = cr * a11;
      o[5] = sr * a02 + cr * a12;
      o[6] = a20;
      o[7] = a21;
      o[8] = a22;
      return o;
    }
    function mul(A, B, o) {
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++)
          o[r * 3 + c] =
            A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
      return o;
    }
    function xf(M, x, y, z) {
      vx = M[0] * x + M[1] * y + M[2] * z;
      vy = M[3] * x + M[4] * y + M[5] * z;
      vz = M[6] * x + M[7] * y + M[8] * z;
    }
    function pj(x, y, z) {
      const w = camD / (camD + z);
      pP = w;
      pX = (cxPx + x * S * w) / cellW;
      pY = (cyPx + y * S * w) / cellH;
    }

    /* ---------------------------------------------------- raster primitives */
    let dimLvl = 0; // subtracted from every level (used when a panel covers the scene)

    // pick the glyph row for a base colour at brightness 0..1 and a depth cue
    function rowFor(base, v, z) {
      const cue = clamp((z + 3) / 9, 0, 1) * 0.3;
      return rowOf(base, ((clamp(v * 1.3 - cue, 0, 1) * 3.99) | 0) - dimLvl);
    }

    // z-buffered filled triangle in cell space with per-vertex brightness
    function tri(
      x0,
      y0,
      z0,
      l0,
      x1,
      y1,
      z1,
      l1,
      x2,
      y2,
      z2,
      l2,
      base,
      own,
      mode,
      seed,
    ) {
      const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
      const maxX = Math.min(cols - 1, Math.ceil(Math.max(x0, x1, x2)));
      const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
      const maxY = Math.min(rows - 1, Math.ceil(Math.max(y0, y1, y2)));
      if (minX > maxX || minY > maxY) return;
      const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
      if (Math.abs(area) < 1e-3) return;
      const inv = 1 / area;
      for (let y = minY; y <= maxY; y++) {
        const py = y + 0.5;
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5;
          const w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) * inv;
          const w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) * inv;
          const w2 = 1 - w0 - w1;
          if (w0 < -0.03 || w1 < -0.03 || w2 < -0.03) continue;
          const z = w0 * z0 + w1 * z1 + w2 * z2;
          const lum = w0 * l0 + w1 * l1 + w2 * l2;
          if (mode === 1) {
            // hatched plate: diagonal lines, brighter where lit
            const h = (x + y * 2 + seed) & 3;
            const ci = h === 0 ? gi("/") : h === 2 ? gi(":") : gi(".");
            put(
              x,
              y,
              z,
              ci,
              rowFor(base, lum * 0.8 + (h === 0 ? 0.2 : 0), z),
              own,
            );
            continue;
          }
          const k =
            3 +
            lum * (NR - 4) +
            (BAYER[((y & 3) << 2) | (x & 3)] / 16 - 0.5) * 0.9;
          let i = Math.floor(k);
          i = i < 3 ? 3 : i > NR - 1 ? NR - 1 : i;
          const r =
            i > 9
              ? rowOf(WHITE, 3 - dimLvl)
              : rowFor(base, i / (NR - 1) + 0.12, z);
          put(x, y, z, RAMPI[i], r, own);
        }
      }
    }

    const SL = gi("/"),
      BS = gi("\\"),
      BAR = gi("|"),
      DASH = gi("-");
    // z-buffered line, glyph follows the direction of the stroke
    function line(x0, y0, z0, x1, y1, z1, row, bias, own, dotted) {
      const dx = x1 - x0,
        dy = y1 - y0;
      let n = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)));
      if (n > 600) return;
      let ch;
      if (dotted) ch = gi(".");
      else {
        const a = Math.abs(Math.atan2(dy * cellH, dx * cellW));
        const m = a > Math.PI / 2 ? Math.PI - a : a;
        ch = m < 0.39 ? DASH : m > 1.18 ? BAR : dx * dy > 0 ? BS : SL;
      }
      if (!n) n = 1;
      const step = dotted ? 2 : 1;
      for (let i = 0; i <= n; i += step) {
        const k = i / n;
        put(
          Math.round(x0 + dx * k),
          Math.round(y0 + dy * k),
          lerp(z0, z1, k) + bias,
          ch,
          row,
          own,
        );
      }
    }

    /* ----------------------------------------------------------- geometry */
    // the centrepiece: a (2,3) torus-knot tube, point-splatted and shaded
    const KS = 0.7;
    let KN = 0,
      kPos,
      kNor,
      kU,
      kG;
    function rebuildKnot() {
      const nu = Math.round(clamp((S0() * 6.2) / (cellW * 0.5), 900, 1800));
      const nv = Math.round(clamp((S0() * 1.9) / (cellH * 0.5), 40, 72));
      KN = nu * nv;
      kPos = new Float32Array(KN * 3);
      kNor = new Float32Array(KN * 3);
      kU = new Float32Array(KN);
      kG = new Float32Array(KN);
      const C = (u, o) => {
        const r = 2 + Math.cos(3 * u);
        o[0] = r * Math.cos(2 * u) * KS;
        o[1] = r * Math.sin(2 * u) * KS;
        o[2] = -Math.sin(3 * u) * KS;
      };
      const p0 = [0, 0, 0],
        p1 = [0, 0, 0],
        p2 = [0, 0, 0];
      const h = 1e-3;
      let n = 0;
      for (let i = 0; i < nu; i++) {
        const u = (i / nu) * Math.PI * 2;
        C(u - h, p0);
        C(u, p1);
        C(u + h, p2);
        const T = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
        const tl = Math.hypot(...T);
        T[0] /= tl;
        T[1] /= tl;
        T[2] /= tl;
        const A = [
          p2[0] - 2 * p1[0] + p0[0],
          p2[1] - 2 * p1[1] + p0[1],
          p2[2] - 2 * p1[2] + p0[2],
        ];
        // normal = curvature direction made perpendicular to T
        const d = A[0] * T[0] + A[1] * T[1] + A[2] * T[2];
        let N = [A[0] - d * T[0], A[1] - d * T[1], A[2] - d * T[2]];
        const nl = Math.hypot(...N) || 1;
        N = N.map((q) => q / nl);
        const B = [
          T[1] * N[2] - T[2] * N[1],
          T[2] * N[0] - T[0] * N[2],
          T[0] * N[1] - T[1] * N[0],
        ];
        const rad = 0.34 + 0.05 * Math.sin(u * 7);
        for (let j = 0; j < nv; j++) {
          const v = (j / nv) * Math.PI * 2;
          const cv = Math.cos(v),
            sv = Math.sin(v);
          const nx = cv * N[0] + sv * B[0],
            ny = cv * N[1] + sv * B[1],
            nz = cv * N[2] + sv * B[2];
          kPos[n * 3] = p1[0] + rad * nx;
          kPos[n * 3 + 1] = p1[1] + rad * ny;
          kPos[n * 3 + 2] = p1[2] + rad * nz;
          kNor[n * 3] = nx;
          kNor[n * 3 + 1] = ny;
          kNor[n * 3 + 2] = nz;
          kU[n] = u;
          // spiral grooves so the tube reads as ribbed cable
          kG[n] = Math.sin(v * 2 + u * 22) > 0.72 ? 1 : 0;
          n++;
        }
      }
    }

    // loose shards orbiting the urchin
    const plates = [];
    for (let i = 0; i < 14; i++) {
      const s = 0.18 + rnd() * 0.34;
      const inc = (rnd() - 0.5) * 2.6;
      plates.push({
        rho: 1.9 + rnd() * 1.2,
        phi: rnd() * 6.283,
        w: (0.12 + rnd() * 0.3) * (rnd() < 0.5 ? 1 : -1),
        inc,
        node: rnd() * 6.283,
        a0: rnd() * 6.283,
        b0: rnd() * 6.283,
        c0: rnd() * 6.283,
        wa: (rnd() - 0.5) * 1.3,
        wb: (rnd() - 0.5) * 1.3,
        wc: (rnd() - 0.5) * 1.3,
        v: [
          [(rnd() - 0.5) * 0.3 * s, -s * (0.9 + rnd() * 0.5), 0],
          [s * (0.5 + rnd() * 0.6), s * (0.3 + rnd() * 0.5), 0],
          [-s * (0.6 + rnd() * 0.6), s * (0.2 + rnd() * 0.6), 0],
        ],
        tint: rnd() < 0.5 ? BLUE : VIOLET,
        hatch: rnd() < 0.55,
        seed: (rnd() * 4) | 0,
        delay: rnd() * 0.5,
        M: new Float64Array(9),
        T: new Float64Array(9),
      });
    }

    // geodesic lattice (icosphere, 2 subdivisions)
    function icosphere(n) {
      const t = (1 + Math.sqrt(5)) / 2;
      let V = [
        [-1, t, 0],
        [1, t, 0],
        [-1, -t, 0],
        [1, -t, 0],
        [0, -1, t],
        [0, 1, t],
        [0, -1, -t],
        [0, 1, -t],
        [t, 0, -1],
        [t, 0, 1],
        [-t, 0, -1],
        [-t, 0, 1],
      ].map((p) => {
        const l = Math.hypot(...p);
        return p.map((q) => q / l);
      });
      let F = [
        [0, 11, 5],
        [0, 5, 1],
        [0, 1, 7],
        [0, 7, 10],
        [0, 10, 11],
        [1, 5, 9],
        [5, 11, 4],
        [11, 10, 2],
        [10, 7, 6],
        [7, 1, 8],
        [3, 9, 4],
        [3, 4, 2],
        [3, 2, 6],
        [3, 6, 8],
        [3, 8, 9],
        [4, 9, 5],
        [2, 4, 11],
        [6, 2, 10],
        [8, 6, 7],
        [9, 8, 1],
      ];
      for (let s = 0; s < n; s++) {
        const cache = new Map();
        const mid = (a, b) => {
          const key = a < b ? a + "_" + b : b + "_" + a;
          if (cache.has(key)) return cache.get(key);
          const p = V[a].map((q, i) => (q + V[b][i]) / 2);
          const l = Math.hypot(...p);
          V.push(p.map((q) => q / l));
          cache.set(key, V.length - 1);
          return V.length - 1;
        };
        const nf = [];
        for (const [a, b, c] of F) {
          const ab = mid(a, b),
            bc = mid(b, c),
            ca = mid(c, a);
          nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
        }
        F = nf;
      }
      const E = new Set();
      for (const [a, b, c] of F)
        for (const [p, q] of [
          [a, b],
          [b, c],
          [c, a],
        ])
          E.add(p < q ? p + "_" + q : q + "_" + p);
      return { V, E: [...E].map((e) => e.split("_").map(Number)) };
    }
    const lat = icosphere(2);
    const LAT_R = 2.7;

    // dust
    const DUST = 260;
    const dust = [];
    for (let i = 0; i < DUST; i++) {
      const r = 1.2 + rnd() * 4.2;
      const a = rnd() * 6.283;
      const b = Math.acos(rnd() * 2 - 1);
      dust.push({
        x: r * Math.sin(b) * Math.cos(a),
        y: r * Math.cos(b),
        z: r * Math.sin(b) * Math.sin(a),
        s: 0.05 + rnd() * 0.2,
        c: rnd() < 0.5 ? BLUE : VIOLET,
      });
    }

    // text rings, one per section of the page
    const RINGS = [
      {
        id: "rng",
        R: 2.95,
        tx: 0.35,
        tz: 0.18,
        sp: 0.2,
        base: BLUE,
        text: "auth's RNG :: incremental :: gacha :: dingus is alive :: authsrng.xyz :: ",
      },
      {
        id: "linux",
        R: 3.2,
        tx: -0.62,
        tz: 0.7,
        sp: -0.15,
        base: VIOLET,
        text: "linux kernel :: use-after-free :: kfree_sensitive :: git send-email :: lore.kernel.org :: ",
      },
      {
        id: "wikipedia",
        R: 3.45,
        tx: 1.15,
        tz: -0.45,
        sp: 0.12,
        base: BLUE,
        text: "wikipedia :: fix tone :: link articles :: add citations :: User:Lovelyauth :: ",
      },
      {
        id: "osm",
        R: 3.7,
        tx: -1.2,
        tz: 1.2,
        sp: -0.2,
        base: VIOLET,
        text: "openstreetmap :: streetcomplete :: map the world :: ivyauth :: ",
      },
      {
        id: "afield",
        R: 3.95,
        tx: 1.75,
        tz: -0.9,
        sp: 0.09,
        base: BLUE,
        text: "bloom :: rngames :: cupcake :: synth :: HI DUDE :: further afield :: ",
      },
      {
        id: "contact",
        R: 4.2,
        tx: 0.1,
        tz: 1.5,
        sp: -0.11,
        base: VIOLET,
        text: "the auth is always watching :: let's talk :: i don't bite :: skunkolee at gmail :: ",
      },
    ];
    const ringMat = new Float64Array(9),
      tiltM = new Float64Array(9),
      tzM = new Float64Array(9),
      txM = new Float64Array(9);
    RINGS.forEach((rg, i) => {
      rg.i = i;
      rg.focus = 0;
      rg.phase = i * 1.3;
      rg.T = new Float64Array(9);
      mul(mat(0, 0, rg.tz, tzM), mat(0, rg.tx, 0, txM), rg.T);
    });

    function rebuildRings() {
      for (const rg of RINGS) {
        const circ = (2 * Math.PI * rg.R * S0()) / cellW;
        const n = Math.max(
          rg.text.length,
          Math.round(circ / 1.2 / rg.text.length) * rg.text.length,
        );
        rg.n = n;
        rg.chars = new Array(n);
        for (let j = 0; j < n; j++)
          rg.chars[j] = gi(rg.text[j % rg.text.length]);
      }
    }
    function S0() {
      return Math.min(Hpx * 0.108, Wpx * (Wpx < Hpx ? 0.15 : 0.09));
    }

    /* --------------------------------------------------------- hud blueprint */
    let gridPts = [],
      gridNums = [];
    function buildGrid() {
      gridPts = [];
      gridNums = [];
      const gx = Math.max(14, Math.round(cols / 11)),
        gy = Math.max(7, Math.round(rows / 8));
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const onV = x % gx === 0,
            onH = y % gy === 0;
          if (onV && onH) gridPts.push([x, y, gi("+"), rowOf(BLUE, 1)]);
          else if (onV && y % 2 === 0)
            gridPts.push([x, y, gi(":"), rowOf(BLUE, 0)]);
          else if (onH && x % 2 === 0)
            gridPts.push([x, y, gi("-"), rowOf(BLUE, 0)]);
        }
      for (let y = gy; y < rows - 2; y += gy)
        for (let x = gx; x < cols - 3; x += gx) {
          const h = (x * 73856093) ^ (y * 19349663);
          if ((h >>> 0) % 4 === 0) gridNums.push([x + 2, y + 1, h >>> 0]);
        }
    }

    /* ---------------------------------------------------------------- state */
    const st = {
      t: 0,
      timeScale: 1,
      paused: false,
      boot: 0,
      mx: 0,
      my: 0,
      mxS: 0,
      myS: 0,
      userYaw: 0,
      userPitch: 0,
      velYaw: 0,
      velPitch: 0,
      cxF: 0.62,
      cxT: 0.62,
      cyF: 0.47,
      cyT: 0.47,
      scF: 1,
      scT: 1,
      dimT: 0,
      dimF: 0,
      hover: -1,
      open: null,
      pointerCellX: -999,
      pointerCellY: -999,
      zoomF: 1,
      zoomT: 1,
      pulsePh: 0,
      pulseSp: 2.2,
      pulseSpT: 2.2,
      pulseAmp: 0.35,
      pulseAmpT: 0.35,
      gyro: false,
      pres: { kind: "none", text: "" },
    };
    const Rc = new Float64Array(9),
      Rr = new Float64Array(9),
      Tm = new Float64Array(9),
      Mm = new Float64Array(9);

    function setTargets() {
      const w = innerWidth;
      const mobile = w < 760;
      const narrow = w < 1000;
      if (st.open) {
        st.cxT = narrow ? 0.5 : 0.73;
        st.cyT = mobile ? 0.3 : 0.47;
        st.scT = narrow ? 0.8 : 0.8;
        st.dimT = narrow ? 1 : 0;
      } else {
        st.cxT = mobile ? 0.5 : narrow ? 0.55 : 0.63;
        st.cyT = mobile ? 0.34 : 0.46;
        st.scT = mobile ? 0.95 : 1;
        st.dimT = 0;
      }
    }

    /* ------------------------------------------------------------- the frame */
    const LX = -0.45,
      LY = -0.6,
      LZ = -0.66;
    const faceN = [0, 0, 0];
    function normal(ax, ay, az, bx, by, bz, cx, cy, cz) {
      const e1x = bx - ax,
        e1y = by - ay,
        e1z = bz - az,
        e2x = cx - ax,
        e2y = cy - ay,
        e2z = cz - az;
      let nx = e1y * e2z - e1z * e2y,
        ny = e1z * e2x - e1x * e2z,
        nz = e1x * e2y - e1y * e2x;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      if (nz > 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      faceN[0] = nx;
      faceN[1] = ny;
      faceN[2] = nz;
      const diff = Math.max(0, nx * LX + ny * LY + nz * LZ);
      const rim = 1 - Math.abs(nz);
      return 0.22 + diff * 0.62 + rim * rim * 0.28 + Math.pow(diff, 10) * 0.4;
    }

    function wavesLayer(t, k0) {
      const half = cols / 2;
      const span = Math.min(half - 2, cols < 90 ? 12 : 26);
      const tick = Math.floor(t * 3);
      const px = st.pointerCellX,
        py = st.pointerCellY;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const left = x < half;
          const e = left ? x : cols - 1 - x;
          if (e > span) continue;
          const k = e / span;
          const tt = left ? t : -t;
          const s = Math.sin(y * 0.11 - tt * 0.5 + e * 0.2 + (left ? 0 : 40));
          const hash =
            ((x * 73856093) ^ (y * 19349663) ^ (tick * 83492791)) >>> 0;
          const jitter = (hash % 100) / 100 - 0.5;
          let v =
            Math.sin(
              e * 0.45 + tt * 1.3 + Math.sin(y * 0.18 + tt * 0.6) * 2.2,
            ) +
            s * 0.7 +
            Math.sin((e + y) * 0.3 + tt * 0.9) * 0.5 +
            jitter * 0.6;
          const dx = x - px,
            dy = y - py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          v += Math.sin(dist * 0.9 - t * 4) * Math.max(0, 1 - dist / 16) * 1.4;
          let n = clamp((v + 2.2) / 4.4, 0, 1);
          n *= (1 - k * 0.8) * k0 * 0.85;
          const i = Math.floor(n * (NR - 1));
          if (!i) continue;
          const base =
            i > 9
              ? WHITE
              : Math.sin(e * 0.15 + y * 0.05 + t * 0.4) > 0
                ? BLUE
                : VIOLET;
          const lvl = i > 9 ? 3 : Math.round(clamp(n, 0, 1) * 3) - 0;
          put(x, y, 5000, RAMPI[i], rowOf(base, lvl - dimLvl), 0);
        }
      }
    }

    function render(dt) {
      const t = st.t;
      const boot = st.boot;
      const ease = (v) => 1 - Math.pow(1 - clamp(v, 0, 1), 3);

      zb.fill(1e9);
      cb.fill(0);
      ob.fill(0);

      // easing of layout/pointer
      const k = 1 - Math.exp(-dt * 5);
      st.cxF = lerp(st.cxF, st.cxT, k);
      st.cyF = lerp(st.cyF, st.cyT, k);
      st.scF = lerp(st.scF, st.scT, k);
      st.dimF = lerp(st.dimF, st.dimT, k);
      st.zoomF = lerp(st.zoomF, st.zoomT, k);
      st.pulseSp = lerp(st.pulseSp, st.pulseSpT, 1 - Math.exp(-dt * 1.5));
      st.pulseAmp = lerp(st.pulseAmp, st.pulseAmpT, 1 - Math.exp(-dt * 1.5));
      st.pulsePh += dt * st.pulseSp * st.timeScale;
      dimLvl = st.dimF > 0.5 ? 1 : 0;
      st.mxS = lerp(st.mxS, st.mx, 1 - Math.exp(-dt * 3));
      st.myS = lerp(st.myS, st.my, 1 - Math.exp(-dt * 3));
      st.userYaw += st.velYaw;
      st.userPitch = clamp(st.userPitch + st.velPitch, -1.2, 1.2);
      st.velYaw *= 0.94;
      st.velPitch *= 0.94;

      S = S0() * st.scF * st.zoomF;
      cxPx = Wpx * st.cxF;
      cyPx = Hpx * st.cyF + Math.sin(t * 0.5) * S * 0.04;

      /* blueprint grid */
      for (const p of gridPts) put(p[0], p[1], 9000, p[2], p[3], 0);
      const ng = Math.floor(t / 2.5);
      for (const [x, y, h] of gridNums) {
        const n = ((h >>> 3) + ng * ((h & 3) + 1) * ((h >>> 9) & 1)) % 100;
        putText(x, y, (n < 10 ? "0" : "") + n, rowOf(BLUE, 1), 8999);
      }

      /* wave.js edges */
      wavesLayer(t, ease(boot * 1.5));

      /* rotations */
      const yaw = t * 0.2 + st.userYaw + st.mxS * 0.55;
      const pitch =
        0.32 + st.userPitch + st.myS * 0.32 + Math.sin(t * 0.27) * 0.1;
      mat(yaw, pitch, Math.sin(t * 0.13) * 0.15, Rc);
      mat(
        st.userYaw * 0.3 + st.mxS * 0.22,
        -0.14 + st.myS * 0.16 + st.userPitch * 0.3,
        0,
        Rr,
      );

      /* dust */
      for (let i = 0; i < DUST; i++) {
        const d = dust[i];
        d.y -= d.s * dt * 0.5;
        if (d.y < -5.5) d.y = 5.5;
        xf(Rr, d.x, d.y, d.z);
        pj(vx, vy, vz);
        const near = clamp(1 - (vz + 4) / 8, 0, 1);
        const ch = near > 0.75 ? gi("*") : near > 0.45 ? gi(":") : gi(".");
        put(
          Math.round(pX),
          Math.round(pY),
          vz + 0.2,
          ch,
          rowFor(d.c, near * 0.9 + 0.15, vz),
          0,
        );
      }

      /* lattice */
      const latBoot = ease(boot * 1.6 - 0.2);
      if (latBoot > 0.01) {
        const lp = new Array(lat.V.length);
        for (let i = 0; i < lat.V.length; i++) {
          const q = lat.V[i];
          xf(
            Rc,
            q[0] * LAT_R * latBoot,
            q[1] * LAT_R * latBoot,
            q[2] * LAT_R * latBoot,
          );
          pj(vx, vy, vz);
          lp[i] = [pX, pY, vz];
        }
        for (const [a, b] of lat.E) {
          const A = lp[a],
            B = lp[b];
          line(
            A[0],
            A[1],
            A[2],
            B[0],
            B[1],
            B[2],
            rowOf(BLUE, 0 - dimLvl),
            0.2,
            0,
            true,
          );
        }
        for (let i = 0; i < lp.length; i++) {
          const P = lp[i];
          put(
            Math.round(P[0]),
            Math.round(P[1]),
            P[2] - 0.05,
            gi("+"),
            rowFor(i % 2 ? BLUE : VIOLET, 0.85, P[2]),
            0,
          );
        }
      }

      /* the knot */
      {
        const grow = ease(boot * 1.3);
        const m = Rc;
        const lim = Math.floor(KN * grow);
        const pulseT = st.pulsePh;
        for (let i = 0; i < lim; i++) {
          const i3 = i * 3;
          const nx = kNor[i3],
            ny = kNor[i3 + 1],
            nz = kNor[i3 + 2];
          const nzv = m[6] * nx + m[7] * ny + m[8] * nz;
          if (nzv > 0.22) continue; // facing away
          const x = kPos[i3],
            y = kPos[i3 + 1],
            z = kPos[i3 + 2];
          const zv = m[6] * x + m[7] * y + m[8] * z;
          const w = camD / (camD + zv);
          const cx = Math.round(
            (cxPx + (m[0] * x + m[1] * y + m[2] * z) * S * w) / cellW - 0.5,
          );
          const cy = Math.round(
            (cyPx + (m[3] * x + m[4] * y + m[5] * z) * S * w) / cellH - 0.5,
          );
          if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
          const idx = cy * cols + cx;
          if (zv >= zb[idx]) continue;
          const nxv = m[0] * nx + m[1] * ny + m[2] * nz,
            nyv = m[3] * nx + m[4] * ny + m[5] * nz;
          const diff = Math.max(0, nxv * LX + nyv * LY + nzv * LZ);
          const rim = 1 - Math.abs(nzv);
          const u = kU[i];
          const pulse = Math.pow(0.5 + 0.5 * Math.sin(u * 6 - pulseT), 6);
          let lum =
            0.2 +
            diff * 0.68 +
            rim * rim * 0.18 +
            Math.pow(diff, 14) * 0.3 +
            pulse * st.pulseAmp;
          if (kG[i]) lum *= 0.72;
          lum = clamp(lum, 0, 1);
          const ci = 2 + Math.round(lum * (NR - 3));
          const base = Math.sin(u * 3 + t * 0.4) > 0 ? BLUE : VIOLET;
          const r2 =
            ci > 9
              ? rowOf(WHITE, 3 - dimLvl)
              : rowFor(base, ci / (NR - 1) + 0.18, zv);
          zb[idx] = zv;
          cb[idx] = RAMPI[ci];
          rb[idx] = r2;
          ob[idx] = 0;
        }
      }

      /* orbiting shards */
      for (let pi = 0; pi < plates.length; pi++) {
        const p = plates[pi];
        const grow = ease((boot - 0.2 - p.delay * 0.5) / 0.5);
        if (grow <= 0.001) continue;
        const ph = p.phi + t * p.w;
        const co = Math.cos(ph) * p.rho,
          so = Math.sin(ph) * p.rho;
        // orbit plane tilted by inc around its node axis
        const ci = Math.cos(p.inc),
          si2 = Math.sin(p.inc);
        let ox_ = co,
          oy_ = so * si2,
          oz_ = so * ci;
        const cn = Math.cos(p.node),
          sn = Math.sin(p.node);
        const rx = ox_ * cn + oz_ * sn,
          rz = -ox_ * sn + oz_ * cn;
        ox_ = rx;
        oz_ = rz;
        mat(p.a0 + t * p.wa, p.b0 + t * p.wb, p.c0 + t * p.wc, p.T);
        const V = [],
          Vp = [];
        for (let k2 = 0; k2 < 3; k2++) {
          const lv = p.v[k2];
          xf(p.T, lv[0] * grow, lv[1] * grow, lv[2] * grow);
          xf(Rc, vx + ox_, vy + oy_, vz + oz_);
          V.push([vx, vy, vz]);
          pj(vx, vy, vz);
          Vp.push([pX, pY, vz]);
        }
        const lum = normal(
          V[0][0],
          V[0][1],
          V[0][2],
          V[1][0],
          V[1][1],
          V[1][2],
          V[2][0],
          V[2][1],
          V[2][2],
        );
        const l = clamp(lum * 0.9 + 0.1, 0, 1);
        tri(
          Vp[0][0],
          Vp[0][1],
          Vp[0][2],
          l,
          Vp[1][0],
          Vp[1][1],
          Vp[1][2],
          l,
          Vp[2][0],
          Vp[2][1],
          Vp[2][2],
          l,
          p.tint,
          0,
          p.hatch ? 1 : 0,
          p.seed,
        );
        const er = rowOf(p.tint, 2 - dimLvl);
        for (let e = 0; e < 3; e++) {
          const A = Vp[e],
            Bq = Vp[(e + 1) % 3];
          line(A[0], A[1], A[2], Bq[0], Bq[1], Bq[2], er, -0.06, 0, false);
        }
      }

      /* text rings */
      for (const rg of RINGS) {
        const target = st.hover === rg.i || st.open === rg.id ? 1 : 0;
        rg.focus = lerp(rg.focus, target, 1 - Math.exp(-dt * 8));
        rg.phase += rg.sp * dt * (1 + rg.focus * 3.5) * st.timeScale;
        mul(Rr, rg.T, ringMat);
        const reveal = ease((boot - 0.35 - rg.i * 0.06) / 0.5);
        if (reveal <= 0) continue;
        const n = rg.n;
        const lim = Math.floor(n * reveal);
        const dth = (2 * Math.PI) / n;
        const R = rg.R;
        const dimOthers = st.hover >= 0 || st.open ? 0.75 : 1;
        const head = Math.floor(t * 9 + rg.i * 37) % n;
        for (let j = 0; j < lim; j++) {
          const c = rg.chars[j];
          if (c === 0) continue;
          const th = rg.phase + j * dth;
          const lx = Math.cos(th) * R,
            lz = Math.sin(th) * R;
          xf(ringMat, lx, 0, lz);
          pj(vx, vy, vz);
          const near = clamp(1 - (vz + R) / (2 * R), 0, 1);
          let row;
          if (rg.focus > 0.5) row = rowOf(WHITE, near > 0.35 ? 3 : 2);
          else {
            const back = (head - j + n) % n; // distance behind the reading head
            if (back < 14) row = rowOf(WHITE, 3 - (back > 8 ? 1 : 0) - dimLvl);
            else
              row = rowFor(
                rg.base,
                (0.04 + near * 0.4) * (rg.focus * 0.4 + dimOthers),
                vz,
              );
          }
          if (j === 0 && reveal < 1) row = rowOf(AMBER, 3);
          put(Math.round(pX), Math.round(pY), vz + 2.2, c, row, rg.i + 1);
        }
      }

      drawMoon();
      presenceReadout();

      /* readouts + crosshair */
      if (cols >= 110) {
        const ccx = Math.round(cxPx / cellW),
          ccy = Math.round(cyPx / cellH);
        const hudRow = rowOf(BLUE, 2 - dimLvl);
        const deg = ((((yaw * 180) / Math.PI) % 360) + 360) % 360;
        const reach = Math.round((S0() * st.scF * 3.9) / cellW);
        const a = rowOf(AMBER, 2);
        putText(
          ccx + reach - 22 > cols - 26 ? cols - 26 : ccx + reach - 22,
          Math.max(2, ccy - Math.round(rows * 0.4)),
          `SYS.AUTH // knot(2,3) n=${KN}`,
          hudRow,
          -100,
        );
        putText(
          ccx - reach + 2 < 2 ? 2 : ccx - reach + 2,
          Math.min(rows - 3, ccy + Math.round(rows * 0.36)),
          `yaw ${deg.toFixed(1).padStart(5, " ")}  pitch ${(pitch * 57.2958).toFixed(1)}`,
          hudRow,
          -100,
        );
        putText(
          ccx - 3,
          ccy - Math.round(S * 0.0 + rows * 0.43),
          "[ + ]",
          a,
          -100,
        );
        if (st.open)
          putText(
            ccx - 4,
            ccy + Math.round(rows * 0.43),
            `//${st.open}`,
            a,
            -100,
          );
      }
    }

    /* ------------------------------------------------------ live presence */
    // main.js polls lanyard into #presence; the scene just reads what it wrote !
    const presEl = document.getElementById("presence");
    const PRES = {
      music: [3.6, 0.5],
      game: [2.8, 0.45],
      watch: [2.2, 0.4],
      online: [2.2, 0.35],
      busy: [1.8, 0.3],
      idle: [1.3, 0.2],
      offline: [0.7, 0.12],
      none: [2.2, 0.35],
    };
    function readPresence() {
      let kind = "none",
        text = "";
      if (presEl && !presEl.hidden) {
        const sv = presEl.dataset.s;
        const label = presEl.querySelector(".ptxt");
        text = label ? label.textContent.trim() : "";
        kind = /^listening to/.test(text)
          ? "music"
          : /^(playing|streaming|competing)/.test(text)
            ? "game"
            : /^watching/.test(text)
              ? "watch"
              : sv === "offline"
                ? "offline"
                : sv === "idle"
                  ? "idle"
                  : sv === "dnd"
                    ? "busy"
                    : "online";
      }
      st.pres = { kind, text };
      st.pulseSpT = PRES[kind][0];
      st.pulseAmpT = PRES[kind][1];
    }
    readPresence();
    setInterval(readPresence, 2000);

    function presenceReadout() {
      if (cols < 110 || st.pres.kind === "none") return;
      const reach = Math.round((S0() * st.scF * st.zoomF * 3.9) / cellW);
      const ccx = Math.round(cxPx / cellW),
        ccy = Math.round(cyPx / cellH);
      let txt =
        (st.pres.kind === "music" ? "NOW // " : "AUTH // ") + st.pres.text;
      txt = txt.replace(/[^\x20-\x7e]/g, "?");
      if (txt.length > 44) txt = txt.slice(0, 43) + "~";
      const x = Math.max(
        2,
        Math.min(cols - txt.length - 2, ccx + reach - txt.length),
      );
      const y = Math.min(rows - 3, ccy + Math.round(rows * 0.36) + 2);
      putText(x, y, txt, rowOf(AMBER, 2), -100);
    }

    /* ------------------------------------------------------------ the moon */
    const SYN = 29.530588853;
    const MOON_REF = Date.UTC(2000, 0, 6, 18, 14); // a known new moon
    function drawMoon() {
      if (cols < 120 || rows < 34) return;
      const age = ((((Date.now() - MOON_REF) / 86400000) % SYN) + SYN) % SYN;
      const th = (age / SYN) * Math.PI * 2;
      const sn = Math.sin(th),
        cs = Math.cos(th);
      const ry = 4,
        rx = Math.round((ry * cellH) / cellW);
      const mcx = Math.round(cols * 0.5),
        mcy = 6;
      for (let y = mcy - ry; y <= mcy + ry; y++)
        for (let x = mcx - rx; x <= mcx + rx; x++) {
          const dx = (x - mcx) / (rx + 0.4),
            dy = (y - mcy) / (ry + 0.3);
          const d2 = dx * dx + dy * dy;
          if (d2 >= 1) continue;
          const nz = Math.sqrt(1 - d2);
          const lum = dx * sn - nz * cs; // >0 = lit by the sun
          const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
          let c, r;
          if (lum > 0.04) {
            let i = 2 + Math.round(clamp(lum, 0, 1) * (NR - 3));
            if (h % 7 === 0) i = Math.max(2, i - 3); // craters
            c = RAMPI[i];
            r = i > 7 ? rowOf(WHITE, 3) : rowOf(WHITE, 2);
          } else {
            c = d2 > 0.78 ? gi(".") : gi(":");
            r = rowOf(VIOLET, 0);
          }
          put(x, y, -80, c, r, 0);
        }
      const pct = Math.round(((1 - cs) / 2) * 100);
      const label = `moon ${pct}%`;
      putText(
        mcx - (label.length >> 1),
        mcy + ry + 2,
        label,
        rowOf(BLUE, 1),
        -80,
      );
    }

    function present() {
      g.fillStyle = "#000";
      g.fillRect(0, 0, Wpx, Hpx);
      for (let y = 0; y < rows; y++) {
        const base = y * cols;
        const py = oy + y * cellH;
        for (let x = 0; x < cols; x++) {
          const c = cb[base + x];
          if (!c) continue;
          g.drawImage(
            atlas,
            c * cellW,
            rb[base + x] * cellH,
            cellW,
            cellH,
            ox + x * cellW,
            py,
            cellW,
            cellH,
          );
        }
      }
    }

    /* ---------------------------------------------------------------- loop */
    let last = 0,
      raf = 0,
      awakeUntil = 0;
    let slow = 0,
      laggy = 0;
    function frame(ms) {
      raf = requestAnimationFrame(frame);
      if (ms - last < 30) return;
      const dt = Math.min(0.1, (ms - last) / 1000);
      last = ms;
      if (reduce && ms > awakeUntil) return;
      const t0 = performance.now();
      st.t += dt * st.timeScale;
      st.timeScale = lerp(
        st.timeScale,
        st.paused || reduce ? 0 : 1,
        1 - Math.exp(-dt * 4),
      );
      st.boot = reduce
        ? 1
        : root.classList.contains("opening")
          ? 0
          : Math.min(1, st.boot + dt / 2.8); // wait for the intro
      render(dt);
      present();
      const cost = performance.now() - t0;
      slow = slow * 0.95 + cost * 0.05;
      if (slow > 30 && maxDpr > 1 && ++laggy > 40) {
        maxDpr = 1; // slow machine: render at css-pixel resolution
        layout();
      }
      if (slow <= 30) laggy = 0;
    }
    const wake = (ms = 1500) => {
      awakeUntil = performance.now() + ms;
    };

    if (!layout()) throw new Error("canvas has no size");
    setTargets();
    st.cxF = st.cxT;
    st.cyF = st.cyT;
    st.scF = st.scT;
    if (reduce) st.t = 4;
    wake(2500);
    raf = requestAnimationFrame(frame);

    let rz = 0;
    addEventListener("resize", () => {
      clearTimeout(rz);
      rz = setTimeout(() => {
        layout();
        setTargets();
        placePanels();
        wake();
      }, 80);
    });

    /* ------------------------------------------------------------- pointer */
    const toCell = (e) => {
      const r = canvas.getBoundingClientRect();
      return [
        Math.floor(((e.clientX - r.left) * dpr - ox) / cellW),
        Math.floor(((e.clientY - r.top) * dpr - oy) / cellH),
      ];
    };
    function ringAt(cx, cy) {
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx,
            y = cy + dy;
          if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
          const o = ob[y * cols + x];
          if (o) return o - 1;
        }
      return -1;
    }
    let drag = null;
    const ptrs = new Map();
    let pinchPrev = 0;
    addEventListener("pointermove", (e) => {
      if (!(st.gyro && e.pointerType === "touch")) {
        st.mx = (e.clientX / innerWidth - 0.5) * 2;
        st.my = (e.clientY / innerHeight - 0.5) * 2;
      }
      if (reduce) {
        st.mx = st.my = 0;
      }
      if (ptrs.has(e.pointerId)) {
        ptrs.set(e.pointerId, [e.clientX, e.clientY]);
        if (ptrs.size === 2) {
          // two fingers: pinch to zoom instead of rotating
          const [a, b] = [...ptrs.values()];
          const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
          if (pinchPrev)
            st.zoomT = clamp(st.zoomT * (dist / pinchPrev), 0.55, 1.7);
          pinchPrev = dist;
          drag = null;
          wake();
          return;
        }
      }
      const [cx, cy] = toCell(e);
      st.pointerCellX = cx;
      st.pointerCellY = cy;
      if (drag && drag.id === e.pointerId) {
        const dx = e.clientX - drag.x,
          dy = e.clientY - drag.y;
        drag.x = e.clientX;
        drag.y = e.clientY;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        st.velYaw = dx * 0.004;
        st.velPitch = dy * 0.004;
        st.userYaw += dx * 0.006;
        st.userPitch = clamp(st.userPitch + dy * 0.006, -1.2, 1.2);
      } else if (e.target === canvas) {
        const h = ringAt(cx, cy);
        if (h !== st.hover) {
          st.hover = h;
          ui.hover(h);
        }
      }
      wake();
    });
    canvas.addEventListener("pointerdown", (e) => {
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 2) {
        drag = null;
        pinchPrev = 0;
        return;
      }
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
      canvas.setPointerCapture(e.pointerId);
    });
    const endDrag = (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const was = drag;
      drag = null;
      if (was.moved < 6) {
        const [cx, cy] = toCell(e);
        const h = ringAt(cx, cy);
        if (h >= 0) ui.toggle(RINGS[h].id);
        else if (st.open) ui.close();
      }
    };
    const lift = (e) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinchPrev = 0;
    };
    canvas.addEventListener("pointerup", (e) => {
      lift(e);
      endDrag(e);
    });
    canvas.addEventListener("pointercancel", (e) => {
      lift(e);
      drag = null;
    });
    canvas.addEventListener(
      "wheel",
      (e) => {
        st.zoomT = clamp(st.zoomT * Math.exp(-e.deltaY * 0.0012), 0.55, 1.7);
        e.preventDefault();
        wake();
      },
      { passive: false },
    );

    // phones: tilt the device to tilt the scene (ios asks permission, and only on a tap)
    const coarse = matchMedia("(pointer: coarse)").matches;
    let gyroAsked = false;
    const onTilt = (e) => {
      if (e.gamma == null || e.beta == null || reduce) return;
      st.gyro = true;
      st.mx = clamp(e.gamma / 28, -1, 1);
      st.my = clamp((e.beta - 55) / 28, -1, 1);
      wake();
    };
    async function enableGyro() {
      if (gyroAsked || !coarse || reduce) return;
      gyroAsked = true;
      try {
        const D = window.DeviceOrientationEvent;
        if (
          D &&
          typeof D.requestPermission === "function" &&
          (await D.requestPermission()) !== "granted"
        )
          return;
        addEventListener("deviceorientation", onTilt);
      } catch (e) {}
    }
    canvas.addEventListener("click", enableGyro);
    if (
      coarse &&
      !(
        window.DeviceOrientationEvent &&
        typeof DeviceOrientationEvent.requestPermission === "function"
      )
    )
      enableGyro(); // android/others need no permission
    canvas.addEventListener("pointerleave", () => {
      if (st.hover !== -1) {
        st.hover = -1;
        ui.hover(-1);
      }
    });

    /* ------------------------------------------------------------------ ui */
    const IDS = [
      "rng",
      "linux",
      "wikipedia",
      "osm",
      "afield",
      "contact",
      "favsong",
    ];
    const panels = {};
    for (const id of IDS) {
      const el = document.getElementById(id);
      if (!el) continue;
      panels[id] = el;
      el.classList.add("panel");
      el.setAttribute("tabindex", "-1");
      el.setAttribute("role", "region");
      el.setAttribute("aria-label", id);
      const bar = document.createElement("div");
      bar.className = "pbar";
      bar.innerHTML =
        '<span class="ptitle"></span><span class="pfill"></span><button type="button" class="pclose" aria-label="close panel">[x]</button>';
      bar.querySelector(".ptitle").textContent = "~/" + id;
      bar.querySelector(".pclose").addEventListener("click", () => ui.close());
      el.prepend(bar);
    }
    const dockLinks = [...document.querySelectorAll(".dock a[data-panel]")];
    const stack = document.querySelector(".stack");
    const brand = document.querySelector(".brand");

    function placePanels() {
      const top = brand ? brand.getBoundingClientRect().bottom + 12 : 80;
      const dock = document.querySelector(".dock");
      const bottom = dock
        ? innerHeight - dock.getBoundingClientRect().top + 14
        : 150;
      const foot = document.querySelector(".foot");
      if (foot) root.style.setProperty("--foot-h", foot.offsetHeight + "px");
      root.style.setProperty("--panel-top", Math.round(top) + "px");
      root.style.setProperty("--panel-bottom", Math.round(bottom) + "px");
    }

    let closing = null;
    const ui = {
      hover(i) {
        dockLinks.forEach((a) =>
          a.classList.toggle("hl", RINGS[i] && a.dataset.panel === RINGS[i].id),
        );
        wake();
      },
      open(id, push = true) {
        if (!panels[id]) return;
        if (st.open === id) return;
        if (st.open) panels[st.open].classList.remove("open", "closing");
        clearTimeout(closing);
        st.open = id;
        placePanels();
        panels[id].classList.add("open");
        root.classList.add("panel-open");
        dockLinks.forEach((a) =>
          a.classList.toggle("on", a.dataset.panel === id),
        );
        document
          .querySelector(".orb[data-panel]")
          ?.classList.toggle("on", id === "favsong");
        setTargets();
        panels[id].scrollTop = 0;
        panels[id].focus({ preventScroll: true });
        if (push && location.hash !== "#" + id)
          history.pushState(null, "", "#" + id);
        wake(2500);
      },
      close(push = true) {
        if (!st.open) return;
        const id = st.open;
        const el = panels[id];
        st.open = null;
        el.classList.add("closing");
        closing = setTimeout(
          () => el.classList.remove("open", "closing"),
          reduce ? 0 : 180,
        );
        root.classList.remove("panel-open");
        dockLinks.forEach((a) => a.classList.remove("on"));
        document
          .querySelectorAll(".orb[data-panel]")
          .forEach((a) => a.classList.remove("on"));
        setTargets();
        if (push && location.hash)
          history.pushState(null, "", location.pathname + location.search);
        wake(2500);
      },
      toggle(id) {
        st.open === id ? ui.close() : ui.open(id);
      },
    };

    document.querySelectorAll("[data-panel]").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        ui.toggle(a.dataset.panel);
      });
      const ri = RINGS.findIndex((r) => r.id === a.dataset.panel);
      if (ri >= 0) {
        const on = () => {
          st.hover = ri;
          wake();
        };
        const off = () => {
          st.hover = -1;
          wake();
        };
        a.addEventListener("mouseenter", on);
        a.addEventListener("mouseleave", off);
        a.addEventListener("focus", on);
        a.addEventListener("blur", off);
      }
    });
    // the header nav still has a plain [contact] link
    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      const id = a.getAttribute("href").slice(1);
      if (panels[id] && !a.dataset.panel)
        a.addEventListener("click", (e) => {
          e.preventDefault();
          ui.open(id);
        });
    });

    const fromHash = () => {
      const id = location.hash.slice(1);
      if (panels[id]) ui.open(id, false);
      else if (st.open) ui.close(false);
    };
    addEventListener("hashchange", fromHash);
    addEventListener("popstate", fromHash);

    addEventListener("keydown", (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target && e.target.tagName) || "";
      if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
      if (document.querySelector(".you:not([hidden])")) return;
      if (e.key === "Escape") ui.close();
      else if (/^[1-6]$/.test(e.key)) ui.toggle(IDS[+e.key - 1]);
      else if (e.key === "7" || e.key === "m") ui.toggle("favsong");
      else if (e.key === " " && e.target === document.body) {
        e.preventDefault();
        togglePause();
      }
    });

    const pauseBtn = document.getElementById("pause-btn");
    function togglePause() {
      st.paused = !st.paused;
      if (pauseBtn) {
        pauseBtn.textContent = st.paused ? "▶" : "||";
        pauseBtn.setAttribute("aria-pressed", String(st.paused));
        pauseBtn.title = st.paused ? "resume scene" : "pause scene";
      }
      wake();
    }
    if (pauseBtn) pauseBtn.addEventListener("click", togglePause);

    /* little text scramble for the headline + brand */
    function scramble(el, ms) {
      if (!el || reduce) return;
      const final = el.textContent;
      const pool = "#%*+=-~:;,.";
      const t0 = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / ms);
        let out = "";
        for (let i = 0; i < final.length; i++)
          out +=
            final[i] === " " || i < final.length * p * 1.15
              ? final[i]
              : pool[(Math.random() * pool.length) | 0];
        el.textContent = p < 1 ? out : final;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
    scramble(document.querySelector(".brand .mark"), 900);
    scramble(document.querySelector(".home-text h1"), 1300);

    setInterval(
      () => {
        applyTimeTint();
        buildAtlas();
        wake();
      },
      10 * 60 * 1000,
    );

    placePanels();
    requestAnimationFrame(placePanels);
    fromHash();
    document.fonts &&
      document.fonts.ready &&
      document.fonts.ready.then(placePanels);
    window.__hero = {
      st,
      ui,
      layout,
      perf: () => slow,
      size: () => [cols, rows],
    }; // handy for poking in devtools
  }
})();

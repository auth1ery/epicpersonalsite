import * as THREE from "./imported/three.module.js";

const root = document.documentElement;
// ---------------------------------------------------------------- helpers
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const easeInOutCubic = (x) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const easeOutBack = (x) => {
  const c1 = 1.2,
    c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

// hand the page back: drop the html.opening gate, fade the black overlay away
function leave(overlay, instant) {
  try {
    sessionStorage.setItem("opening-seen", "1");
  } catch (e) {}
  root.classList.remove("opening");
  if (!overlay) return;
  if (instant) {
    overlay.remove();
    return;
  }
  overlay.style.transition = "opacity 1.6s ease";
  overlay.style.pointerEvents = "none";
  requestAnimationFrame(() => (overlay.style.opacity = "0"));
  setTimeout(() => overlay.remove(), 1800);
}

function labelTexture() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 320;
  const g = c.getContext("2d");
  g.fillStyle = "#f2eee4";
  g.fillRect(0, 0, 512, 320);
  g.strokeStyle = "#1a1a1a";
  g.lineWidth = 6;
  g.strokeRect(10, 10, 492, 300);
  g.fillStyle = "#111";
  g.font = "bold 70px monospace";
  g.fillText("FRAGILE", 34, 96);
  g.font = "28px monospace";
  g.fillText("contents: one (1) auth", 34, 146);
  g.fillText("this side up  ^ ^", 34, 186);
  for (let x = 34, i = 0; x < 478; i++) {
    const w = 2 + ((i * 7) % 5);
    g.fillRect(x, 220, w, 64);
    x += w + 3 + ((i * 3) % 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeGrid(size, step, color, opacity, y) {
  // lines are cut into short pieces: three.js fogs per vertex, so one long
  // line running away from the camera would be black end to end
  const pts = [];
  const n = Math.round(size / step);
  const seg = step * 2;
  for (let i = -n; i <= n; i++) {
    const p = i * step;
    for (let a = -size; a < size; a += seg) {
      pts.push(a, 0, p, a + seg, 0, p, p, 0, a, p, 0, a + seg);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  const m = new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  );
  m.position.y = y;
  return m;
}

// ------------------------------------------------------------------- main
function run() {
  // overlay (inline styles + !important: hero.css makes everything transparent)
  const ov = document.createElement("div");
  ov.id = "opening";
  ov.setAttribute("role", "dialog");
  ov.setAttribute("aria-label", "intro");
  ov.style.cssText =
    "position:fixed;inset:0;z-index:99999;background:#000!important;overflow:hidden;visibility:visible;opacity:1;touch-action:none";
  document.body.append(ov);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
  } catch (e) {
    leave(ov, true); // no webgl: just show the site
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x000000, 1);
  renderer.domElement.style.cssText =
    "display:block;width:100%;height:100%;background:#000!important";
  ov.append(renderer.domElement);

  const ui = (css, text) => {
    const d = document.createElement("div");
    d.style.cssText =
      "position:absolute;font:14px/1.4 monospace;color:#69f!important;background:transparent!important;letter-spacing:.12em;user-select:none;" +
      css;
    d.textContent = text;
    ov.append(d);
    return d;
  };
  const hint = ui(
    "left:0;right:0;bottom:9vh;text-align:center;transition:opacity .6s;",
    "[ click the package ]",
  );
  const skip = ui(
    "right:18px;bottom:16px;cursor:pointer;opacity:.6;padding:.2em .6em;border:1px solid #69f;",
    "skip >>",
  );
  skip.setAttribute("role", "button");
  skip.tabIndex = 0;

  // --------------------------------------------------------------- scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x000000, 0.045);

  const camera = new THREE.PerspectiveCamera(
    45,
    innerWidth / innerHeight,
    0.05,
    200,
  );
  const CAM0 = new THREE.Vector3(0, 0.9, 6.4);
  camera.position.copy(CAM0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(3, 5, 4);
  scene.add(sun);
  const blue = new THREE.PointLight(0x6699ff, 45, 22);
  blue.position.set(-4, 1, 3);
  const violet = new THREE.PointLight(0xaa55ff, 45, 22);
  violet.position.set(4, -1, 2);
  scene.add(blue, violet);

  const floor = makeGrid(80, 2, 0x7aa6ff, 1, -2.3);
  const ceil = makeGrid(80, 2, 0xaa55ff, 0.6, 5.2);
  scene.add(floor, ceil);

  // ---------------------------------------------------------- the package
  const W = 2.2,
    H = 1.5,
    D = 1.8;
  const pack = new THREE.Group();
  scene.add(pack);

  const card = new THREE.MeshStandardMaterial({
    color: 0xc19a63,
    roughness: 0.85,
  });
  const cardTwo = new THREE.MeshStandardMaterial({
    color: 0xb08850,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  const black = new THREE.MeshBasicMaterial({
    color: 0x000000,
    side: THREE.BackSide,
    fog: false,
  });

  // five walls, brown outside, pure black inside
  const wall = (w, h, x, y, z, rx, ry) => {
    const geo = new THREE.PlaneGeometry(w, h);
    const outer = new THREE.Mesh(geo, card);
    const inner = new THREE.Mesh(geo, black);
    for (const m of [outer, inner]) {
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, 0);
      pack.add(m);
    }
    return outer;
  };
  const front = wall(W, H, 0, 0, D / 2, 0, 0);
  wall(W, H, 0, 0, -D / 2, 0, Math.PI);
  wall(D, H, W / 2, 0, 0, 0, Math.PI / 2);
  wall(D, H, -W / 2, 0, 0, 0, -Math.PI / 2);
  wall(W, D, 0, -H / 2, 0, Math.PI / 2, 0);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, D)),
    new THREE.LineBasicMaterial({
      color: 0x6699ff,
      transparent: true,
      opacity: 0.35,
    }),
  );
  pack.add(edges);

  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.69),
    new THREE.MeshStandardMaterial({ map: labelTexture(), roughness: 0.6 }),
  );
  label.position.set(0.35, -0.15, D / 2 + 0.004);
  label.rotation.z = -0.04;
  pack.add(label);

  // flaps: pivots on the top edges
  const flap = (len, span, geoShift, px, pz, axis, sign, lift) => {
    const geo = new THREE.PlaneGeometry(
      axis === "x" ? span : len,
      axis === "x" ? len : span,
    );
    geo.rotateX(-Math.PI / 2);
    geo.translate(geoShift[0], 0, geoShift[1]);
    const mesh = new THREE.Mesh(geo, cardTwo);
    const pivot = new THREE.Group();
    pivot.position.set(px, H / 2 + lift, pz);
    pivot.add(mesh);
    pack.add(pivot);
    return { pivot, axis, sign };
  };
  const flaps = [
    flap(D / 2, W, [0, -D / 4], 0, D / 2, "x", +1, 0.01), // front
    flap(D / 2, W, [0, D / 4], 0, -D / 2, "x", -1, 0.01), // back
    flap(W / 2, D, [-W / 4, 0], W / 2, 0, "z", -1, 0), // right
    flap(W / 2, D, [W / 4, 0], -W / 2, 0, "z", +1, 0), // left
  ];

  const tape = new THREE.Mesh(
    new THREE.PlaneGeometry(W + 0.02, 0.3).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({
      color: 0xdcc58a,
      roughness: 0.35,
      side: THREE.DoubleSide,
    }),
  );
  tape.position.y = H / 2 + 0.025;
  pack.add(tape);

  // ---------------------------------------------------------------- audio
  let audio = null;
  try {
    audio = new Audio(new URL("./assets/audio/misplace.mp3", import.meta.url).href);
    audio.preload = "auto";
    window.openingAudio = audio; // so the rest of the site can mute/stop it
  } catch (e) {}

  // ---------------------------------------------------------------- state
  let phase = "idle"; // idle -> opening -> leaving
  let tClick = 0;
  let yaw = 0.5,
    yawFrom = 0,
    yawTo = 0;
  const mouse = { x: 0, y: 0 };
  let hover = false;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hitMeshes = [];
  pack.traverse((o) => o.isMesh && hitMeshes.push(o));

  function pick(e) {
    ndc.set(
      (e.clientX / innerWidth) * 2 - 1,
      -(e.clientY / innerHeight) * 2 + 1,
    );
    ray.setFromCamera(ndc, camera);
    return ray.intersectObjects(hitMeshes, false).length > 0;
  }

  const onMove = (e) => {
    mouse.x = (e.clientX / innerWidth - 0.5) * 2;
    mouse.y = (e.clientY / innerHeight - 0.5) * 2;
    if (phase !== "idle") return;
    const h = pick(e);
    if (h !== hover) {
      hover = h;
      renderer.domElement.style.cursor = h ? "pointer" : "";
    }
  };
  const onDown = (e) => {
    if (phase === "idle" && pick(e)) open();
  };
  const onKey = (e) => {
    if (e.key === "Escape") finish(true);
    else if ((e.key === "Enter" || e.key === " ") && phase === "idle") {
      e.preventDefault();
      open();
    }
  };
  const onResize = () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  addEventListener("pointermove", onMove);
  renderer.domElement.addEventListener("pointerdown", onDown);
  addEventListener("keydown", onKey);
  addEventListener("resize", onResize);
  skip.addEventListener("click", () => finish(true));
  skip.addEventListener(
    "keydown",
    (e) => (e.key === "Enter" || e.key === " ") && finish(true),
  );

  function open() {
    phase = "opening";
    tClick = clock.getElapsedTime();
    yawFrom = yaw;
    yawTo = Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2); // square up to the camera
    hint.style.opacity = "0";
    skip.style.opacity = "0";
    skip.style.pointerEvents = "none";
    renderer.domElement.style.cursor = "";
    if (audio) audio.play().catch(() => {}); // the click is the user gesture that allows this
  }

  let ended = false;
  function finish(skipped) {
    if (ended) return;
    ended = true;
    phase = "leaving";
    removeEventListener("pointermove", onMove);
    removeEventListener("keydown", onKey);
    removeEventListener("resize", onResize);
    leave(ov, false);
    // keep drawing black frames while the overlay fades, then free the gpu
    setTimeout(() => {
      cancelAnimationFrame(raf);
      renderer.dispose();
    }, 1900);
  }

  // ---------------------------------------------------------------- loop
  const clock = new THREE.Clock();
  let raf = 0;
  const P0 = CAM0,
    P1 = new THREE.Vector3(0, 4.2, 1.2),
    P2 = new THREE.Vector3(0, -0.2, 0);
  const L0 = new THREE.Vector3(0, 0, 0),
    L1 = new THREE.Vector3(0, 0.4, 0),
    L2 = new THREE.Vector3(0, -3, -0.6);
  const bez = (a, b, c, e, out) => {
    const i = 1 - e;
    return out.set(
      i * i * a.x + 2 * i * e * b.x + e * e * c.x,
      i * i * a.y + 2 * i * e * b.y + e * e * c.y,
      i * i * a.z + 2 * i * e * b.z + e * e * c.z,
    );
  };
  const look = new THREE.Vector3();
  let last = 0;

  function frame() {
    raf = requestAnimationFrame(frame);
    const t = clock.getElapsedTime();
    const dt = Math.min(0.1, t - last);
    last = t;

    // the grid slides toward the camera forever
    floor.position.z = (t * 1.8) % 2;
    floor.position.x = (t * 0.35) % 2;
    ceil.position.z = (-t * 1.2) % 2;

    const tt = phase === "idle" ? 0 : t - tClick;

    if (phase === "idle") {
      yaw += dt * 0.28;
      pack.position.y = Math.sin(t * 1.1) * 0.09;
      pack.rotation.set(
        Math.sin(t * 0.7) * 0.06,
        yaw,
        Math.sin(t * 0.9) * 0.03,
      );
      const k = hover ? 1 : 0;
      card.emissive.setRGB(0.1 * k, 0.14 * k, 0.28 * k);
      camera.position.set(
        CAM0.x + mouse.x * 0.45,
        CAM0.y - mouse.y * 0.25,
        CAM0.z,
      );
      camera.lookAt(0, 0, 0);
      hint.style.opacity = String(0.55 + 0.45 * Math.sin(t * 3));
    } else {
      // box: square up, shake while the tape rips, then the flaps swing open
      const sq = easeOutCubic(clamp(tt / 0.8));
      const shake = tt < 0.5 ? (0.5 - tt) * 0.06 : 0;
      pack.position.set(
        (Math.random() - 0.5) * shake,
        Math.sin(t * 1.1) * 0.09 * (1 - sq),
        (Math.random() - 0.5) * shake,
      );
      pack.rotation.set(0.06 * (1 - sq), yawFrom + (yawTo - yawFrom) * sq, 0);
      card.emissive.setRGB(0.05, 0.07, 0.14);

      tape.scale.x = 1 - easeOutCubic(clamp(tt / 0.3));
      tape.visible = tape.scale.x > 0.01;
      const open = easeOutBack(clamp((tt - 0.25) / 1.1));
      const open2 = easeOutBack(clamp((tt - 0.4) / 1.1));
      const ang = 2.4;
      flaps[0].pivot.rotation.x = ang * open;
      flaps[1].pivot.rotation.x = -ang * open;
      flaps[2].pivot.rotation.z = -ang * open2;
      flaps[3].pivot.rotation.z = ang * open2;

      // camera: up and over the opening, then straight down into the dark
      const u = clamp((tt - 1.0) / 3.2);
      const e = easeInOutCubic(u);
      bez(P0, P1, P2, e, camera.position);
      bez(L0, L1, L2, e, look);
      camera.lookAt(look);

      if (phase === "opening" && tt > 4.5) finish(false);
    }
    renderer.render(scene, camera);
  }
  frame();
}

if (root.classList.contains("opening")) {
  try {
    run();
  } catch (e) {
    console.error("opening:", e);
    leave(document.getElementById("opening"), true);
  }
}

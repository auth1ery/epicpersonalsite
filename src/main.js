(function () {
  const canvas = document.getElementById("fractal");
  const gl =
    canvas.getContext("webgl", { antialias: false, alpha: false }) ||
    canvas.getContext("experimental-webgl");
  if (!gl) {
    document.getElementById("fractal").style.display = "none";
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

      vec3 palette(float t){
        t = clamp(t, 0.0, 1.0);
        float r = pow(t, 1.7);
        float g = pow(t, 1.3);
        float b = 0.42 + 0.58 * t;
        return vec3(r, g, b);
      }

      void main(){
        vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
        vec2 c = u_center + uv * u_span;
        vec2 z = vec2(0.0);
        const int MAX_ITER = 260;
        int iter = 0;
        bool escaped = false;
        for(int i = 0; i < MAX_ITER; i++){
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
          float t = (smoothIter / float(MAX_ITER)) * 3.1;
          col = palette(t);
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

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    window.addEventListener("resize", resize);
    resize();

    // [cx, cy, span]
    const stops = [
      [-0.5, 0.0, 1.6], // hero full set
      [-0.745, 0.113, 0.09], // seahorse valley
      [0.2732, -0.0068, 0.018], // elephant valley
      [-0.7453, 0.1127, 0.004], // spiral valley
      [-0.09, 0.826, 0.012], // triple spiral
      [-1.749, 0.0, 0.0016], // deep minibrot
    ];

    let current = { cx: stops[0][0], cy: stops[0][1], span: stops[0][2] };

    function lerp(a, b, t) {
      return a + (b - a) * t;
    }
    function ease(t) {
      return t * t * (3 - 2 * t);
    }

    function getTarget() {
      const sections = document.querySelectorAll("main section");
      const scrollY = window.scrollY;
      const vh = window.innerHeight;
      const total = document.body.scrollHeight - vh;
      let progress = total > 0 ? scrollY / total : 0;
      progress = Math.max(0, Math.min(1, progress));
      const segCount = stops.length - 1;
      const segF = progress * segCount;
      let idx = Math.floor(segF);
      if (idx >= segCount) idx = segCount - 1;
      let t = segF - idx;
      t = ease(Math.max(0, Math.min(1, t)));
      const a = stops[idx],
        b = stops[idx + 1];
      return {
        cx: lerp(a[0], b[0], t),
        cy: lerp(a[1], b[1], t),
        span: Math.exp(lerp(Math.log(a[2]), Math.log(b[2]), t)),
        segIndex: idx,
        segT: t,
      };
    }

    function render() {
      const target = getTarget();
      const smooth = 0.09;
      current.cx += (target.cx - current.cx) * smooth;
      current.cy += (target.cy - current.cy) * smooth;
      current.span *= Math.pow(target.span / current.span, smooth);

      gl.uniform2f(u_res, canvas.width, canvas.height);
      gl.uniform2f(u_center, current.cx, current.cy);
      gl.uniform1f(u_span, current.span);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      updateNav(target.segIndex, target.segT);
      requestAnimationFrame(render);
    }

    function updateNav(idx, t) {
      const activeIdx = t > 0.5 ? idx + 1 : idx;
      const btns = window.railBtnsExport || [];
      btns.forEach((b, i) => b.classList.toggle("active", i === activeIdx));
      const cue = document.getElementById("cue");
      if (cue) cue.style.opacity = window.scrollY > 40 ? "0" : "1";
    }

    requestAnimationFrame(render);
  }

  // nav rail dots
  const sectionIds = [
    "s-hero",
    "s-rng",
    "s-asterisk",
    "s-cupcake",
    "s-systems",
    "s-contact",
  ];
  const rail = document.getElementById("rail");
  const btns = sectionIds.map((id, i) => {
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

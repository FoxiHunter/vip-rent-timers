let cvs = document.getElementById("snowCanvas");
if (!cvs) {
  cvs = document.createElement("canvas");
  cvs.id = "snowCanvas";
  document.body.prepend(cvs);
}
const ctx = cvs.getContext("2d", { alpha: true });

let W = 0, H = 0, R = 1;
let flakes = [];
let raf = 0;
let running = false;
let last = 0;
let windPhase = 0;

const PI2 = Math.PI * 2;
const rdm = Math.random;
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const dpr = () => ("devicePixelRatio" in window ? Math.min(window.devicePixelRatio, 2) : 1);

const prm = { density: 1, size: 1, color: "rgba(255,255,255,.75)", speed: 1 };

function readCSS() {
  const cs = getComputedStyle(document.documentElement);
  prm.density = parseFloat(cs.getPropertyValue("--snow-density") || "1") || 1;
  prm.size = parseFloat(cs.getPropertyValue("--snow-size") || "1") || 1;
  prm.color = cs.getPropertyValue("--snow-color") || "rgba(255,255,255,.75)";
  prm.speed = parseFloat(cs.getPropertyValue("--snow-speed") || "1") || 1;
}

function size() {
  W = window.innerWidth; H = window.innerHeight; R = dpr();
  cvs.width = W * R; cvs.height = H * R;
  cvs.style.width = W + "px"; cvs.style.height = H + "px";
  ctx.setTransform(R, 0, 0, R, 0, 0);
}

function makeFlakes() {
  readCSS();
  const base = Math.max(80, Math.min(420, Math.floor((W * H) / 16000)));
  const count = Math.floor(base * prm.density * (reduced ? 0.4 : 1));
  flakes = new Array(count).fill(0).map(() => ({
    x: rdm() * W,
    y: rdm() * H,
    r: (rdm() * 1.6 + 0.6) * prm.size,
    s: rdm() * 0.8 + 0.2,
    o: rdm() * 0.6 + 0.2,
    d: rdm() * PI2
  }));
}

function step(t) {
  if (!running) return;
  if (!last) last = t;
  let dt = t - last;
  last = t;
  if (dt > 80) dt = 16;
  const sp = prm.speed * (reduced ? 0.6 : 1);
  windPhase += dt * 0.00025 * sp;

  ctx.clearRect(0, 0, W, H);
  const wind = Math.sin(windPhase) * 0.35 * sp;
  ctx.fillStyle = prm.color.trim() || "rgba(255,255,255,.75)";

  for (let i = 0; i < flakes.length; i++) {
    const f = flakes[i];
    f.y += f.s * (0.8 + f.r * 0.35) * dt * 0.06 * sp;
    f.x += Math.sin(f.d + windPhase * 1.6) * (0.3 + f.r * 0.2) + wind;
    if (f.y > H + 8) { f.y = -10; f.x = rdm() * W; }
    if (f.x < -10) f.x = W + 8; else if (f.x > W + 10) f.x = -8;
    ctx.globalAlpha = f.o;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, PI2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  raf = requestAnimationFrame(step);
}

function start() {
  if (running) return;
  running = true;
  last = 0;
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(step);
}

function stop() {
  running = false;
  cancelAnimationFrame(raf);
  raf = 0;
  last = 0;
}

function init() {
  size();
  makeFlakes();
  if (!reduced) start();
  else {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = prm.color;
    for (const f of flakes) {
      ctx.globalAlpha = f.o;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, PI2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

window.SNOW = {
  set(v = {}) {
    if (typeof v.density === "number") document.documentElement.style.setProperty("--snow-density", String(v.density));
    if (typeof v.size === "number") document.documentElement.style.setProperty("--snow-size", String(v.size));
    if (typeof v.color === "string") document.documentElement.style.setProperty("--snow-color", v.color);
    if (typeof v.speed === "number") document.documentElement.style.setProperty("--snow-speed", String(v.speed));
    size(); makeFlakes();
  },
  start, stop
};

window.addEventListener("resize", () => { size(); makeFlakes(); });
document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else start(); });

init();

"use strict";

/* ============================================================
   Chroma — a calm, full-screen color field.
   Two modes:
     solid    — one color holds, then slowly crossfades to the next
     gradient — a soft multi-color field that drifts continuously
   Colors are built in OKLCH so every in-between stays clean and
   luminous (RGB blending would pass through muddy grays).
   ============================================================ */

/* ---------- Palettes ----------
   L = lightness (0..1), C = chroma (0 = gray), hues = which arc of the wheel */
const PALETTES = {
  soft:  { name: "Soft",  L: [0.87, 0.93], C: [0.035, 0.075], hues: "full" },
  vivid: { name: "Vivid", L: [0.60, 0.72], C: [0.150, 0.230], hues: "full" },
  blend: { name: "Blend", L: [0.66, 0.92], C: [0.050, 0.210], hues: "full" },
  warm:  { name: "Warm",  L: [0.72, 0.88], C: [0.090, 0.170], hues: "warm" },
  cool:  { name: "Cool",  L: [0.70, 0.86], C: [0.090, 0.170], hues: "cool" },
};
const TIMERS = [0, 5, 10, 20, 30]; // minutes; 0 = off
const MODES = [
  { key: "solid",     label: "Solid" },
  { key: "gradient",  label: "Gradient" },
  { key: "breathing", label: "Breathing" },
  { key: "rainbow",   label: "Rainbow" },
];

/* ---------- Settings (persisted) ---------- */
const DEFAULTS = { mode: "solid", palette: "blend", pace: 45, bright: 100, timer: 0 };
let state = load();

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem("chroma") || "{}") }; }
  catch { return { ...DEFAULTS }; }
}
function save() { localStorage.setItem("chroma", JSON.stringify(state)); }

/* ---------- Color helpers ---------- */
const OK = window.CSS && CSS.supports && CSS.supports("color", "oklch(0.7 0.1 30)");
const lerp = (a, b, f) => a + (b - a) * f;
const wrapHue = (h) => ((h % 360) + 360) % 360;
const shortHue = (a, b) => (((b - a + 540) % 360) - 180); // signed shortest delta

function hueArc(kind) {
  if (kind === "warm") return [-25, 115];  // reds → oranges → yellows (wraps past 0)
  if (kind === "cool") return [135, 300];  // greens → cyans → blues → violets
  return [0, 360];
}
function colorStr(c) {
  if (OK) return `oklch(${c.L.toFixed(4)} ${c.C.toFixed(4)} ${wrapHue(c.h).toFixed(2)})`;
  const s = Math.round(Math.min(1, c.C / 0.25) * 80);       // rough HSL fallback
  return `hsl(${wrapHue(c.h).toFixed(0)} ${s}% ${Math.round(c.L * 100)}%)`;
}
function pal() { return PALETTES[state.palette]; }

// Even, non-repeating spread of colors within the palette (for Solid mode steps).
function stepColor(p, i) {
  const [a, b] = hueArc(p.hues);
  const t = (i * 0.6180339887) % 1;                          // golden-ratio spread
  const h = a + t * (b - a);
  const L = lerp(p.L[0], p.L[1], (Math.sin(i * 1.7) + 1) / 2);
  const C = lerp(p.C[0], p.C[1], (Math.cos(i * 1.1) + 1) / 2);
  return { L, C, h };
}

// Seconds-per-color, exponential so the slider has fine control at the fast end.
// pace 0 → 2s, pace 100 → 90s (also sets the speed of the moving modes).
function holdSeconds() { return 2 * Math.pow(45, state.pace / 100); }
function transSeconds() { return Math.min(6, holdSeconds() * 0.3); }

/* ---------- DOM ---------- */
const $ = (s) => document.querySelector(s);
const stage = $("#stage"), dim = $("#dim"), controls = $("#controls"), hint = $("#hint");
const countdownEl = $("#countdown"), doneEl = $("#done");

/* ---------- Render loop ---------- */
let raf = null, lastNow = null, elapsed = 0;
let cur = null, tgt = null, stepIndex = 0, nextChangeAt = 0;
let sessionEndAt = null, finished = false;

function resetSolid() {
  stepIndex = 0;
  tgt = stepColor(pal(), 0);
  if (!cur) cur = { ...tgt };
  nextChangeAt = elapsed + holdSeconds() + transSeconds();
}

function stepSolid(dt) {
  if (elapsed >= nextChangeAt) {
    stepIndex++;
    tgt = stepColor(pal(), stepIndex);
    nextChangeAt = elapsed + holdSeconds() + transSeconds();
  }
  const tau = Math.max(0.4, transSeconds() / 3);
  const k = 1 - Math.exp(-dt / tau);                          // smooth ease toward target
  cur = {
    L: cur.L + (tgt.L - cur.L) * k,
    C: cur.C + (tgt.C - cur.C) * k,
    h: cur.h + shortHue(cur.h, tgt.h) * k,
  };
  stage.style.background = colorStr(cur);
}

// Horizontal band of soft palette colors that slowly drift.
function stepGradient() {
  const p = pal(), stops = 4, [a, b] = hueArc(p.hues);
  const center = (a + b) / 2, half = (b - a) / 2, full = p.hues === "full";
  const parts = [];
  for (let k = 0; k < stops; k++) {
    const h = full
      ? (k / stops) * 360 + elapsed * (360 / (holdSeconds() * 8))
      : center + Math.sin(elapsed / holdSeconds() + k * 1.3) * half;
    const L = lerp(p.L[0], p.L[1], (Math.sin(elapsed * 0.05 + k * 1.5) + 1) / 2);
    const C = lerp(p.C[0], p.C[1], (Math.cos(elapsed * 0.04 + k * 1.1) + 1) / 2);
    parts.push(`${colorStr({ L, C, h })} ${(k / (stops - 1)) * 100}%`);
  }
  stage.style.background = `linear-gradient(180deg, ${parts.join(", ")})`;
}

// A soft glow that expands and contracts at a calm breathing rhythm.
function stepBreathing() {
  const p = pal(), [a, b] = hueArc(p.hues), full = p.hues === "full";
  const h = full ? elapsed * (360 / (holdSeconds() * 10))
                 : (a + b) / 2 + Math.sin(elapsed / holdSeconds()) * (b - a) / 2;
  const L = lerp(p.L[0], p.L[1], 0.55), C = lerp(p.C[0], p.C[1], 0.7);
  const glow = colorStr({ L, C, h });
  const dark = colorStr({ L: Math.max(0.1, L - 0.4), C: C * 0.5, h });
  const cycle = Math.max(6, Math.min(16, holdSeconds()));     // seconds per breath
  const b01 = (Math.sin(elapsed * 2 * Math.PI / cycle - Math.PI / 2) + 1) / 2;
  const size = 38 + b01 * 78;                                  // inhale = fills screen
  stage.style.background = `radial-gradient(circle at 50% 50%, ${glow}, ${dark} ${size.toFixed(1)}%)`;
}

// Rainbow anchors are built from the chosen palette. HSL keeps yellow naturally
// bright and blue mid-toned (unlike fixed-lightness OKLCH), and each palette
// picks its own saturation/lightness so Soft = pastel, Vivid = saturated, etc.
const RB_SL = {
  soft:  { s: 55, l: 80 },
  vivid: { s: 95, l: 52 },
  blend: { s: 78, l: 63 },
  warm:  { s: 85, l: 58 },
  cool:  { s: 80, l: 58 },
};
function rainbowColors(key) {
  const p = PALETTES[key], sl = RB_SL[key] || RB_SL.blend;
  const [a, b] = hueArc(p.hues), full = p.hues === "full";
  const hsl = (h) => `hsl(${wrapHue(h).toFixed(0)} ${sl.s}% ${sl.l}%)`;
  if (full) {                                   // full wheel: a clean 7-hue loop
    const cols = [];
    for (let i = 0; i < 7; i++) cols.push(hsl((i / 7) * 360));
    return cols;
  }
  // restricted arc (warm/cool): go there and back so the seamless loop never
  // crosses into the opposite (missing) side of the color wheel.
  const N = 6, up = [];
  for (let i = 0; i < N; i++) up.push(hsl(a + (i / (N - 1)) * (b - a)));
  return up.concat(up.slice(1, -1).reverse());
}

// Interpolate blends in OKLCH (vivid) when supported, else plain sRGB.
const OKGRAD = !!(window.CSS && CSS.supports &&
  CSS.supports("background-image", "linear-gradient(90deg in oklch, red, blue)"));

// Equal-width color bands: each color gets a wide flat plateau with a soft blend
// between. The first color is repeated at 100% so the pattern tiles seamlessly.
function bandedGradient(colors, soft) {
  const seq = colors.concat([colors[0]]);
  const band = 100 / (seq.length - 1);
  const plateau = band / 2 * (1 - soft);      // flat part; `soft` (0..1) = blend amount
  const stops = [];
  seq.forEach((c, i) => {
    const center = i * band;
    const a = Math.max(0, center - plateau), b = Math.min(100, center + plateau);
    stops.push(`${c} ${a.toFixed(2)}%`, `${c} ${b.toFixed(2)}%`);
  });
  const interp = OKGRAD ? " in oklch" : "";   // vivid transitions, no muddy midpoints
  return `linear-gradient(90deg${interp}, ${stops.join(", ")})`;
}
// soft 0.5 → the blend zone is as wide as the flat plateau, so each transition
// reads almost like its own color band.
const RAINBOW_ZOOM = 2.2;  // wider bands (fewer colors on screen at once)
let rainbowGrad = bandedGradient(rainbowColors(state.palette), 0.5);
function rebuildRainbow() { rainbowGrad = bandedGradient(rainbowColors(state.palette), 0.5); }

// Scroll by pixels (percentage positioning can't move a full-width image) so
// each equal band travels left→right; repeat + matching ends makes it seamless.
function stepRainbow() {
  const W = stage.clientWidth || window.innerWidth || 1;
  const patternPx = W * RAINBOW_ZOOM;
  const posPx = ((elapsed / holdSeconds()) % 1) * patternPx;
  stage.style.backgroundImage = rainbowGrad;
  stage.style.backgroundSize = `${RAINBOW_ZOOM * 100}% 100%`;
  stage.style.backgroundRepeat = "repeat";
  stage.style.backgroundPosition = `${posPx.toFixed(1)}px 50%`;
}

const RENDERERS = { gradient: stepGradient, breathing: stepBreathing, rainbow: stepRainbow };

function frame(now) {
  if (lastNow == null) lastNow = now;
  const dt = Math.min(0.1, (now - lastNow) / 1000);
  lastNow = now; elapsed += dt;

  if (state.mode === "solid") stepSolid(dt);
  else (RENDERERS[state.mode] || stepGradient)();

  if (sessionEndAt != null && !finished) {
    const left = Math.max(0, sessionEndAt - elapsed);
    renderCountdown(left);
    if (left <= 0) return endSession();
  }
  raf = requestAnimationFrame(frame);
}

function start() {
  lastNow = null;
  if (state.mode === "solid" && !tgt) resetSolid();
  if (!raf) raf = requestAnimationFrame(frame);
}

/* ---------- Session timer ---------- */
function armTimer() {
  if (state.timer > 0) { sessionEndAt = elapsed + state.timer * 60; finished = false; countdownEl.classList.remove("hidden"); }
  else { sessionEndAt = null; countdownEl.classList.add("hidden"); }
}
function renderCountdown(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  countdownEl.textContent = `${m}:${String(s).padStart(2, "0")}`;
}
function endSession() {
  finished = true;
  cancelAnimationFrame(raf); raf = null;
  doneEl.classList.remove("hidden");
  releaseWake();
}
function restart() {
  doneEl.classList.add("hidden");
  finished = false; elapsed = 0; cur = null; tgt = null;
  resetSolid(); armTimer(); requestWake(); start();
}

/* ---------- Dimmer (brightness) ---------- */
function applyBright() { dim.style.opacity = String((100 - state.bright) / 100 * 0.85); }

/* ---------- Wake lock (keep screen on) ---------- */
let wakeLock = null;
async function requestWake() {
  try { if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen"); } catch {}
}
function releaseWake() { try { wakeLock && wakeLock.release(); wakeLock = null; } catch {} }
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !finished) requestWake();
});

/* ---------- Controls UI ---------- */
function buildChips(container, items, current, onPick) {
  container.innerHTML = "";
  items.forEach(({ key, label }) => {
    const b = document.createElement("button");
    b.className = "chip" + (key === current ? " active" : "");
    b.textContent = label;
    b.onclick = () => onPick(key);
    container.appendChild(b);
  });
}

function renderModes() {
  const c = $("#modes");
  c.innerHTML = "";
  MODES.forEach((m) => {
    const b = document.createElement("button");
    b.className = "seg" + (m.key === state.mode ? " active" : "");
    b.textContent = m.label;
    b.onclick = () => setMode(m.key);
    c.appendChild(b);
  });
}
function updatePaceVal() { $("#paceVal").textContent = `${Math.round(holdSeconds())}s`; }

function renderControls() {
  renderModes();
  buildChips($("#palettes"), Object.entries(PALETTES).map(([key, p]) => ({ key, label: p.name })),
    state.palette, setPalette);
  buildChips($("#timers"), TIMERS.map((m) => ({ key: m, label: m === 0 ? "Off" : `${m} min` })),
    state.timer, setTimer);
  $("#pace").value = state.pace;
  $("#bright").value = state.bright;
  updatePaceVal();
  applyBright();
}

function setMode(mode) {
  state.mode = mode; save();
  if (mode === "solid") resetSolid();
  renderControls();
}
function setPalette(key) {
  state.palette = key; save();
  if (state.mode === "solid") tgt = stepColor(pal(), stepIndex); // ease toward new palette now
  rebuildRainbow();
  renderControls();
}
function setTimer(m) { state.timer = m; save(); armTimer(); renderControls(); }

/* auto-hide the panel */
let hideT = null;
function showControls() {
  controls.classList.remove("hidden");
  clearTimeout(hideT); hideT = setTimeout(hideControls, 5000);
}
function hideControls() { controls.classList.add("hidden"); }

/* ---------- Wiring ---------- */
$("#pace").oninput = (e) => { state.pace = +e.target.value; save(); updatePaceVal(); };
$("#bright").oninput = (e) => { state.bright = +e.target.value; save(); applyBright(); };
$("#restartBtn").onclick = restart;
$("#fsBtn").onclick = () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
};

// tap the field to toggle controls; tapping the panel keeps it open
document.addEventListener("click", (e) => {
  if (e.target.closest("#controls") || e.target.closest("#done")) return;
  hint.classList.add("gone");
  controls.classList.contains("hidden") ? showControls() : hideControls();
});
controls.addEventListener("pointerdown", () => clearTimeout(hideT));
controls.addEventListener("pointerup", () => { clearTimeout(hideT); hideT = setTimeout(hideControls, 5000); });

// first interaction: acquire wake lock (needs a user gesture)
document.addEventListener("pointerdown", function once() {
  requestWake();
  document.removeEventListener("pointerdown", once);
});

setTimeout(() => hint.classList.add("gone"), 6000);

renderControls();
resetSolid();
armTimer();
start();

/* ---------- PWA ---------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

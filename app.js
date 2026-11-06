const R = 6371, MU = 398600.4418, MAX_TRAIL = 4500, PRED_STEPS = 2000;

function acceleration(x, y, mu) {
  const r2 = x * x + y * y, f = -mu / (r2 * Math.sqrt(r2));
  return [x * f, y * f];
}

function step(s, dt, mu) {
  const r2 = s.x * s.x + s.y * s.y, f0 = -mu / (r2 * Math.sqrt(r2));
  const ax0 = s.x * f0, ay0 = s.y * f0, halfDt = 0.5 * dt, halfDt2 = halfDt * dt;
  const x = s.x + s.vx * dt + ax0 * halfDt2, y = s.y + s.vy * dt + ay0 * halfDt2;
  const nr2 = x * x + y * y, f1 = -mu / (nr2 * Math.sqrt(nr2));
  return { x, y, vx: s.vx + (ax0 + x * f1) * halfDt, vy: s.vy + (ay0 + y * f1) * halfDt };
}

function stepInPlace(s, dt, mu) {
  const r2 = s.x * s.x + s.y * s.y, f0 = -mu / (r2 * Math.sqrt(r2));
  const ax0 = s.x * f0, ay0 = s.y * f0, halfDt = 0.5 * dt, halfDt2 = halfDt * dt;
  const x = s.x + s.vx * dt + ax0 * halfDt2, y = s.y + s.vy * dt + ay0 * halfDt2;
  const nr2 = x * x + y * y, f1 = -mu / (nr2 * Math.sqrt(nr2));
  s.x = x; s.y = y;
  s.vx += (ax0 + x * f1) * halfDt;
  s.vy += (ay0 + y * f1) * halfDt;
}

function energy(s, mu) {
  return (s.vx * s.vx + s.vy * s.vy) / 2 - mu / Math.hypot(s.x, s.y);
}

function orbitalElements(s, mu) {
  const r = Math.hypot(s.x, s.y), v2 = s.vx * s.vx + s.vy * s.vy, dot = s.x * s.vx + s.y * s.vy;
  const E = v2 / 2 - mu / r, h = s.x * s.vy - s.y * s.vx, p = (h * h) / mu;
  const ex = ((v2 - mu / r) * s.x - dot * s.vx) / mu, ey = ((v2 - mu / r) * s.y - dot * s.vy) / mu, e = Math.hypot(ex, ey);
  const radial = Math.abs(h) / Math.sqrt(mu * r) < 1e-12, parabolic = Math.abs(E) / (mu / r) < 1e-10;
  const type = radial ? "Radial (degenerate)" : e < 1e-10 ? "Circular" : parabolic ? "Parabolic" : E < 0 ? "Elliptical" : "Hyperbolic";
  return { E, h, p, e, ex, ey, type, radial, parabolic, a: parabolic ? Infinity : -mu / (2 * E), peri: p / (1 + e) };
}

const elCache = new Map();
const $ = (id) => {
  if (!elCache.has(id)) elCache.set(id, document.getElementById(id));
  return elCache.get(id);
};
const intFmt = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const decFmt = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
const conicCards = [...document.querySelectorAll("[data-conic]")];
const canvas = $("sky"), ctx = canvas.getContext("2d");
const bgCanvas = document.createElement("canvas"), bgCtx = bgCanvas.getContext("2d");
const planetCanvas = document.createElement("canvas"), planetCtx = planetCanvas.getContext("2d");

let s, initial, currentEl, mu, playing = false, started = false, crashed = false;
let t = 0, theta = 0, zoom = 1, drag = null, w = 800, h = 470, dpr = 1, last = 0, turn = 0, lastAngle = 0;
let mission = "circle", won = false, rafId = 0, dirty = true, canvasVisible = true, bgKey = "", planetKey = "";

const trailBuf = new Float64Array(MAX_TRAIL * 2);
let trailHead = 0, trailLen = 0;
const predBuf = new Float64Array(PRED_STEPS * 2);
let predLen = 0;

const inputs = ["mass", "radius", "speed", "angle"];
const val = (id) => +$(id).value;
function pos() {
  const rr = val("radius") * R;
  return { x: Math.cos(theta) * rr, y: Math.sin(theta) * rr };
}

function buildPrediction() {
  const p = { ...initial }, r0 = Math.hypot(p.x, p.y);
  const dt = Math.min(18, (Math.sqrt((r0 * r0 * r0) / mu) * Math.PI * 2) / PRED_STEPS);
  predLen = 0;
  for (let i = 0; i < PRED_STEPS; i++) {
    predBuf[predLen * 2] = p.x;
    predBuf[predLen * 2 + 1] = p.y;
    predLen++;
    stepInPlace(p, dt, mu);
    if (p.x * p.x + p.y * p.y < R * R) break;
  }
}

function scheduleFrame() {
  if (rafId || document.hidden || !canvasVisible) return;
  if (playing || dirty) {
    last = 0;
    rafId = requestAnimationFrame(frame);
  }
}
function invalidate() { dirty = true; scheduleFrame(); }

function setup() {
  mu = MU * val("mass");
  const p = pos(), a = theta + (val("angle") * Math.PI) / 180, spd = val("speed");
  s = { x: p.x, y: p.y, vx: spd * Math.cos(a), vy: spd * Math.sin(a) };
  initial = { ...s };
  currentEl = orbitalElements(initial, mu);
  buildPrediction();
  playing = false; started = false; crashed = false;
  t = 0; turn = 0; lastAngle = Math.atan2(s.y, s.x);
  trailHead = 0; trailLen = 0; won = false;
  $("launch").textContent = "▶ Launch satellite";
  $("status").textContent = "Ready to launch";
  $("hint").textContent = "Drag the satellite to position · Drag the arrow to aim";
  labels(); updateConic(currentEl); readouts(); invalidate();
}

function labels() {
  const r = val("radius") * R;
  $("massValue").textContent = val("mass").toFixed(2) + " M⊕";
  $("radiusValue").textContent = val("radius").toFixed(2) + " R⊕";
  $("speedValue").textContent = val("speed").toFixed(2) + " km/s";
  $("angleValue").textContent = val("angle") + "°";
  $("circular").textContent = Math.sqrt(mu / r).toFixed(2) + " km/s";
  $("escape").textContent = Math.sqrt((2 * mu) / r).toFixed(2) + " km/s";
}

inputs.forEach((id) => ($(id).oninput = setup));
["trail", "vectors", "prediction"].forEach((id) => ($(id).onchange = invalidate));
$("reset").onclick = setup;
$("launch").onclick = () => {
  if (crashed) setup();
  playing = !playing; started = true;
  $("launch").textContent = playing ? "Ⅱ Pause" : "▶ Resume";
  $("status").textContent = playing ? "Flight in progress" : "Paused";
  $("hint").textContent = "Explore the energy exchange as the satellite moves.";
  invalidate();
};
$("help").onclick = () => $("guide").showModal();
$("closeHelp").onclick = () => $("guide").close();
$("zoomIn").onclick = () => { zoom = Math.min(3, zoom * 1.25); invalidate(); };
$("zoomOut").onclick = () => { zoom = Math.max(0.2, zoom / 1.25); invalidate(); };

document.querySelectorAll("[data-preset]").forEach((b) => (b.onclick = () => {
  mission = b.dataset.preset; theta = 0; zoom = 1;
  $("mass").value = 1; $("radius").value = 2.5; $("angle").value = 90;
  const vc = Math.sqrt(MU / (2.5 * R));
  $("speed").value = mission === "circle" ? vc : mission === "ellipse" ? vc * 1.18 : mission === "hyperbola" ? vc * 1.65 : vc * Math.SQRT2;
  setup();
  $("challenge").textContent = mission === "circle"
    ? "Your mission: complete one circular orbit."
    : mission === "ellipse"
      ? "Your mission: complete an elliptical orbit. Watch speed fall as altitude rises."
      : "Your mission: reach 8 planetary radii on an unbound path. Try lowering the launch speed afterward.";
}));

function scale() { return (Math.min(w, h) / (11 * R)) * zoom; }
function screen(x, y) { const sc = scale(); return [w / 2 + x * sc, h / 2 - y * sc]; }
function world(x, y) { const sc = scale(); return [(x - w / 2) / sc, (h / 2 - y) / sc]; }
function arrow(x, y, dx, dy, color) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.stroke();
  const a = Math.atan2(dy, dx);
  ctx.beginPath(); ctx.moveTo(x + dx, y + dy);
  ctx.lineTo(x + dx - 8 * Math.cos(a - 0.4), y + dy - 8 * Math.sin(a - 0.4));
  ctx.lineTo(x + dx - 8 * Math.cos(a + 0.4), y + dy - 8 * Math.sin(a + 0.4));
  ctx.fill();
}
function pointer(e) { const b = canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; }
canvas.onpointerdown = (e) => {
  if (started) return;
  const p = pointer(e), q = screen(s.x, s.y), tip = [q[0] + s.vx * 13, q[1] - s.vy * 13];
  drag = Math.hypot(p[0] - q[0], p[1] - q[1]) < 22 ? "position" : Math.hypot(p[0] - tip[0], p[1] - tip[1]) < 30 ? "velocity" : null;
  if (drag) canvas.setPointerCapture(e.pointerId);
};
canvas.onpointermove = (e) => {
  if (!drag) return;
  const p = pointer(e);
  if (drag === "position") {
    const v = world(p[0], p[1]);
    theta = Math.atan2(v[1], v[0]);
    $("radius").value = Math.max(1.15, Math.min(5, Math.hypot(v[0], v[1]) / R));
  } else {
    const q = screen(s.x, s.y), vx = (p[0] - q[0]) / 13, vy = -(p[1] - q[1]) / 13;
    $("speed").value = Math.min(16, Math.hypot(vx, vy));
    const a = ((Math.atan2(vy, vx) - theta) * 180) / Math.PI;
    $("angle").value = ((a + 540) % 360) - 180;
  }
  setup();
};
canvas.onpointerup = canvas.onpointercancel = () => (drag = null);

function readouts() {
  const r = Math.hypot(s.x, s.y), v = Math.hypot(s.vx, s.vy), ke = (v * v) / 2, pe = -mu / r, E = ke + pe;
  const L = s.x * s.vy - s.y * s.vx, ecc = Math.sqrt(Math.max(0, 1 + (2 * E * L * L) / (mu * mu))), el = currentEl;
  $("altitude").textContent = intFmt.format(Math.max(0, r - R)) + " km";
  $("velocity").textContent = v.toFixed(2) + " km/s";
  $("ke").textContent = ke.toFixed(2); $("pe").textContent = pe.toFixed(2);
  $("total").textContent = (E > 0 ? "+" : "") + E.toFixed(2);
  $("keBar").value = ke; $("peBar").value = -pe;
  $("orbitType").textContent = el.type;
  $("orbitInfo").textContent = crashed ? "Surface impact · path interrupted" : el.peri < R ? "Conic intersects the planet" : el.E < 0 && !el.parabolic ? "Bound trajectory" : "Unbound trajectory";
  const mins = Math.floor(t / 60);
  $("clock").textContent = "T + " + String(Math.floor(mins / 60)).padStart(2, "0") + ":" + String(mins % 60).padStart(2, "0");
  if (!won && started && !crashed && ((mission === "circle" && ecc < 0.025 && Math.abs(turn) >= Math.PI * 2) || (mission === "ellipse" && ecc >= 0.025 && E < 0 && Math.abs(turn) >= Math.PI * 2) || ((mission === "escape" || mission === "parabola" || mission === "hyperbola") && (el.parabolic || el.E > 0) && r >= 8 * R))) {
    won = true;
    $("challenge").textContent = "✓ Mission complete! " + (mission === "escape" || mission === "parabola" || mission === "hyperbola" ? "You escaped the planet’s gravity well." : "One full orbit. Try changing the launch speed and compare the path.");
  }
}

function ensureLayers() {
  const nextBgKey = `${w}:${h}:${dpr}:${zoom}`;
  if (nextBgKey !== bgKey) {
    bgKey = nextBgKey;
    bgCanvas.width = Math.round(w * dpr); bgCanvas.height = Math.round(h * dpr);
    bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bgCtx.fillStyle = "#091329"; bgCtx.fillRect(0, 0, w, h);
    for (let i = 0; i < 100; i++) {
      const x = (((i * 127.13 + 37) % 997) / 997) * w, y = (((i * 79.73 + 11) % 661) / 661) * h;
      bgCtx.fillStyle = i % 4 ? "#526b9b" : "#9ebbe8";
      bgCtx.globalAlpha = 0.2 + (i % 3) * 0.13; bgCtx.fillRect(x, y, 1, 1);
    }
    bgCtx.globalAlpha = 1;
    const c = [w / 2, h / 2], pr = R * scale();
    bgCtx.lineWidth = 1; bgCtx.strokeStyle = "#263859"; bgCtx.setLineDash([2, 7]);
    bgCtx.beginPath();
    for (const n of [2, 3, 4, 5]) { bgCtx.moveTo(c[0] + pr * n, c[1]); bgCtx.arc(c[0], c[1], pr * n, 0, Math.PI * 2); }
    bgCtx.stroke(); bgCtx.setLineDash([]);
    bgCtx.strokeStyle = "#172b4d"; bgCtx.beginPath();
    bgCtx.moveTo(c[0], 45); bgCtx.lineTo(c[0], h - 45); bgCtx.moveTo(25, c[1]); bgCtx.lineTo(w - 25, c[1]); bgCtx.stroke();
  }
  const massStr = val("mass").toFixed(2), nextPlanetKey = `${nextBgKey}:${massStr}`;
  if (nextPlanetKey !== planetKey) {
    planetKey = nextPlanetKey;
    planetCanvas.width = Math.round(w * dpr); planetCanvas.height = Math.round(h * dpr);
    planetCtx.setTransform(dpr, 0, 0, dpr, 0, 0); planetCtx.clearRect(0, 0, w, h);
    const c = [w / 2, h / 2], pr = R * scale();
    const glow = planetCtx.createRadialGradient(c[0], c[1], pr * 0.7, c[0], c[1], pr * 1.7);
    glow.addColorStop(0, "#609dff2b"); glow.addColorStop(1, "#609dff00");
    planetCtx.fillStyle = glow; planetCtx.beginPath(); planetCtx.arc(c[0], c[1], pr * 1.7, 0, Math.PI * 2); planetCtx.fill();
    const g = planetCtx.createRadialGradient(c[0] - pr * 0.45, c[1] - pr * 0.45, 0, c[0], c[1], pr);
    g.addColorStop(0, "#b2dbff"); g.addColorStop(0.55, "#518bdf"); g.addColorStop(1, "#172f72");
    planetCtx.fillStyle = g; planetCtx.beginPath(); planetCtx.arc(c[0], c[1], pr, 0, Math.PI * 2); planetCtx.fill();
    planetCtx.save(); planetCtx.beginPath(); planetCtx.arc(c[0], c[1], pr, 0, Math.PI * 2); planetCtx.clip();
    planetCtx.strokeStyle = "#c3ddff40";
    for (let i = -2; i < 3; i++) { planetCtx.beginPath(); planetCtx.ellipse(c[0], c[1] + i * pr * 0.32, pr, pr * 0.17, -0.35, 0, Math.PI * 2); planetCtx.stroke(); }
    planetCtx.restore();
    planetCtx.fillStyle = "#99b4e1"; planetCtx.font = "9px monospace"; planetCtx.textAlign = "center";
    planetCtx.fillText("M " + massStr + " M⊕", c[0], c[1] + pr + 20);
  }
}

function draw() {
  ensureLayers();
  ctx.drawImage(bgCanvas, 0, 0, w, h);
  const sc = scale(), cx = w / 2, cy = h / 2;
  if ($("prediction").checked && !crashed && predLen > 0) {
    ctx.strokeStyle = "#7caaff70"; ctx.lineWidth = 1; ctx.setLineDash([4, 6]); ctx.beginPath();
    for (let i = 0; i < predLen; i++) {
      const px = cx + predBuf[i * 2] * sc, py = cy - predBuf[i * 2 + 1] * sc;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke(); ctx.setLineDash([]);
  }
  if ($("trail").checked && trailLen > 0) {
    ctx.strokeStyle = "#51ddf6"; ctx.lineWidth = 1.7; ctx.beginPath();
    const startIdx = trailLen === MAX_TRAIL ? trailHead : 0;
    for (let i = 0; i < trailLen; i++) {
      const idx = ((startIdx + i) % MAX_TRAIL) * 2, px = cx + trailBuf[idx] * sc, py = cy - trailBuf[idx + 1] * sc;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
  }
  ctx.drawImage(planetCanvas, 0, 0, w, h);
  const qx = cx + s.x * sc, qy = cy - s.y * sc;
  if ($("vectors").checked || !started) {
    arrow(qx, qy, s.vx * 13, -s.vy * 13, "#51ddf6");
    if (!started) { ctx.strokeStyle = "#51ddf6"; ctx.beginPath(); ctx.arc(qx + s.vx * 13, qy - s.vy * 13, 7, 0, Math.PI * 2); ctx.stroke(); }
    if ($("vectors").checked) {
      const r2 = s.x * s.x + s.y * s.y, r = Math.sqrt(r2), len = Math.min(90, (mu / r2) * 25000);
      arrow(qx, qy, (-s.x / r) * len, (s.y / r) * len, "#ff897a");
    }
  }
  ctx.fillStyle = crashed ? "#ff897a" : "#f3f8ff"; ctx.shadowColor = "#51ddf6"; ctx.shadowBlur = 15;
  ctx.beginPath(); ctx.arc(qx, qy, 5, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  ctx.strokeStyle = "#51ddf680"; ctx.beginPath(); ctx.arc(qx, qy, 10, 0, Math.PI * 2); ctx.stroke();
  if (qx < 0 || qx > w || qy < 0 || qy > h) {
    ctx.fillStyle = "#c4d7f5"; ctx.font = "11px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("Satellite beyond view — zoom out to follow", w / 2, h - 60);
  }
}

function frame(now) {
  rafId = 0;
  if (document.hidden || !canvasVisible) return;
  const delta = last ? Math.min((now - last) / 1000, 0.06) : 0;
  last = now;
  if (playing) {
    let remaining = delta * 300 * val("rate");
    while (remaining > 0) {
      const dt = Math.min(2, remaining);
      stepInPlace(s, dt, mu); t += dt; remaining -= dt;
      const a = Math.atan2(s.y, s.x), da = a - lastAngle;
      turn += Math.atan2(Math.sin(da), Math.cos(da)); lastAngle = a;
      const r2 = s.x * s.x + s.y * s.y;
      if (r2 <= R * R) {
        const rr = Math.sqrt(r2); s.x *= R / rr; s.y *= R / rr;
        playing = false; crashed = true;
        $("status").textContent = "Surface impact"; $("launch").textContent = "↺ Try again";
        break;
      }
    }
    trailBuf[trailHead * 2] = s.x; trailBuf[trailHead * 2 + 1] = s.y;
    trailHead = (trailHead + 1) % MAX_TRAIL;
    if (trailLen < MAX_TRAIL) trailLen++;
    readouts();
  }
  dirty = false; draw();
  if (playing) rafId = requestAnimationFrame(frame);
}

new ResizeObserver(() => {
  const b = canvas.getBoundingClientRect();
  w = b.width; h = b.height; dpr = devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); invalidate();
}).observe(canvas);

document.addEventListener("contentvisibilityautostatechange", (event) => {
  if (event.target && (event.target === canvas || (event.target.contains && event.target.contains(canvas)))) {
    canvasVisible = !event.skipped; scheduleFrame();
  }
}, { capture: true });

if ("IntersectionObserver" in window) {
  new IntersectionObserver((entries) => { canvasVisible = entries[0].isIntersecting; scheduleFrame(); }, { rootMargin: "200px" }).observe(canvas);
}
document.addEventListener("visibilitychange", scheduleFrame);

function updateConic(o) {
  const fmt = (n) => (Number.isFinite(n) ? decFmt.format(n) : "∞");
  $("conicName").textContent = o.type;
  $("eccentricity").textContent = o.e.toFixed(6);
  $("conicEnergy").textContent = (Math.abs(o.E) < 1e-10 ? 0 : o.E).toFixed(6) + " km²/s²";
  $("semiLatus").textContent = fmt(o.p) + " km";
  $("semiMajor").textContent = o.parabolic ? "∞ (limit)" : fmt(o.a) + " km";
  $("conicEquation").textContent = o.radial ? "Radial motion: h = 0; no nondegenerate conic" : o.type === "Circular" ? "r = " + fmt(o.p) + " km" : o.parabolic ? "r(ν) = " + fmt(o.p) + " / (1 + cos ν) km" : "r(ν) = " + fmt(o.p) + " / (1 + " + o.e.toFixed(6) + " cos ν) km";
  $("conicMeaning").textContent = o.radial
    ? "Straight-line motion. The usual conic equation degenerates; e = 1 alone does not imply a parabola when angular momentum is zero."
    : o.type === "Circular" ? "Constant radius: velocity is tangential and v = √(μ/r)."
    : o.type === "Elliptical" ? "A closed, bound conic. The planet is at one focus."
    : o.parabolic ? "The escape boundary: ε = 0, e = 1. Speed approaches zero at infinite distance."
    : "An open, unbound conic. The satellite retains speed v∞ = √(2ε) = " + Math.sqrt(2 * o.E).toFixed(3) + " km/s at infinite distance.";
  conicCards.forEach((c) => c.classList.toggle("active", c.dataset.conic === o.type));
}

$("speed").value = Math.sqrt(MU / (2.5 * R));
setup();

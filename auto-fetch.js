/**
 * auto-fetch.js  — 2-screen controller
 * Screen 1: Login  →  Screen 2: Dashboard + Prediction
 */
"use strict";

const FETCH_URL    = "fetch-data.php";
const PREDICT_URL  = "api.php";
const STORAGE_KEY  = "yw_creds";

const PREDICT_STEPS = [
  "Initialising Python environment…",
  "Loading Support-backend modules…",
  "Running Calcute.php algorithm…",
  "Applying Pythonhelp statistical layer…",
  "Cross-validating trend patterns…",
  "Building confidence matrix…",
  "Finalising prediction output…",
];

/* cached data */
let cachedTrends = [];
let cachedPrediction = null;

/* ── INIT ─────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {

  /* password toggle */
  document.getElementById("pwToggle").addEventListener("click", () => {
    const inp = document.getElementById("loginPass");
    inp.type  = inp.type === "password" ? "text" : "password";
  });

  /* auto-fill saved creds */
  const saved = loadCreds();
  if (saved) {
    document.getElementById("loginPhone").value = saved.phone;
    document.getElementById("loginPass").value  = saved.pass;
    setBadge("loading", "Credentials loaded — click Login");
  }

  /* Login button */
  document.getElementById("btnLogin").addEventListener("click", handleLogin);

  /* Manual button → go screen2 empty, let user use predict manually */
  document.getElementById("btnManual").addEventListener("click", () => {
    goScreen2(false);
  });

  /* Back button */
  document.getElementById("btnBack").addEventListener("click", () => {
    goScreen1();
  });

  /* Refresh button */
  document.getElementById("btnRefresh").addEventListener("click", doRefresh);

  /* Predict button */
  document.getElementById("btnPredict").addEventListener("click", doPredict);
});

/* ── SCREEN TRANSITIONS ───────────────────────── */
function goScreen2(autoFetch) {
  const s1 = document.getElementById("screen1");
  const s2 = document.getElementById("screen2");

  s1.classList.add("slide-out");
  setTimeout(() => {
    s1.classList.remove("active", "slide-out");
    s2.classList.add("active", "slide-in");
    setTimeout(() => s2.classList.remove("slide-in"), 350);
    if (autoFetch) doFetch();
  }, 320);
}

function goScreen1() {
  const s1 = document.getElementById("screen1");
  const s2 = document.getElementById("screen2");
  s2.classList.remove("active");
  s1.classList.add("active");
}

/* ── LOGIN HANDLER ────────────────────────────── */
async function handleLogin() {
  const phone = document.getElementById("loginPhone").value.trim();
  const pass  = document.getElementById("loginPass").value.trim();
  const btn   = document.getElementById("btnLogin");
  const errEl = document.getElementById("loginError");

  errEl.textContent = "";

  if (!phone || !pass) {
    errEl.textContent = "⚠ Please enter your phone number and password.";
    return;
  }

  btn.disabled = true;
  document.getElementById("loginBtnText").textContent = "Logging in…";
  setBadge("loading", "Logging in to YaarWin…");

  /* Save creds if checkbox checked */
  if (document.getElementById("rememberCreds").checked) {
    saveCreds(phone, pass);
  }

  /* transition to screen 2, auto-fetch will run */
  setBadge("success", "Login triggered — fetching data…");
  goScreen2(true);

  btn.disabled = false;
  document.getElementById("loginBtnText").innerHTML = "🚀 Login &amp; Fetch Results";
}

/* ── FETCH DATA (calls fetch-data.php) ───────── */
async function doFetch() {
  showLoader(true);
  hideError();
  hideContent();

  const steps = ["lstep1","lstep2","lstep3","lstep4","lstep5"];

  /* animate steps while fetching */
  let si = 0;
  setStep(steps[si++], "active");
  const timer = setInterval(() => {
    if (si < steps.length) {
      setStep(steps[si-1], "done");
      setStep(steps[si++], "active");
    }
  }, 800);

  try {
    const resp = await fetch(FETCH_URL, { method: "GET", headers: { Accept: "application/json" } });
    const data = await resp.json();

    clearInterval(timer);
    steps.forEach(s => setStep(s, "done"));

    if (!resp.ok || data.status === "error") throw new Error(data.error ?? "Fetch failed");
    if (!Array.isArray(data.trends) || data.trends.length < 1) throw new Error("No trend data returned.");

    cachedTrends = data.trends;

    /* auto-run prediction too */
    const pred = await runPrediction(cachedTrends);
    cachedPrediction = pred;

    showLoader(false);
    renderDashboard(cachedTrends, cachedPrediction, data.fetched_at);

  } catch (err) {
    clearInterval(timer);
    showLoader(false);
    showError("❌ " + err.message + " — You can still enter data manually.");
    /* show empty dashboard so user can use predict button */
    renderDashboard([], null, null);
  }
}

/* ── REFRESH ─────────────────────────────────── */
async function doRefresh() {
  await doFetch();
}

/* ── PREDICTION OVERLAY ──────────────────────── */
async function doPredict() {
  if (cachedTrends.length < 10) {
    showError("⚠ Need 10 trend records to predict. Please refresh or check credentials.");
    return;
  }

  /* show overlay */
  const overlay  = document.getElementById("predictOverlay");
  const stepEl   = document.getElementById("predictStep");
  const btn      = document.getElementById("btnPredict");
  btn.disabled   = true;
  overlay.classList.add("active");
  stepEl.textContent = PREDICT_STEPS[0];

  let idx = 0;
  const t = setInterval(() => {
    idx = (idx + 1) % PREDICT_STEPS.length;
    stepEl.textContent = PREDICT_STEPS[idx];
  }, 900);

  try {
    const pred = await runPrediction(cachedTrends);
    cachedPrediction = pred;
    clearInterval(t);
    overlay.classList.remove("active");
    renderPrediction(pred);
  } catch (err) {
    clearInterval(t);
    overlay.classList.remove("active");
    showError("❌ Prediction error: " + err.message);
  } finally {
    btn.disabled = false;
  }
}

/* ── CALL api.php ────────────────────────────── */
async function runPrediction(trends) {
  const resp = await fetch(PREDICT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trends }),
  });
  const data = await resp.json();
  if (!resp.ok || data.status === "error") throw new Error(data.error ?? "Prediction failed");
  return data;
}

/* ── RENDER DASHBOARD ────────────────────────── */
function renderDashboard(trends, pred, fetchedAt) {
  const content = document.getElementById("dashContent");
  content.classList.add("show");

  /* sub-title */
  document.getElementById("dashSub").textContent =
    fetchedAt ? "Last fetched: " + fetchedAt : "Manual mode — enter data below";

  /* history rows */
  const rowsEl = document.getElementById("historyRows");
  rowsEl.innerHTML = "";

  if (trends.length === 0) {
    rowsEl.innerHTML = `<div style="padding:20px;text-align:center;color:#333;font-size:13px;">
      No data — tap 🔄 Refresh after setting credentials in fetch-config.php</div>`;
  } else {
    trends.forEach((t, i) => {
      const color = t.color.toLowerCase();
      const size  = t.size.toLowerCase();
      const row   = document.createElement("div");
      row.className = "hist-row";
      row.innerHTML = `
        <span class="row-idx">${i + 1}</span>
        <span class="row-period">${t.trendId}</span>
        <span><span class="num-badge">${t.number}</span></span>
        <span><span class="color-pill ${color}">${t.color}</span></span>
        <span><span class="size-pill ${size === 'mb' ? 'mb' : 'ms'}">${t.size}</span></span>`;
      rowsEl.appendChild(row);
    });
  }

  /* prediction */
  if (pred) renderPrediction(pred);
}

function renderPrediction(pred) {
  document.getElementById("predId").textContent  = pred.predicted_trend_id ?? "—";
  document.getElementById("predNum").textContent = pred.predicted_number    ?? "—";

  /* color pill */
  const colorEl = document.getElementById("predColor");
  const c = (pred.predicted_color ?? "").toLowerCase();
  colorEl.innerHTML = `<span class="color-pill ${c}">${pred.predicted_color ?? "—"}</span>`;

  /* size pill */
  const sizeEl = document.getElementById("predSize");
  const s = (pred.predicted_size ?? "").toLowerCase();
  sizeEl.innerHTML = `<span class="size-pill ${s === 'mb' ? 'mb' : 'ms'}">${pred.predicted_size ?? "—"}</span>`;

  /* confidence */
  const conf = pred.confidence ?? 0;
  document.getElementById("confPct").textContent = conf + "%";
  requestAnimationFrame(() => {
    setTimeout(() => { document.getElementById("confFill").style.width = conf + "%"; }, 60);
  });
}

/* ── UI HELPERS ──────────────────────────────── */
function showLoader(show) {
  document.getElementById("fetchLoader").classList.toggle("active", show);
}
function hideContent() {
  document.getElementById("dashContent").classList.remove("show");
}
function showError(msg) {
  const el = document.getElementById("dashError");
  el.textContent = msg;
  el.classList.add("show");
}
function hideError() {
  document.getElementById("dashError").classList.remove("show");
}
function setStep(id, state) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("active","done");
  if (state) el.classList.add(state);
}
function setBadge(state, msg) {
  const dot  = document.getElementById("badgeDot");
  const text = document.getElementById("badgeText");
  dot.className  = "badge-dot " + state;
  text.textContent = msg;
}

/* ── CREDENTIAL STORAGE ──────────────────────── */
function saveCreds(phone, pass) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ phone, pass })); } catch(e){}
}
function loadCreds() {
  try { const d = localStorage.getItem(STORAGE_KEY); return d ? JSON.parse(d) : null; } catch(e){ return null; }
}

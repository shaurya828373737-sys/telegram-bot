/**
 * auto-fetch.js  —  2-screen controller
 * Screen 1: Login  →  Screen 2: Dashboard + Prediction
 */
"use strict";

const FETCH_URL   = "fetch-data.php";
const PREDICT_URL = "api.php";
const CRED_KEY    = "yw_creds";

const PRED_STEPS = [
  "Initialising Python environment…",
  "Loading Support-backend modules…",
  "Running Calcute.php algorithm…",
  "Applying Pythonhelp statistical layer…",
  "Cross-validating trend patterns…",
  "Building confidence matrix…",
  "Finalising prediction output…",
];

let cachedTrends = [];

/* ── BOOT ──────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {

  /* restore saved creds */
  const saved = loadCreds();
  if (saved) {
    document.getElementById("inp-phone").value = saved.phone;
    document.getElementById("inp-pass").value  = saved.pass;
    setBadge("loading", "Credentials loaded — click Login");
  }

  /* password eye toggle */
  document.getElementById("pwEye").addEventListener("click", () => {
    const f = document.getElementById("inp-pass");
    f.type  = (f.type === "password") ? "text" : "password";
  });

  document.getElementById("btnLogin").addEventListener("click",   doLogin);
  document.getElementById("btnManual").addEventListener("click",  () => goS2(false));
  document.getElementById("btnBack").addEventListener("click",    goS1);
  document.getElementById("btnRefresh").addEventListener("click", doFetch);
  document.getElementById("btnPredict").addEventListener("click", doPredict);
});

/* ── SCREEN SWITCH ─────────────────────────── */
function goS2(fetch) {
  document.getElementById("s1").classList.remove("active");
  document.getElementById("s2").classList.add("active");
  if (fetch) doFetch();
}
function goS1() {
  document.getElementById("s2").classList.remove("active");
  document.getElementById("s1").classList.add("active");
}

/* ── LOGIN ─────────────────────────────────── */
function doLogin() {
  const phone = document.getElementById("inp-phone").value.trim();
  const pass  = document.getElementById("inp-pass").value.trim();
  const err   = document.getElementById("lcErr");
  const btn   = document.getElementById("btnLogin");

  err.textContent = "";

  if (!phone || !pass) {
    err.textContent = "⚠ Please enter phone number and password.";
    return;
  }

  if (document.getElementById("chkRemember").checked) saveCreds(phone, pass);

  btn.disabled   = true;
  btn.textContent = "Logging in…";
  setBadge("loading", "Login triggered — fetching data…");

  setTimeout(() => {
    btn.disabled    = false;
    btn.innerHTML   = "🚀 Login &amp; Fetch Results";
    goS2(true);
  }, 400);
}

/* ── FETCH DATA ────────────────────────────── */
async function doFetch() {
  showLoader(true);
  hideErr();
  hideBody();

  const steps = ["ls1","ls2","ls3","ls4","ls5"];
  let si = 0;
  stepSet(steps[si++], "on");

  const timer = setInterval(() => {
    if (si < steps.length) {
      stepSet(steps[si - 1], "done");
      stepSet(steps[si++], "on");
    }
  }, 700);

  try {
    const res  = await fetch(FETCH_URL, { headers: { Accept: "application/json" } });
    const data = await res.json();

    clearInterval(timer);
    steps.forEach(s => stepSet(s, "done"));

    if (data.status === "error") throw new Error(data.error);
    if (!Array.isArray(data.trends) || !data.trends.length)
      throw new Error("No trend data returned.");

    cachedTrends = data.trends;

    /* auto-run prediction */
    let pred = null;
    try { pred = await runPredict(cachedTrends); } catch(e) { /* show data even if pred fails */ }

    showLoader(false);
    renderAll(cachedTrends, pred, data.fetched_at);

  } catch (err) {
    clearInterval(timer);
    showLoader(false);
    showErr("❌ " + err.message + " — You can still enter data manually.");
    renderAll([], null, null);
  }
}

/* ── PREDICT ───────────────────────────────── */
async function doPredict() {
  if (cachedTrends.length < 10) {
    showErr("⚠ Need 10 trend records. Tap Refresh or check credentials in fetch-config.php.");
    return;
  }

  const overlay = document.getElementById("predOverlay");
  const stepEl  = document.getElementById("predStep");
  const btn     = document.getElementById("btnPredict");

  btn.disabled = true;
  overlay.classList.add("on");
  stepEl.textContent = PRED_STEPS[0];

  let idx = 0;
  const t = setInterval(() => {
    idx = (idx + 1) % PRED_STEPS.length;
    stepEl.textContent = PRED_STEPS[idx];
  }, 900);

  try {
    const pred = await runPredict(cachedTrends);
    clearInterval(t);
    overlay.classList.remove("on");
    renderPred(pred);
  } catch(e) {
    clearInterval(t);
    overlay.classList.remove("on");
    showErr("❌ Prediction error: " + e.message);
  } finally {
    btn.disabled = false;
  }
}

async function runPredict(trends) {
  const r = await fetch(PREDICT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trends }),
  });
  const d = await r.json();
  if (d.status === "error") throw new Error(d.error);
  return d;
}

/* ── RENDER ────────────────────────────────── */
function renderAll(trends, pred, fetchedAt) {
  document.getElementById("dashSub").textContent =
    fetchedAt ? "Last fetched: " + fetchedAt : "Manual mode";

  /* history rows */
  const wrap = document.getElementById("histRows");
  wrap.innerHTML = "";

  if (!trends.length) {
    wrap.innerHTML =
      '<div style="padding:22px;text-align:center;color:#2a2a4a;font-size:13px;">' +
      'No data — set credentials in fetch-config.php and tap 🔄 Refresh</div>';
  } else {
    trends.forEach((t, i) => {
      const cl = t.color.toLowerCase();
      const sl = t.size.toLowerCase();
      const row = document.createElement("div");
      row.className = "hist-row";
      row.innerHTML =
        `<span class="h-idx">${i + 1}</span>` +
        `<span class="h-period">${t.trendId}</span>` +
        `<span><span class="nbadge">${t.number}</span></span>` +
        `<span><span class="cpill ${cl}">${t.color}</span></span>` +
        `<span><span class="spill ${sl === "mb" ? "mb" : "ms"}">${t.size}</span></span>`;
      wrap.appendChild(row);
    });
  }

  if (pred) renderPred(pred);
  showBody();
}

function renderPred(pred) {
  document.getElementById("pId").textContent  = pred.predicted_trend_id ?? "—";
  document.getElementById("pNum").textContent = pred.predicted_number    ?? "—";

  const c = (pred.predicted_color ?? "").toLowerCase();
  document.getElementById("pColor").innerHTML =
    `<span class="cpill ${c}">${pred.predicted_color ?? "—"}</span>`;

  const s = (pred.predicted_size ?? "").toLowerCase();
  document.getElementById("pSize").innerHTML =
    `<span class="spill ${s === "mb" ? "mb" : "ms"}">${pred.predicted_size ?? "—"}</span>`;

  const conf = pred.confidence ?? 0;
  document.getElementById("confPct").textContent = conf + "%";
  requestAnimationFrame(() =>
    setTimeout(() => { document.getElementById("confFill").style.width = conf + "%"; }, 60)
  );
}

/* ── UI HELPERS ────────────────────────────── */
function showLoader(v) { document.getElementById("loaderWrap").classList.toggle("on", v); }
function showBody()    { document.getElementById("dashBody").classList.add("on"); }
function hideBody()    { document.getElementById("dashBody").classList.remove("on"); }
function showErr(m)    { const e=document.getElementById("errBar"); e.textContent=m; e.classList.add("on"); }
function hideErr()     { document.getElementById("errBar").classList.remove("on"); }
function stepSet(id,s) { const e=document.getElementById(id); if(e){e.className="loader-item "+(s||"");} }
function setBadge(state, msg) {
  document.getElementById("bdot").className  = "badge-dot " + state;
  document.getElementById("btext").textContent = msg;
}

/* ── CRED STORAGE ──────────────────────────── */
function saveCreds(p, pw) {
  try { localStorage.setItem(CRED_KEY, JSON.stringify({phone:p,pass:pw})); } catch(e){}
}
function loadCreds() {
  try { const d=localStorage.getItem(CRED_KEY); return d?JSON.parse(d):null; } catch(e){return null;}
}

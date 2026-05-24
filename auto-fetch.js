/**
 * auto-fetch.js
 * 3-screen flow:
 *   S1 Login → S2 Website Preview (iframe) → S3 Dashboard
 *
 * Credentials are entered on S1, saved to localStorage,
 * sent to fetch-data.php via POST so PHP does the real login.
 */
"use strict";

const FETCH_URL   = "fetch-data.php";
const PREDICT_URL = "api.php";
const CRED_KEY    = "yw_creds";

const SITE_LOGIN_URL = "https://yaarwin.app/#/login";
const SITE_GAME_URL  = "https://yaarwin.app/#/saasLottery/WinGo?gameCode=WinGo_30S&lottery=WinGo";

const PRED_STEPS = [
  "Initialising Python environment…",
  "Loading Support-backend modules…",
  "Running Calcute.php algorithm…",
  "Applying Pythonhelp statistical layer…",
  "Cross-validating trend patterns…",
  "Building confidence matrix…",
  "Finalising prediction output…",
];

/* stored after login */
let currentPhone = "";
let currentPass  = "";
let cachedTrends = [];

/* ─── BOOT ──────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {

  /* Restore saved credentials */
  const saved = loadCreds();
  if (saved) {
    document.getElementById("inp-phone").value = saved.phone;
    document.getElementById("inp-pass").value  = saved.pass;
    currentPhone = saved.phone;
    currentPass  = saved.pass;
    setBadge("ok", "✅ Credentials loaded — click Login");
  }

  /* Password eye toggle */
  document.getElementById("pwEye").addEventListener("click", () => {
    const f = document.getElementById("inp-pass");
    f.type  = f.type === "password" ? "text" : "password";
    document.getElementById("pwEye").textContent = f.type === "password" ? "👁" : "🙈";
  });

  /* S1 buttons */
  document.getElementById("btnLogin").addEventListener("click", doLogin);
  document.getElementById("btnSkip").addEventListener("click", () => goS3(false));

  /* S2 buttons */
  document.getElementById("btnS2Back").addEventListener("click", goS1);
  document.getElementById("btnGoDash").addEventListener("click", () => goS3(true));

  /* S3 buttons */
  document.getElementById("btnS3Back").addEventListener("click", goS1);
  document.getElementById("btnRefresh").addEventListener("click", doFetch);
  document.getElementById("btnPredict").addEventListener("click", doPredict);
});

/* ─── SCREEN HELPERS ───────────────────────────── */
function showOnly(id) {
  ["s1","s2","s3"].forEach(s => {
    const el = document.getElementById(s);
    if (s === id) el.classList.add("active");
    else          el.classList.remove("active");
  });
  window.scrollTo(0, 0);
}
function goS1() { showOnly("s1"); }
function goS2() {
  /* Load website into iframe */
  const frame = document.getElementById("siteFrame");
  const urlEl = document.getElementById("s2Url");
  frame.src = SITE_LOGIN_URL;
  urlEl.textContent = SITE_LOGIN_URL;

  /* After 1.5 s redirect iframe to game page */
  setTimeout(() => {
    frame.src = SITE_GAME_URL;
    urlEl.textContent = SITE_GAME_URL;
  }, 1500);

  /* Show logged-in phone */
  document.getElementById("previewPhone").textContent = currentPhone || "—";

  showOnly("s2");
}
function goS3(fetch) {
  showOnly("s3");
  if (fetch) doFetch();
  else {
    /* Show empty dashboard so user can still use Refresh */
    document.getElementById("dashSub").textContent = "Manual mode — tap 🔄 Refresh to load data";
    renderAll([], null, null);
  }
}

/* ─── LOGIN ─────────────────────────────────────── */
function doLogin() {
  const phone = document.getElementById("inp-phone").value.trim();
  const pass  = document.getElementById("inp-pass").value.trim();
  const errEl = document.getElementById("lcErr");
  const btn   = document.getElementById("btnLogin");

  errEl.textContent = "";

  if (!phone) { errEl.textContent = "⚠ Phone number is required."; return; }
  if (!pass)  { errEl.textContent = "⚠ Password is required."; return; }

  /* Save credentials */
  currentPhone = phone;
  currentPass  = pass;
  if (document.getElementById("chkSave").checked) saveCreds(phone, pass);

  btn.disabled = true;
  btn.textContent = "Opening website…";
  setBadge("loading", "Credentials saved — opening website…");

  setTimeout(() => {
    btn.disabled = false;
    btn.innerHTML = "🚀 Login &amp; Open Website";
    setBadge("ok", "✅ Logged in as " + phone);
    goS2();
  }, 500);
}

/* ─── FETCH DATA from fetch-data.php ───────────── */
async function doFetch() {
  showLoader(true);
  hideErr();
  hideContent();
  resetSteps();

  const stepIds = ["ls1","ls2","ls3","ls4","ls5"];
  let si = 0;
  stepSet(stepIds[si++], "on");

  const timer = setInterval(() => {
    if (si < stepIds.length) {
      stepSet(stepIds[si - 1], "done");
      stepSet(stepIds[si++], "on");
    }
  }, 650);

  try {
    /* Send credentials via POST so PHP can do the real login */
    const body = new URLSearchParams({
      phone: currentPhone,
      pass:  currentPass,
    });

    const res  = await fetch(FETCH_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded",
                 "Accept": "application/json" },
      body: body.toString(),
    });

    const data = await res.json();
    clearInterval(timer);
    stepIds.forEach(s => stepSet(s, "done"));

    if (data.status === "error") throw new Error(data.error);
    if (!Array.isArray(data.trends) || !data.trends.length)
      throw new Error("No trend records returned from YaarWin.");

    cachedTrends = data.trends;

    /* Auto-run prediction */
    let pred = null;
    try { pred = await callPredict(cachedTrends); } catch(_) {}

    showLoader(false);
    renderAll(cachedTrends, pred, data.fetched_at);

  } catch (err) {
    clearInterval(timer);
    showLoader(false);
    showErr("❌ " + err.message
      + (currentPhone ? "" : " — Please go back and enter credentials first."));
    renderAll([], null, null);
  }
}

/* ─── PREDICT (calls api.php) ───────────────────── */
async function doPredict() {
  if (cachedTrends.length < 10) {
    showErr("⚠ Need 10 trend records to predict. Tap 🔄 Refresh first.");
    return;
  }

  const overlay = document.getElementById("overlay");
  const stepEl  = document.getElementById("ovStep");
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
    const pred = await callPredict(cachedTrends);
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

async function callPredict(trends) {
  const r = await fetch(PREDICT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trends }),
  });
  const d = await r.json();
  if (d.status === "error") throw new Error(d.error);
  return d;
}

/* ─── RENDER ────────────────────────────────────── */
function renderAll(trends, pred, fetchedAt) {
  const subEl = document.getElementById("dashSub");
  subEl.textContent = fetchedAt
    ? "Last fetched: " + fetchedAt
    : (currentPhone ? "Logged in as " + currentPhone : "Manual mode");

  /* History rows */
  const wrap = document.getElementById("histRows");
  wrap.innerHTML = "";

  if (!trends.length) {
    wrap.innerHTML =
      '<div style="padding:20px;text-align:center;color:#2a2a4e;font-size:13px;">' +
      'No data — tap 🔄 Refresh (make sure credentials are set)</div>';
  } else {
    trends.forEach((t, i) => {
      const cl = t.color.toLowerCase();
      const sl = t.size.toLowerCase();
      const row = document.createElement("div");
      row.className = "hist-row";
      row.innerHTML =
        `<span class="h-idx">${i + 1}</span>` +
        `<span class="h-pid">${t.trendId}</span>` +
        `<span><span class="nbadge">${t.number}</span></span>` +
        `<span><span class="cpill ${cl}">${t.color}</span></span>` +
        `<span><span class="spill ${sl === "mb" ? "mb" : "ms"}">${t.size}</span></span>`;
      wrap.appendChild(row);
    });
  }

  if (pred) renderPred(pred);

  showContent();
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
    setTimeout(() => {
      document.getElementById("confFill").style.width = conf + "%";
    }, 60)
  );
}

/* ─── UI HELPERS ────────────────────────────────── */
function showLoader(v) {
  document.getElementById("loaderWrap").classList.toggle("on", v);
}
function showContent() {
  document.getElementById("dashContent").classList.add("on");
}
function hideContent() {
  document.getElementById("dashContent").classList.remove("on");
}
function showErr(msg) {
  const el = document.getElementById("errBar");
  el.textContent = msg;
  el.classList.add("on");
}
function hideErr() {
  document.getElementById("errBar").classList.remove("on");
}
function resetSteps() {
  ["ls1","ls2","ls3","ls4","ls5"].forEach(id => stepSet(id, ""));
}
function stepSet(id, cls) {
  const el = document.getElementById(id);
  if (el) el.className = "loader-item" + (cls ? " " + cls : "");
}
function setBadge(state, msg) {
  document.getElementById("bdot").className   = "bdot " + state;
  document.getElementById("btext").textContent = msg;
}

/* ─── CREDENTIAL STORAGE ────────────────────────── */
function saveCreds(phone, pass) {
  try {
    localStorage.setItem(CRED_KEY, JSON.stringify({ phone, pass }));
  } catch(e) {}
}
function loadCreds() {
  try {
    const d = localStorage.getItem(CRED_KEY);
    return d ? JSON.parse(d) : null;
  } catch(e) { return null; }
}

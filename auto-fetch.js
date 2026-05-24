/**
 * auto-fetch.js
 * Floating card controller — monitors iframe URL changes
 * and reacts:
 *
 *  yaarwin.app/#/login         → "Login Now To Start"
 *  yaarwin.app/#/              → "Login Successful ✅"
 *  yaarwin.app/#/saasLottery   → "Fetching The Details…" → show prediction
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

let lastUrl       = "";
let isMinimized   = false;
let isFetching    = false;
let cachedTrends  = [];
let urlPollTimer  = null;

/* ── BOOT ─────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {

  /* Minimise / restore */
  document.getElementById("fcMinBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    minimize();
  });
  document.getElementById("floatCard").addEventListener("click", () => {
    if (isMinimized) restore();
  });

  /* Refetch button */
  document.getElementById("btnRefetch").addEventListener("click", () => {
    if (!isFetching) doFetch();
  });

  /* Start polling iframe URL every 800ms */
  urlPollTimer = setInterval(checkIframeUrl, 800);

  /* Initial state */
  setCard("login");
});

/* ── URL MONITOR ──────────────────────────── */
function checkIframeUrl() {
  const frame = document.getElementById("siteFrame");
  let url = "";
  try {
    url = frame.contentWindow.location.href;
  } catch(e) {
    /* cross-origin block — use last known */
    url = lastUrl || "https://yaarwin.app/#/login";
  }

  if (url === lastUrl) return;   /* no change */
  lastUrl = url;

  const hash = url.split("#")[1] || "";

  if (hash.includes("/saasLottery") || hash.includes("WinGo")) {
    /* On the WinGo game page */
    if (!isFetching) {
      setCard("fetching");
      doFetch();
    }
  } else if (hash === "/" || hash === "" || hash.includes("/home") || hash.includes("/index")) {
    /* On home page after login */
    setCard("loggedIn");
    /* hide result until we fetch */
    showResult(false);
  } else if (hash.includes("/login") || hash.includes("/register")) {
    /* On login page */
    setCard("login");
    showResult(false);
  } else {
    /* Other pages — neutral */
    setCard("loggedIn");
  }
}

/* ── CARD STATES ──────────────────────────── */
function setCard(state) {
  const dot  = document.getElementById("fcDot");
  const badge = document.getElementById("fcBadgeText");
  const msg  = document.getElementById("fcMsg");
  const sub  = document.getElementById("fcSub");

  dot.className = "fc-dot";   /* reset */

  if (state === "login") {
    badge.textContent = "Prediction Tool";
    msg.innerHTML     = "Login Now To Start";
    sub.textContent   = "Please log in to yaarwin.app to continue";
  }
  else if (state === "loggedIn") {
    dot.classList.add("green");
    badge.textContent = "Connected";
    msg.innerHTML     = "Login Successful ✅";
    sub.textContent   = "Navigate to WinGo 30s game to get predictions";
  }
  else if (state === "fetching") {
    dot.classList.add("yellow");
    badge.textContent = "Working…";
    msg.innerHTML = 'Fetching The Details <span class="fc-dots"><span></span><span></span><span></span></span>';
    sub.textContent = "Analyzing last 10 WinGo results…";
    showResult(false);
  }
  else if (state === "done") {
    dot.classList.add("green");
    badge.textContent = "Prediction Ready";
    msg.innerHTML     = "✅ Next Result Predicted";
    sub.textContent   = "Based on last 10 completed rounds";
    showResult(true);
  }
  else if (state === "error") {
    dot.classList.add("red");
    badge.textContent = "Error";
  }
}

function showResult(v) {
  document.getElementById("fcResult").style.display = v ? "block" : "none";
}

/* ── FETCH DATA ───────────────────────────── */
async function doFetch() {
  if (isFetching) return;
  isFetching = true;

  const btn = document.getElementById("btnRefetch");
  if (btn) btn.disabled = true;

  setCard("fetching");

  try {
    /* POST credentials from localStorage */
    const creds = loadCreds();
    const body  = new URLSearchParams({
      phone: creds?.phone || "",
      pass:  creds?.pass  || "",
    });

    const res  = await fetch(FETCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body.toString(),
    });
    const data = await res.json();

    if (data.status === "error") throw new Error(data.error);
    if (!Array.isArray(data.trends) || !data.trends.length)
      throw new Error("No trend data returned.");

    cachedTrends = data.trends;

    /* Run prediction — with 10-15 sec animated wait */
    await animatedWait(10000, 15000);
    const pred = await callPredict(cachedTrends);

    renderResult(pred);
    setCard("done");

  } catch(err) {
    setCard("error");
    document.getElementById("fcMsg").textContent = "⚠ " + err.message;
    document.getElementById("fcSub").textContent = "Tap Fetch Next Result to retry";
    showResult(false);
  } finally {
    isFetching = false;
    if (btn) btn.disabled = false;
  }
}

/* ── PREDICT ─────────────────────────────── */
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

/* ── RENDER RESULT ────────────────────────── */
function renderResult(pred) {
  document.getElementById("rPeriod").textContent = pred.predicted_trend_id ?? "—";
  document.getElementById("rNum").textContent    = pred.predicted_number    ?? "—";

  const c = (pred.predicted_color ?? "").toLowerCase();
  document.getElementById("rColor").innerHTML =
    `<span class="pill ${c}">${pred.predicted_color ?? "—"}</span>`;

  const s = (pred.predicted_size ?? "").toLowerCase();
  document.getElementById("rSize").innerHTML =
    `<span class="pill ${s === "mb" ? "mb" : "ms"}">${pred.predicted_size ?? "—"}</span>`;

  const conf = pred.confidence ?? 0;
  document.getElementById("rConf").textContent = conf + "%";
  requestAnimationFrame(() =>
    setTimeout(() => { document.getElementById("rConfBar").style.width = conf + "%"; }, 60)
  );
}

/* ── ANIMATED WAIT (10-15 sec) ─────────────── */
function animatedWait(minMs, maxMs) {
  const wait = minMs + Math.random() * (maxMs - minMs);
  const steps = [
    "🔐 Logging in to YaarWin…",
    "📡 Requesting WinGo 30s history…",
    "📦 Parsing last 10 results…",
    "🔄 Running Calcute algorithm…",
    "📊 Applying statistical layer…",
    "✨ Building prediction…",
  ];
  let si = 0;
  const sub = document.getElementById("fcSub");
  const interval = setInterval(() => {
    if (si < steps.length) sub.textContent = steps[si++];
    else clearInterval(interval);
  }, wait / steps.length);
  return new Promise(resolve => setTimeout(() => { clearInterval(interval); resolve(); }, wait));
}

/* ── MINIMISE / RESTORE ─────────────────────── */
function minimize() {
  isMinimized = true;
  document.getElementById("floatCard").classList.add("minimized");
  document.getElementById("fcMinBtn").textContent = "+";
}
function restore() {
  isMinimized = false;
  document.getElementById("floatCard").classList.remove("minimized");
  document.getElementById("fcMinBtn").textContent = "—";
}

/* ── CREDENTIAL STORAGE ─────────────────────── */
function saveCreds(phone, pass) {
  try { localStorage.setItem(CRED_KEY, JSON.stringify({ phone, pass })); } catch(e) {}
}
function loadCreds() {
  try { const d = localStorage.getItem(CRED_KEY); return d ? JSON.parse(d) : null; } catch(e) { return null; }
}

/**
 * auto-fetch.js
 * Floating card controller with hardcoded navigation buttons.
 *
 * Since yaarwin.app is cross-origin (iframe URL cannot be read),
 * we use 3 navigation buttons on the floating card:
 *
 *  [Login Page] → loads login URL + shows "Login Now To Start"
 *  [Home]       → loads home URL  + shows "Login Successful ✅"
 *  [WinGo]     → loads game URL  + shows "Fetching…" → prediction
 *
 * Hardcoded URLs:
 *   Login: https://yaarwin.app/#/login
 *   Home:  https://yaarwin.app/#/
 *   WinGo: https://yaarwin.app/#/saasLottery/WinGo?gameCode=WinGo_30S&lottery=WinGo
 */
"use strict";

/* ── HARDCODED URLS ─────────────────────────── */
const URL_LOGIN = "https://yaarwin.app/#/login";
const URL_HOME  = "https://yaarwin.app/#/";
const URL_WINGO = "https://yaarwin.app/#/saasLottery/WinGo?gameCode=WinGo_30S&lottery=WinGo";

const FETCH_URL   = "fetch-data.php";
const PREDICT_URL = "api.php";
const CRED_KEY    = "yw_creds";

let isMinimized  = false;
let isFetching   = false;
let cachedTrends = [];

/* ── BOOT ─────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {

  /* Navigation buttons */
  document.getElementById("navLogin").addEventListener("click", () => {
    navigateTo(URL_LOGIN);
    setCard("login");
    showResult(false);
  });

  document.getElementById("navHome").addEventListener("click", () => {
    navigateTo(URL_HOME);
    setCard("loggedIn");
    showResult(false);
  });

  document.getElementById("navWingo").addEventListener("click", () => {
    navigateTo(URL_WINGO);
    if (!isFetching) {
      setCard("fetching");
      doFetch();
    }
  });

  /* Minimise / restore */
  document.getElementById("fcMinBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMinimize();
  });
  document.getElementById("floatCard").addEventListener("click", () => {
    if (isMinimized) toggleMinimize();
  });

  /* Refetch button */
  document.getElementById("btnRefetch").addEventListener("click", () => {
    if (!isFetching) doFetch();
  });

  /* Initial state: login page */
  setCard("login");
});

/* ── NAVIGATE IFRAME ──────────────────────────── */
function navigateTo(url) {
  const frame = document.getElementById("siteFrame");
  frame.src = url;
}

/* ── CARD STATES ──────────────────────────────── */
function setCard(state) {
  const dot   = document.getElementById("fcDot");
  const badge = document.getElementById("fcBadgeText");
  const msg   = document.getElementById("fcMsg");
  const sub   = document.getElementById("fcSub");

  dot.className = "fc-dot"; /* reset */

  switch (state) {
    case "login":
      badge.textContent = "Prediction Tool";
      msg.innerHTML     = "🔐 Login Now To Start";
      sub.textContent   = "Please log in to yaarwin.app to continue";
      break;

    case "loggedIn":
      dot.classList.add("green");
      badge.textContent = "Connected";
      msg.innerHTML     = "✅ Login Successful";
      sub.textContent   = "Tap [🎮 WinGo] button to get predictions";
      break;

    case "fetching":
      dot.classList.add("yellow");
      badge.textContent = "Working…";
      msg.innerHTML     = 'Fetching The Details <span class="fc-dots"><span></span><span></span><span></span></span>';
      sub.textContent   = "Analyzing last 10 WinGo 30s results…";
      showResult(false);
      break;

    case "done":
      dot.classList.add("green");
      badge.textContent = "Prediction Ready";
      msg.innerHTML     = "🎯 Next Result Predicted";
      sub.textContent   = "Based on last 10 completed rounds";
      showResult(true);
      break;

    case "error":
      dot.classList.add("red");
      badge.textContent = "Error";
      break;
  }
}

function showResult(v) {
  document.getElementById("fcResult").style.display = v ? "block" : "none";
}

/* ── FETCH DATA ───────────────────────────────── */
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

    const res = await fetch(FETCH_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body:    body.toString(),
    });
    const data = await res.json();

    if (data.status === "error") throw new Error(data.error);
    if (!Array.isArray(data.trends) || !data.trends.length)
      throw new Error("No trend data returned.");

    cachedTrends = data.trends;

    /* Animated wait 10-15 seconds to simulate analysis */
    await animatedWait(10000, 15000);

    /* Run prediction through api.php */
    const pred = await callPredict(cachedTrends);

    renderResult(pred);
    setCard("done");

  } catch (err) {
    setCard("error");
    document.getElementById("fcMsg").textContent = "⚠ " + err.message;
    document.getElementById("fcSub").textContent = "Tap 🔍 Fetch Next Result to retry";
    showResult(false);
  } finally {
    isFetching = false;
    if (btn) btn.disabled = false;
  }
}

/* ── PREDICT (call api.php) ───────────────────── */
async function callPredict(trends) {
  const r = await fetch(PREDICT_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ trends }),
  });
  const d = await r.json();
  if (d.status === "error") throw new Error(d.error);
  return d;
}

/* ── RENDER PREDICTION ────────────────────────── */
function renderResult(pred) {
  document.getElementById("rPeriod").textContent = pred.predicted_trend_id ?? "—";
  document.getElementById("rNum").textContent    = pred.predicted_number   ?? "—";

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

/* ── ANIMATED WAIT (10-15 seconds) ────────────── */
function animatedWait(minMs, maxMs) {
  const wait = minMs + Math.random() * (maxMs - minMs);
  const steps = [
    "🔐 Connecting to YaarWin server…",
    "📡 Requesting WinGo 30s game history…",
    "📦 Parsing last 10 completed results…",
    "🔄 Running Calcute prediction algorithm…",
    "📊 Applying Pythonhelp statistical layer…",
    "✨ Finalising prediction output…",
  ];
  let si = 0;
  const sub = document.getElementById("fcSub");
  const interval = setInterval(() => {
    if (si < steps.length) sub.textContent = steps[si++];
    else clearInterval(interval);
  }, wait / steps.length);
  return new Promise(resolve =>
    setTimeout(() => { clearInterval(interval); resolve(); }, wait)
  );
}

/* ── MINIMISE / RESTORE ───────────────────────── */
function toggleMinimize() {
  isMinimized = !isMinimized;
  document.getElementById("floatCard").classList.toggle("minimized", isMinimized);
}

/* ── CREDENTIAL STORAGE ───────────────────────── */
function saveCreds(phone, pass) {
  try { localStorage.setItem(CRED_KEY, JSON.stringify({ phone, pass })); } catch(e) {}
}
function loadCreds() {
  try { const d = localStorage.getItem(CRED_KEY); return d ? JSON.parse(d) : null; } catch(e) { return null; }
}

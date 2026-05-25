/**
 * auto-fetch.js  —  Floating Card State Machine
 * ─────────────────────────────────────────────
 * Since yaarwin.app is cross-origin, we CANNOT read the iframe URL.
 * Instead, the 3 nav buttons tell the card which page the user is on:
 *
 *  [📱 Login]  → navigate iframe to Login  + card shows "Login Now To Start"
 *  [🏠 Home]   → navigate iframe to Home   + card shows "Login Successful ✅"
 *  [🎮 WinGo]  → navigate iframe to WinGo + card shows "Fetching Details…"
 *               → PHP fetches last 10 via YaarWin API
 *               → Prediction engine runs (10-15 sec animated)
 *               → Shows result: Number / Color / Size / Confidence
 *
 * Credentials are saved in localStorage and sent as POST to fetch-data.php.
 * fetch-data.php does the real YaarWin login + history fetch server-side.
 */

"use strict";

/* ════════════════ HARDCODED URLS ════════════════ */
const URL_LOGIN = "https://yaarwin.app/#/login";
const URL_HOME  = "https://yaarwin.app/#/";
const URL_WINGO = "https://yaarwin.app/#/saasLottery/WinGo?gameCode=WinGo_30S&lottery=WinGo";

const FETCH_URL   = "fetch-data.php";
const PREDICT_URL = "api.php";
const CRED_KEY    = "yw_creds";

/* analysis step messages shown while waiting */
const STEPS = [
  "🔐 Connecting to YaarWin server…",
  "📡 Requesting WinGo 30s game history…",
  "📊 Receiving last 10 completed rounds…",
  "🔄 Running Calcute.php algorithm…",
  "📐 Applying Pythonhelp statistical layer…",
  "🧮 Building confidence matrix…",
  "✨ Finalising prediction output…",
];

/* ════════════════ STATE ════════════════ */
let isMini    = false;
let isBusy    = false;
let trends    = [];   // last 10 records from API

/* ════════════════ BOOT ════════════════ */
document.addEventListener("DOMContentLoaded", () => {

  /* nav buttons */
  document.getElementById("nb-login").addEventListener("click", handleLogin);
  document.getElementById("nb-home" ).addEventListener("click", handleHome);
  document.getElementById("nb-wingo").addEventListener("click", handleWingo);

  /* mini/restore */
  document.getElementById("cMinBtn").addEventListener("click", e => {
    e.stopPropagation();
    setMini(true);
  });
  document.getElementById("card").addEventListener("click", () => {
    if (isMini) setMini(false);
  });

  /* fetch-next button */
  document.getElementById("btnGo").addEventListener("click", () => {
    if (!isBusy) runFetch();
  });

  /* restore saved state */
  setState("login");
});

/* ════════════════ NAV HANDLERS ════════════════ */
function handleLogin() {
  goFrame(URL_LOGIN);
  setState("login");
  hide("resultPanel");
  hide("last10Wrap");
}

function handleHome() {
  goFrame(URL_HOME);
  setState("home");
  hide("resultPanel");
  hide("last10Wrap");
}

function handleWingo() {
  goFrame(URL_WINGO);
  if (isBusy) return;
  setState("fetching");
  hide("resultPanel");
  hide("last10Wrap");
  runFetch();
}

/* ════════════════ IFRAME NAVIGATION ════════════════ */
function goFrame(url) {
  document.getElementById("siteFrame").src = url;
}

/* ════════════════ CARD STATE MACHINE ════════════════ */
function setState(s) {
  const dot   = document.getElementById("cdot");
  const badge = document.getElementById("cbadge");
  const msg   = document.getElementById("cMsg");
  const sub   = document.getElementById("cSub");

  /* reset dot class */
  dot.className = "cdot";

  switch (s) {
    case "login":
      badge.textContent = "Prediction Tool";
      msg.innerHTML     = "🔐 Login Now To Start";
      sub.textContent   = "Please log in to yaarwin.app to continue";
      break;

    case "home":
      dot.classList.add("g");
      badge.textContent = "Connected";
      msg.innerHTML     = "✅ Login Successful";
      sub.textContent   = "Tap 🎮 WinGo to fetch game results & predict";
      break;

    case "fetching":
      dot.classList.add("y");
      badge.textContent = "Analyzing…";
      msg.innerHTML     = 'Fetching The Details <span class="ldots"><span></span><span></span><span></span></span>';
      sub.textContent   = STEPS[0];
      break;

    case "done":
      dot.classList.add("g");
      badge.textContent = "Prediction Ready ✅";
      msg.innerHTML     = "🎯 Next Result Predicted";
      sub.textContent   = "Based on last 10 completed WinGo 30s rounds";
      break;

    case "error":
      dot.classList.add("r");
      badge.textContent = "Error";
      break;
  }
}

/* ════════════════ MAIN FETCH + PREDICT PIPELINE ════════════════ */
async function runFetch() {
  if (isBusy) return;
  isBusy = true;

  const btn = document.getElementById("btnGo");
  btn.disabled = true;
  setState("fetching");
  hide("resultPanel");
  hide("last10Wrap");

  try {
    /* Step A: fetch game history via PHP */
    const creds = loadCreds();
    const body  = new URLSearchParams({
      phone: creds?.phone ?? "",
      pass:  creds?.pass  ?? "",
    });

    const res  = await fetch(FETCH_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
      body:    body.toString(),
    });
    const data = await res.json();

    if (data.status === "error") throw new Error(data.error);
    if (!Array.isArray(data.trends) || data.trends.length < 1)
      throw new Error("No trend data returned from YaarWin API.");

    trends = data.trends;

    /* Step B: show last-10 table immediately */
    renderLast10(trends);

    /* Step C: animated wait 10-15 seconds while showing step messages */
    await animatedWait(10000, 15000);

    /* Step D: run prediction via api.php */
    const pred = await callPredict(trends);

    /* Step E: render result */
    renderResult(pred);
    setState("done");
    show("resultPanel");

  } catch (err) {
    setState("error");
    document.getElementById("cMsg").innerHTML = "⚠ " + sanitizeErr(err.message);
    document.getElementById("cSub").textContent = "Tap 🔍 Fetch Next Result to retry";
    hide("resultPanel");
    hide("last10Wrap");
  } finally {
    isBusy = false;
    btn.disabled = false;
  }
}

/* ════════════════ PREDICT via api.php ════════════════ */
async function callPredict(trendList) {
  const r = await fetch(PREDICT_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ trends: trendList }),
  });
  const d = await r.json();
  if (d.status === "error") throw new Error(d.error);
  return d;
}

/* ════════════════ RENDER LAST-10 TABLE ════════════════ */
function renderLast10(list) {
  const body = document.getElementById("t10Body");
  body.innerHTML = "";
  list.forEach((t, i) => {
    const cl  = t.color.toLowerCase();
    const sl  = t.size.toLowerCase() === "mb" ? "mb" : "ms";
    const row = document.createElement("div");
    row.className = "t10-row";
    row.innerHTML =
      `<span class="t10-i">${i + 1}</span>` +
      `<span class="t10-pid">${t.trendId}</span>` +
      `<span class="t10-n"><span class="nbadge">${t.number}</span></span>` +
      `<span><span class="pill ${cl}">${t.color}</span></span>` +
      `<span><span class="spill ${sl}">${t.size}</span></span>`;
    body.appendChild(row);
  });
  show("last10Wrap");
}

/* ════════════════ RENDER PREDICTION RESULT ════════════════ */
function renderResult(pred) {
  document.getElementById("rPid").textContent = pred.predicted_trend_id ?? "—";
  document.getElementById("rNum").textContent = pred.predicted_number   ?? "—";

  const c = (pred.predicted_color ?? "").toLowerCase();
  document.getElementById("rColor").innerHTML =
    `<span class="pill ${c}">${pred.predicted_color ?? "—"}</span>`;

  const s = (pred.predicted_size ?? "").toLowerCase();
  document.getElementById("rSize").innerHTML =
    `<span class="pill ${s === "mb" ? "mb" : "ms"}">${pred.predicted_size ?? "—"}</span>`;

  const conf = +(pred.confidence ?? 0);
  document.getElementById("rConf").textContent = conf + "%";
  requestAnimationFrame(() =>
    setTimeout(() => { document.getElementById("rConfBar").style.width = conf + "%"; }, 80)
  );
}

/* ════════════════ ANIMATED WAIT (10–15 sec) ════════════════ */
function animatedWait(minMs, maxMs) {
  const total    = minMs + Math.random() * (maxMs - minMs);
  const interval = total / STEPS.length;
  let   idx      = 0;
  const subEl    = document.getElementById("cSub");

  const timer = setInterval(() => {
    idx++;
    if (idx < STEPS.length) subEl.textContent = STEPS[idx];
    else clearInterval(timer);
  }, interval);

  return new Promise(resolve =>
    setTimeout(() => { clearInterval(timer); resolve(); }, total)
  );
}

/* ════════════════ MINI / RESTORE ════════════════ */
function setMini(v) {
  isMini = v;
  document.getElementById("card").classList.toggle("mini", v);
}

/* ════════════════ HELPERS ════════════════ */
function show(id) { document.getElementById(id).style.display = "block"; }
function hide(id) { document.getElementById(id).style.display = "none"; }

function sanitizeErr(msg) {
  return String(msg).replace(/</g, "&lt;").replace(/>/g, "&gt;").substring(0, 120);
}

/* ════════════════ CREDENTIAL STORAGE ════════════════ */
function saveCreds(phone, pass) {
  try { localStorage.setItem(CRED_KEY, JSON.stringify({ phone, pass })); } catch (_) {}
}
function loadCreds() {
  try {
    const raw = localStorage.getItem(CRED_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

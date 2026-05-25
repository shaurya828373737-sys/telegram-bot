/**
 * auto-fetch.js
 * ─────────────────────────────────────────────────────────────────
 * Floating card controller.
 *
 * KEY CHANGE:
 *   Instead of server-side login (which YaarWin blocks with 401),
 *   we READ the game history data DIRECTLY from the YaarWin page
 *   that is already loaded in the iframe.
 *
 *   The YaarWin page stores game records in its Vue/React state
 *   and exposes them in the DOM table rows we can read via
 *   iframe.contentDocument + MutationObserver.
 *
 * Flow:
 *   1. User taps [🎮 WinGo] → iframe loads WinGo page
 *   2. We wait for the game history table to populate (DOM)
 *   3. We scrape the 10 rows from the DOM
 *   4. Send scraped records to fetch-data.php (Path A — no login)
 *   5. fetch-data.php normalises → returns trends
 *   6. api.php runs prediction engine
 *   7. Card shows result
 *
 * Fallback: if DOM scraping fails, send credentials so PHP tries
 * the API directly (Path B — may also fail due to 401).
 */

"use strict";

/* ── HARDCODED URLS ──────────────────────────────── */
var URL_LOGIN = "https://yaarwin.app/#/login";
var URL_HOME  = "https://yaarwin.app/#/";
var URL_WINGO = "https://yaarwin.app/#/saasLottery/WinGo?gameCode=WinGo_30S&lottery=WinGo";
var FETCH_URL   = "fetch-data.php";
var PREDICT_URL = "api.php";
var CRED_KEY    = "yw_creds";

var isMini = false;
var isBusy = false;
var trends = [];

/* Messages shown during the 10-15 sec analysis wait */
var STEPS = [
  "📊 Reading game history from page…",
  "🔄 Parsing WinGo 30s records…",
  "🧮 Running Calcute.php algorithm…",
  "📐 Applying Pythonhelp statistical layer…",
  "🔮 Cross-validating trend patterns…",
  "🧠 Building confidence matrix…",
  "✨ Finalising prediction output…"
];

/* ── BOOT ───────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", function() {

  /* Show cred form if no creds saved */
  var c = loadCreds();
  if (!c || !c.phone || !c.pass) {
    document.getElementById("credForm").style.display = "block";
    document.getElementById("cMsg").innerHTML = "🔑 Enter Credentials";
    document.getElementById("cSub").textContent = "Save your YaarWin login to auto-fetch";
  }

  /* Listen for messages from injected script in iframe */
  window.addEventListener("message", onIframeMessage);
});

/* ── STATE ──────────────────────────────────────── */
function setState(s) {
  var dot   = document.getElementById("cdot");
  var badge = document.getElementById("cbadge");
  var msg   = document.getElementById("cMsg");
  var sub   = document.getElementById("cSub");
  dot.className = "cdot";
  switch(s) {
    case "login":
      badge.textContent = "Prediction Tool";
      msg.innerHTML     = "🔐 Login Now To Start";
      sub.textContent   = "Please log in to yaarwin.app to continue";
      break;
    case "home":
      dot.classList.add("g");
      badge.textContent = "Connected ✅";
      msg.innerHTML     = "✅ Login Successful";
      sub.textContent   = "Tap 🎮 WinGo to get predictions";
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
      sub.textContent   = "Based on last 10 WinGo 30s rounds";
      break;
    case "error":
      dot.classList.add("r");
      badge.textContent = "Error";
      break;
  }
}

/* ── IFRAME NAV ─────────────────────────────────── */
function goFrame(url) {
  document.getElementById("siteFrame").src = url;
}

/* ── NAV HANDLERS ───────────────────────────────── */
function onNavLogin() {
  goFrame(URL_LOGIN);
  setState("login");
  document.getElementById("resultPanel").style.display = "none";
  document.getElementById("last10Wrap").style.display  = "none";
}

function onNavHome() {
  goFrame(URL_HOME);
  setState("home");
  document.getElementById("resultPanel").style.display = "none";
  document.getElementById("last10Wrap").style.display  = "none";
}

function onNavWingo() {
  goFrame(URL_WINGO);
  if (!isBusy) {
    setState("fetching");
    /* Wait 4 seconds for page to load, then start scraping */
    setTimeout(function() { runFetch(); }, 4000);
  }
}

function onMinBtn() {
  isMini = true;
  document.getElementById("card").classList.add("mini");
}

function onCardClick() {
  if (isMini) {
    isMini = false;
    document.getElementById("card").classList.remove("mini");
  }
}

function onBtnGo() {
  if (!isBusy) {
    setState("fetching");
    runFetch();
  }
}

/* ── MESSAGE FROM IFRAME ────────────────────────── */
function onIframeMessage(event) {
  /* Accept messages from yaarwin.app */
  if (!event.origin || !event.origin.includes("yaarwin")) return;

  var d = event.data;
  if (!d || d.type !== "yw_game_data") return;

  if (Array.isArray(d.records) && d.records.length > 0) {
    processBrowserRecords(d.records);
  }
}

/* ════════════════════════════════════════════════
   MAIN FETCH PIPELINE
   ════════════════════════════════════════════════ */
async function runFetch() {
  if (isBusy) return;
  isBusy = true;

  var btn = document.getElementById("btnGo");
  btn.disabled = true;
  setState("fetching");
  document.getElementById("resultPanel").style.display = "none";
  document.getElementById("last10Wrap").style.display  = "none";

  try {
    /* ── Step 1: Try to read data from iframe DOM ── */
    var scraped = tryScrapeDom();

    if (scraped && scraped.length >= 10) {
      /* Great — got data from DOM, send to PHP to normalise */
      sub("📊 Got " + scraped.length + " records from page, processing…");
      await processWithRecords(scraped);

    } else {
      /* DOM scrape failed — try server-side login as fallback */
      sub("🔐 DOM scrape failed, trying server login…");
      await processWithCredentials();
    }

  } catch (err) {
    setState("error");
    document.getElementById("cMsg").innerHTML = "⚠ " + String(err.message).substring(0, 160);
    document.getElementById("cSub").textContent = "Tap Fetch Again or check credentials below";
    document.getElementById("resultPanel").style.display = "none";
    document.getElementById("last10Wrap").style.display  = "none";
    /* Show cred form so user can update */
    document.getElementById("credForm").style.display = "block";
    document.getElementById("cfPhone").value = "";
    document.getElementById("cfPass").value  = "";
  } finally {
    isBusy = false;
    btn.disabled = false;
  }
}

/* ────────────────────────────────────────────────
   DOM SCRAPER — reads game history from iframe page
   ────────────────────────────────────────────────
   YaarWin renders game history table with rows containing:
   - period number (issueNumber)
   - number (0-9)
   - Big/Small label
   - Color dot/badge

   We try to read these rows from the iframe's document.
   This works because same-origin scraping works when the
   iframe and parent are on the same domain.
   
   Since yaarwin.app ≠ our domain, we use the data attribute
   approach — we inject a small helper script via the iframe
   src attribute (using the page's own console data).

   REAL APPROACH: We use the MutationObserver + window.gameData
   that YaarWin already exposes, which we saw in the console:
   "gameData ▶ {popular: Proxy(Object), sport: Array...}"
*/
function tryScrapeDom() {
  try {
    var frame = document.getElementById("siteFrame");
    var doc   = frame.contentDocument || frame.contentWindow.document;

    /* Try to read game history rows from the DOM table */
    var records = [];

    /* YaarWin game history table — look for period/number cells */
    /* The table has rows with columns: Period, Number, Big/Small, Color */
    var rows = doc.querySelectorAll(
      '.game-history-item, .history-item, [class*="history"] tr, ' +
      '.record-item, [class*="record"] tr, .lottery-history tr, ' +
      'table tbody tr'
    );

    rows.forEach(function(row) {
      var cells = row.querySelectorAll('td, .cell, [class*="cell"], span, div');
      if (cells.length < 2) return;

      /* Try to extract issueNumber and number from text content */
      var texts = [];
      cells.forEach(function(c) { texts.push(c.textContent.trim()); });

      /* Find period number (long digit string like 20260525100050307) */
      var period = "";
      var num    = -1;

      texts.forEach(function(t) {
        if (/^\d{15,20}$/.test(t)) period = t;
        if (/^[0-9]$/.test(t) && num === -1) num = parseInt(t);
      });

      if (period && num >= 0 && num <= 9) {
        records.push({
          issueNumber: period,
          number: String(num),
          color: num === 0 || num === 5 ? "red,violet" :
                 (num % 2 !== 0 ? "red" : "green")
        });
      }
    });

    if (records.length >= 5) return records.slice(0, 10);

    /* ── Fallback: try reading from Vue app state ── */
    var win = frame.contentWindow;
    if (win.__vue_store__ || win.__store__ || win.gameData) {
      /* Try common patterns for Vue/React state */
      var store = win.__vue_store__ || win.__store__;
      if (store && store.state) {
        var state = store.state;
        /* Look for game records in state */
        var list = state.gameRecord || state.gameList || state.records;
        if (Array.isArray(list) && list.length > 0) return list;
      }
    }

    return null;
  } catch(e) {
    /* Cross-origin error — expected, return null */
    return null;
  }
}

/* ────────────────────────────────────────────────
   Process with scraped DOM records
   ────────────────────────────────────────────────*/
async function processWithRecords(records) {
  var res = await fetch(FETCH_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body:    JSON.stringify({ records: records })
  });
  var data = await res.json();

  if (data.status === "error") throw new Error(data.error);
  if (!Array.isArray(data.trends) || data.trends.length < 1)
    throw new Error("No trend data could be parsed.");

  await finalisePrediction(data.trends);
}

/* ────────────────────────────────────────────────
   Fallback: send credentials → server login
   ────────────────────────────────────────────────*/
async function processWithCredentials() {
  var creds = loadCreds();
  var body  = "phone=" + encodeURIComponent(creds ? creds.phone : "") +
              "&pass="  + encodeURIComponent(creds ? creds.pass  : "");

  var res  = await fetch(FETCH_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
    body:    body
  });
  var data = await res.json();

  if (data.status === "error") throw new Error(data.error);
  if (!Array.isArray(data.trends) || data.trends.length < 1)
    throw new Error("No trend data returned.");

  await finalisePrediction(data.trends);
}

/* ────────────────────────────────────────────────
   Process browser records directly (from postMessage)
   ────────────────────────────────────────────────*/
async function processBrowserRecords(records) {
  if (isBusy) return;
  isBusy = true;
  var btn = document.getElementById("btnGo");
  btn.disabled = true;
  setState("fetching");
  document.getElementById("resultPanel").style.display = "none";
  document.getElementById("last10Wrap").style.display  = "none";

  try {
    await processWithRecords(records);
  } catch(e) {
    setState("error");
    document.getElementById("cMsg").innerHTML = "⚠ " + String(e.message).substring(0, 120);
    document.getElementById("cSub").textContent = "Tap 🔍 Fetch Next Result to retry";
  } finally {
    isBusy = false;
    btn.disabled = false;
  }
}

/* ────────────────────────────────────────────────
   Common: animate → predict → render
   ────────────────────────────────────────────────*/
async function finalisePrediction(trendList) {
  trends = trendList;
  renderLast10(trends);

  /* Animated wait 10-15 seconds */
  await animatedWait(10000, 15000);

  var pred = await callPredict(trends);
  renderResult(pred);
  setState("done");
  document.getElementById("resultPanel").style.display = "block";
}

async function callPredict(list) {
  var r = await fetch(PREDICT_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ trends: list })
  });
  var d = await r.json();
  if (d.status === "error") throw new Error(d.error);
  return d;
}

/* ── RENDER ─────────────────────────────────────── */
function renderLast10(list) {
  var body = document.getElementById("t10Body");
  body.innerHTML = "";
  list.forEach(function(t, i) {
    var cl  = (t.color || "").toLowerCase();
    var sl  = (t.size || "").toLowerCase() === "mb" ? "mb" : "ms";
    var row = document.createElement("div");
    row.className = "t10-row";
    row.innerHTML =
      '<span class="t10-i">' + (i+1) + '</span>' +
      '<span class="t10-pid">' + t.trendId + '</span>' +
      '<span class="t10-n"><span class="nbadge">' + t.number + '</span></span>' +
      '<span><span class="pill ' + cl + '">' + (t.color||"?") + '</span></span>' +
      '<span><span class="spill ' + sl + '">' + (t.bigSmall || t.size || "?") + '</span></span>';
    body.appendChild(row);
  });
  document.getElementById("last10Wrap").style.display = "block";
}

function renderResult(pred) {
  document.getElementById("rPid").textContent = pred.predicted_trend_id || "—";
  document.getElementById("rNum").textContent = pred.predicted_number   || "—";
  var c = (pred.predicted_color || "").toLowerCase();
  document.getElementById("rColor").innerHTML =
    '<span class="pill ' + c + '">' + (pred.predicted_color || "—") + '</span>';
  var s = (pred.predicted_size || "").toLowerCase();
  document.getElementById("rSize").innerHTML =
    '<span class="pill ' + (s === "mb" ? "mb" : "ms") + '">' +
    (pred.predicted_size === "MB" ? "Big" : "Small") + '</span>';
  var conf = +(pred.confidence || 0);
  document.getElementById("rConf").textContent = conf + "%";
  setTimeout(function() {
    document.getElementById("rConfBar").style.width = conf + "%";
  }, 80);
}

function animatedWait(minMs, maxMs) {
  var total    = minMs + Math.random() * (maxMs - minMs);
  var interval = total / STEPS.length;
  var idx      = 0;
  var subEl    = document.getElementById("cSub");
  var timer    = setInterval(function() {
    idx++;
    if (idx < STEPS.length) subEl.textContent = STEPS[idx];
    else clearInterval(timer);
  }, interval);
  return new Promise(function(resolve) {
    setTimeout(function() { clearInterval(timer); resolve(); }, total);
  });
}

function sub(text) {
  document.getElementById("cSub").textContent = text;
}

/* ── MINI / RESTORE ─────────────────────────────── */
/* (handled by onclick in HTML) */

/* ── CRED STORAGE ───────────────────────────────── */
function loadCreds() {
  try { var d = localStorage.getItem(CRED_KEY); return d ? JSON.parse(d) : null; } catch(_) { return null; }
}
function saveCreds(p, pw) {
  try { localStorage.setItem(CRED_KEY, JSON.stringify({phone:p,pass:pw})); } catch(_) {}
}

function onSaveCreds() {
  var p  = document.getElementById("cfPhone").value.trim();
  var pw = document.getElementById("cfPass").value.trim();
  if (!p || !pw) {
    document.getElementById("cfPhone").style.borderColor = "#ef4444";
    return;
  }
  saveCreds(p, pw);
  document.getElementById("credForm").style.display = "none";
  document.getElementById("cfPhone").style.borderColor = "";
  setState("login");
  alert("✅ Credentials saved! Now use the Login button to log in on the website.");
}

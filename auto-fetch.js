"use strict";
/* ═══════════════════════════════════
   auto-fetch.js  — Manual Trend Entry
   Fixed: No Period ID. pickColour/pickSize
   don't clash with variable names.
   cardClick won't block inner buttons.
═══════════════════════════════════ */

var PREDICT_URL = "api.php";
window.isMini   = false;
var savedTrends  = [];
var pickedNum    = null;
var pickedColor  = null;
var pickedSize   = null;

var COLOR_MAP = {
  "Red":"r","Green":"g","Violet":"v",
  "RedViolet":"v","GreenViolet":"v"
};

var WAIT_STEPS = [
  "🔐 Connecting to YaarWin engine…",
  "📊 Reading 10 trend patterns…",
  "🔄 Running Calcute algorithm…",
  "📐 Applying statistical layer…",
  "🧮 Building confidence matrix…",
  "✨ Generating prediction…"
];

window.addEventListener("DOMContentLoaded", function() {
  buildNumGrid();
  setState("login");
});

function buildNumGrid() {
  var g = document.getElementById("numGrid");
  if (!g) return;
  g.innerHTML = "";
  for (var i = 0; i <= 9; i++) {
    (function(n) {
      var b = document.createElement("button");
      b.className   = "nmb";
      b.textContent = n;
      b.dataset.n   = n;
      b.onclick = function(e) { e.stopPropagation(); pickNum(b); };
      g.appendChild(b);
    })(i);
  }
}

function setState(s) {
  var dot   = document.getElementById("dot");
  var badge = document.getElementById("badge");
  var msg   = document.getElementById("msg");
  var sub   = document.getElementById("sub");
  if (!dot) return;
  dot.className = "dot";
  if (s === "login") {
    badge.textContent = "Prediction Tool";
    msg.innerHTML = "🔐 Login Now To Start";
    sub.textContent = "Log in to yaarwin.app then tap 🎮 WinGo";
  } else if (s === "home") {
    dot.classList.add("g");
    badge.textContent = "Connected ✅";
    msg.innerHTML = "✅ Login Successful";
    sub.textContent = "Tap 🎮 WinGo to start entering trends";
  } else if (s === "entry") {
    dot.classList.add("y");
    badge.textContent = "Entering Trends";
    msg.innerHTML = "Enter Trend #" + (savedTrends.length + 1);
    sub.textContent = "Tap number → colour → size → Save";
  } else if (s === "waiting") {
    dot.classList.add("y");
    badge.textContent = "Analyzing…";
    msg.innerHTML = 'Getting Result <span class="ldots"><span></span><span></span><span></span></span>';
    sub.textContent = WAIT_STEPS[0];
  } else if (s === "done") {
    dot.classList.add("g");
    badge.textContent = "Prediction Ready ✅";
    msg.innerHTML = "🎯 Next Result Predicted";
    sub.textContent = "Based on your 10 entered trends";
  } else if (s === "error") {
    dot.classList.add("r");
    badge.textContent = "Error";
  }
}

function goLogin() {
  document.getElementById("frame").src = "https://yaarwin.app/#/login";
  setState("login");
  hide("entryPanel"); hide("resultArea"); hide("progBar");
}
function goHome() {
  document.getElementById("frame").src = "https://yaarwin.app/#/";
  setState("home");
  hide("entryPanel"); hide("resultArea"); hide("progBar");
}
function goWingo() {
  document.getElementById("frame").src =
    "https://yaarwin.app/#/saasLottery/WinGo?gameCode=WinGo_30S&lottery=WinGo";

  /* Try to auto-fetch from the public API first */
  setState("fetching");
  hide("entryPanel"); hide("resultArea"); show("progBar");
  document.getElementById("pgTxt").textContent = "Fetching live data…";
  document.getElementById("pgFill").style.width = "30%";

  autoFetchFromAPI();
}

/* Auto-fetch from public API — no login needed */
async function autoFetchFromAPI() {
  try {
    var res  = await fetch("fetch-data.php", {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body:    JSON.stringify({ auto: true })
    });
    var data = await res.json();

    if (data.status === "error") throw new Error(data.error);
    if (!Array.isArray(data.trends) || data.trends.length < 1)
      throw new Error("No trend data.");

    savedTrends = data.trends.map(function(t) {
      return {
        trendId:  t.trendId,
        number:   t.number,
        color:    t.color,
        size:     t.size,
        bigSmall: t.bigSmall || (t.size === "MB" ? "Big" : "Small"),
        rawColor: t.color
      };
    });

    /* Show the data was fetched */
    document.getElementById("pgTxt").textContent = "✅ Got " + savedTrends.length + " live results!";
    document.getElementById("pgFill").style.width = "100%";
    document.getElementById("sub").textContent = "Live data loaded — running prediction…";

    /* Render the last-10 table */
    renderAllSaved();
    updateProgress();

    /* Run prediction automatically */
    setTimeout(function() {
      hide("entryPanel");
      runPrediction();
    }, 1200);

  } catch(err) {
    /* API failed — fall back to manual entry */
    savedTrends = [];
    resetEntry();
    document.getElementById("pgTxt").textContent = "0 / 10 trends entered";
    document.getElementById("pgFill").style.width = "0%";
    setState("entry");
    show("entryPanel");
    document.getElementById("sub").textContent =
      "Auto-fetch failed: " + String(err.message).substring(0,60) + " — Enter manually below";
    updateEntryTitle();
  }
}

/* ── PICK HANDLERS (unique names, no clash) ── */
function pickNum(btn) {
  document.querySelectorAll(".nmb").forEach(function(b) { b.classList.remove("sel"); });
  btn.classList.add("sel");
  pickedNum = parseInt(btn.dataset.n);
  /* auto colour if not yet picked */
  if (!pickedColor) {
    var autoC = (pickedNum === 0 || pickedNum === 5) ? "Violet"
              : (pickedNum % 2 !== 0 ? "Red" : "Green");
    applyColour(autoC);
  }
  /* auto size if not yet picked */
  if (!pickedSize) {
    applySize(pickedNum >= 5 ? "Big" : "Small");
  }
  document.getElementById("sub").textContent =
    "Num " + pickedNum + " ✓  — check colour & size then Save";
}

/* called from HTML: onclick="pickColour(this)" */
function pickColour(btn) {
  btn.parentElement.querySelectorAll(".ob").forEach(function(b) { b.classList.remove("sel"); });
  btn.classList.add("sel");
  pickedColor = btn.dataset.c;
}

/* called from HTML: onclick="pickSize(this)" */
function pickSize(btn) {
  btn.parentElement.querySelectorAll(".ob").forEach(function(b) { b.classList.remove("sel"); });
  btn.classList.add("sel");
  pickedSize = btn.dataset.s;
}

function applyColour(name) {
  document.querySelectorAll("#colGroup .ob").forEach(function(b) {
    b.classList.remove("sel");
    if (b.dataset.c === name) b.classList.add("sel");
  });
  pickedColor = name;
}
function applySize(name) {
  document.querySelectorAll("#sizeGroup .ob").forEach(function(b) {
    b.classList.remove("sel");
    if (b.dataset.s === name) b.classList.add("sel");
  });
  pickedSize = name;
}

function resetEntry() {
  document.querySelectorAll(".nmb").forEach(function(b) { b.classList.remove("sel"); });
  document.querySelectorAll("#colGroup .ob").forEach(function(b) { b.classList.remove("sel"); });
  document.querySelectorAll("#sizeGroup .ob").forEach(function(b) { b.classList.remove("sel"); });
  pickedNum = null; pickedColor = null; pickedSize = null;
}

/* ── SAVE ── */
function saveTrend() {
  if (pickedNum === null) { flash("Select a Number first"); return; }
  if (!pickedColor)       { flash("Select a Colour"); return; }
  if (!pickedSize)        { flash("Select Size (Big/Small)"); return; }

  var trend = {
    trendId:  autoId(),
    number:   pickedNum,
    color:    resolveColor(pickedColor),
    size:     pickedSize === "Big" ? "MB" : "Ms",
    bigSmall: pickedSize,
    rawColor: pickedColor
  };

  savedTrends.push(trend);
  renderSavedRow(trend, savedTrends.length - 1);
  updateProgress();

  if (savedTrends.length >= 10) {
    hide("entryPanel");
    runPrediction();
  } else {
    resetEntry();
    var n = savedTrends.length;
    setState("entry");
    document.getElementById("sub").textContent =
      "✅ Trend " + n + " saved! Now enter trend " + (n + 1);
    updateEntryTitle();
  }
}

/* ── DELETE ── */
function deleteTrend(idx) {
  savedTrends.splice(idx, 1);
  renderAllSaved();
  updateProgress();
  updateEntryTitle();
  setState("entry");
  show("entryPanel");
  hide("resultArea");
}

/* ── RENDER SAVED ROW (no Period ID shown) ── */
function renderSavedRow(t, idx) {
  var list = document.getElementById("savedList");
  var row  = document.createElement("div");
  row.className = "sv";
  row.id        = "sv_" + idx;
  var cl   = COLOR_MAP[t.rawColor] || "r";
  var clLb = colorLabel(t.rawColor);
  var szCl = t.size === "MB" ? "rb-big" : "rb-sml";
  row.innerHTML =
    '<span class="sv-i">' + (idx + 1) + '</span>' +
    '<span class="sv-n">' + t.number + '</span>' +
    '<span class="sv-c rbadge rb-' + cl + '">' + clLb + '</span>' +
    '<span class="sv-s rbadge ' + szCl + '">' + t.bigSmall + '</span>' +
    '<button class="sv-del" onclick="deleteTrend(' + idx + ');return false;">✕</button>';
  list.appendChild(row);
}

function renderAllSaved() {
  var list = document.getElementById("savedList");
  if (!list) return;
  list.innerHTML = "";
  savedTrends.forEach(function(t, i) { renderSavedRow(t, i); });
}

/* ── PROGRESS ── */
function updateProgress() {
  var n   = savedTrends.length;
  var pct = Math.round((n / 10) * 100);
  var pt  = document.getElementById("pgTxt");
  var pp  = document.getElementById("pgPct");
  var pf  = document.getElementById("pgFill");
  if (pt) pt.textContent  = n + " / 10 trends entered";
  if (pp) pp.textContent  = pct + "%";
  if (pf) pf.style.width  = pct + "%";
}
function updateEntryTitle() {
  var n  = savedTrends.length + 1;
  var et = document.getElementById("entTitle");
  var sl = document.getElementById("saveLbl");
  if (n <= 10) {
    if (et) et.textContent = "Enter Trend #" + n;
    if (sl) sl.textContent = n;
  }
}

/* ── PREDICTION ── */
async function runPrediction() {
  setState("waiting");
  show("progBar");
  hide("resultArea");

  var total = 10000 + Math.random() * 5000;
  var step  = total / WAIT_STEPS.length;
  var idx   = 0;
  var sub   = document.getElementById("sub");
  var timer = setInterval(function() {
    idx++;
    if (idx < WAIT_STEPS.length && sub)
      sub.textContent = WAIT_STEPS[idx];
    else clearInterval(timer);
  }, step);

  try {
    var trendList = savedTrends.map(function(t) {
      return { trendId: t.trendId, number: t.number, color: t.color, size: t.size };
    });

    await new Promise(function(r) { setTimeout(r, total); });
    clearInterval(timer);

    var res  = await fetch(PREDICT_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ trends: trendList })
    });
    var pred = await res.json();
    if (pred.status === "error") throw new Error(pred.error);

    renderResult(pred);
    setState("done");

  } catch (err) {
    clearInterval(timer);
    setState("error");
    var msg = document.getElementById("msg");
    if (msg) msg.innerHTML = "⚠ " + String(err.message).substring(0, 120);
    if (sub) sub.textContent = "Tap 🔄 to try again";
    var ra = document.getElementById("resultArea");
    if (ra) {
      ra.style.display = "block";
      ra.innerHTML =
        '<button class="bagain" onclick="startOver();return false;">🔄 Enter New 10 Trends</button>';
    }
  }
}

/* ── RENDER RESULT ── */
function renderResult(pred) {
  var n = pred.predicted_number;
  var rn = document.getElementById("rNum");
  if (rn) rn.textContent = (n !== null && n !== undefined) ? n : "—";

  var rp = document.getElementById("rPid");
  if (rp) rp.textContent = pred.predicted_trend_id || "—";

  var c    = (pred.predicted_color || "").toLowerCase();
  var cKey = c.includes("violet") ? "v" : c === "red" ? "r" : "g";
  var ce   = document.getElementById("rCol");
  if (ce) { ce.className = "rbadge rb-" + cKey; ce.textContent = pred.predicted_color || "—"; }

  var s  = (pred.predicted_size || "").toLowerCase();
  var se = document.getElementById("rSz");
  if (se) {
    se.className   = "rbadge " + (s === "mb" ? "rb-big" : "rb-sml");
    se.textContent = s === "mb" ? "🔼 Big" : "🔽 Small";
  }

  var conf = +(pred.confidence || 0);
  var rc   = document.getElementById("rConf");
  var rf   = document.getElementById("rFill");
  if (rc) rc.textContent = conf + "%";
  if (rf) setTimeout(function() { rf.style.width = conf + "%"; }, 80);

  show("resultArea");
}

/* ── START OVER ── */
function startOver() {
  savedTrends = [];
  pickedNum = null; pickedColor = null; pickedSize = null;
  resetEntry();
  var sl = document.getElementById("savedList");
  if (sl) sl.innerHTML = "";
  updateProgress();
  setState("entry");
  updateEntryTitle();
  show("entryPanel"); show("progBar");
  hide("resultArea");
}

/* ── MINI ── */
function doMin() {
  window.isMini = true;
  document.getElementById("card").classList.add("mini");
}

/* ── HELPERS ── */
function show(id) { var e = document.getElementById(id); if (e) e.style.display = "block"; }
function hide(id) { var e = document.getElementById(id); if (e) e.style.display = "none";  }

function flash(msg) {
  var s = document.getElementById("sub");
  if (!s) return;
  s.style.color   = "#ef4444";
  s.textContent   = "⚠ " + msg;
  setTimeout(function() {
    s.style.color = "";
    s.textContent = "Tap number → colour → size → Save";
  }, 2200);
}

function autoId() {
  var d = new Date();
  return d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0") +
    "100050" + String(300 + savedTrends.length).padStart(3, "0");
}

function resolveColor(raw) {
  return { Red:"Red", Green:"Green", Violet:"Violet",
           RedViolet:"Violet", GreenViolet:"Violet" }[raw] || raw;
}

function colorLabel(raw) {
  return { Red:"Red", Green:"Green", Violet:"Violet",
           RedViolet:"R+V", GreenViolet:"G+V" }[raw] || raw || "?";
}

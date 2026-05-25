"use strict";
/* ═══════════════════════════════════════════════════════
   auto-fetch.js  —  Manual Trend Entry Controller
   
   Flow:
   1. User taps 🎮 WinGo → entry panel appears
   2. For each of 10 trends:
      a. Enter Period ID (optional)
      b. Tap number button (0-9)
      c. Tap colour button (Red/Green/Violet/R+V/G+V)
      d. Tap size button (Big/Small)
      e. Tap "Save Trend #N" → row saved, next opens
   3. After 10 saved → "Getting Accurate Result…"
   4. Sends to fetch-data.php → api.php → shows prediction
═══════════════════════════════════════════════════════ */

var FETCH_URL   = "fetch-data.php";
var PREDICT_URL = "api.php";
var isMini = false;
var savedTrends = [];
var selNum  = null;
var selCol  = null;
var selSize = null;

var COLOR_MAP = {
  "Red":"red","Green":"green","Violet":"violet",
  "RedViolet":"violet","GreenViolet":"violet"
};
var SIZE_MAP  = { "Big":"mb","Small":"ms" };

var WAIT_STEPS = [
  "🔐 Connecting to YaarWin engine…",
  "📊 Reading 10 trend patterns…",
  "🔄 Running Calcute algorithm…",
  "📐 Applying statistical layer…",
  "🧮 Building confidence matrix…",
  "✨ Generating prediction…"
];

/* ── BOOT ── */
window.addEventListener("DOMContentLoaded", function() {
  buildNumGrid();
  setState("login");
});

/* ── BUILD 0-9 NUM GRID ── */
function buildNumGrid() {
  var g = document.getElementById("numGrid");
  g.innerHTML = "";
  for (var i = 0; i <= 9; i++) {
    (function(n){
      var b = document.createElement("button");
      b.className = "nmb";
      b.textContent = n;
      b.setAttribute("data-n", n);
      b.onclick = function(){ selNumber(b); return false; };
      g.appendChild(b);
    })(i);
  }
}

/* ── STATE ── */
function setState(s) {
  var dot   = document.getElementById("dot");
  var badge = document.getElementById("badge");
  var msg   = document.getElementById("msg");
  var sub   = document.getElementById("sub");
  dot.className = "dot";
  if (s==="login") {
    badge.textContent = "Prediction Tool";
    msg.innerHTML  = "🔐 Login Now To Start";
    sub.textContent = "Log in to yaarwin.app, then tap 🎮 WinGo";
  } else if (s==="home") {
    dot.classList.add("g");
    badge.textContent = "Connected ✅";
    msg.innerHTML  = "✅ Login Successful";
    sub.textContent = "Tap 🎮 WinGo to start entering trends";
  } else if (s==="entry") {
    dot.classList.add("y");
    badge.textContent = "Entering Trends";
    msg.innerHTML  = 'Enter Trend <span class="ldots"><span></span><span></span><span></span></span>';
    sub.textContent = "Fill number, colour & size, then save";
  } else if (s==="waiting") {
    dot.classList.add("y");
    badge.textContent = "Analyzing…";
    msg.innerHTML  = 'Getting Accurate Result <span class="ldots"><span></span><span></span><span></span></span>';
    sub.textContent = WAIT_STEPS[0];
  } else if (s==="done") {
    dot.classList.add("g");
    badge.textContent = "Prediction Ready ✅";
    msg.innerHTML  = "🎯 Next Result Predicted";
    sub.textContent = "Based on your 10 entered trends";
  } else if (s==="error") {
    dot.classList.add("r");
    badge.textContent = "Error";
  }
}

/* ── IFRAME NAV ── */
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
  savedTrends = [];
  selNum = null; selCol = null; selSize = null;
  resetEntry();
  setState("entry");
  show("entryPanel"); show("progBar");
  hide("resultArea");
  updateProgress();
  updateEntryTitle();
}

/* ── RESET ENTRY FORM ── */
function resetEntry() {
  /* clear number selection */
  document.querySelectorAll(".nmb").forEach(function(b){ b.classList.remove("sel"); });
  /* clear colour */
  document.querySelectorAll("#colGroup .ob").forEach(function(b){ b.classList.remove("sel"); });
  /* clear size */
  document.querySelectorAll("#sizeGroup .ob").forEach(function(b){ b.classList.remove("sel"); });
  /* clear period id */
  document.getElementById("inId").value = "";
  /* reset local vars */
  selNum = null; selCol = null; selSize = null;
}

/* ── SELECTION HANDLERS ── */
function selNumber(btn) {
  document.querySelectorAll(".nmb").forEach(function(b){ b.classList.remove("sel"); });
  btn.classList.add("sel");
  selNum = parseInt(btn.getAttribute("data-n"));

  /* auto-derive colour and size from number — user can override */
  autoDerive(selNum);
}

function autoDerive(n) {
  /* WinGo rules: 0,5=violet; odd=red; even=green; ≥5=Big; <5=Small */
  var autoC = n===0||n===5 ? "Violet" : (n%2!==0 ? "Red" : "Green");
  /* Only auto-select if nothing chosen yet */
  if (!selCol) {
    document.querySelectorAll("#colGroup .ob").forEach(function(b){
      b.classList.remove("sel");
      if (b.getAttribute("data-c")===autoC) { b.classList.add("sel"); selCol=autoC; }
    });
  }
  if (!selSize) {
    var autoS = n>=5 ? "Big" : "Small";
    document.querySelectorAll("#sizeGroup .ob").forEach(function(b){
      b.classList.remove("sel");
      if (b.getAttribute("data-s")===autoS) { b.classList.add("sel"); selSize=autoS; }
    });
  }
}

function selCol(btn) {
  document.querySelectorAll("#colGroup .ob").forEach(function(b){ b.classList.remove("sel"); });
  btn.classList.add("sel");
  selCol = btn.getAttribute("data-c");
}

function selSize(btn) {
  document.querySelectorAll("#sizeGroup .ob").forEach(function(b){ b.classList.remove("sel"); });
  btn.classList.add("sel");
  selSize = btn.getAttribute("data-s");
}

/* ── SAVE TREND ── */
function saveTrend() {
  if (selNum === null) { flash("Please select a Number (0-9)"); return; }
  if (!selCol)         { flash("Please select a Colour"); return; }
  if (!selSize)        { flash("Please select Size (Big/Small)"); return; }

  var pid = document.getElementById("inId").value.trim();
  if (!pid) { pid = autoId(); }

  var trend = {
    trendId: pid,
    number:  selNum,
    color:   resolveDisplayColor(selCol),
    size:    selSize === "Big" ? "MB" : "Ms",
    bigSmall:selSize,
    rawColor:selCol
  };

  savedTrends.push(trend);
  renderSavedRow(trend, savedTrends.length - 1);
  updateProgress();

  if (savedTrends.length >= 10) {
    /* All 10 entered — run prediction */
    hide("entryPanel");
    runPrediction();
  } else {
    updateEntryTitle();
    resetEntry();
    /* Flash success */
    var n = savedTrends.length;
    setSubText("✅ Trend " + n + " saved! Enter trend " + (n+1));
  }
}


/* ── DELETE SAVED TREND ── */
function deleteTrend(idx) {
  savedTrends.splice(idx, 1);
  renderAllSaved();
  updateProgress();
  updateEntryTitle();
  show("entryPanel");
  hide("resultArea");
}

/* ── RENDER SAVED ROW ── */
function renderSavedRow(t, idx) {
  var list = document.getElementById("savedList");
  var row = document.createElement("div");
  row.className = "sv";
  row.id = "sv_" + idx;
  var cl  = COLOR_MAP[t.rawColor] || COLOR_MAP[t.color] || "r";
  var clLabel = colorLabel(t.rawColor, cl);
  var szCl = t.size === "MB" ? "rb-big" : "rb-sml";
  row.innerHTML =
    '<span class="sv-i">' + (idx+1) + '</span>' +
    '<span class="sv-pid">' + shortId(t.trendId) + '</span>' +
    '<span class="sv-n">' + t.number + '</span>' +
    '<span class="sv-c rbadge rb-' + cl + '" style="font-size:10px;padding:2px 5px">' + clLabel + '</span>' +
    '<span class="sv-s rbadge ' + szCl + '" style="font-size:10px;padding:2px 5px">' + t.bigSmall + '</span>' +
    '<button class="sv-del" onclick="deleteTrend(' + idx + ');return false;">✕</button>';
  list.appendChild(row);
}

function renderAllSaved() {
  var list = document.getElementById("savedList");
  list.innerHTML = "";
  savedTrends.forEach(function(t, i){ renderSavedRow(t, i); });
}

/* ── UPDATE PROGRESS ── */
function updateProgress() {
  var n = savedTrends.length;
  var pct = Math.round((n/10)*100);
  document.getElementById("pgTxt").textContent = n + " / 10 trends entered";
  document.getElementById("pgPct").textContent = pct + "%";
  document.getElementById("pgFill").style.width = pct + "%";
}

function updateEntryTitle() {
  var n = savedTrends.length + 1;
  if (n <= 10) {
    document.getElementById("entTitle").textContent = "Enter Trend #" + n;
    document.getElementById("saveLbl").textContent  = n;
  }
}

/* ── RUN PREDICTION ── */
async function runPrediction() {
  setState("waiting");
  show("progBar");
  hide("resultArea");

  /* Animated wait */
  var total = 10000 + Math.random() * 5000;
  var step  = total / WAIT_STEPS.length;
  var idx   = 0;
  var timer = setInterval(function(){
    idx++;
    if (idx < WAIT_STEPS.length) setSubText(WAIT_STEPS[idx]);
    else clearInterval(timer);
  }, step);

  try {
    /* Build proper trend list for api.php */
    var trendList = savedTrends.map(function(t) {
      return {
        trendId: t.trendId,
        number:  t.number,
        color:   t.color,
        size:    t.size
      };
    });

    await new Promise(function(r){ setTimeout(r, total); });
    clearInterval(timer);

    /* Call api.php prediction engine */
    var res = await fetch(PREDICT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trends: trendList })
    });
    var pred = await res.json();
    if (pred.status === "error") throw new Error(pred.error);

    renderResult(pred);
    setState("done");

  } catch(err) {
    clearInterval(timer);
    setState("error");
    document.getElementById("msg").innerHTML = "⚠ " + String(err.message).substring(0,120);
    setSubText("Tap 🔄 Start Over to try again");
    show("resultArea");
    document.getElementById("resultArea").innerHTML =
      '<button class="bagain" onclick="startOver();return false;">🔄 Enter New 10 Trends</button>';
  }
}

/* ── RENDER RESULT ── */
function renderResult(pred) {
  var n = pred.predicted_number;
  document.getElementById("rNum").textContent = (n !== undefined && n !== null) ? n : "—";
  document.getElementById("rPid").textContent = pred.predicted_trend_id || "Next Period";

  var c = (pred.predicted_color || "").toLowerCase();
  if (c.includes("violet")) c = "v";
  else if (c==="red")   c = "r";
  else if (c==="green") c = "g";
  var colEl = document.getElementById("rCol");
  colEl.className = "rbadge rb-" + c;
  colEl.textContent = pred.predicted_color || "—";

  var s = (pred.predicted_size || "").toLowerCase();
  var szEl = document.getElementById("rSz");
  szEl.className = "rbadge " + (s==="mb" ? "rb-big" : "rb-sml");
  szEl.textContent = s==="mb" ? "🔼 Big" : "🔽 Small";

  var conf = +(pred.confidence || 0);
  document.getElementById("rConf").textContent = conf + "%";
  setTimeout(function(){ document.getElementById("rFill").style.width = conf + "%"; }, 80);

  show("resultArea");
}

/* ── START OVER ── */
function startOver() {
  savedTrends = [];
  selNum = null; selCol = null; selSize = null;
  resetEntry();
  renderAllSaved();
  updateProgress();
  updateEntryTitle();
  setState("entry");
  show("entryPanel"); show("progBar");
  hide("resultArea");
}

/* ── MINI / RESTORE ── */
function doMin() {
  isMini = true;
  document.getElementById("card").classList.add("mini");
}
function cardClick() {
  if (isMini) {
    isMini = false;
    document.getElementById("card").classList.remove("mini");
  }
}

/* ── HELPERS ── */
function show(id){ var e=document.getElementById(id); if(e) e.style.display="block"; }
function hide(id){ var e=document.getElementById(id); if(e) e.style.display="none"; }
function setSubText(t){ document.getElementById("sub").textContent = t; }

function flash(msg) {
  var s = document.getElementById("sub");
  s.style.color = "#ef4444";
  s.textContent = "⚠ " + msg;
  setTimeout(function(){ s.style.color=""; s.textContent="Fill all fields then save"; }, 2000);
}

function autoId() {
  /* Generate a plausible issueNumber if not entered */
  var d = new Date();
  var base = d.getFullYear().toString() +
    String(d.getMonth()+1).padStart(2,"0") +
    String(d.getDate()).padStart(2,"0") +
    "100050" + String(300 + savedTrends.length).padStart(3,"0");
  return base;
}

function shortId(id) {
  return id.length > 12 ? "…" + id.slice(-8) : id;
}

function resolveDisplayColor(raw) {
  if (raw==="Red")         return "Red";
  if (raw==="Green")       return "Green";
  if (raw==="Violet")      return "Violet";
  if (raw==="RedViolet")   return "Violet";
  if (raw==="GreenViolet") return "Violet";
  return raw;
}

function colorLabel(raw, cl) {
  if (raw==="RedViolet")   return "R+Violet";
  if (raw==="GreenViolet") return "G+Violet";
  if (cl==="r") return "Red";
  if (cl==="g") return "Green";
  if (cl==="v") return "Violet";
  return raw || "?";
}

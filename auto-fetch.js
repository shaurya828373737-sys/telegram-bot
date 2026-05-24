/**
 * auto-fetch.js
 * ─────────────────────────────────────────────────────────────────
 * Handles the "Auto Fill Form" button.
 *
 * Flow:
 *   1. User clicks "Auto Fill Form"
 *   2. Shows live status steps
 *   3. Calls fetch-data.php  (PHP does login → scrape)
 *   4. Receives { trends: [...10 records...] }
 *   5. Auto-fills every row in the form (ID, num btn, color btn, size btn)
 * ─────────────────────────────────────────────────────────────────
 */

"use strict";

const FETCH_ENDPOINT = "fetch-data.php";

/* Status step messages shown one-by-one during fetch */
const FETCH_STEP_MSGS = [
  "🔐 Logging in to YaarWin…",
  "✅ Login successful — token acquired",
  "📡 Requesting WinGo 30s game history…",
  "📦 Receiving data from server…",
  "🔄 Parsing & normalising records…",
  "✨ Auto-filling form rows…",
];

/* ── Init ───────────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("autoFetchBtn");
  if (btn) btn.addEventListener("click", handleAutoFetch);
});

/* ── Main handler ───────────────────────────────────────────────── */
async function handleAutoFetch() {
  const btn     = document.getElementById("autoFetchBtn");
  const btnText = document.getElementById("autoFetchBtnText");

  btn.disabled  = true;
  btnText.textContent = "Fetching…";

  showFetchStatus("idle");
  clearFetchSteps();

  try {
    /* Animate status steps while fetch runs in parallel */
    const [data] = await Promise.all([
      callFetchEndpoint(),
      animateFetchSteps(),
    ]);

    /* Fill the form */
    autoFillRows(data.trends);

    setFetchStatus("success",
      `✅ Form filled! Fetched ${data.trends.length} records from ${data.source} at ${data.fetched_at}`);

  } catch (err) {
    setFetchStatus("error", "❌ " + err.message);
  } finally {
    btn.disabled  = false;
    btnText.textContent = "Auto Fill Form";
  }
}

/* ── Call fetch-data.php ────────────────────────────────────────── */
async function callFetchEndpoint() {
  const resp = await fetch(FETCH_ENDPOINT, {
    method:  "GET",
    headers: { "Accept": "application/json" },
  });

  const data = await resp.json();

  if (!resp.ok || data.status === "error") {
    throw new Error(data.error ?? `Server error ${resp.status}`);
  }

  if (!Array.isArray(data.trends) || data.trends.length < 10) {
    throw new Error("Not enough trend records returned.");
  }

  return data;
}

/* ── Auto-fill all 10 form rows ─────────────────────────────────── */
function autoFillRows(trends) {
  const rows = document.querySelectorAll(".trend-row");

  trends.forEach((trend, idx) => {
    if (idx >= rows.length) return;
    const row = rows[idx];

    /* ── Trend ID ──────────────────────────────────────────── */
    const idInput = row.querySelector(".input-id");
    if (idInput) {
      idInput.value = trend.trendId;
      flashInput(idInput);
    }

    /* ── Number button ─────────────────────────────────────── */
    const numStr = String(trend.number);
    row.querySelectorAll(".num-btn").forEach((b) => {
      b.classList.remove("selected");
      if (b.dataset.value === numStr) {
        b.classList.add("selected");
        pulseBtn(b);
      }
    });
    const numHidden = row.querySelector(".num-hidden");
    if (numHidden) numHidden.value = numStr;

    /* ── Color button ──────────────────────────────────────── */
    row.querySelectorAll(".color-btn").forEach((b) => {
      b.classList.remove("selected");
      if (b.dataset.value === trend.color) {
        b.classList.add("selected");
        pulseBtn(b);
      }
    });
    const colorHidden = row.querySelector(".color-hidden");
    if (colorHidden) colorHidden.value = trend.color;

    /* ── Size button ───────────────────────────────────────── */
    row.querySelectorAll(".size-btn").forEach((b) => {
      b.classList.remove("selected");
      if (b.dataset.value === trend.size) {
        b.classList.add("selected");
        pulseBtn(b);
      }
    });
    const sizeHidden = row.querySelector(".size-hidden");
    if (sizeHidden) sizeHidden.value = trend.size;

    /* Clear any previous error on this row */
    if (typeof clearError === "function") clearError(row);
  });

  /* Hide global error if present */
  if (typeof hideGlobalError === "function") hideGlobalError();
}

/* ── Animate step messages ──────────────────────────────────────── */
function animateFetchSteps() {
  return new Promise((resolve) => {
    const stepsEl = document.getElementById("fetchSteps");
    const statusEl = document.getElementById("fetchStatus");
    if (statusEl) statusEl.style.display = "block";

    let i = 0;
    const interval = setInterval(() => {
      if (i < FETCH_STEP_MSGS.length) {
        appendStep(FETCH_STEP_MSGS[i]);
        i++;
      } else {
        clearInterval(interval);
        resolve();
      }
    }, 480);
  });
}

function appendStep(msg) {
  const stepsEl = document.getElementById("fetchSteps");
  if (!stepsEl) return;
  const line = document.createElement("div");
  line.className = "fetch-step-line";
  line.textContent = msg;
  stepsEl.appendChild(line);
  /* animate in */
  requestAnimationFrame(() => line.classList.add("visible"));
  /* auto-scroll */
  stepsEl.scrollTop = stepsEl.scrollHeight;
}

function clearFetchSteps() {
  const el = document.getElementById("fetchSteps");
  if (el) el.innerHTML = "";
}

/* ── Status dot helpers ─────────────────────────────────────────── */
function showFetchStatus(state) {
  const bar = document.getElementById("fetchStatus");
  const dot = document.getElementById("fetchStatusDot");
  const msg = document.getElementById("fetchStatusMsg");
  if (!bar) return;
  bar.style.display = "block";
  bar.className = "fetch-status " + state;
  if (dot) dot.className = "fetch-status-dot " + state;
  if (msg) msg.textContent = "Connecting to YaarWin…";
}

function setFetchStatus(state, text) {
  const bar = document.getElementById("fetchStatus");
  const dot = document.getElementById("fetchStatusDot");
  const msg = document.getElementById("fetchStatusMsg");
  if (!bar) return;
  bar.className = "fetch-status " + state;
  if (dot) dot.className = "fetch-status-dot " + state;
  if (msg) msg.textContent = text;
}

/* ── Visual feedback helpers ────────────────────────────────────── */
function flashInput(el) {
  el.style.transition = "background 0.3s";
  el.style.background = "#1a3a1a";
  setTimeout(() => { el.style.background = ""; }, 600);
}

function pulseBtn(el) {
  el.classList.add("auto-filled");
  setTimeout(() => el.classList.remove("auto-filled"), 700);
}

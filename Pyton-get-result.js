/**
 * Pyton-get-result.js
 * ─────────────────────────────────────────────────────────────────
 * Front-end controller for the Trend Prediction Tool.
 *
 *  • Collects the 10 trend rows from the UI
 *  • Shows the loading dialog
 *  • POSTs data to api.php
 *  • Renders the prediction result cards
 * ─────────────────────────────────────────────────────────────────
 */

"use strict";

/* ── Constants ─────────────────────────────────────────────────── */
const API_ENDPOINT = "api.php";
const TOTAL_ROWS   = 10;

/* Loading-step messages cycled in the dialog */
const LOADING_STEPS = [
  "Initialising Python environment…",
  "Loading Support-backend modules…",
  "Running Calcute.php algorithm…",
  "Applying Pythonhelp statistical layer…",
  "Cross-validating trend patterns…",
  "Building confidence matrix…",
  "Finalising prediction output…",
];

/* ── DOM refs (populated after DOMContentLoaded) ───────────────── */
let fetchBtn, loadingOverlay, loadingStepEl, resultPanel;

/* ── Entry point ───────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  fetchBtn       = document.getElementById("fetchBtn");
  loadingOverlay = document.getElementById("loadingOverlay");
  loadingStepEl  = document.getElementById("loadingStep");
  resultPanel    = document.getElementById("resultPanel");

  fetchBtn.addEventListener("click", handleFetch);

  /* ── Number buttons (0–9) ── */
  document.querySelectorAll(".num-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = btn.closest(".trend-row");
      row.querySelectorAll(".num-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      row.querySelector(".num-hidden").value = btn.dataset.value;
      /* clear error highlight on this row */
      clearError(row);
      hideGlobalError();
    });
  });

  /* ── Color buttons ── */
  document.querySelectorAll(".color-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = btn.closest(".trend-row");
      row.querySelectorAll(".color-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      row.querySelector(".color-hidden").value = btn.dataset.value;
      clearError(row);
      hideGlobalError();
    });
  });

  /* ── Size buttons ── */
  document.querySelectorAll(".size-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = btn.closest(".trend-row");
      row.querySelectorAll(".size-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      row.querySelector(".size-hidden").value = btn.dataset.value;
      clearError(row);
      hideGlobalError();
    });
  });
});

/* ── Main handler ──────────────────────────────────────────────── */
async function handleFetch() {
  const rows = collectRows();
  if (!rows) return; /* validation failed — errors already shown */

  showLoading();
  fetchBtn.disabled = true;

  try {
    const result = await postToAPI(rows);
    hideLoading();
    renderResult(result, rows);
  } catch (err) {
    hideLoading();
    showGlobalError("Network error: " + err.message);
  } finally {
    fetchBtn.disabled = false;
  }
}

/* ── Collect & validate 10 trend rows ─────────────────────────── */
function collectRows() {
  const rows = [];
  let valid  = true;
  let firstError = null;

  document.querySelectorAll(".trend-row").forEach((rowEl, idx) => {
    const idInput    = rowEl.querySelector(".input-id");
    const numHidden  = rowEl.querySelector(".num-hidden");
    const colorHidden = rowEl.querySelector(".color-hidden");
    const sizeHidden = rowEl.querySelector(".size-hidden");

    clearError(rowEl);

    const trendId = idInput.value.trim();
    const num     = numHidden.value;
    const color   = colorHidden.value;
    const size    = sizeHidden.value;

    if (!trendId || num === "" || !color || !size) {
      if (!firstError) firstError = `Row ${idx + 1}: all fields are required.`;
      markRowError(rowEl);
      valid = false;
      return;
    }

    if (!/^\d+$/.test(trendId)) {
      if (!firstError) firstError = `Row ${idx + 1}: Trend ID must be numeric.`;
      markRowError(rowEl);
      valid = false;
      return;
    }

    rows.push({ trendId, number: parseInt(num, 10), color, size });
  });

  if (!valid && firstError) {
    showGlobalError(firstError);
  }

  return valid ? rows : null;
}

/* ── POST to api.php ───────────────────────────────────────────── */
async function postToAPI(rows) {
  const payload = { trends: rows };

  const resp = await fetch(API_ENDPOINT, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });

  if (!resp.ok) throw new Error(`Server responded ${resp.status}`);

  const data = await resp.json();
  if (data.error) throw new Error(data.error);

  return data;
}

/* ── Loading dialog ────────────────────────────────────────────── */
let stepInterval = null;

function showLoading() {
  loadingOverlay.classList.add("active");
  resultPanel.classList.remove("show");

  let idx = 0;
  loadingStepEl.textContent = LOADING_STEPS[0];
  loadingStepEl.classList.remove("lit");

  stepInterval = setInterval(() => {
    idx = (idx + 1) % LOADING_STEPS.length;
    loadingStepEl.classList.remove("lit");
    /* brief blank then fade in next */
    setTimeout(() => {
      loadingStepEl.textContent = LOADING_STEPS[idx];
      loadingStepEl.classList.add("lit");
    }, 120);
  }, 900);
}

function hideLoading() {
  clearInterval(stepInterval);
  loadingOverlay.classList.remove("active");
}

/* ── Render prediction result ──────────────────────────────────── */
function renderResult(data, inputRows) {
  /* ── Next Trend ID ── */
  document.getElementById("res-trendId").textContent =
    data.predicted_trend_id ?? "–";

  /* ── Predicted Number ── */
  document.getElementById("res-number").textContent =
    data.predicted_number ?? "–";

  /* ── Color ── */
  const colorEl   = document.getElementById("res-color");
  const colorText = (data.predicted_color ?? "").toLowerCase();
  colorEl.textContent = "";
  const badge = document.createElement("span");
  badge.className = `color-badge ${colorText}`;
  badge.textContent = data.predicted_color ?? "–";
  colorEl.appendChild(badge);

  /* ── Size ── */
  const sizeEl   = document.getElementById("res-size");
  const sizeText = (data.predicted_size ?? "").toLowerCase();
  sizeEl.textContent = "";
  const sizeBadge = document.createElement("span");
  sizeBadge.className = `size-badge ${sizeText === "mb" ? "big" : "small"}`;
  sizeBadge.textContent = sizeText === "mb" ? "MB (Big)" : "Ms (Small)";
  sizeEl.appendChild(sizeBadge);

  /* ── Confidence bar ── */
  const conf    = data.confidence ?? 75;
  const confPct = document.getElementById("res-conf-pct");
  const confBar = document.getElementById("res-conf-bar");
  confPct.textContent = conf + "%";
  /* animate bar after paint */
  requestAnimationFrame(() => {
    setTimeout(() => { confBar.style.width = conf + "%"; }, 60);
  });

  /* ── History summary chips ── */
  buildHistoryChips(inputRows);

  resultPanel.classList.add("show");
  resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ── Build history chips from input rows ───────────────────────── */
function buildHistoryChips(rows) {
  const strip = document.getElementById("historyStrip");
  strip.innerHTML = "";
  rows.forEach((r) => {
    const chip = document.createElement("div");
    chip.className = "history-chip";
    chip.innerHTML =
      `#<span>${r.trendId.slice(-4)}</span> ` +
      `N:<span>${r.number}</span> ` +
      `<span>${r.color}</span> ` +
      `<span>${r.size}</span>`;
    strip.appendChild(chip);
  });
}

/* ── Validation helpers ────────────────────────────────────────── */
function markRowError(rowEl) {
  /* Highlight Trend ID input border */
  const idInput = rowEl.querySelector(".input-id");
  if (idInput) idInput.style.borderColor = "#ef4444";

  /* Highlight button groups that have nothing selected */
  const numHidden   = rowEl.querySelector(".num-hidden");
  const colorHidden = rowEl.querySelector(".color-hidden");
  const sizeHidden  = rowEl.querySelector(".size-hidden");

  if (!numHidden.value) {
    rowEl.querySelectorAll(".num-btn").forEach((b) => {
      b.style.borderColor = "#ef4444";
    });
  }
  if (!colorHidden.value) {
    rowEl.querySelectorAll(".color-btn").forEach((b) => {
      b.style.outline = "1px solid #ef4444";
    });
  }
  if (!sizeHidden.value) {
    rowEl.querySelectorAll(".size-btn").forEach((b) => {
      b.style.borderColor = "#ef4444";
    });
  }
}

function clearError(rowEl) {
  const idInput = rowEl.querySelector(".input-id");
  if (idInput) idInput.style.borderColor = "";
  rowEl.querySelectorAll(".num-btn").forEach((b) => (b.style.borderColor = ""));
  rowEl.querySelectorAll(".color-btn").forEach((b) => (b.style.outline = ""));
  rowEl.querySelectorAll(".size-btn").forEach((b) => (b.style.borderColor = ""));
}

function showGlobalError(msg) {
  const bar = document.getElementById("globalError");
  if (bar) {
    bar.textContent = "⚠ " + msg;
    bar.style.display = "block";
  }
}

function hideGlobalError() {
  const bar = document.getElementById("globalError");
  if (bar) bar.style.display = "none";
}

<?php
/**
 * api.php
 * ─────────────────────────────────────────────────────────────────
 * HTTP API endpoint — the single entry point called by the browser.
 *
 *  Method : POST
 *  Content-Type: application/json
 *  Body   : { "trends": [ ...10 records... ] }
 *
 *  Response (200 OK):
 *  {
 *    "status": "ok",
 *    "predicted_trend_id": "504312623",
 *    "predicted_number"  : 7,
 *    "predicted_color"   : "Red",
 *    "predicted_size"    : "MB",
 *    "confidence"        : 82,
 *    "analysis"          : { ... },
 *    "stats"             : { ... },
 *    "meta"              : { ... }
 *  }
 *
 *  Response (4xx / 5xx):
 *  { "status": "error", "error": "..." }
 * ─────────────────────────────────────────────────────────────────
 */

declare(strict_types=1);

// ── CORS headers (allow same-origin fetch from index.html) ────────
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

// ── Pre-flight OPTIONS request ────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Only accept POST ──────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'error' => 'Method not allowed. Use POST.']);
    exit;
}

// ── Load the pipeline ─────────────────────────────────────────────
require_once __DIR__ . '/Support-backend.php';
require_once __DIR__ . '/Python-File.php';

// ── Read & decode JSON body ───────────────────────────────────────
$rawBody = file_get_contents('php://input');

if (empty($rawBody)) {
    jsonError('Empty request body.', 400);
}

$decoded = json_decode($rawBody, true);

if (json_last_error() !== JSON_ERROR_NONE) {
    jsonError('Invalid JSON: ' . json_last_error_msg(), 400);
}

if (!isset($decoded['trends']) || !is_array($decoded['trends'])) {
    jsonError('Missing required key: "trends" (array of 10 objects).', 400);
}

// ── Run the prediction pipeline ───────────────────────────────────
try {
    $result = runPredictionPipeline($decoded['trends']);
    jsonSuccess($result);
} catch (InvalidArgumentException $e) {
    jsonError($e->getMessage(), 422);
} catch (Throwable $e) {
    // Log internally; never expose stack trace to client
    error_log('[Trend Predictor] Uncaught error: ' . $e->getMessage());
    jsonError('Internal server error. Please try again.', 500);
}

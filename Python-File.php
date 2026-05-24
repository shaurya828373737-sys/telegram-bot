<?php
/**
 * Python-File.php
 * ─────────────────────────────────────────────────────────────────
 * Main backend orchestrator — simulates a Python prediction engine.
 *
 * Pipeline:
 *   1. Boot: load all sub-modules
 *   2. Read raw JSON body
 *   3. Validate & sanitise input via Support-backend.php
 *   4. Run prediction engine via Calcute.php
 *   5. Enrich result via Pythonhelp.php utilities
 *   6. Return JSON response
 *
 * Called by: api.php
 * ─────────────────────────────────────────────────────────────────
 */

declare(strict_types=1);

// ── Module loading (mirrors Python's import chain) ────────────────
require_once __DIR__ . '/Support-backend.php';
require_once __DIR__ . '/Pythonhelp.php';
require_once __DIR__ . '/Calcute.php';

/**
 * Run the full prediction pipeline.
 *
 * @param  array $rawTrends  Unsanitised input from JSON body.
 * @return array             Prediction result ready for JSON output.
 */
function runPredictionPipeline(array $rawTrends): array
{
    // ── Step 1: Sanitise ──────────────────────────────────────────
    $trends = sanitiseTrendList($rawTrends);

    // ── Step 2: Extract numeric series for statistical helpers ────
    $numbers = extractNumbers($trends);

    // ── Step 3: Statistical enrichment (Pythonhelp layer) ─────────
    $stats = [
        'mean'         => calculateMean($numbers),
        'median'       => calculateMedian($numbers),
        'mode'         => calculateMode($numbers),
        'std_dev'      => round(calculateStdDev($numbers), 4),
        'variance'     => round(calculateVariance($numbers), 4),
        'exp_smooth'   => round(exponentialSmoothing(
                                array_map('floatval', $numbers), 0.35), 4),
        'rolling_avg'  => round(rollingAverage(
                                array_map('floatval', $numbers), 3), 4),
        'z_score_last' => round(zScore(array_map('floatval', $numbers)), 4),
        'pct_rank'     => percentRank(array_map('floatval', $numbers)),
    ];

    // ── Step 4: Core prediction (Calcute engine) ──────────────────
    $prediction = calculatePrediction($trends);

    // ── Step 5: Merge stats into final result ─────────────────────
    $prediction['stats'] = $stats;

    // ── Step 6: Add processing metadata ──────────────────────────
    $prediction['meta'] = [
        'engine'       => 'Python-File.php + Calcute.php',
        'processed_at' => date('Y-m-d H:i:s'),
        'rows_received' => count($trends),
        'version'      => '1.0.0',
    ];

    return $prediction;
}

<?php
/**
 * Calcute.php
 * ─────────────────────────────────────────────────────────────────
 * Core prediction calculation engine.
 *
 *  Algorithms used (all purely deterministic / statistical):
 *   1. Weighted Moving Average  → predicted number
 *   2. Frequency Majority Vote  → predicted color
 *   3. Streak + Frequency       → predicted size
 *   4. Confidence score         → composite metric
 *
 * This file is INCLUDED by Python-File.php / api.php.
 * ─────────────────────────────────────────────────────────────────
 */

declare(strict_types=1);

require_once __DIR__ . '/Support-backend.php';
require_once __DIR__ . '/Pythonhelp.php';

/**
 * Main entry point.
 * Runs all sub-algorithms and returns a unified prediction array.
 *
 * @param  array $trends  10 sanitised trend records (newest last).
 * @return array          Prediction result.
 */
function calculatePrediction(array $trends): array
{
    $numbers = extractNumbers($trends);

    $predictedNumber = predictNumber($numbers);
    $predictedColor  = predictColor($trends, $predictedNumber);
    $predictedSize   = predictSize($trends, $predictedNumber);
    $nextTrendId     = predictNextTrendId($trends);
    $confidence      = calculateConfidence($trends, $predictedNumber, $predictedColor, $predictedSize);

    return [
        'predicted_trend_id' => $nextTrendId,
        'predicted_number'   => $predictedNumber,
        'predicted_color'    => $predictedColor,
        'predicted_size'     => $predictedSize,
        'confidence'         => $confidence,
        'analysis'           => buildAnalysis($numbers, $trends),
    ];
}

/* ── 1. Number Prediction ─────────────────────────────────────── */

/**
 * Weighted Moving Average with heavier weight on recent entries.
 * Also applies modular correction based on last-digit parity pattern.
 *
 * @param  int[] $nums  10 numbers (index 0 = oldest, 9 = newest).
 * @return int          Predicted next number (0–9).
 */
function predictNumber(array $nums): int
{
    // Weights: 1 for oldest … 10 for newest
    $totalWeight = 0;
    $weightedSum = 0.0;

    foreach ($nums as $i => $n) {
        $weight       = $i + 1;           // 1-based
        $weightedSum += $n * $weight;
        $totalWeight += $weight;
    }

    $wma = $weightedSum / $totalWeight;

    // Trend delta: difference between last 3 and first 3 averages
    $earlyAvg = array_sum(array_slice($nums, 0, 3)) / 3;
    $lateAvg  = array_sum(array_slice($nums, 7, 3)) / 3;
    $delta    = ($lateAvg - $earlyAvg) / 10.0;     // normalised

    // Fibonacci correction: detect repeating-gap pattern
    $fibCorrection = detectFibPattern($nums);

    $raw = $wma + $delta + $fibCorrection;

    // Map to 0–9 using modulo on rounded value
    return (int)round(fmod(abs($raw), 10));
}

/**
 * Detect a simple Fibonacci-like gap pattern in the last 5 numbers.
 * Returns a small float correction (+/- 0..1).
 */
function detectFibPattern(array $nums): float
{
    $tail = array_slice($nums, -5);
    $gaps = [];
    for ($i = 1; $i < count($tail); $i++) {
        $gaps[] = $tail[$i] - $tail[$i - 1];
    }
    // If the last two gaps sum to approximately the first gap → fib-like
    if (count($gaps) >= 3) {
        $fibScore = abs(($gaps[count($gaps)-1] + $gaps[count($gaps)-2]) - $gaps[0]);
        if ($fibScore <= 1) return 0.5;   // fib-like: add small positive bias
        if ($fibScore >= 8) return -0.5;  // anti-fib: subtract
    }
    return 0.0;
}

/* ── 2. Color Prediction ──────────────────────────────────────── */

/**
 * Rules (in priority order):
 *   a) If predicted number is 0 or 5 → Violet (special numbers)
 *   b) If predicted number is odd     → Red
 *   c) If predicted number is even    → Green
 *   d) Frequency override: if one color appears ≥ 5 times, use runner-up
 *      (market "reversion" simulation)
 *
 * @param  array $trends
 * @param  int   $predNum
 * @return string
 */
function predictColor(array $trends, int $predNum): string
{
    // Rule a: special numbers
    if ($predNum === 0 || $predNum === 5) {
        return 'Violet';
    }

    $freqMap   = buildFrequencyMap($trends, 'color');
    $topColor  = array_key_first($freqMap);
    $topCount  = $freqMap[$topColor];

    // Frequency reversion: if dominant color appeared ≥ 6 times, predict change
    if ($topCount >= 6) {
        // Return the second most frequent color
        $others = array_slice($freqMap, 1, 1, true);
        if ($others) {
            return array_key_first($others);
        }
    }

    // Rule b / c: parity of predicted number
    return ($predNum % 2 !== 0) ? 'Red' : 'Green';
}

/* ── 3. Size Prediction ───────────────────────────────────────── */

/**
 * Rules:
 *   a) Number >= 5 → MB (Big); Number < 5 → Ms (Small)
 *   b) Streak override: if last 3 entries share same size, flip prediction
 *      (mean-reversion heuristic)
 *
 * @param  array $trends
 * @param  int   $predNum
 * @return string  'Ms' | 'MB'
 */
function predictSize(array $trends, int $predNum): string
{
    $baseSize = ($predNum >= 5) ? 'MB' : 'Ms';

    // Streak check on last 3 actual sizes
    $lastThree = array_slice($trends, -3);
    $sizes     = array_column($lastThree, 'size');

    if (count(array_unique($sizes)) === 1) {
        // All three same → flip (mean reversion)
        return ($sizes[0] === 'MB') ? 'Ms' : 'MB';
    }

    return $baseSize;
}

/* ── 4. Confidence Score ──────────────────────────────────────── */

/**
 * Composite confidence metric (0–100).
 * Factors:
 *  - Color frequency dominance (25 pts)
 *  - Size streak agreement (25 pts)
 *  - Number variance (25 pts — lower variance = higher confidence)
 *  - Pattern consistency score (25 pts)
 *
 * @param  array  $trends
 * @param  int    $predNum
 * @param  string $predColor
 * @param  string $predSize
 * @return int
 */
function calculateConfidence(
    array $trends, int $predNum, string $predColor, string $predSize
): int {
    $score = 0;

    // ── Color dominance ────────────────────────────────────────
    $colorFreq     = buildFrequencyMap($trends, 'color');
    $topColorCount = max($colorFreq);
    $score        += (int)round(($topColorCount / 10) * 25);

    // ── Size streak ────────────────────────────────────────────
    $sizeFreq     = buildFrequencyMap($trends, 'size');
    $topSizeCount = max($sizeFreq);
    $score       += (int)round(($topSizeCount / 10) * 25);

    // ── Number variance (lower = more confident) ───────────────
    $numbers  = extractNumbers($trends);
    $variance = calculateVariance($numbers);
    // Max theoretical variance for 0-9 = ~8.25; map to 25 pts inverted
    $varScore = (int)round((1 - clamp($variance / 8.25, 0.0, 1.0)) * 25);
    $score   += $varScore;

    // ── Pattern consistency (last 5 numbers trending?) ─────────
    $patternScore = assessPatternConsistency(array_slice($numbers, -5));
    $score       += $patternScore;   // 0–25

    return (int)clamp((float)$score, 40.0, 98.0);
}

/**
 * Assess how consistent the last 5 numbers are (monotone/near-monotone).
 * Returns 0–25.
 */
function assessPatternConsistency(array $nums): int
{
    if (count($nums) < 2) return 12;

    $increases  = 0;
    $decreases  = 0;
    $sameCount  = 0;

    for ($i = 1; $i < count($nums); $i++) {
        if ($nums[$i] > $nums[$i-1])      $increases++;
        elseif ($nums[$i] < $nums[$i-1])  $decreases++;
        else                              $sameCount++;
    }

    $dominant = max($increases, $decreases);
    $total    = count($nums) - 1;

    // Full monotone trend → 25 pts; no pattern → 5 pts
    return (int)round(5 + ($dominant / $total) * 20);
}

/* ── Analysis summary ──────────────────────────────────────────── */

/**
 * Build a human-readable analysis object for the response.
 *
 * @param  int[]  $numbers
 * @param  array  $trends
 * @return array
 */
function buildAnalysis(array $numbers, array $trends): array
{
    return [
        'number_mean'     => round(array_sum($numbers) / count($numbers), 2),
        'number_variance' => round(calculateVariance($numbers), 2),
        'color_freq'      => buildFrequencyMap($trends, 'color'),
        'size_freq'       => buildFrequencyMap($trends, 'size'),
        'streak_info'     => detectStreaks($trends),
    ];
}

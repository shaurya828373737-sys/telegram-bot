<?php
/**
 * Pythonhelp.php
 * ─────────────────────────────────────────────────────────────────
 * Statistical & mathematical helper utilities.
 * Mimics Python's statistics / numpy-style functions in pure PHP.
 *
 * Functions available:
 *  - calculateMean()
 *  - calculateMedian()
 *  - calculateMode()
 *  - calculateVariance()
 *  - calculateStdDev()
 *  - normalise()
 *  - detectStreaks()
 *  - exponentialSmoothing()
 *  - rollingAverage()
 *  - zScore()
 *  - percentRank()
 * ─────────────────────────────────────────────────────────────────
 */

declare(strict_types=1);

/**
 * Arithmetic mean of an array of numbers.
 *
 * @param  float[] $data
 * @return float
 */
function calculateMean(array $data): float
{
    if (empty($data)) return 0.0;
    return array_sum($data) / count($data);
}

/**
 * Median value of an array.
 *
 * @param  float[] $data
 * @return float
 */
function calculateMedian(array $data): float
{
    if (empty($data)) return 0.0;
    sort($data);
    $n  = count($data);
    $mid = intdiv($n, 2);
    return ($n % 2 === 0)
        ? ($data[$mid - 1] + $data[$mid]) / 2.0
        : (float)$data[$mid];
}

/**
 * Mode(s) of an array — returns array of most-frequent values.
 *
 * @param  array $data
 * @return array
 */
function calculateMode(array $data): array
{
    if (empty($data)) return [];
    $freq    = array_count_values(array_map('strval', $data));
    $maxFreq = max($freq);
    return array_keys(array_filter($freq, fn($f) => $f === $maxFreq));
}

/**
 * Population variance.
 *
 * @param  float[] $data
 * @return float
 */
function calculateVariance(array $data): float
{
    if (count($data) < 2) return 0.0;
    $mean     = calculateMean($data);
    $squareDiffs = array_map(fn($x) => ($x - $mean) ** 2, $data);
    return array_sum($squareDiffs) / count($data);
}

/**
 * Population standard deviation.
 *
 * @param  float[] $data
 * @return float
 */
function calculateStdDev(array $data): float
{
    return sqrt(calculateVariance($data));
}

/**
 * Min-max normalisation → scales data to [0, 1].
 *
 * @param  float[] $data
 * @return float[]
 */
function normalise(array $data): array
{
    if (empty($data)) return [];
    $min   = min($data);
    $max   = max($data);
    $range = $max - $min;

    if ($range == 0) {
        return array_fill(0, count($data), 0.5);
    }

    return array_map(fn($x) => ($x - $min) / $range, $data);
}

/**
 * Detect current streak (consecutive same value at the end of array).
 *
 * @param  array  $trends  Full trend records.
 * @return array  ['field' => ..., 'value' => ..., 'length' => int][]
 */
function detectStreaks(array $trends): array
{
    $streaks = [];

    foreach (['color', 'size'] as $field) {
        $vals     = array_column($trends, $field);
        $reversed = array_reverse($vals);
        $streakVal = $reversed[0] ?? null;
        $length   = 0;

        foreach ($reversed as $v) {
            if ($v === $streakVal) $length++;
            else break;
        }

        $streaks[] = [
            'field'  => $field,
            'value'  => $streakVal,
            'length' => $length,
        ];
    }

    return $streaks;
}

/**
 * Exponential smoothing (single / Holt's method).
 * alpha controls smoothing (0 = flat, 1 = last value only).
 *
 * @param  float[] $data
 * @param  float   $alpha  Smoothing factor 0 < alpha < 1.
 * @return float           Smoothed forecast for next step.
 */
function exponentialSmoothing(array $data, float $alpha = 0.3): float
{
    if (empty($data)) return 0.0;
    $smoothed = (float)$data[0];

    for ($i = 1; $i < count($data); $i++) {
        $smoothed = $alpha * $data[$i] + (1 - $alpha) * $smoothed;
    }
    return $smoothed;
}

/**
 * Rolling (simple moving) average over the last N items.
 *
 * @param  float[] $data
 * @param  int     $window  Window size.
 * @return float
 */
function rollingAverage(array $data, int $window = 3): float
{
    if (empty($data)) return 0.0;
    $slice = array_slice($data, -$window);
    return calculateMean($slice);
}

/**
 * Z-score of the last value relative to the series.
 *
 * @param  float[] $data
 * @return float
 */
function zScore(array $data): float
{
    if (count($data) < 2) return 0.0;
    $std = calculateStdDev($data);
    if ($std == 0) return 0.0;
    $last = (float)end($data);
    return ($last - calculateMean($data)) / $std;
}

/**
 * Percentile rank of the last value in the dataset (0–100).
 *
 * @param  float[] $data
 * @return float
 */
function percentRank(array $data): float
{
    if (empty($data)) return 50.0;
    $last  = end($data);
    $below = count(array_filter($data, fn($x) => $x < $last));
    return round(($below / count($data)) * 100, 1);
}

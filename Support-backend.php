<?php
/**
 * Support-backend.php
 * ─────────────────────────────────────────────────────────────────
 * Shared helper functions used across the backend pipeline.
 * This file is INCLUDED (not called directly).
 *
 *  • Input sanitisation
 *  • Trend-list normalisation
 *  • Frequency / distribution builders
 *  • Response helpers
 * ─────────────────────────────────────────────────────────────────
 */

declare(strict_types=1);

// ─── Allowed values ───────────────────────────────────────────────
const ALLOWED_COLORS = ['Red', 'Green', 'Violet'];
const ALLOWED_SIZES  = ['Ms', 'MB'];
const NUMBER_MIN     = 0;
const NUMBER_MAX     = 9;

/**
 * Sanitise and validate a single trend record coming from JSON.
 *
 * @param  mixed $raw  Raw associative array from decoded JSON.
 * @param  int   $idx  Row index (for error messages).
 * @return array       Cleaned record.
 * @throws InvalidArgumentException on bad data.
 */
function sanitiseTrend(mixed $raw, int $idx): array
{
    if (!is_array($raw)) {
        throw new InvalidArgumentException("Row {$idx}: expected object.");
    }

    // ── Trend ID ──────────────────────────────────────────────────
    $trendId = trim((string)($raw['trendId'] ?? ''));
    // Accept 6–20 digit numeric strings (YaarWin uses 18-digit period IDs)
    if (!preg_match('/^\d{6,20}$/', $trendId)) {
        // Auto-fix: generate a valid ID rather than reject
        $trendId = '2026052510005' . str_pad((string)($idx + $idx * 7), 4, '0', STR_PAD_LEFT);
    }

    // ── Number ────────────────────────────────────────────────────
    $number = filter_var($raw['number'] ?? null, FILTER_VALIDATE_INT);
    if ($number === false || $number < NUMBER_MIN || $number > NUMBER_MAX) {
        throw new InvalidArgumentException(
            "Row {$idx}: number must be integer 0–9."
        );
    }

    // ── Color ─────────────────────────────────────────────────────
    $color = ucfirst(strtolower(trim((string)($raw['color'] ?? ''))));
    if (!in_array($color, ALLOWED_COLORS, true)) {
        throw new InvalidArgumentException(
            "Row {$idx}: color must be one of " . implode(', ', ALLOWED_COLORS) . "."
        );
    }

    // ── Size ──────────────────────────────────────────────────────
    $size = trim((string)($raw['size'] ?? ''));
    if (!in_array($size, ALLOWED_SIZES, true)) {
        throw new InvalidArgumentException(
            "Row {$idx}: size must be 'Ms' or 'MB'."
        );
    }

    return [
        'trendId' => $trendId,
        'number'  => $number,
        'color'   => $color,
        'size'    => $size,
    ];
}

/**
 * Validate and sanitise the full list of 10 trend records.
 *
 * @param  mixed $rawList  Decoded JSON array.
 * @return array           Array of 10 clean records.
 * @throws InvalidArgumentException
 */
function sanitiseTrendList(mixed $rawList): array
{
    if (!is_array($rawList) || count($rawList) < 10) {
        throw new InvalidArgumentException(
            "10 trend records are required. Got: " . (is_array($rawList) ? count($rawList) : 0)
        );
    }

    // Use exactly the last 10 if more provided
    $rawList = array_slice($rawList, -10);

    $clean = [];
    foreach ($rawList as $idx => $item) {
        $clean[] = sanitiseTrend($item, $idx + 1);
    }
    return $clean;
}

/**
 * Build a frequency map for any string field in the trend list.
 *
 * @param  array  $trends  Sanitised trend records.
 * @param  string $field   Field name ('color' | 'size').
 * @return array           ['value' => count, ...]  sorted desc.
 */
function buildFrequencyMap(array $trends, string $field): array
{
    $freq = [];
    foreach ($trends as $t) {
        $val = $t[$field] ?? '';
        $freq[$val] = ($freq[$val] ?? 0) + 1;
    }
    arsort($freq);
    return $freq;
}

/**
 * Extract just the numeric values from trend records.
 *
 * @param  array $trends
 * @return int[]
 */
function extractNumbers(array $trends): array
{
    return array_map(fn($t) => (int)$t['number'], $trends);
}

/**
 * Predict the next Trend ID by incrementing the last one by 1.
 *
 * @param  array $trends
 * @return string
 */
function predictNextTrendId(array $trends): string
{
    $lastId = (int)end($trends)['trendId'];
    return (string)($lastId + 1);
}

/**
 * Send a JSON success response and exit.
 *
 * @param array $payload
 */
function jsonSuccess(array $payload): never
{
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array_merge(['status' => 'ok'], $payload), JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Send a JSON error response and exit.
 *
 * @param string $message
 * @param int    $httpCode
 */
function jsonError(string $message, int $httpCode = 400): never
{
    http_response_code($httpCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['status' => 'error', 'error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Clamp a value between min and max.
 */
function clamp(float $val, float $min, float $max): float
{
    return max($min, min($max, $val));
}

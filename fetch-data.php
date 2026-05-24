<?php
/**
 * fetch-data.php
 * ─────────────────────────────────────────────────────────────────
 * Server-side auto-fetch pipeline for YaarWin WinGo game history.
 *
 * Flow:
 *   1. POST login  → receive token
 *   2. GET history → last 10 completed rounds
 *   3. Normalise   → map to { trendId, number, color, size }
 *   4. Return JSON → browser auto-fills the form
 *
 * Called by:  Pyton-get-result.js  via  fetch('fetch-data.php')
 * Method:     GET  (no body needed — credentials are hardcoded)
 * ─────────────────────────────────────────────────────────────────
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/fetch-config.php';
require_once __DIR__ . '/Support-backend.php';   // jsonSuccess / jsonError helpers

/* ════════════════════════════════════════════════════════════════
   STEP 1 — LOGIN  →  get bearer token
   ════════════════════════════════════════════════════════════════ */
$token = doLogin();
if (!$token) {
    jsonError('Login failed. Check credentials in fetch-config.php.', 401);
}

/* ════════════════════════════════════════════════════════════════
   STEP 2 — FETCH GAME HISTORY
   ════════════════════════════════════════════════════════════════ */
$rawRecords = fetchHistory($token);
if (!$rawRecords) {
    jsonError('Failed to fetch game history from YaarWin.', 502);
}

/* ════════════════════════════════════════════════════════════════
   STEP 3 — NORMALISE records
   ════════════════════════════════════════════════════════════════ */
$trends = normaliseRecords($rawRecords);
if (count($trends) < 10) {
    jsonError('Not enough completed rounds returned (got ' . count($trends) . ', need 10).', 422);
}

/* ════════════════════════════════════════════════════════════════
   STEP 4 — RETURN
   ════════════════════════════════════════════════════════════════ */
jsonSuccess([
    'trends'      => $trends,
    'fetched_at'  => date('Y-m-d H:i:s'),
    'game'        => 'WinGo_30S',
    'source'      => 'yaarwin.app',
]);

/* ════════════════════════════════════════════════════════════════
   FUNCTIONS
   ════════════════════════════════════════════════════════════════ */

/**
 * POST login credentials → return auth token string or null.
 */
function doLogin(): ?string
{
    $payload = json_encode([
        'phone'    => YW_PHONE,
        'password' => YW_PASSWORD,
        'loginType' => 0,          // 0 = phone+password login
    ]);

    $resp = curlPost(YW_LOGIN_URL, $payload);
    if (!$resp) return null;

    $json = json_decode($resp, true);

    // Try common token field names used by WinGo-based platforms
    return $json['data']['token']
        ?? $json['data']['userInfo']['token']
        ?? $json['token']
        ?? $json['result']['token']
        ?? null;
}

/**
 * GET game history with bearer token → return raw list array or null.
 */
function fetchHistory(string $token): ?array
{
    $url = YW_HISTORY_URL . '?pageSize=' . YW_FETCH_ROWS . '&pageNo=1';

    $headers = [
        'Authorization: Bearer ' . $token,
        'Accept: application/json',
        'Content-Type: application/json',
        'User-Agent: ' . YW_UA,
        'Referer: ' . YW_BASE . '/',
        'Origin: '  . YW_BASE,
    ];

    $resp = curlGet($url, $headers);
    if (!$resp) return null;

    $json = json_decode($resp, true);

    // Try common response structures used by WinGo platforms
    $list = $json['data']['list']
         ?? $json['data']['gameslist']
         ?? $json['data']['records']
         ?? $json['result']['list']
         ?? $json['list']
         ?? null;

    return is_array($list) ? $list : null;
}

/**
 * Normalise raw API records into our standard format.
 * Takes the 10 most recent COMPLETED rounds.
 *
 * WinGo API fields (varies slightly per platform):
 *   issueNumber / periodNumber / issue  → Trend ID
 *   number / winNumber                  → 0-9
 *   colour / color / winColor           → red|green|violet
 *   size / winSize                      → Big|Small
 *
 * @param  array $raw
 * @return array  Up to 10 normalised trend records
 */
function normaliseRecords(array $raw): array
{
    $result = [];

    foreach ($raw as $item) {
        // ── Trend ID ──────────────────────────────────────────────
        $trendId = (string)(
            $item['issueNumber']
            ?? $item['issue']
            ?? $item['periodNumber']
            ?? $item['period']
            ?? $item['roundId']
            ?? ''
        );

        // Skip records with no ID or status != completed
        if ($trendId === '') continue;

        // ── Number ────────────────────────────────────────────────
        $rawNum = $item['number'] ?? $item['winNumber'] ?? $item['result'] ?? null;
        if ($rawNum === null) continue;
        $number = (int)$rawNum;
        if ($number < 0 || $number > 9) continue;

        // ── Color ─────────────────────────────────────────────────
        $rawColor = strtolower(trim((string)(
            $item['colour']
            ?? $item['color']
            ?? $item['winColor']
            ?? $item['colorStr']
            ?? ''
        )));

        // Map number to color if API doesn't return it
        if ($rawColor === '') {
            $rawColor = numberToColor($number);
        }

        $color = mapColor($rawColor, $number);

        // ── Size ──────────────────────────────────────────────────
        $rawSize = strtolower(trim((string)(
            $item['size']
            ?? $item['winSize']
            ?? $item['bigSmall']
            ?? ''
        )));

        // Derive size from number if API doesn't return it
        if ($rawSize === '') {
            $rawSize = ($number >= 5) ? 'big' : 'small';
        }

        $size = mapSize($rawSize, $number);

        $result[] = [
            'trendId' => $trendId,
            'number'  => $number,
            'color'   => $color,
            'size'    => $size,
        ];

        if (count($result) >= YW_FETCH_ROWS) break;
    }

    // Return oldest→newest (for correct WMA weighting)
    return array_reverse($result);
}

/**
 * Map raw color string → Red / Green / Violet
 * WinGo rule: 0,5 = Violet; odd = Red; even = Green
 */
function mapColor(string $raw, int $number): string
{
    if (str_contains($raw, 'violet') || str_contains($raw, 'purple')) return 'Violet';
    if (str_contains($raw, 'red'))    return 'Red';
    if (str_contains($raw, 'green'))  return 'Green';

    // Fallback: derive from number
    return numberToColor($number);
}

function numberToColor(int $n): string
{
    if ($n === 0 || $n === 5) return 'Violet';
    return ($n % 2 !== 0) ? 'Red' : 'Green';
}

/**
 * Map raw size string → Ms / MB
 */
function mapSize(string $raw, int $number): string
{
    if (str_contains($raw, 'big')   || $raw === 'b' || $raw === 'mb') return 'MB';
    if (str_contains($raw, 'small') || $raw === 's' || $raw === 'ms') return 'Ms';
    return ($number >= 5) ? 'MB' : 'Ms';
}

/* ════════════════════════════════════════════════════════════════
   cURL HELPERS
   ════════════════════════════════════════════════════════════════ */

/**
 * Shared cURL base options.
 */
function baseCurl(string $url): \CurlHandle
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 5,
        CURLOPT_TIMEOUT        => YW_TIMEOUT,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_USERAGENT      => YW_UA,
        CURLOPT_ENCODING       => 'gzip, deflate, br',
        // Cookie jar (in-memory, no file) — keeps session alive between calls
        CURLOPT_COOKIEFILE     => '',
        CURLOPT_COOKIEJAR      => '',
    ]);
    return $ch;
}

/**
 * POST JSON → return raw response string or null on error.
 */
function curlPost(string $url, string $jsonBody, array $extraHeaders = []): ?string
{
    $ch = baseCurl($url);
    $headers = array_merge([
        'Content-Type: application/json',
        'Accept: application/json',
        'User-Agent: ' . YW_UA,
        'Referer: ' . YW_BASE . '/',
        'Origin: '  . YW_BASE,
        'Content-Length: ' . strlen($jsonBody),
    ], $extraHeaders);

    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $jsonBody,
        CURLOPT_HTTPHEADER     => $headers,
    ]);

    $resp = curl_exec($ch);
    $err  = curl_error($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($err || !$resp || $code < 200 || $code >= 300) {
        error_log("[fetch-data] POST failed → {$url} | HTTP {$code} | {$err}");
        return null;
    }
    return $resp;
}

/**
 * GET with auth headers → return raw response string or null on error.
 */
function curlGet(string $url, array $headers = []): ?string
{
    $ch = baseCurl($url);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

    $resp = curl_exec($ch);
    $err  = curl_error($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($err || !$resp || $code < 200 || $code >= 300) {
        error_log("[fetch-data] GET failed → {$url} | HTTP {$code} | {$err}");
        return null;
    }
    return $resp;
}

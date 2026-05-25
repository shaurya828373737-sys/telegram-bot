<?php
/**
 * fetch-data.php
 * ─────────────────────────────────────────────────────────────────
 * COMPLETELY REWRITTEN — no more server-side login.
 *
 * The approach that WORKS:
 *   The browser already has the YaarWin game data (it's loaded in
 *   the iframe). We accept that data directly from the browser via
 *   POST as JSON, normalise it, run prediction, and return result.
 *
 * POST body (JSON):
 *   { "records": [ ...raw YaarWin records... ] }
 *
 *   Each record shape (from console):
 *   {
 *     "issueNumber": "20260525100050307",
 *     "number": "0",
 *     "color": "red,violet",
 *     "premium": "0",
 *     "sum": 0
 *   }
 *
 * OR legacy format with fallback credentials:
 *   { "phone": "...", "pass": "..." }
 *   → tries server-side login as before
 *
 * Response:
 *   { "status":"ok", "trends": [...], "fetched_at": "..." }
 * ─────────────────────────────────────────────────────────────────
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/Support-backend.php';
require_once __DIR__ . '/fetch-config.php';

/* ── Read body ─────────────────────────────────────────────────── */
$raw_body = file_get_contents('php://input');
$json_body = json_decode($raw_body, true);

/* ════════════════════════════════════════════════════════════════
   PATH A: Browser sends raw records directly (preferred, no login)
   Records come from the page's own JavaScript — 100% reliable
   ════════════════════════════════════════════════════════════════ */
if (!empty($json_body['records']) && is_array($json_body['records'])) {
    $trends = normaliseRecords($json_body['records']);

    if (count($trends) < 1) {
        jsonError('No valid records could be parsed from the provided data.', 422);
    }

    jsonSuccess([
        'trends'     => $trends,
        'count'      => count($trends),
        'game'       => 'WinGo_30S',
        'source'     => 'browser-direct',
        'fetched_at' => date('Y-m-d H:i:s'),
    ]);
}

/* ════════════════════════════════════════════════════════════════
   PATH B: Try server-side login + API fetch (fallback)
   Uses credentials from POST or fetch-config.php
   ════════════════════════════════════════════════════════════════ */

/* Read credentials */
$phone = trim((string)($_POST['phone'] ?? $json_body['phone'] ?? ''));
$pass  = trim((string)($_POST['pass']  ?? $json_body['pass']  ?? ''));

if ($phone === '') $phone = YW_PHONE;
if ($pass  === '') $pass  = YW_PASSWORD;

if (empty($phone) || empty($pass) ||
    $phone === 'YOUR_PHONE_NUMBER' || $pass === 'YOUR_PASSWORD') {
    jsonError(
        'No credentials. Enter your phone & password in the floating card, ' .
        'then go to the WinGo page so data loads automatically.', 401
    );
}

/* Login */
$token = doLogin($phone, $pass);
if (!$token) {
    jsonError(
        'Server login failed (YaarWin blocks direct API access). ' .
        'Navigate to WinGo page in the website — data will be fetched automatically from the page.', 401
    );
}

/* History */
$rawList = fetchHistory($token);
if (!$rawList) {
    jsonError('Could not fetch WinGo 30s history via server.', 502);
}

$trends = normaliseRecords($rawList);
if (count($trends) < 1) {
    jsonError('Zero usable records from server API.', 422);
}

jsonSuccess([
    'trends'     => $trends,
    'count'      => count($trends),
    'game'       => 'WinGo_30S',
    'source'     => 'server-api',
    'fetched_at' => date('Y-m-d H:i:s'),
]);

/* ════════════════════════════════════════════════════════════════
   NORMALISE  — works with EXACT YaarWin data structure from console
   Input:  { issueNumber, number (string), color (comma-sep), ... }
   Output: { trendId, number (int), color, size, bigSmall }
   ════════════════════════════════════════════════════════════════ */
function normaliseRecords(array $raw): array
{
    $out = [];

    foreach ($raw as $item) {
        if (!is_array($item)) continue;

        /* ── Trend ID ── */
        $tid = (string)(
            $item['issueNumber'] ?? $item['issue']        ??
            $item['periodNumber']?? $item['period']       ??
            $item['roundId']     ?? $item['id']           ?? ''
        );
        if ($tid === '') continue;

        /* ── Number — comes as STRING "0"-"9" ── */
        $rawN = $item['number'] ?? $item['winNumber'] ?? $item['result'] ?? null;
        if ($rawN === null) continue;
        $n = (int)$rawN;
        if ($n < 0 || $n > 9) continue;

        /* ── Color — can be "red,violet" or "green,violet" ── */
        $rawC = strtolower(trim((string)(
            $item['colour']   ?? $item['color']    ??
            $item['winColor'] ?? $item['colorStr'] ?? ''
        )));
        $color = parseColor($rawC, $n);

        /* ── Size — derived from number (no size field in API) ── */
        /* WinGo rule: 0-4 = Small, 5-9 = Big */
        $size    = ($n >= 5) ? 'MB' : 'Ms';
        $bigSmall = ($n >= 5) ? 'Big' : 'Small';

        /* Also check if API returns size field */
        $rawS = strtolower(trim((string)(
            $item['size']     ?? $item['winSize']  ??
            $item['bigSmall'] ?? $item['size_str'] ?? ''
        )));
        if ($rawS !== '') {
            if (str_contains($rawS, 'big') || $rawS === 'mb' || $rawS === 'b') {
                $size     = 'MB';
                $bigSmall = 'Big';
            } elseif (str_contains($rawS, 'small') || $rawS === 'ms' || $rawS === 's') {
                $size     = 'Ms';
                $bigSmall = 'Small';
            }
        }

        /* ── Premium / sum (keep as-is for extra info) ── */
        $premium = $item['premium'] ?? $item['sum'] ?? 0;

        $out[] = [
            'trendId'  => $tid,
            'number'   => $n,
            'color'    => $color,
            'size'     => $size,
            'bigSmall' => $bigSmall,
            'premium'  => (int)$premium,
        ];

        if (count($out) >= 10) break;
    }

    /* Return oldest→newest (for correct WMA weighting in Calcute.php) */
    return array_reverse($out);
}

/**
 * Parse YaarWin color string.
 * Examples: "red,violet" → "Violet"  (special number)
 *           "green,violet" → "Violet" (special number)
 *           "red" → "Red"
 *           "green" → "Green"
 */
function parseColor(string $raw, int $n): string
{
    /* If color contains "violet" — it's a special number (0 or 5) */
    if (str_contains($raw, 'violet') || str_contains($raw, 'purple')) {
        return 'Violet';
    }
    if (str_contains($raw, 'red'))   return 'Red';
    if (str_contains($raw, 'green')) return 'Green';

    /* Derive from WinGo number rules */
    if ($n === 0 || $n === 5) return 'Violet';
    return ($n % 2 !== 0) ? 'Red' : 'Green';
}

/* ════════════════════════════════════════════════════════════════
   SERVER-SIDE LOGIN (fallback only)
   ════════════════════════════════════════════════════════════════ */
function doLogin(string $phone, string $pass): ?string
{
    $payloads = [
        ['phone'  => $phone, 'password' => $pass, 'loginType' => 0],
        ['mobile' => $phone, 'password' => $pass, 'loginType' => 0],
        ['phone'  => $phone, 'password' => $pass],
        ['mobile' => $phone, 'password' => $pass],
    ];

    foreach (YW_LOGIN_URLS as $url) {
        foreach ($payloads as $payload) {
            $resp = xPost($url, json_encode($payload));
            if (!$resp) continue;
            $j = json_decode($resp, true);
            if (!is_array($j)) continue;

            $token =
                $j['data']['token']             ??
                $j['data']['userInfo']['token'] ??
                $j['data']['info']['token']     ??
                $j['result']['token']           ??
                $j['token']                     ??
                null;

            if (is_string($token) && strlen($token) > 10) return $token;
        }
    }
    return null;
}

function fetchHistory(string $token): ?array
{
    $rows    = YW_FETCH_ROWS;
    $headers = [
        'Authorization: Bearer ' . $token,
        'Accept: application/json',
        'Referer: ' . YW_BASE . '/',
        'Origin: '  . YW_BASE,
        'User-Agent: ' . YW_UA,
    ];

    foreach (YW_HISTORY_URLS as $base) {
        foreach (["pageSize={$rows}&pageNo=1", "pageSize={$rows}&page=1", "size={$rows}&pageNo=1"] as $q) {
            $resp = xGet("{$base}?{$q}", $headers);
            if (!$resp) continue;
            $j = json_decode($resp, true);
            if (!is_array($j)) continue;
            $list =
                $j['data']['list'] ?? $j['data']['gameslist'] ??
                $j['data']['records'] ?? $j['result']['list'] ?? $j['list'] ?? null;
            if (is_array($list) && count($list) > 0) return $list;
        }
    }
    return null;
}

/* ════════════════════════════════════════════════════════════════
   CURL HELPERS
   ════════════════════════════════════════════════════════════════ */
function baseCh(string $url): \CurlHandle
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 3,
        CURLOPT_TIMEOUT        => YW_TIMEOUT,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
        CURLOPT_USERAGENT      => YW_UA,
        CURLOPT_ENCODING       => 'gzip, deflate',
    ]);
    return $ch;
}

function xPost(string $url, string $body): ?string
{
    $ch = baseCh($url);
    curl_setopt_array($ch, [
        CURLOPT_POST       => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Accept: application/json',
            'Referer: ' . YW_BASE . '/',
            'Origin: '  . YW_BASE,
        ],
    ]);
    $resp = curl_exec($ch);
    curl_close($ch);
    return $resp ?: null;
}

function xGet(string $url, array $headers): ?string
{
    $ch = baseCh($url);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    $resp = curl_exec($ch);
    curl_close($ch);
    return $resp ?: null;
}

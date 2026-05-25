<?php
/**
 * fetch-data.php
 * ─────────────────────────────────────────────────────────────────
 * DIRECT PUBLIC API — NO LOGIN REQUIRED
 *
 * YaarWin uses a public CDN at draw.ar-lottery01.com
 * No auth header needed — just a timestamp query param.
 *
 * Endpoints confirmed from Network tab:
 *   History: https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json?ts=TIMESTAMP
 *   Current: https://draw.ar-lottery01.com/WinGo/WinGo_30S.json?ts=TIMESTAMP
 *
 * Response format (confirmed):
 *   { "data": { "list": [ { "issueNumber":"...", "number":"1",
 *     "color":"green", "premium":"1", "sum":0 } ] },
 *     "code": 0, "msg": "Succeed" }
 * ─────────────────────────────────────────────────────────────────
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/Support-backend.php';

/* ── Timestamp in milliseconds ──────────────────────────────────── */
$ts = (int)(microtime(true) * 1000);

/* ── Confirmed public endpoints ─────────────────────────────────── */
$HISTORY_URL = "https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json?ts={$ts}";
$CURRENT_URL = "https://draw.ar-lottery01.com/WinGo/WinGo_30S.json?ts={$ts}";

/* ── Headers that mimic the real browser ────────────────────────── */
$HEADERS = [
    'Accept: application/json, text/plain, */*',
    'Accept-Encoding: gzip, deflate, br',
    'Accept-Language: en-GB,en-US;q=0.9,en;q=0.8',
    'Origin: https://yaarwin.app',
    'Referer: https://yaarwin.app/',
    'sec-fetch-dest: empty',
    'sec-fetch-mode: cors',
    'sec-fetch-site: cross-site',
    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
];

/* ── Fetch history ───────────────────────────────────────────────── */
$raw = fetchUrl($HISTORY_URL, $HEADERS);

if (!$raw) {
    /* Fallback to current round endpoint */
    $raw = fetchUrl($CURRENT_URL, $HEADERS);
}

if (!$raw) {
    jsonError('Could not reach YaarWin game data server. Check your internet.', 502);
}

/* ── Decode ─────────────────────────────────────────────────────── */
$json = json_decode($raw, true);

if (!is_array($json)) {
    jsonError('Invalid response from game server.', 502);
}

/* ── Check success ───────────────────────────────────────────────── */
$code = (int)($json['code'] ?? -1);
if ($code !== 0) {
    $msg = $json['msg'] ?? 'Unknown game server error';
    jsonError("Game server error: {$msg}", 502);
}

/* ── Extract record list ─────────────────────────────────────────── */
$list = $json['data']['list'] ?? null;

if (!is_array($list) || count($list) < 1) {
    jsonError('No game records returned.', 422);
}

/* ── Normalise ───────────────────────────────────────────────────── */
$trends = normaliseYaarWin($list, 10);

if (count($trends) < 1) {
    jsonError('Could not parse valid trend records.', 422);
}

/* ── Return ─────────────────────────────────────────────────────── */
jsonSuccess([
    'trends'     => $trends,
    'count'      => count($trends),
    'game'       => 'WinGo_30S',
    'source'     => 'draw.ar-lottery01.com',
    'fetched_at' => date('Y-m-d H:i:s'),
    'total'      => $json['data']['totalCount'] ?? count($list),
]);

/* ════════════════════════════════════════════════════════════════
   NORMALISE — maps YaarWin API format to prediction format
   Input:  { issueNumber, number (string), color (green/red/red,violet) }
   Output: { trendId, number (int), color (Red/Green/Violet), size, bigSmall }
   ════════════════════════════════════════════════════════════════ */
function normaliseYaarWin(array $list, int $limit): array
{
    $out = [];

    foreach ($list as $item) {
        if (!is_array($item)) continue;

        /* Trend ID */
        $tid = trim((string)($item['issueNumber'] ?? ''));
        if ($tid === '' || !preg_match('/^\d+$/', $tid)) continue;

        /* Number — comes as string "0"-"9" */
        $n = (int)($item['number'] ?? -1);
        if ($n < 0 || $n > 9) continue;

        /* Color */
        $rawColor = strtolower(trim((string)($item['color'] ?? '')));
        $color    = parseColor($rawColor, $n);

        /* Size — derived from number, no field in API */
        $size     = ($n >= 5) ? 'MB' : 'Ms';
        $bigSmall = ($n >= 5) ? 'Big' : 'Small';

        $out[] = [
            'trendId'  => $tid,
            'number'   => $n,
            'color'    => $color,
            'size'     => $size,
            'bigSmall' => $bigSmall,
        ];

        if (count($out) >= $limit) break;
    }

    /* API returns newest-first → reverse to oldest-first for WMA algorithm */
    return array_reverse($out);
}

/**
 * Parse YaarWin color string.
 * "green"        → Green
 * "red"          → Red
 * "red,violet"   → Violet  (number 0)
 * "green,violet" → Violet  (number 5)
 */
function parseColor(string $raw, int $n): string
{
    if (str_contains($raw, 'violet')) return 'Violet';
    if ($raw === 'green')             return 'Green';
    if ($raw === 'red')               return 'Red';
    if ($n === 0 || $n === 5)        return 'Violet';
    return ($n % 2 !== 0) ? 'Red' : 'Green';
}

/* ════════════════════════════════════════════════════════════════
   cURL HELPER
   ════════════════════════════════════════════════════════════════ */
function fetchUrl(string $url, array $headers): ?string
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 3,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_ENCODING       => 'gzip, deflate, br',
    ]);

    $resp = curl_exec($ch);
    $err  = curl_error($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($err) {
        error_log("[fetch-data] cURL error {$url}: {$err}");
        return null;
    }
    if ($code < 200 || $code >= 300) {
        error_log("[fetch-data] HTTP {$code} for {$url}");
        return null;
    }

    return $resp ?: null;
}

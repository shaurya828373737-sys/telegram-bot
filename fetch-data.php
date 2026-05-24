<?php
/**
 * fetch-data.php
 * ─────────────────────────────────────────────────────────────────
 * Receives phone + pass via POST from auto-fetch.js
 * Does: Login → get token → fetch WinGo 30s history → return JSON
 *
 * POST params:
 *   phone  — user's phone number
 *   pass   — user's password
 *
 * Falls back to fetch-config.php credentials if POST is empty.
 * ─────────────────────────────────────────────────────────────────
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204); exit;
}

require_once __DIR__ . '/Support-backend.php';
require_once __DIR__ . '/fetch-config.php';

/* ── Read credentials ─────────────────────────── */
/* Priority: POST params > fetch-config.php defaults */
$phone = trim((string)($_POST['phone'] ?? ''));
$pass  = trim((string)($_POST['pass']  ?? ''));

if ($phone === '') $phone = defined('YW_PHONE')    ? YW_PHONE    : '';
if ($pass  === '') $pass  = defined('YW_PASSWORD') ? YW_PASSWORD : '';

if ($phone === '' || $pass === '') {
    jsonError('Login credentials missing. Enter phone and password on the login screen.', 401);
}

/* ── Constants ─────────────────────────────────── */
$BASE        = defined('YW_BASE')        ? YW_BASE        : 'https://yaarwin.app';
$LOGIN_URL   = defined('YW_LOGIN_URL')   ? YW_LOGIN_URL   : $BASE . '/api/member/login';
$HISTORY_URL = defined('YW_HISTORY_URL') ? YW_HISTORY_URL : $BASE . '/api/game/WinGo/WinGo_30S/gameRecord';
$ROWS        = defined('YW_FETCH_ROWS')  ? (int)YW_FETCH_ROWS : 10;
$TIMEOUT     = defined('YW_TIMEOUT')     ? (int)YW_TIMEOUT    : 20;
$UA          = defined('YW_UA')          ? YW_UA : 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36';

/* ── Step 1: Login ──────────────────────────────── */
$token = doLogin($phone, $pass, $LOGIN_URL, $BASE, $UA, $TIMEOUT);
if (!$token) {
    jsonError('Login failed. Check credentials in fetch-config.php. — You can still enter data manually.', 401);
}

/* ── Step 2: Fetch history ──────────────────────── */
$rawList = fetchHistory($token, $HISTORY_URL, $ROWS, $BASE, $UA, $TIMEOUT);
if (!$rawList) {
    jsonError('Failed to fetch game history from YaarWin.', 502);
}

/* ── Step 3: Normalise ──────────────────────────── */
$trends = normaliseRecords($rawList, $ROWS);
if (count($trends) < 1) {
    jsonError('Not enough completed rounds returned (got ' . count($trends) . ').', 422);
}

/* ── Return ─────────────────────────────────────── */
jsonSuccess([
    'trends'     => $trends,
    'fetched_at' => date('Y-m-d H:i:s'),
    'game'       => 'WinGo_30S',
    'source'     => 'yaarwin.app',
    'count'      => count($trends),
]);

/* ══════════════════════════════════════════════════
   FUNCTIONS
══════════════════════════════════════════════════ */

function doLogin(string $phone, string $pass, string $url, string $base, string $ua, int $timeout): ?string
{
    /* Try multiple login payload structures used by WinGo platforms */
    $payloads = [
        ['phone' => $phone, 'password' => $pass, 'loginType' => 0],
        ['mobile' => $phone, 'password' => $pass, 'loginType' => 0],
        ['username' => $phone, 'password' => $pass],
        ['account' => $phone, 'password' => $pass],
    ];

    foreach ($payloads as $payload) {
        $resp = curlPost($url, json_encode($payload), $base, $ua, $timeout);
        if (!$resp) continue;

        $json = json_decode($resp, true);
        if (!is_array($json)) continue;

        $token = $json['data']['token']
              ?? $json['data']['userInfo']['token']
              ?? $json['result']['token']
              ?? $json['token']
              ?? $json['data']['info']['token']
              ?? null;

        if ($token && strlen($token) > 10) return (string)$token;
    }
    return null;
}

function fetchHistory(string $token, string $url, int $rows, string $base, string $ua, int $timeout): ?array
{
    /* Try common query param patterns */
    $urls = [
        $url . '?pageSize=' . $rows . '&pageNo=1',
        $url . '?pageSize=' . $rows . '&page=1',
        $url . '?size=' . $rows . '&pageNo=1',
        $url . '?limit=' . $rows,
    ];

    $headers = [
        'Authorization: Bearer ' . $token,
        'Accept: application/json',
        'Content-Type: application/json',
        'User-Agent: ' . $ua,
        'Referer: ' . $base . '/',
        'Origin: '  . $base,
    ];

    foreach ($urls as $u) {
        $resp = curlGet($u, $headers, $timeout);
        if (!$resp) continue;

        $json = json_decode($resp, true);
        if (!is_array($json)) continue;

        $list = $json['data']['list']
             ?? $json['data']['gameslist']
             ?? $json['data']['records']
             ?? $json['result']['list']
             ?? $json['list']
             ?? $json['data']
             ?? null;

        if (is_array($list) && count($list) > 0) return $list;
    }
    return null;
}

function normaliseRecords(array $raw, int $limit): array
{
    $result = [];

    foreach ($raw as $item) {
        if (!is_array($item)) continue;

        /* Trend ID */
        $trendId = (string)(
            $item['issueNumber'] ?? $item['issue'] ?? $item['periodNumber']
            ?? $item['period'] ?? $item['roundId'] ?? $item['id'] ?? ''
        );
        if ($trendId === '') continue;

        /* Number */
        $rawNum = $item['number'] ?? $item['winNumber'] ?? $item['result'] ?? null;
        if ($rawNum === null) continue;
        $number = (int)$rawNum;
        if ($number < 0 || $number > 9) continue;

        /* Color */
        $rawColor = strtolower(trim((string)(
            $item['colour'] ?? $item['color'] ?? $item['winColor']
            ?? $item['colorStr'] ?? ''
        )));
        if ($rawColor === '') $rawColor = numToColorStr($number);
        $color = mapColor($rawColor, $number);

        /* Size */
        $rawSize = strtolower(trim((string)(
            $item['size'] ?? $item['winSize'] ?? $item['bigSmall'] ?? ''
        )));
        if ($rawSize === '') $rawSize = $number >= 5 ? 'big' : 'small';
        $size = mapSize($rawSize, $number);

        $result[] = [
            'trendId' => $trendId,
            'number'  => $number,
            'color'   => $color,
            'size'    => $size,
        ];

        if (count($result) >= $limit) break;
    }

    /* Return oldest-first so WMA weighting is correct */
    return array_reverse($result);
}

function numToColorStr(int $n): string
{
    if ($n === 0 || $n === 5) return 'violet';
    return ($n % 2 !== 0) ? 'red' : 'green';
}

function mapColor(string $raw, int $number): string
{
    if (str_contains($raw, 'violet') || str_contains($raw, 'purple')) return 'Violet';
    if (str_contains($raw, 'red'))   return 'Red';
    if (str_contains($raw, 'green')) return 'Green';
    if ($number === 0 || $number === 5) return 'Violet';
    return ($number % 2 !== 0) ? 'Red' : 'Green';
}

function mapSize(string $raw, int $number): string
{
    if (str_contains($raw, 'big') || $raw === 'b' || $raw === 'mb') return 'MB';
    if (str_contains($raw, 'small') || $raw === 's' || $raw === 'ms') return 'Ms';
    return $number >= 5 ? 'MB' : 'Ms';
}

/* ── cURL helpers ───────────────────────────────── */
function baseCurl(string $url, string $ua, int $timeout): \CurlHandle
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 5,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
        CURLOPT_USERAGENT      => $ua,
        CURLOPT_ENCODING       => 'gzip, deflate',
        CURLOPT_COOKIEFILE     => '',
        CURLOPT_COOKIEJAR      => '',
    ]);
    return $ch;
}

function curlPost(string $url, string $body, string $base, string $ua, int $timeout): ?string
{
    $ch = baseCurl($url, $ua, $timeout);
    curl_setopt_array($ch, [
        CURLOPT_POST       => true,
        CURLOPT_POSTFIELDS => $body,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Accept: application/json',
            'Referer: ' . $base . '/',
            'Origin: '  . $base,
            'Content-Length: ' . strlen($body),
        ],
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);
    if ($err || !$resp) { error_log('[fetch-data] POST error: ' . $err); return null; }
    return $resp;
}

function curlGet(string $url, array $headers, int $timeout): ?string
{
    $ch = baseCurl($url, $headers[3] ?? '', $timeout);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    $resp = curl_exec($ch);
    $err  = curl_error($ch);
    curl_close($ch);
    if ($err || !$resp) { error_log('[fetch-data] GET error: ' . $err); return null; }
    return $resp;
}

<?php
/**
 * fetch-data.php
 * ─────────────────────────────────────────────────────────────────
 * Server-side pipeline called by auto-fetch.js via POST.
 *
 * POST params:
 *   phone   — user phone (from localStorage in browser)
 *   pass    — user password (from localStorage in browser)
 *
 * Falls back to fetch-config.php credentials if POST is empty.
 *
 * Pipeline:
 *   1. Try every known login endpoint until token acquired
 *   2. Try every known history endpoint until records received
 *   3. Normalise records → { trendId, number, color, size }
 *   4. Return JSON to browser
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

/* ── 1. Resolve credentials ─────────────────────────────────────── */
$phone = trim((string)($_POST['phone'] ?? ''));
$pass  = trim((string)($_POST['pass']  ?? ''));

if ($phone === '') $phone = YW_PHONE;
if ($pass  === '') $pass  = YW_PASSWORD;

if ($phone === '' || $pass === '' ||
    $phone === 'YOUR_PHONE_NUMBER' || $pass === 'YOUR_PASSWORD') {
  jsonError(
    'No credentials. Open the tool, tap 📱 Login, ' .
    'log in on the website, then edit fetch-config.php with your phone & password.', 401
  );
}

/* ── 2. Login → token ───────────────────────────────────────────── */
$token = attemptLogin($phone, $pass);
if (!$token) {
  jsonError(
    'Login failed on all endpoints. Check credentials or try again later.', 401
  );
}

/* ── 3. Fetch history ───────────────────────────────────────────── */
$raw = attemptHistory($token);
if (!$raw) {
  jsonError('Could not fetch WinGo 30s history from any known endpoint.', 502);
}

/* ── 4. Normalise ───────────────────────────────────────────────── */
$trends = normalise($raw, YW_FETCH_ROWS);
if (count($trends) < 1) {
  jsonError('Zero usable records returned — API may have changed format.', 422);
}

/* ── 5. Respond ─────────────────────────────────────────────────── */
jsonSuccess([
  'trends'     => $trends,
  'count'      => count($trends),
  'game'       => 'WinGo_30S',
  'source'     => 'yaarwin.app',
  'fetched_at' => date('Y-m-d H:i:s'),
]);

/* ════════════════════════════════════════════════════════
   LOGIN  —  tries every known endpoint + payload shape
════════════════════════════════════════════════════════ */
function attemptLogin(string $phone, string $pass): ?string
{
  /* All payload shapes WinGo platforms use */
  $payloads = [
    ['phone'    => $phone, 'password' => $pass, 'loginType' => 0],
    ['mobile'   => $phone, 'password' => $pass, 'loginType' => 0],
    ['username' => $phone, 'password' => $pass],
    ['account'  => $phone, 'password' => $pass],
    ['phone'    => $phone, 'pwd'      => $pass],
    ['mobile'   => $phone, 'pwd'      => $pass],
  ];

  foreach (YW_LOGIN_URLS as $url) {
    foreach ($payloads as $payload) {
      $resp = xPost($url, json_encode($payload));
      if (!$resp) continue;

      $j = json_decode($resp, true);
      if (!is_array($j)) continue;

      /* Extract token from all known response shapes */
      $token =
        $j['data']['token']             ??
        $j['data']['userInfo']['token'] ??
        $j['data']['info']['token']     ??
        $j['result']['token']           ??
        $j['result']['data']['token']   ??
        $j['token']                     ??
        null;

      if (is_string($token) && strlen($token) > 10) {
        return $token;
      }
    }
  }
  return null;
}

/* ════════════════════════════════════════════════════════
   HISTORY  —  tries every known endpoint + param shape
════════════════════════════════════════════════════════ */
function attemptHistory(string $token): ?array
{
  $rows = YW_FETCH_ROWS;

  /* All query-string param shapes platforms use */
  $paramSets = [
    "pageSize={$rows}&pageNo=1",
    "pageSize={$rows}&page=1",
    "size={$rows}&pageNo=1",
    "limit={$rows}&page=1",
    "pageSize={$rows}&pageNum=1",
    "rows={$rows}&page=1",
  ];

  $headers = [
    'Authorization: Bearer ' . $token,
    'Accept: application/json',
    'Content-Type: application/json',
    'Referer: ' . YW_BASE . '/',
    'Origin: '  . YW_BASE,
    'User-Agent: ' . YW_UA,
  ];

  foreach (YW_HISTORY_URLS as $baseUrl) {
    foreach ($paramSets as $params) {
      $url  = $baseUrl . '?' . $params;
      $resp = xGet($url, $headers);
      if (!$resp) continue;

      $j = json_decode($resp, true);
      if (!is_array($j)) continue;

      /* Extract list from all known response shapes */
      $list =
        $j['data']['list']      ??
        $j['data']['gameslist'] ??
        $j['data']['records']   ??
        $j['data']['rows']      ??
        $j['result']['list']    ??
        $j['list']              ??
        (is_array($j['data'] ?? null) && isset($j['data'][0]) ? $j['data'] : null) ??
        null;

      if (is_array($list) && count($list) > 0) {
        return $list;
      }
    }
  }
  return null;
}

/* ════════════════════════════════════════════════════════
   NORMALISE  —  maps raw API records to standard format
════════════════════════════════════════════════════════ */
function normalise(array $raw, int $limit): array
{
  $out = [];

  foreach ($raw as $item) {
    if (!is_array($item)) continue;

    /* ── Trend ID ── */
    $tid = (string)(
      $item['issueNumber'] ?? $item['issue']        ??
      $item['periodNumber']?? $item['period']        ??
      $item['roundId']     ?? $item['id']            ?? ''
    );
    if ($tid === '') continue;

    /* ── Number ── */
    $rawN = $item['number'] ?? $item['winNumber'] ?? $item['result'] ?? null;
    if ($rawN === null) continue;
    $n = (int)$rawN;
    if ($n < 0 || $n > 9) continue;

    /* ── Color ── */
    $rawC = strtolower(trim((string)(
      $item['colour']   ?? $item['color']    ??
      $item['winColor'] ?? $item['colorStr'] ?? ''
    )));
    $color = resolveColor($rawC, $n);

    /* ── Size ── */
    $rawS = strtolower(trim((string)(
      $item['size']     ?? $item['winSize']  ??
      $item['bigSmall'] ?? ''
    )));
    $size  = resolveSize($rawS, $n);

    $out[] = compact('tid', 'n', 'color', 'size') + [
      'trendId' => $tid,
      'number'  => $n,
      'color'   => $color,
      'size'    => $size,
    ];

    if (count($out) >= $limit) break;
  }

  /* oldest-first so WMA weighing is correct */
  return array_reverse($out);
}

function resolveColor(string $raw, int $n): string
{
  if (str_contains($raw, 'violet') || str_contains($raw, 'purple')) return 'Violet';
  if (str_contains($raw, 'red'))    return 'Red';
  if (str_contains($raw, 'green'))  return 'Green';
  /* derive from number — WinGo rules */
  if ($n === 0 || $n === 5) return 'Violet';
  return ($n % 2 !== 0) ? 'Red' : 'Green';
}

function resolveSize(string $raw, int $n): string
{
  if ($raw === 'big'   || $raw === 'mb' || $raw === 'b') return 'MB';
  if ($raw === 'small' || $raw === 'ms' || $raw === 's') return 'Ms';
  if (str_contains($raw, 'big'))   return 'MB';
  if (str_contains($raw, 'small')) return 'Ms';
  return ($n >= 5) ? 'MB' : 'Ms';
}

/* ════════════════════════════════════════════════════════
   CURL HELPERS
════════════════════════════════════════════════════════ */
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
    CURLOPT_COOKIEFILE     => '',
    CURLOPT_COOKIEJAR      => '',
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
      'User-Agent: ' . YW_UA,
    ],
  ]);
  $resp = curl_exec($ch);
  $err  = curl_error($ch);
  curl_close($ch);
  if ($err) { error_log("[fetch-data] POST $url → $err"); return null; }
  return $resp ?: null;
}

function xGet(string $url, array $headers): ?string
{
  $ch = baseCh($url);
  curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
  $resp = curl_exec($ch);
  $err  = curl_error($ch);
  curl_close($ch);
  if ($err) { error_log("[fetch-data] GET $url → $err"); return null; }
  return $resp ?: null;
}

<?php
/**
 * fetch-config.php
 * ─────────────────────────────────────────────────────────────────
 * Hardcoded fallback credentials for YaarWin.
 *
 * These are used ONLY if no phone/pass is posted from the browser.
 * Replace with your real credentials.
 *
 * ⚠ SECURITY: Protect this file from direct HTTP access.
 *   Add to .htaccess:
 *     <Files "fetch-config.php">
 *       Require all denied
 *     </Files>
 * ─────────────────────────────────────────────────────────────────
 */

/* ── YOUR CREDENTIALS (fill in) ─────────────────────────────────── */
define('YW_PHONE',    'YOUR_PHONE_NUMBER');  // e.g. '9876543210'
define('YW_PASSWORD', 'YOUR_PASSWORD');       // e.g. 'pass@123'

/* ── BASE URL ────────────────────────────────────────────────────── */
define('YW_BASE', 'https://yaarwin.app');

/* ── ALL KNOWN LOGIN ENDPOINTS (tried in order) ──────────────────── */
define('YW_LOGIN_URLS', [
  YW_BASE . '/api/member/login',
  YW_BASE . '/api/user/login',
  YW_BASE . '/api/v1/member/login',
  YW_BASE . '/api/v2/member/login',
]);

/* ── ALL KNOWN HISTORY ENDPOINTS (tried in order) ───────────────── */
define('YW_HISTORY_URLS', [
  YW_BASE . '/api/game/WinGo/WinGo_30S/gameRecord',
  YW_BASE . '/api/lottery/WinGo/WinGo_30S/gameRecord',
  YW_BASE . '/api/game/wingo/WinGo_30S/gameRecord',
  YW_BASE . '/api/wingo/gameRecord',
  YW_BASE . '/api/game/record',
]);

/* ── CONFIG ──────────────────────────────────────────────────────── */
define('YW_FETCH_ROWS', 10);
define('YW_TIMEOUT',    25);

/* ── USER AGENT (real Android Chrome) ───────────────────────────── */
define('YW_UA',
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) ' .
  'AppleWebKit/537.36 (KHTML, like Gecko) ' .
  'Chrome/124.0.6367.82 Mobile Safari/537.36'
);

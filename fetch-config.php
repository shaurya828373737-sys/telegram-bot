<?php
/**
 * fetch-config.php
 * ─────────────────────────────────────────────────────────────────
 * Hardcoded credentials + URLs for YaarWin auto-fetch.
 * ⚠️  Keep this file private — never expose on public URL.
 *     Add to .htaccess:  deny from all
 * ─────────────────────────────────────────────────────────────────
 */

// ── YOUR LOGIN CREDENTIALS ────────────────────────────────────────
define('YW_PHONE',    'YOUR_PHONE_NUMBER');   // e.g. '9876543210'
define('YW_PASSWORD', 'YOUR_PASSWORD');        // e.g. 'mypass123'

// ── API BASE (no trailing slash) ──────────────────────────────────
define('YW_BASE',     'https://yaarwin.app');

// ── ENDPOINT 1: Login ─────────────────────────────────────────────
// Standard WinGo platform login endpoint
define('YW_LOGIN_URL',   YW_BASE . '/api/member/login');

// ── ENDPOINT 2: WinGo 30s Game History ───────────────────────────
// Returns last N completed rounds with: issueNumber, number, colour, size
define('YW_HISTORY_URL', YW_BASE . '/api/game/WinGo/WinGo_30S/gameRecord');

// ── HOW MANY RECORDS TO FETCH ──────────────────────────────────────
define('YW_FETCH_ROWS', 10);

// ── CURL TIMEOUT (seconds) ────────────────────────────────────────
define('YW_TIMEOUT', 20);

// ── COMMON HEADERS that mimic a real browser ─────────────────────
define('YW_UA', 'Mozilla/5.0 (Linux; Android 12; Pixel 6) '
              . 'AppleWebKit/537.36 (KHTML, like Gecko) '
              . 'Chrome/124.0.0.0 Mobile Safari/537.36');

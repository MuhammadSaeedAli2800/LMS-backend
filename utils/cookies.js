const crypto = require('crypto');
const config = require('../config/env');
const { isPersistentToken } = require('./tokens');

const TOKEN_COOKIE = 'lms_token';
const CSRF_COOKIE = 'lms_csrf';
const REMEMBER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function baseOptions() {
  return {
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    path: '/',
  };
}

function setCsrfCookie(res, persistent) {
  const csrfToken = crypto.randomBytes(32).toString('hex');
  const options = {
    ...baseOptions(),
    httpOnly: false,
  };
  if (persistent) {
    options.maxAge = REMEMBER_MAX_AGE_MS;
  }
  res.cookie(CSRF_COOKIE, csrfToken, options);
  return csrfToken;
}

function setAuthCookies(res, token, persistent) {
  const tokenOptions = {
    ...baseOptions(),
    httpOnly: true,
  };
  if (persistent) {
    tokenOptions.maxAge = REMEMBER_MAX_AGE_MS;
  }
  res.cookie(TOKEN_COOKIE, token, tokenOptions);
  setCsrfCookie(res, persistent);
}

function refreshCsrfCookie(res, token) {
  setCsrfCookie(res, Boolean(token) && isPersistentToken(token));
}

function clearAuthCookies(res) {
  const shared = baseOptions();
  res.clearCookie(TOKEN_COOKIE, { ...shared, httpOnly: true });
  res.clearCookie(CSRF_COOKIE, { ...shared, httpOnly: false });
}

module.exports = {
  TOKEN_COOKIE,
  CSRF_COOKIE,
  setAuthCookies,
  setCsrfCookie,
  refreshCsrfCookie,
  clearAuthCookies,
};

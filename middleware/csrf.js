const crypto = require('crypto');
const ApiError = require('../utils/ApiError');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXEMPT = new Set([
  'POST /api/auth/login',
  'POST /api/admin/auth/login',
]);

function tokensMatch(headerToken, cookieToken) {
  if (typeof headerToken !== 'string' || typeof cookieToken !== 'string') {
    return false;
  }
  const header = Buffer.from(headerToken);
  const cookie = Buffer.from(cookieToken);
  if (header.length === 0 || header.length !== cookie.length) {
    return false;
  }
  return crypto.timingSafeEqual(header, cookie);
}

function csrf(req, res, next) {
  const method = req.method.toUpperCase();
  if (SAFE_METHODS.has(method)) {
    return next();
  }

  const pathOnly = (req.originalUrl || req.url || '').split('?')[0];
  if (EXEMPT.has(`${method} ${pathOnly}`)) {
    return next();
  }

  const headerToken = req.get('X-CSRF-Token');
  const cookieToken = req.cookies && req.cookies.lms_csrf;
  if (!tokensMatch(headerToken, cookieToken)) {
    return next(new ApiError(403, 'Invalid CSRF token'));
  }
  return next();
}

module.exports = csrf;

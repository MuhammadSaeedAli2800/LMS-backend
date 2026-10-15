const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/authService');
const sanitizeUser = require('../utils/sanitizeUser');
const { setAuthCookies, clearAuthCookies, refreshCsrfCookie } = require('../utils/cookies');
const { isPersistentToken } = require('../utils/tokens');

const login = asyncHandler(async (req, res) => {
  const result = await authService.login({
    email: req.body.email,
    password: req.body.password,
    rememberMe: req.body.rememberMe === true,
    allowedRoles: req.body.loginAs === 'student' || req.body.loginAs === 'teacher'
      ? [req.body.loginAs]
      : ['teacher', 'student'],
  });
  setAuthCookies(res, result.token, result.persistent);
  res.json({
    success: true,
    message: 'Logged in',
    data: { user: result.user },
  });
});

const logout = asyncHandler(async (req, res) => {
  clearAuthCookies(res);
  res.json({
    success: true,
    message: 'Logged out',
  });
});

const me = asyncHandler(async (req, res) => {
  refreshCsrfCookie(res, req.cookies && req.cookies.lms_token);
  res.json({
    success: true,
    data: { user: sanitizeUser(req.user) },
  });
});

const changePassword = asyncHandler(async (req, res) => {
  const persistent = Boolean(req.cookies && req.cookies.lms_token) && isPersistentToken(req.cookies.lms_token);
  const result = await authService.changePassword(
    req.user._id,
    req.body.currentPassword,
    req.body.newPassword,
    persistent
  );
  setAuthCookies(res, result.token, persistent);
  res.json({
    success: true,
    message: 'Password changed',
    data: { user: result.user },
  });
});

module.exports = {
  login,
  logout,
  me,
  changePassword,
};

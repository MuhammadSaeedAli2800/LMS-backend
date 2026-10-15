const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/authService');
const { setAuthCookies } = require('../utils/cookies');

const login = asyncHandler(async (req, res) => {
  const result = await authService.login({
    email: req.body.email,
    password: req.body.password,
    rememberMe: req.body.rememberMe === true,
    allowedRoles: ['admin'],
  });
  setAuthCookies(res, result.token, result.persistent);
  res.json({
    success: true,
    message: 'Logged in',
    data: { user: result.user },
  });
});

module.exports = { login };

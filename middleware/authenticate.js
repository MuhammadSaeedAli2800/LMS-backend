const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { config } = require('../config/env');
const asyncHandler = require('./asyncHandler');

const OBJECT_ID = /^[a-fA-F0-9]{24}$/;

const authenticate = asyncHandler(async (req, res, next) => {
  const token = req.cookies && req.cookies.token;
  if (!token || typeof token !== 'string') {
    throw new AppError('Authentication required.', 401);
  }

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw new AppError('Authentication required.', 401);
  }

  if (!payload || typeof payload.sub !== 'string' || !OBJECT_ID.test(payload.sub)) {
    throw new AppError('Authentication required.', 401);
  }

  const user = await User.findById(payload.sub);
  if (!user || user.accountStatus !== 'active') {
    throw new AppError('Authentication required.', 401);
  }

  const passwordVersion = user.passwordChangedAt ? new Date(user.passwordChangedAt).getTime() : 0;
  if (typeof payload.pwdAt !== 'number' || payload.pwdAt !== passwordVersion) {
    throw new AppError('Authentication required.', 401);
  }

  req.user = user;
  return next();
});

module.exports = authenticate;

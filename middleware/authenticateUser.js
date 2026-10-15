const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const { verifyToken } = require('../utils/tokens');
const User = require('../models/User');

function isAllowedDuringPasswordChange(req) {
  const pathOnly = (req.originalUrl || '').split('?')[0];
  if (req.method === 'GET' && pathOnly === '/api/auth/me') {
    return true;
  }
  if (req.method === 'POST' && pathOnly === '/api/auth/change-password') {
    return true;
  }
  if (req.method === 'POST' && pathOnly === '/api/auth/logout') {
    return true;
  }
  return false;
}

// Role and account status always come from MongoDB, never from the JWT or request body.
async function authenticateUser(req, res, next) {
  try {
    const token = req.cookies && req.cookies.lms_token;
    if (!token || typeof token !== 'string') {
      throw new ApiError(401, 'Authentication required');
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch (error) {
      throw new ApiError(401, 'Authentication required');
    }

    if (!payload || !payload.sub || !mongoose.isValidObjectId(payload.sub)) {
      throw new ApiError(401, 'Authentication required');
    }

    const user = await User.findById(payload.sub);
    if (!user || user.accountStatus !== 'active') {
      throw new ApiError(401, 'Authentication required');
    }

    const version = user.passwordChangedAt ? new Date(user.passwordChangedAt).getTime() : 0;
    if (typeof payload.pwdAt !== 'number' || payload.pwdAt !== version) {
      throw new ApiError(401, 'Authentication required');
    }

    req.user = user;

    if (user.mustChangePassword && !isAllowedDuringPasswordChange(req)) {
      throw new ApiError(403, 'You must change your password before continuing.', {
        code: 'MUST_CHANGE_PASSWORD',
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = authenticateUser;

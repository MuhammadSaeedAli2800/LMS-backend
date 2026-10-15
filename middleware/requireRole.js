const ApiError = require('../utils/ApiError');

function requireRole(...roles) {
  return function roleGuard(req, res, next) {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new ApiError(403, 'Forbidden'));
    }
    return next();
  };
}

module.exports = requireRole;

const jwt = require('jsonwebtoken');
const config = require('../config/env');

function signToken(userId, persistent, pwdAt = 0) {
  const expiresIn = persistent ? config.jwtRememberExpiresIn : config.jwtExpiresIn;
  return jwt.sign({ sub: String(userId), pwdAt }, config.jwtSecret, {
    expiresIn,
    algorithm: 'HS256',
  });
}

function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
}

function isPersistentToken(token) {
  const decoded = jwt.decode(token);
  if (!decoded || !decoded.iat || !decoded.exp) {
    return false;
  }
  return decoded.exp - decoded.iat > 60 * 60 * 24;
}

module.exports = {
  signToken,
  verifyToken,
  isPersistentToken,
};

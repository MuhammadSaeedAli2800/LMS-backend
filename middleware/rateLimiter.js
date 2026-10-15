const rateLimit = require('express-rate-limit');
const config = require('../config/env');

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.nodeEnv === 'test',
  message: {
    success: false,
    message: 'Too many login attempts. Try again later.',
  },
});

module.exports = { loginRateLimiter };

const rateLimit = require('express-rate-limit');

const sensitiveRouteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  handler(req, res) {
    res.status(429).json({ message: 'Too many requests. Please try again later.' });
  },
});

module.exports = { sensitiveRouteLimiter };

const { validationResult } = require('express-validator');

function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) {
    return next();
  }

  const errors = result.array().map((error) => ({
    field: error.path || error.param,
    message: error.msg,
  }));

  return res.status(400).json({
    success: false,
    message: 'Validation failed',
    errors,
  });
}

module.exports = validate;

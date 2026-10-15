const ApiError = require('./ApiError');

class AppError extends ApiError {
  constructor(message, statusCode, options) {
    super(statusCode || 500, message, options);
    this.name = 'AppError';
  }
}

module.exports = AppError;

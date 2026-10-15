class ApiError extends Error {
  constructor(statusCode, message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = options.errors;
    this.code = options.code;
  }
}

module.exports = ApiError;

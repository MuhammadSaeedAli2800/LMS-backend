const ApiError = require('../utils/ApiError');

function duplicateField(err) {
  const keys = Object.keys(err.keyPattern || err.keyValue || {});
  if (keys.length > 0) {
    return keys[0];
  }
  const message = String(err.message || '');
  if (message.includes('studentId')) {
    return 'studentId';
  }
  if (message.includes('teacherId')) {
    return 'teacherId';
  }
  if (message.includes('email')) {
    return 'email';
  }
  return '';
}

function duplicateMessage(err) {
  const field = duplicateField(err);
  if (field === 'email') {
    return 'Email is already in use';
  }
  if (field === 'studentId') {
    return 'Student ID is already in use';
  }
  if (field === 'teacherId') {
    return 'Teacher ID is already in use';
  }
  return 'A record with this value already exists';
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof ApiError) {
    const body = { success: false, message: err.message };
    if (err.errors) {
      body.errors = err.errors;
    }
    if (err.code) {
      body.code = err.code;
    }
    return res.status(err.statusCode).json(body);
  }

  if (err && (err.code === 11000 || err.code === 11001)) {
    return res.status(409).json({
      success: false,
      message: duplicateMessage(err),
    });
  }

  if (err && (err.name === 'CastError' || err.name === 'BSONError')) {
    return res.status(400).json({
      success: false,
      message: 'Invalid id',
    });
  }

  if (err && err.name === 'ValidationError') {
    const errors = Object.values(err.errors || {}).map((item) => ({
      field: item.path,
      message: item.message,
    }));
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors,
    });
  }

  if (err instanceof SyntaxError && err.status === 400 && Object.prototype.hasOwnProperty.call(err, 'body')) {
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON',
    });
  }

  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({
      success: false,
      message: 'Payload too large',
    });
  }

  console.error('Unhandled error:', err && err.name ? err.name : 'Error');
  return res.status(500).json({
    success: false,
    message: 'Internal server error',
  });
}

module.exports = errorHandler;

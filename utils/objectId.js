const mongoose = require('mongoose');
const AppError = require('./AppError');

function assertObjectId(id, label = 'id') {
  if (typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) {
    throw new AppError(`Invalid ${label}.`, 400);
  }
  return id;
}

module.exports = { assertObjectId };

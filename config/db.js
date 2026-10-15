const mongoose = require('mongoose');
const config = require('./env');

mongoose.set('strictQuery', true);

async function connectDB(uri) {
  const mongoUri = uri || config.mongodbUri;
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not configured');
  }
  await mongoose.connect(mongoUri);
  return mongoose.connection;
}

module.exports = { connectDB };

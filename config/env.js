const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const nodeEnv = process.env.NODE_ENV || 'development';

if (nodeEnv === 'production') {
  const secret = process.env.JWT_SECRET || '';
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters in production');
  }
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required in production');
  }
}

let jwtSecret = process.env.JWT_SECRET || '';
if (nodeEnv === 'test' && jwtSecret.length < 32) {
  jwtSecret = 'test-only-jwt-secret-not-for-production-use';
}

function parseRounds(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isInteger(parsed) && parsed >= 4 && parsed <= 15) {
    return parsed;
  }
  return 12;
}

module.exports = {
  port: Number.parseInt(process.env.PORT, 10) || 5000,
  nodeEnv,
  mongodbUri: process.env.MONGODB_URI || '',
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  jwtRememberExpiresIn: process.env.JWT_REMEMBER_EXPIRES_IN || '7d',
  clientOrigin: process.env.CLIENT_ORIGIN || process.env.CLIENT_URL || 'http://localhost:5173',
  bcryptRounds: parseRounds(process.env.BCRYPT_ROUNDS),
  adminName: process.env.ADMIN_NAME || '',
  adminEmail: process.env.ADMIN_EMAIL || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
};

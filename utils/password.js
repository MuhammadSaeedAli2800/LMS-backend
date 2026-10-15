const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../config/env');

const LETTER = /[A-Za-z]/;
const NUMBER = /[0-9]/;
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const ALL = UPPER + LOWER + DIGITS;

// Compared when no account exists so missing emails do not return faster than real accounts.
const dummyPasswordHash = bcrypt.hashSync('timing-safe-dummy-password', config.bcryptRounds);

function isStrongPassword(password) {
  return typeof password === 'string'
    && password.length >= 8
    && LETTER.test(password)
    && NUMBER.test(password);
}

function hashPassword(password) {
  return bcrypt.hash(password, config.bcryptRounds);
}

function comparePassword(password, passwordHash) {
  const candidate = typeof password === 'string' ? password : '';
  return bcrypt.compare(candidate, passwordHash || dummyPasswordHash);
}

function generateTemporaryPassword(length = 16) {
  const size = Math.max(12, length);
  const bytes = crypto.randomBytes(size);
  const chars = new Array(size);
  chars[0] = UPPER[bytes[0] % UPPER.length];
  chars[1] = LOWER[bytes[1] % LOWER.length];
  chars[2] = DIGITS[bytes[2] % DIGITS.length];
  for (let i = 3; i < size; i += 1) {
    chars[i] = ALL[bytes[i] % ALL.length];
  }
  for (let i = size - 1; i > 0; i -= 1) {
    const j = crypto.randomBytes(1)[0] % (i + 1);
    const swap = chars[i];
    chars[i] = chars[j];
    chars[j] = swap;
  }
  return chars.join('');
}

module.exports = {
  dummyPasswordHash,
  isStrongPassword,
  hashPassword,
  comparePassword,
  generateTemporaryPassword,
};

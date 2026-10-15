process.env.NODE_ENV = 'test';
process.env.BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS || '4';
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-characters-long';
}
process.env.CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
let app;

async function start() {
  if (!mongod) {
    mongod = await MongoMemoryServer.create({
      spawn: { detached: true },
      instance: { args: ['--nounixsocket'] },
    });
    process.env.MONGODB_URI = mongod.getUri();
    await mongoose.connect(mongod.getUri());
  }
  if (!app) {
    app = require('../app');
    const User = require('../models/User');
    const AuditLog = require('../models/AuditLog');
    await User.init();
    await AuditLog.init();
  }
  return app;
}

async function stop() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
  app = null;
}

async function resetData() {
  const collections = mongoose.connection.collections;
  await Promise.all(
    Object.values(collections).map((collection) => collection.deleteMany({}))
  );
}

function extractCookies(res) {
  const header = res.headers['set-cookie'];
  const list = Array.isArray(header) ? header : header ? [header] : [];
  const cookies = {};
  list.forEach((entry) => {
    const pair = String(entry).split(';')[0];
    const eq = pair.indexOf('=');
    if (eq === -1) {
      return;
    }
    const name = pair.slice(0, eq).trim();
    const rawValue = pair.slice(eq + 1).trim();
    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch (error) {
      cookies[name] = rawValue;
    }
  });
  return cookies;
}

function cookieHeader(cookies) {
  return Object.entries(cookies)
    .filter(([, value]) => value)
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join('; ');
}

function setCookieLine(res, name) {
  const header = res.headers['set-cookie'] || [];
  const list = Array.isArray(header) ? header : [header];
  return list.find((entry) => String(entry).toLowerCase().startsWith(`${name.toLowerCase()}=`)) || '';
}

async function seedUser(fields) {
  const { hashPassword } = require('../utils/password');
  const User = require('../models/User');
  const passwordHash = await hashPassword(fields.password);
  const doc = {
    name: fields.name,
    email: String(fields.email).trim().toLowerCase(),
    passwordHash,
    role: fields.role,
    accountStatus: fields.accountStatus || 'active',
    mustChangePassword: Boolean(fields.mustChangePassword),
    department: fields.department || '',
    className: fields.className || '',
    academicProgram: fields.academicProgram || '',
  };
  if (fields.studentId) {
    doc.studentId = fields.studentId;
  }
  if (fields.teacherId) {
    doc.teacherId = fields.teacherId;
  }
  return User.create(doc);
}

module.exports = {
  start,
  stop,
  resetData,
  extractCookies,
  cookieHeader,
  setCookieLine,
  seedUser,
};

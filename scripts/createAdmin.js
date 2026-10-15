const mongoose = require('mongoose');
const config = require('../config/env');
const User = require('../models/User');
const { connectDB } = require('../config/db');
const { hashPassword, isStrongPassword } = require('../utils/password');

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function main() {
  const name = String(config.adminName || '').trim();
  const email = String(config.adminEmail || '').trim().toLowerCase();
  const password = config.adminPassword || '';

  if (!name || !email || !password) {
    console.error('ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD are required.');
    process.exit(1);
  }

  if (name.length > 120) {
    console.error('ADMIN_NAME must be at most 120 characters.');
    process.exit(1);
  }

  if (!isEmail(email)) {
    console.error('ADMIN_EMAIL must be a valid email address.');
    process.exit(1);
  }

  if (!isStrongPassword(password)) {
    console.error('ADMIN_PASSWORD must be at least 8 characters and include a letter and a number.');
    process.exit(1);
  }

  if (!config.mongodbUri) {
    console.error('MONGODB_URI is required.');
    process.exit(1);
  }

  await connectDB();

  const existing = await User.findOne({ email }).select('_id');
  if (existing) {
    console.error(`An account with email ${email} already exists. The password was not changed.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  await User.create({
    name,
    email,
    passwordHash: await hashPassword(password),
    role: 'admin',
    mustChangePassword: false,
    accountStatus: 'active',
  });

  console.log(`Admin created successfully: ${email}`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  const password = config.adminPassword || '';
  const message = error && error.message && password && !String(error.message).includes(password)
    ? error.message
    : 'Failed to create admin.';
  console.error(message);
  try {
    await mongoose.disconnect();
  } catch (disconnectError) {
    // Ignore disconnect failures while exiting.
  }
  process.exit(1);
});

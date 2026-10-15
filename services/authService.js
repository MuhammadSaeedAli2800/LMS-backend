const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const sanitizeUser = require('../utils/sanitizeUser');
const { comparePassword, hashPassword, isStrongPassword } = require('../utils/password');
const { signToken } = require('../utils/tokens');
const { recordAudit } = require('./auditService');

const GENERIC_LOGIN_MESSAGE = 'Invalid email or password';

async function login({ email, password, rememberMe, allowedRoles }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
  const passwordMatches = await comparePassword(password, user && user.passwordHash);
  const roleAllowed = Boolean(user) && allowedRoles.includes(user.role);

  if (!user || !passwordMatches || !roleAllowed) {
    throw new ApiError(401, GENERIC_LOGIN_MESSAGE);
  }

  if (user.accountStatus === 'inactive') {
    throw new ApiError(403, 'This account is inactive. Contact your administrator.');
  }

  const loggedInAt = new Date();
  await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: loggedInAt } });
  user.lastLoginAt = loggedInAt;

  const persistent = rememberMe === true;
  const version = user.passwordChangedAt ? new Date(user.passwordChangedAt).getTime() : 0;
  const token = signToken(user._id, persistent, version);

  return {
    token,
    persistent,
    user: sanitizeUser(user),
  };
}

async function changePassword(userId, currentPassword, newPassword, persistent) {
  if (!isStrongPassword(newPassword)) {
    throw new ApiError(400, 'Password must be at least 8 characters and include a letter and a number');
  }

  const user = await User.findById(userId).select('+passwordHash');
  if (!user || user.accountStatus !== 'active') {
    throw new ApiError(401, 'Authentication required');
  }

  const currentMatches = await comparePassword(currentPassword, user.passwordHash);
  if (!currentMatches) {
    throw new ApiError(400, 'Current password is incorrect');
  }

  user.passwordHash = await hashPassword(newPassword);
  user.mustChangePassword = false;
  user.passwordChangedAt = new Date();
  await user.save();

  await recordAudit({
    actorId: user._id,
    action: 'PASSWORD_CHANGED',
    targetType: 'User',
    targetId: user._id,
    details: {},
  });

  return {
    user: sanitizeUser(user),
    token: signToken(user._id, persistent === true, user.passwordChangedAt.getTime()),
  };
}

module.exports = {
  login,
  changePassword,
};

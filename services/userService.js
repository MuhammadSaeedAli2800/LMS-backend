const User = require('../models/User');
const AppError = require('../utils/AppError');
const { hashPassword, generateTemporaryPassword } = require('../utils/password');
const { toPublicUser } = require('../utils/publicUser');
const { recordAudit } = require('./auditService');

const OBJECT_ID = /^[a-fA-F0-9]{24}$/;

const ROLE_PROFILES = {
  student: {
    idField: 'studentId',
    notFoundMessage: 'Student not found.',
    createdAction: 'STUDENT_CREATED',
    updatedAction: 'STUDENT_UPDATED',
    statusAction: 'STUDENT_STATUS_CHANGED',
    resetAction: 'STUDENT_PASSWORD_RESET',
  },
  teacher: {
    idField: 'teacherId',
    notFoundMessage: 'Teacher not found.',
    createdAction: 'TEACHER_CREATED',
    updatedAction: 'TEACHER_UPDATED',
    statusAction: 'TEACHER_STATUS_CHANGED',
    resetAction: 'TEACHER_PASSWORD_RESET',
  },
};

const UPDATABLE_FIELDS = {
  student: ['name', 'email', 'studentId', 'department', 'className'],
  teacher: ['name', 'email', 'teacherId', 'department', 'className'],
};

function mapDuplicateKeyError(err) {
  if (!err || err.code !== 11000) return err;
  const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || '';
  if (field === 'email') return new AppError('Email is already in use.', 409);
  if (field === 'studentId') return new AppError('Student ID is already in use.', 409);
  if (field === 'teacherId') return new AppError('Teacher ID is already in use.', 409);
  return new AppError('A unique value is already in use.', 409);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertValidId(id) {
  if (typeof id !== 'string' || !OBJECT_ID.test(id)) {
    throw new AppError('Invalid id.', 400);
  }
}

async function findRoleUser(role, id) {
  assertValidId(id);
  const user = await User.findOne({ _id: id, role });
  if (!user) {
    throw new AppError(ROLE_PROFILES[role].notFoundMessage, 404);
  }
  return user;
}

async function getRoleUser(role, id) {
  const user = await findRoleUser(role, id);
  return toPublicUser(user);
}

async function listByRole(role, search) {
  const profile = ROLE_PROFILES[role];
  const filter = { role };
  const raw = Array.isArray(search) ? search[0] : search;
  if (typeof raw === 'string' && raw.trim()) {
    const pattern = new RegExp(escapeRegex(raw.trim().slice(0, 200)), 'i');
    filter.$or = [
      { name: pattern },
      { email: pattern },
      { [profile.idField]: pattern },
    ];
  }
  const users = await User.find(filter).sort({ createdAt: -1 }).limit(100);
  return users.map(toPublicUser);
}

async function createRoleUser(role, actorId, input) {
  const profile = ROLE_PROFILES[role];
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const doc = {
    name: input.name,
    email: input.email,
    passwordHash,
    role,
    department: input.department ?? '',
    className: input.className ?? '',
    mustChangePassword: true,
    createdBy: actorId,
  };
  if (input.accountStatus) {
    doc.accountStatus = input.accountStatus;
  }
  if (input[profile.idField]) {
    doc[profile.idField] = input[profile.idField];
  }

  try {
    const user = await User.create(doc);
    await recordAudit({
      actorId,
      action: profile.createdAction,
      targetType: 'User',
      targetId: user._id,
      details: {
        email: user.email,
        role: user.role,
        [profile.idField]: user[profile.idField],
      },
    });
    return { user: toPublicUser(user), temporaryPassword };
  } catch (err) {
    throw mapDuplicateKeyError(err);
  }
}

async function updateRoleUser(role, actorId, id, input) {
  const profile = ROLE_PROFILES[role];
  const user = await findRoleUser(role, id);
  for (const field of UPDATABLE_FIELDS[role]) {
    if (Object.prototype.hasOwnProperty.call(input, field) && input[field] !== undefined) {
      user[field] = input[field];
    }
  }
  try {
    await user.save({ validateModifiedOnly: true });
  } catch (err) {
    throw mapDuplicateKeyError(err);
  }
  await recordAudit({
    actorId,
    action: profile.updatedAction,
    targetType: 'User',
    targetId: user._id,
    details: {
      email: user.email,
      [profile.idField]: user[profile.idField],
    },
  });
  return toPublicUser(user);
}

async function updateRoleStatus(role, actorId, id, accountStatus) {
  const profile = ROLE_PROFILES[role];
  const user = await findRoleUser(role, id);
  user.accountStatus = accountStatus;
  await user.save({ validateModifiedOnly: true });
  await recordAudit({
    actorId,
    action: profile.statusAction,
    targetType: 'User',
    targetId: user._id,
    details: { accountStatus },
  });
  return toPublicUser(user);
}

async function resetRolePassword(role, actorId, id) {
  const profile = ROLE_PROFILES[role];
  const user = await findRoleUser(role, id);
  const temporaryPassword = generateTemporaryPassword();
  user.passwordHash = await hashPassword(temporaryPassword);
  user.mustChangePassword = true;
  user.passwordChangedAt = new Date();
  await user.save({ validateModifiedOnly: true });
  await recordAudit({
    actorId,
    action: profile.resetAction,
    targetType: 'User',
    targetId: user._id,
    details: { email: user.email },
  });
  return { user: toPublicUser(user), temporaryPassword };
}

async function createAdminUser(actorId, input) {
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  try {
    const user = await User.create({
      name: input.name,
      email: input.email,
      passwordHash,
      role: 'admin',
      accountStatus: 'active',
      mustChangePassword: true,
      createdBy: actorId,
    });
    await recordAudit({
      actorId,
      action: 'ADMIN_CREATED',
      targetType: 'User',
      targetId: user._id,
      details: { email: user.email, role: 'admin' },
    });
    return { user: toPublicUser(user), temporaryPassword };
  } catch (err) {
    throw mapDuplicateKeyError(err);
  }
}

async function listAdmins(search) {
  const filter = { role: 'admin' };
  const raw = Array.isArray(search) ? search[0] : search;
  if (typeof raw === 'string' && raw.trim()) {
    const pattern = new RegExp(escapeRegex(raw.trim().slice(0, 200)), 'i');
    filter.$or = [{ name: pattern }, { email: pattern }];
  }
  const users = await User.find(filter).sort({ createdAt: -1 }).limit(100);
  return users.map(toPublicUser);
}

async function getDashboardCounts() {
  const Course = require('../models/Course');
  const Assignment = require('../models/Assignment');
  const AuditLog = require('../models/AuditLog');
  const [totalStudents, totalTeachers, totalCourses, activeCourses, totalAssignments, recentActivities] = await Promise.all([
    User.countDocuments({ role: 'student' }),
    User.countDocuments({ role: 'teacher' }),
    Course.countDocuments(),
    Course.countDocuments({ status: 'published' }),
    Assignment.countDocuments(),
    AuditLog.find().sort({ createdAt: -1 }).limit(8).populate('actorId', 'name email'),
  ]);
  return {
    totalStudents,
    totalTeachers,
    totalCourses,
    activeCourses,
    totalAssignments,
    recentActivities: recentActivities.map((log) => ({
      id: String(log._id),
      action: log.action,
      targetType: log.targetType,
      createdAt: log.createdAt,
      actorName: log.actorId?.name || 'Unknown',
    })),
  };
}

module.exports = {
  mapDuplicateKeyError,
  findRoleUser,
  getRoleUser,
  listByRole,
  createRoleUser,
  updateRoleUser,
  updateRoleStatus,
  resetRolePassword,
  createAdminUser,
  listAdmins,
  getDashboardCounts,
};

function toPublicUser(user) {
  const doc = typeof user.toObject === 'function' ? user.toObject() : user;
  return {
    id: String(doc._id),
    name: doc.name,
    email: doc.email,
    role: doc.role,
    studentId: doc.studentId || null,
    teacherId: doc.teacherId || null,
    department: doc.department || '',
    className: doc.className || '',
    accountStatus: doc.accountStatus,
    mustChangePassword: Boolean(doc.mustChangePassword),
    createdBy: doc.createdBy ? String(doc.createdBy) : null,
    lastLoginAt: doc.lastLoginAt || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

module.exports = { toPublicUser };

function sanitizeUser(user) {
  if (!user) {
    return null;
  }
  const doc = typeof user.toObject === 'function'
    ? user.toObject({ versionKey: false })
    : user;

  return {
    id: String(doc._id || doc.id),
    name: doc.name,
    email: doc.email,
    role: doc.role,
    studentId: doc.studentId || '',
    teacherId: doc.teacherId || '',
    department: doc.department || '',
    className: doc.className || '',
    academicProgram: doc.academicProgram || '',
    profileImage: doc.profileImage || '',
    accountStatus: doc.accountStatus,
    mustChangePassword: Boolean(doc.mustChangePassword),
    lastLoginAt: doc.lastLoginAt || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

module.exports = sanitizeUser;

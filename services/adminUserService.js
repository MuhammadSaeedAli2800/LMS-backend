const mongoose = require('mongoose');
const User = require('../models/User');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const Attendance = require('../models/Attendance');
const TeacherAttendance = require('../models/TeacherAttendance');
const ApiError = require('../utils/ApiError');
const { removeStoredFile } = require('../middleware/upload');
const sanitizeUser = require('../utils/sanitizeUser');
const { generateTemporaryPassword, hashPassword } = require('../utils/password');
const { recordAudit, listRecent } = require('./auditService');
const { scheduleFields } = require('../utils/schedule');
const courseAdmin = require('./courseAdminService');

const STUDENT_UPDATE_FIELDS = ['name', 'email', 'studentId', 'department', 'className', 'academicProgram'];
const TEACHER_UPDATE_FIELDS = ['name', 'email', 'teacherId', 'department', 'academicProgram'];

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pick(body, fields) {
  const updates = {};
  fields.forEach((field) => {
    if (body && Object.prototype.hasOwnProperty.call(body, field) && body[field] !== undefined) {
      updates[field] = body[field];
    }
  });
  return updates;
}

function parsePage(value) {
  const page = Number.parseInt(value, 10);
  if (!Number.isInteger(page) || page < 1) {
    return 1;
  }
  return page;
}

function parseLimit(value) {
  const limit = Number.parseInt(value, 10);
  if (!Number.isInteger(limit) || limit < 1) {
    return 10;
  }
  return Math.min(limit, 50);
}

function assertObjectId(id) {
  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(400, 'Invalid id');
  }
}

function notFoundMessage(role) {
  if (role === 'student') {
    return 'Student not found';
  }
  if (role === 'teacher') {
    return 'Teacher not found';
  }
  if (role === 'admin') {
    return 'Admin not found';
  }
  return 'User not found';
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase();
}

function optionalText(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
}

function resolveAccountStatus(value) {
  if (value === 'inactive') {
    return 'inactive';
  }
  return 'active';
}

async function assertEmailAvailable(email, excludeId) {
  const query = { email };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const existing = await User.findOne(query).select('_id');
  if (existing) {
    throw new ApiError(409, 'Email is already in use');
  }
}

async function assertCodeAvailable(field, role, code, excludeId) {
  const query = { role, [field]: code };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const existing = await User.findOne(query).select('_id');
  if (existing) {
    throw new ApiError(409, role === 'student'
      ? 'Student ID is already in use'
      : 'Teacher ID is already in use');
  }
}

async function getByRole(id, role) {
  assertObjectId(id);
  const user = await User.findById(id);
  if (!user || user.role !== role) {
    throw new ApiError(404, notFoundMessage(role));
  }
  return user;
}

async function listUsers({ role, search, status, department, className, page, limit }) {
  const currentPage = parsePage(page);
  const currentLimit = parseLimit(limit);
  const filter = { role };

  if (typeof status === 'string' && status.trim()) {
    const normalized = status.trim().toLowerCase();
    if (normalized === 'active' || normalized === 'inactive') {
      filter.accountStatus = normalized;
    }
  }

  if (typeof department === 'string' && department.trim()) {
    filter.department = new RegExp(`^${escapeRegex(department.trim())}$`, 'i');
  }

  if (role === 'student' && typeof className === 'string' && className.trim()) {
    filter.className = new RegExp(`^${escapeRegex(className.trim())}$`, 'i');
  }

  if (typeof search === 'string' && search.trim()) {
    const expression = new RegExp(escapeRegex(search.trim().slice(0, 120)), 'i');
    const clauses = [{ name: expression }, { email: expression }];
    if (role === 'student') {
      clauses.push({ studentId: expression });
    } else if (role === 'teacher') {
      clauses.push({ teacherId: expression });
    }
    filter.$or = clauses;
  }

  const total = await User.countDocuments(filter);
  const users = await User.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip((currentPage - 1) * currentLimit)
    .limit(currentLimit);
  const shaped = users.map(sanitizeUser);
  if (role === 'student' && shaped.length > 0) {
    const enrollments = await Enrollment.find({
      studentId: { $in: shaped.map((user) => user.id) },
      status: 'active',
    }).select('studentId courseId');
    const courseIds = [...new Set(enrollments.map((item) => String(item.courseId)))];
    const courses = await Course.find({ _id: { $in: courseIds } }).select('title courseCode days startTime endTime');
    const courseMap = new Map(courses.map((course) => [String(course._id), course]));
    const coursesByStudent = new Map();
    enrollments.forEach((enrollment) => {
      const course = courseMap.get(String(enrollment.courseId));
      if (!course) return;
      const key = String(enrollment.studentId);
      const assigned = coursesByStudent.get(key) || [];
      assigned.push({
        id: String(course._id),
        title: course.title,
        courseCode: course.courseCode,
        ...scheduleFields(course),
      });
      coursesByStudent.set(key, assigned);
    });
    shaped.forEach((user) => {
      user.courses = (coursesByStudent.get(user.id) || []).sort((left, right) => left.title.localeCompare(right.title));
    });
  }

  if (role === 'teacher' && shaped.length > 0) {
    const teacherIds = shaped.map((user) => user.id);
    const courses = await Course.find({ teacherIds: { $in: teacherIds } }).select('title courseCode days startTime endTime teacherIds');
    const coursesByTeacher = new Map();
    courses.forEach((course) => {
      (course.teacherIds || []).forEach((teacherId) => {
        const key = String(teacherId);
        if (!teacherIds.includes(key)) return;
        const assigned = coursesByTeacher.get(key) || [];
        assigned.push({
          id: String(course._id),
          title: course.title,
          courseCode: course.courseCode,
          ...scheduleFields(course),
        });
        coursesByTeacher.set(key, assigned);
      });
    });
    shaped.forEach((user) => {
      user.courses = (coursesByTeacher.get(user.id) || []).sort((left, right) => left.title.localeCompare(right.title));
    });
  }

  return {
    users: shaped,
    pagination: {
      page: currentPage,
      limit: currentLimit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / currentLimit),
    },
  };
}

async function createManagedUser({ actorId, role, fields, auditAction }) {
  const email = normalizeEmail(fields.email);
  await assertEmailAvailable(email);

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const document = {
    name: String(fields.name || '').trim(),
    email,
    passwordHash,
    role,
    department: optionalText(fields.department),
    academicProgram: optionalText(fields.academicProgram),
    accountStatus: resolveAccountStatus(fields.accountStatus),
    mustChangePassword: true,
    createdBy: actorId,
  };

  if (role === 'student') {
    document.studentId = normalizeCode(fields.studentId);
    document.className = optionalText(fields.className);
    await assertCodeAvailable('studentId', 'student', document.studentId);
  }

  if (role === 'teacher') {
    document.teacherId = normalizeCode(fields.teacherId);
    await assertCodeAvailable('teacherId', 'teacher', document.teacherId);
  }

  const user = await User.create(document);

  await recordAudit({
    actorId,
    action: auditAction,
    targetType: 'User',
    targetId: user._id,
    details: {
      name: user.name,
      email: user.email,
      role: user.role,
      studentId: user.studentId || undefined,
      teacherId: user.teacherId || undefined,
    },
  });

  return {
    user: sanitizeUser(user),
    temporaryPassword,
  };
}

async function createStudent(actorId, body) {
  const email = normalizeEmail(body && body.email);
  const existing = await User.findOne({ email });
  const courseId = body && body.courseId ? String(body.courseId) : '';
  if (existing && existing.role === 'student') {
    if (!courseId) {
      throw new ApiError(409, 'This email already belongs to a student. Choose a course to enroll them in another class.');
    }
    const enrollment = await courseAdmin.enrollStudent(actorId, String(existing._id), courseId);
    return { user: sanitizeUser(existing), enrollment, enrolledExisting: true };
  }
  if (courseId) {
    if (body.accountStatus === 'inactive') {
      throw new ApiError(400, 'An inactive account cannot be enrolled in a course.');
    }
    const course = await Course.findById(courseId);
    if (!course) throw new ApiError(404, 'Course not found.');
    if (course.status === 'archived') throw new ApiError(400, 'Archived courses cannot take new students.');
  }
  const created = await createManagedUser({
    actorId,
    role: 'student',
    fields: {
      name: body && body.name,
      email: body && body.email,
      studentId: body && body.studentId,
      department: body && body.department,
      className: body && body.className,
      academicProgram: body && body.academicProgram,
      accountStatus: body && body.accountStatus,
    },
    auditAction: 'STUDENT_CREATED',
  });
  if (!courseId) return created;
  try {
    const enrollment = await courseAdmin.enrollStudent(actorId, created.user.id, courseId);
    return { ...created, enrollment };
  } catch (error) {
    await User.deleteOne({ _id: created.user.id });
    throw error;
  }
}

async function createTeacher(actorId, body) {
  return createManagedUser({
    actorId,
    role: 'teacher',
    fields: {
      name: body && body.name,
      email: body && body.email,
      teacherId: body && body.teacherId,
      department: body && body.department,
      academicProgram: body && body.academicProgram,
      accountStatus: body && body.accountStatus,
    },
    auditAction: 'TEACHER_CREATED',
  });
}

async function createAdmin(actorId, body) {
  return createManagedUser({
    actorId,
    role: 'admin',
    fields: {
      name: body && body.name,
      email: body && body.email,
      accountStatus: 'active',
    },
    auditAction: 'ADMIN_CREATED',
  });
}

async function updateByRole(id, role, body, allowedFields) {
  const user = await getByRole(id, role);
  const updates = pick(body, allowedFields);

  if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
    updates.name = String(updates.name).trim();
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'email')) {
    updates.email = normalizeEmail(updates.email);
    await assertEmailAvailable(updates.email, user._id);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'studentId')) {
    updates.studentId = normalizeCode(updates.studentId);
    await assertCodeAvailable('studentId', 'student', updates.studentId, user._id);
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'teacherId')) {
    updates.teacherId = normalizeCode(updates.teacherId);
    await assertCodeAvailable('teacherId', 'teacher', updates.teacherId, user._id);
  }
  ['department', 'className', 'academicProgram'].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(updates, field)) {
      updates[field] = optionalText(updates[field]);
    }
  });

  if (Object.keys(updates).length === 0) {
    return sanitizeUser(user);
  }

  const updated = await User.findOneAndUpdate(
    { _id: user._id, role },
    { $set: updates },
    { new: true, runValidators: true }
  );

  if (!updated) {
    throw new ApiError(404, notFoundMessage(role));
  }

  return sanitizeUser(updated);
}

async function syncStudentCourses(actorId, studentId, courseIds) {
  const student = await getByRole(studentId, 'student');
  const desired = [...new Set((Array.isArray(courseIds) ? courseIds : []).map((id) => String(id)))];
  const current = await Enrollment.find({ studentId: student._id, status: 'active' });
  const currentIds = new Set(current.map((enrollment) => String(enrollment.courseId)));
  const adding = desired.filter((id) => !currentIds.has(id));
  if (adding.length && student.accountStatus !== 'active') {
    throw new ApiError(400, 'An inactive account cannot be enrolled in a course.');
  }
  for (const id of adding) {
    const course = await Course.findById(id);
    if (!course) throw new ApiError(404, 'Course not found.');
    if (course.status === 'archived') throw new ApiError(400, 'Archived courses cannot take new students.');
  }
  const desiredIds = new Set(desired);
  for (const enrollment of current) {
    if (!desiredIds.has(String(enrollment.courseId))) {
      await courseAdmin.removeEnrollment(actorId, String(enrollment._id));
    }
  }
  for (const id of adding) {
    await courseAdmin.enrollStudent(actorId, String(student._id), id);
  }
}

async function updateStudent(id, body, actorId) {
  const user = await updateByRole(id, 'student', body, STUDENT_UPDATE_FIELDS);
  if (body && Array.isArray(body.courseIds)) {
    await syncStudentCourses(actorId, id, body.courseIds);
  }
  return user;
}

async function updateTeacher(id, body) {
  return updateByRole(id, 'teacher', body, TEACHER_UPDATE_FIELDS);
}

async function applyStatus(id, role, accountStatus, actorId, auditAction) {
  if (accountStatus !== 'active' && accountStatus !== 'inactive') {
    throw new ApiError(400, 'accountStatus must be active or inactive');
  }

  const user = await getByRole(id, role);
  user.accountStatus = accountStatus;
  await user.save();

  await recordAudit({
    actorId,
    action: auditAction,
    targetType: 'User',
    targetId: user._id,
    details: {
      name: user.name,
      email: user.email,
      role: user.role,
      studentId: user.studentId || undefined,
      teacherId: user.teacherId || undefined,
      accountStatus,
    },
  });

  return sanitizeUser(user);
}

async function deleteStudent(id, actorId) {
  const user = await getByRole(id, 'student');
  const submissions = await Submission.find({ studentId: user._id }).select('storedName');
  submissions.forEach((submission) => removeStoredFile(submission.storedName));
  await Submission.deleteMany({ studentId: user._id });
  await Enrollment.deleteMany({ studentId: user._id });
  await Attendance.deleteMany({ studentId: user._id });
  const details = {
    name: user.name,
    email: user.email,
    role: user.role,
    studentId: user.studentId || undefined,
  };
  await user.deleteOne();
  await recordAudit({
    actorId,
    action: 'STUDENT_DELETED',
    targetType: 'User',
    targetId: user._id,
    details,
  });
  return { id: String(user._id) };
}

async function deleteTeacher(id, actorId) {
  const user = await getByRole(id, 'teacher');
  await Course.updateMany({ teacherIds: user._id }, { $pull: { teacherIds: user._id } });
  await TeacherAttendance.deleteMany({ teacherId: user._id });
  const details = {
    name: user.name,
    email: user.email,
    role: user.role,
    teacherId: user.teacherId || undefined,
  };
  await user.deleteOne();
  await recordAudit({
    actorId,
    action: 'TEACHER_DELETED',
    targetType: 'User',
    targetId: user._id,
    details,
  });
  return { id: String(user._id) };
}

async function setStudentStatus(id, accountStatus, actorId) {
  return applyStatus(id, 'student', accountStatus, actorId, 'STUDENT_STATUS_CHANGED');
}

async function setTeacherStatus(id, accountStatus, actorId) {
  return applyStatus(id, 'teacher', accountStatus, actorId, 'TEACHER_STATUS_CHANGED');
}

async function resetPassword(id, role, actorId, auditAction) {
  const user = await getByRole(id, role);
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const result = await User.updateOne(
    { _id: user._id, role },
    { $set: { passwordHash, mustChangePassword: true, passwordChangedAt: new Date() } }
  );

  if (!result.matchedCount) {
    throw new ApiError(404, notFoundMessage(role));
  }

  user.mustChangePassword = true;

  await recordAudit({
    actorId,
    action: auditAction,
    targetType: 'User',
    targetId: user._id,
    details: {
      name: user.name,
      email: user.email,
      role: user.role,
      studentId: user.studentId || undefined,
      teacherId: user.teacherId || undefined,
    },
  });

  return {
    user: sanitizeUser(user),
    temporaryPassword,
  };
}

async function resetStudentPassword(id, actorId) {
  return resetPassword(id, 'student', actorId, 'STUDENT_PASSWORD_RESET');
}

async function resetTeacherPassword(id, actorId) {
  return resetPassword(id, 'teacher', actorId, 'TEACHER_PASSWORD_RESET');
}

async function getDashboard() {
  const [totalStudents, totalTeachers, totalCourses, activeCourses, totalAssignments, recentActivities, courses, enrollments, assignments, teachers, students] = await Promise.all([
    User.countDocuments({ role: 'student' }),
    User.countDocuments({ role: 'teacher' }),
    Course.countDocuments(),
    Course.countDocuments({ status: 'published' }),
    Assignment.countDocuments(),
    listRecent(10),
    Course.find().select('title courseCode status days startTime endTime teacherIds').sort({ title: 1 }).populate('teacherIds', 'name teacherId'),
    Enrollment.find({ status: 'active' }).select('courseId studentId'),
    Assignment.find().select('title courseId status').sort({ title: 1 }),
    User.find({ role: 'teacher' }).select('name email teacherId accountStatus').sort({ name: 1 }),
    User.find({ role: 'student' }).select('name email studentId className accountStatus').sort({ name: 1 }),
  ]);

  const studentsByCourse = new Map();
  const coursesByStudent = new Map();
  const enrolledStudents = new Set();
  enrollments.forEach((enrollment) => {
    const courseId = String(enrollment.courseId);
    const studentId = String(enrollment.studentId);
    studentsByCourse.set(courseId, (studentsByCourse.get(courseId) || 0) + 1);
    enrolledStudents.add(studentId);
    const assigned = coursesByStudent.get(studentId) || [];
    assigned.push(courseId);
    coursesByStudent.set(studentId, assigned);
  });
  const assignmentsByCourse = new Map();
  assignments.forEach((assignment) => {
    const courseId = String(assignment.courseId);
    const list = assignmentsByCourse.get(courseId) || [];
    list.push({
      id: String(assignment._id),
      title: assignment.title,
      status: assignment.status,
    });
    assignmentsByCourse.set(courseId, list);
  });

  const coursesByTeacher = new Map();
  const courseBreakdown = courses.map((course) => {
    const teachers = (course.teacherIds || []).map((teacher) => ({
      id: String(teacher._id || teacher),
      name: teacher.name || 'Teacher',
      teacherId: teacher.teacherId || '',
    }));
    const courseAssignments = assignmentsByCourse.get(String(course._id)) || [];
    const presented = {
      id: String(course._id),
      title: course.title,
      courseCode: course.courseCode,
      status: course.status,
      ...scheduleFields(course),
      studentCount: studentsByCourse.get(String(course._id)) || 0,
      teacherCount: teachers.length,
      teachers,
      assignmentCount: courseAssignments.length,
      assignments: courseAssignments,
    };
    teachers.forEach((teacher) => {
      const assigned = coursesByTeacher.get(teacher.id) || [];
      assigned.push({
        id: presented.id,
        title: presented.title,
        courseCode: presented.courseCode,
        status: presented.status,
        days: presented.days,
        startTime: presented.startTime,
        endTime: presented.endTime,
        studentCount: presented.studentCount,
      });
      coursesByTeacher.set(teacher.id, assigned);
    });
    return presented;
  });

  const courseById = new Map(courseBreakdown.map((course) => [course.id, course]));
  const studentBreakdown = students.map((student) => {
    const assignedCourses = (coursesByStudent.get(String(student._id)) || [])
      .map((courseId) => courseById.get(courseId))
      .filter(Boolean)
      .map((course) => ({
        id: course.id,
        title: course.title,
        courseCode: course.courseCode,
        status: course.status,
        days: course.days,
        startTime: course.startTime,
        endTime: course.endTime,
      }))
      .sort((left, right) => left.title.localeCompare(right.title));
    return {
      id: String(student._id),
      name: student.name,
      email: student.email,
      studentId: student.studentId || '',
      className: student.className || '',
      accountStatus: student.accountStatus,
      courseCount: assignedCourses.length,
      courses: assignedCourses,
    };
  });

  const teacherBreakdown = teachers.map((teacher) => {
    const assignedCourses = coursesByTeacher.get(String(teacher._id)) || [];
    return {
      id: String(teacher._id),
      name: teacher.name,
      email: teacher.email,
      teacherId: teacher.teacherId || '',
      accountStatus: teacher.accountStatus,
      courseCount: assignedCourses.length,
      courses: assignedCourses,
    };
  });

  return {
    totalStudents,
    totalTeachers,
    totalCourses,
    activeCourses,
    totalAssignments,
    studentsNotEnrolled: Math.max(0, totalStudents - enrolledStudents.size),
    courseBreakdown,
    studentBreakdown,
    teacherBreakdown,
    recentActivities,
  };
}

async function updateOwnProfile(userId, name) {
  const nextName = String(name || '').trim();
  const user = await User.findById(userId);
  if (!user || user.role !== 'admin') throw new ApiError(404, 'Administrator not found.');
  user.name = nextName;
  await user.save();
  return sanitizeUser(user);
}

module.exports = {
  listUsers,
  getByRole,
  createStudent,
  createTeacher,
  createAdmin,
  updateStudent,
  updateTeacher,
  setStudentStatus,
  setTeacherStatus,
  updateOwnProfile,
  deleteStudent,
  deleteTeacher,
  resetStudentPassword,
  resetTeacherPassword,
  getDashboard,
  sanitizeUser,
};

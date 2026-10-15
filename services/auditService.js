const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const Course = require('../models/Course');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');

const SECRET_KEYS = [
  'password',
  'passwordHash',
  'token',
  'temporaryPassword',
  'currentPassword',
  'newPassword',
  'jwt',
  'lms_token',
  'lms_csrf',
];

function publicDetails(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return {};
  }
  const safe = { ...details };
  SECRET_KEYS.forEach((key) => {
    delete safe[key];
  });
  return safe;
}

async function recordAudit({ actorId, action, targetType, targetId, details }) {
  return AuditLog.create({
    actorId,
    action,
    targetType,
    targetId: targetId || null,
    details: publicDetails(details),
  });
}

const OBJECT_ID = /^[a-f0-9]{24}$/i;

function isObjectId(value) {
  return OBJECT_ID.test(String(value || ''));
}

function addId(set, value) {
  if (isObjectId(value)) set.add(String(value));
}

function accountPhrase(details) {
  const role = details.role === 'teacher'
    ? 'Teacher'
    : details.role === 'admin'
      ? 'Administrator'
      : details.role === 'student'
        ? 'Student'
        : '';
  const name = details.name || details.studentName || details.teacherName || '';
  const email = details.email || details.studentEmail || details.teacherEmail || '';
  const code = [details.studentId, details.teacherId].find((value) => value && !isObjectId(value));
  const identity = [name, code, email].filter(Boolean).join(', ');
  return { role, identity };
}

function coursePhrase(details) {
  if (details.courseTitle && details.courseCode) return `${details.courseTitle} (${details.courseCode})`;
  return details.courseTitle || details.courseCode || '';
}

function describeActivity(action, details) {
  const account = accountPhrase(details);
  const course = coursePhrase(details);
  const who = account.identity;
  switch (action) {
    case 'STUDENT_DELETED':
      return who ? `Student account deleted: ${who}` : 'Student account deleted';
    case 'TEACHER_DELETED':
      return who ? `Teacher account deleted: ${who}` : 'Teacher account deleted';
    case 'STUDENT_CREATED':
      return who ? `Student account created: ${who}` : 'Student account created';
    case 'TEACHER_CREATED':
      return who ? `Teacher account created: ${who}` : 'Teacher account created';
    case 'ADMIN_CREATED':
      return who ? `Administrator account created: ${who}` : 'Administrator account created';
    case 'STUDENT_STATUS_CHANGED':
    case 'TEACHER_STATUS_CHANGED':
      return who
        ? `${account.role || 'Account'} ${details.accountStatus === 'inactive' ? 'deactivated' : 'activated'}: ${who}`
        : `Account marked ${details.accountStatus || 'updated'}`;
    case 'STUDENT_PASSWORD_RESET':
    case 'TEACHER_PASSWORD_RESET':
      return who ? `Password reset for ${who}` : 'Password reset';
    case 'PASSWORD_CHANGED':
      return who ? `Password changed for ${who}` : 'Password changed';
    case 'COURSE_CREATED':
      return course ? `Course created: ${course}` : 'Course created';
    case 'COURSE_UPDATED':
      return course ? `Course updated: ${course}` : 'Course updated';
    case 'COURSE_STATUS_CHANGED':
      return `Course marked ${details.status || 'updated'}${course ? `: ${course}` : ''}`;
    case 'COURSE_DELETED':
      return course ? `Course deleted: ${course}` : 'Course deleted';
    case 'STUDENT_ENROLLED':
      if (details.count && !who) return `${details.count} students enrolled in ${course || 'a course'}`;
      return `${who || 'A student'} enrolled in ${course || 'a course'}`;
    case 'STUDENT_UNENROLLED':
      return `${who || 'A student'} removed from ${course || 'a course'}`;
    case 'MATERIAL_ADDED':
      return `Learning material added: ${details.title || 'Material'}${course ? ` in ${course}` : ''}`;
    case 'ASSIGNMENT_CREATED':
      return `Assignment created: ${details.assignmentTitle || details.title || 'Assignment'}${course ? ` in ${course}` : ''}`;
    case 'ASSIGNMENT_DELETED':
      return `Assignment deleted: ${details.assignmentTitle || details.title || 'Assignment'}${course ? ` in ${course}` : ''}`;
    case 'SUBMISSION_GRADED':
      return `Graded ${who || 'a student'} on ${details.assignmentTitle || 'an assignment'}${details.marks !== undefined && details.marks !== null ? `: ${details.marks} marks` : ''}${course ? ` in ${course}` : ''}`;
    case 'ATTENDANCE_UPDATED':
      return `${details.audience === 'teacher' ? 'Teacher' : 'Student'} attendance marked ${details.status || 'updated'} for ${who || 'a person'}${course ? ` in ${course}` : ''}${details.sessionDate ? ` on ${details.sessionDate}` : ''}`;
    case 'ATTENDANCE_DELETED':
      return `Attendance deleted for ${who || 'a person'}${course ? ` in ${course}` : ''}${details.sessionDate ? ` on ${details.sessionDate}` : ''}`;
    case 'ATTENDANCE_SAVED':
      return `Attendance saved for ${course || 'a course'}${details.sessionDate ? ` on ${details.sessionDate}` : ''}${details.count ? ` (${details.count} students)` : ''}`;
    case 'ANNOUNCEMENT_PUBLISHED':
      return `Announcement published: ${details.title || 'Announcement'}${course ? ` in ${course}` : ''}`;
    default:
      return '';
  }
}

async function enrichLogs(logs) {
  const userIds = new Set();
  const courseIds = new Set();
  const courseCodes = new Set();
  const assignmentIds = new Set();
  const submissionIds = new Set();

  logs.forEach((log) => {
    const details = publicDetails(log.details);
    if (log.targetType === 'User') addId(userIds, log.targetId);
    if (log.targetType === 'Course') addId(courseIds, log.targetId);
    if (log.targetType === 'Assignment') addId(assignmentIds, log.targetId);
    if (log.targetType === 'Submission') addId(submissionIds, log.targetId);
    addId(userIds, details.studentId);
    addId(courseIds, details.courseId);
    addId(assignmentIds, details.assignmentId);
    if (details.courseCode) courseCodes.add(String(details.courseCode));
    if (log.targetType === 'Enrollment') addId(courseIds, log.targetId);
  });

  const [users, courses, assignments, submissions] = await Promise.all([
    userIds.size ? User.find({ _id: { $in: [...userIds] } }).select('name email role studentId teacherId') : [],
    courseIds.size ? Course.find({ _id: { $in: [...courseIds] } }).select('title courseCode') : [],
    assignmentIds.size ? Assignment.find({ _id: { $in: [...assignmentIds] } }).select('title courseId') : [],
    submissionIds.size ? Submission.find({ _id: { $in: [...submissionIds] } }).select('studentId assignmentId marks') : [],
  ]);

  submissions.forEach((submission) => {
    addId(userIds, submission.studentId);
    addId(assignmentIds, submission.assignmentId);
  });
  assignments.forEach((assignment) => addId(courseIds, assignment.courseId));

  const extraUsers = userIds.size
    ? await User.find({ _id: { $in: [...userIds] } }).select('name email role studentId teacherId')
    : [];
  const extraAssignments = assignmentIds.size
    ? await Assignment.find({ _id: { $in: [...assignmentIds] } }).select('title courseId')
    : [];
  extraAssignments.forEach((assignment) => addId(courseIds, assignment.courseId));
  const extraCourses = courseIds.size
    ? await Course.find({ _id: { $in: [...courseIds] } }).select('title courseCode')
    : [];
  const codedCourses = courseCodes.size
    ? await Course.find({ courseCode: { $in: [...courseCodes] } }).select('title courseCode')
    : [];

  const userMap = new Map([...users, ...extraUsers].map((user) => [String(user._id), user]));
  const courseMap = new Map([...courses, ...extraCourses, ...codedCourses].map((course) => [String(course._id), course]));
  const courseCodeMap = new Map([...courses, ...extraCourses, ...codedCourses].map((course) => [course.courseCode, course]));
  const assignmentMap = new Map([...assignments, ...extraAssignments].map((assignment) => [String(assignment._id), assignment]));
  const submissionMap = new Map(submissions.map((submission) => [String(submission._id), submission]));

  return logs.map((log) => {
    const details = publicDetails(log.details);
    const targetId = log.targetId ? String(log.targetId) : '';
    const user = (log.targetType === 'User' && userMap.get(targetId))
      || (isObjectId(details.studentId) ? userMap.get(String(details.studentId)) : null);
    const submission = log.targetType === 'Submission' ? submissionMap.get(targetId) : null;
    const submissionStudent = submission ? userMap.get(String(submission.studentId)) : null;
    const assignment = assignmentMap.get(String(details.assignmentId || ''))
      || (log.targetType === 'Assignment' ? assignmentMap.get(targetId) : null)
      || (submission ? assignmentMap.get(String(submission.assignmentId)) : null);
    const course = courseMap.get(String(details.courseId || ''))
      || (log.targetType === 'Course' || log.targetType === 'Enrollment' ? courseMap.get(targetId) : null)
      || (details.courseCode ? courseCodeMap.get(String(details.courseCode)) : null)
      || (assignment ? courseMap.get(String(assignment.courseId)) : null);
    const person = submissionStudent || user;

    if (person) {
      details.name = details.name || details.studentName || person.name;
      details.email = details.email || details.studentEmail || person.email;
      details.role = details.role || person.role;
      if (!details.studentId || isObjectId(details.studentId)) details.studentId = person.studentId || '';
      if (!details.teacherId || isObjectId(details.teacherId)) details.teacherId = person.teacherId || '';
    }
    if (course) {
      details.courseTitle = details.courseTitle || course.title;
      details.courseCode = details.courseCode || course.courseCode;
    }
    if (assignment) {
      details.assignmentTitle = details.assignmentTitle || assignment.title;
    }
    if (['COURSE_CREATED', 'COURSE_UPDATED', 'COURSE_STATUS_CHANGED', 'COURSE_DELETED'].includes(log.action) && !details.courseTitle && details.title) {
      details.courseTitle = details.title;
    }
    if (submission && (details.marks === undefined || details.marks === null)) {
      details.marks = submission.marks;
    }
    return { log, details };
  });
}

function shapeActivity(log, details) {
  const actorDoc = log.actorId && log.actorId.name ? log.actorId : null;
  return {
    id: String(log._id),
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId ? String(log.targetId) : null,
    details,
    summary: describeActivity(log.action, details),
    createdAt: log.createdAt,
    actorName: actorDoc ? actorDoc.name : 'Unknown',
    actorEmail: actorDoc ? actorDoc.email : '',
    actor: actorDoc
      ? {
        id: String(actorDoc._id),
        name: actorDoc.name,
        email: actorDoc.email,
      }
      : null,
  };
}

async function listRecent(limit = 10) {
  const logs = await AuditLog.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('actorId', 'name email role');
  const enriched = await enrichLogs(logs);
  return enriched.map(({ log, details }) => shapeActivity(log, details));
}

module.exports = {
  recordAudit,
  listRecent,
  publicDetails,
  describeActivity,
};

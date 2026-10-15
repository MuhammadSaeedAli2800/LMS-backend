const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const AppError = require('../utils/AppError');
const { assertObjectId } = require('../utils/objectId');

async function loadCourse(courseId) {
  assertObjectId(courseId, 'course id');
  const course = await Course.findById(courseId);
  if (!course) throw new AppError('Course not found.', 404);
  return course;
}

function teaches(course, userId) {
  return course.teacherIds.some((id) => String(id) === String(userId));
}

async function assertTeacherCanView(user, courseId) {
  const course = await loadCourse(courseId);
  if (!teaches(course, user._id)) {
    throw new AppError('You are not assigned to this course.', 403);
  }
  return course;
}

async function assertTeacherCanManage(user, courseId) {
  const course = await assertTeacherCanView(user, courseId);
  if (course.status === 'archived') {
    throw new AppError('This course is archived.', 403);
  }
  return course;
}

async function activeEnrollment(studentId, courseId) {
  return Enrollment.findOne({ studentId, courseId, status: 'active' });
}

async function assertStudentCanView(user, courseId) {
  const course = await loadCourse(courseId);
  if (course.status === 'draft') throw new AppError('Course not found.', 404);
  const enrollment = await activeEnrollment(user._id, course._id);
  if (!enrollment) throw new AppError('You are not enrolled in this course.', 403);
  return { course, enrollment };
}

module.exports = {
  loadCourse,
  teaches,
  assertTeacherCanView,
  assertTeacherCanManage,
  activeEnrollment,
  assertStudentCanView,
};

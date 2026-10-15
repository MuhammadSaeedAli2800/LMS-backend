const { matchedData } = require('express-validator');
const asyncHandler = require('../utils/asyncHandler');
const courseAdmin = require('../services/courseAdminService');
const learning = require('../services/learningService');
const adminAttendance = require('../services/adminAttendanceService');
const { sendData } = require('../utils/respond');

const listCourses = asyncHandler(async (req, res) => {
  sendData(res, { courses: await courseAdmin.listCourses(req.query) });
});

const createCourse = asyncHandler(async (req, res) => {
  const course = await courseAdmin.createCourse(req.user._id, matchedData(req, { locations: ['body'] }));
  sendData(res, { course }, 201);
});

const getCourse = asyncHandler(async (req, res) => {
  sendData(res, { course: await courseAdmin.getCourse(req.params.id) });
});

const updateCourse = asyncHandler(async (req, res) => {
  const course = await courseAdmin.updateCourse(req.user._id, req.params.id, matchedData(req, { locations: ['body'] }));
  sendData(res, { course });
});

const updateCourseStatus = asyncHandler(async (req, res) => {
  const { status } = matchedData(req, { locations: ['body'] });
  sendData(res, { course: await courseAdmin.updateCourseStatus(req.user._id, req.params.id, status) });
});

const deleteCourse = asyncHandler(async (req, res) => {
  sendData(res, await courseAdmin.deleteCourse(req.user._id, req.params.id));
});

const listAnnouncements = asyncHandler(async (req, res) => {
  sendData(res, { announcements: await learning.listAnnouncementsForAdmin() });
});

const createAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await learning.publishAdminAnnouncement(req.user, matchedData(req, { locations: ['body'] }));
  sendData(res, { announcement }, 201);
});

const deleteAnnouncement = asyncHandler(async (req, res) => {
  sendData(res, await learning.deleteAdminAnnouncement(req.user, req.params.id));
});

const listEnrollments = asyncHandler(async (req, res) => {
  sendData(res, { enrollments: await courseAdmin.listEnrollments(req.query) });
});

const createEnrollment = asyncHandler(async (req, res) => {
  const data = matchedData(req, { locations: ['body'] });
  const enrollment = await courseAdmin.enrollStudent(req.user._id, data.studentId, data.courseId);
  sendData(res, { enrollment }, 201);
});

const deleteEnrollment = asyncHandler(async (req, res) => {
  await courseAdmin.removeEnrollment(req.user._id, req.params.id);
  sendData(res, { message: 'Enrollment removed.' });
});

const reports = asyncHandler(async (req, res) => {
  sendData(res, await courseAdmin.reports());
});

const workReport = asyncHandler(async (req, res) => {
  sendData(res, await courseAdmin.workReport());
});

const courseReport = asyncHandler(async (req, res) => {
  sendData(res, await courseAdmin.courseReport(req.params.courseId));
});

const teacherReport = asyncHandler(async (req, res) => {
  sendData(res, await courseAdmin.teacherReport(req.params.teacherId));
});

const auditLogs = asyncHandler(async (req, res) => {
  sendData(res, { logs: await courseAdmin.listAuditLogs() });
});

const attendanceCards = asyncHandler(async (req, res) => {
  sendData(res, { courses: await adminAttendance.attendanceCards(req.query.audience || 'student') });
});

const attendanceCourse = asyncHandler(async (req, res) => {
  sendData(res, await adminAttendance.attendanceCourse(req.query.audience || 'student', req.params.courseId));
});

const listAttendance = asyncHandler(async (req, res) => {
  const records = await adminAttendance.listAttendance({
    audience: req.query.audience,
    date: req.query.date,
    courseId: req.query.courseId,
  });
  sendData(res, { records });
});

const saveAttendanceRecord = asyncHandler(async (req, res) => {
  const record = await adminAttendance.saveAttendance(req.user._id, matchedData(req, { locations: ['body'] }));
  sendData(res, { record });
});

const deleteAttendanceRecord = asyncHandler(async (req, res) => {
  await adminAttendance.deleteAttendance(req.user._id, req.params.audience, req.params.id);
  sendData(res, { message: 'Attendance deleted.' });
});

module.exports = {
  listCourses,
  createCourse,
  getCourse,
  updateCourse,
  updateCourseStatus,
  deleteCourse,
  listAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
  listEnrollments,
  createEnrollment,
  deleteEnrollment,
  reports,
  workReport,
  courseReport,
  teacherReport,
  auditLogs,
  attendanceCards,
  attendanceCourse,
  listAttendance,
  saveAttendanceRecord,
  deleteAttendanceRecord,
};

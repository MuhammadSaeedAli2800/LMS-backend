const { matchedData } = require('express-validator');
const asyncHandler = require('../utils/asyncHandler');
const sanitizeUser = require('../utils/sanitizeUser');
const learning = require('../services/learningService');
const { sendData } = require('../utils/respond');

const dashboard = asyncHandler(async (req, res) => {
  sendData(res, await learning.teacherDashboard(req.user));
});

const courses = asyncHandler(async (req, res) => {
  sendData(res, { courses: await learning.teacherCourses(req.user) });
});

const students = asyncHandler(async (req, res) => {
  sendData(res, { students: await learning.courseStudents(req.user, req.params.courseId) });
});

const materials = asyncHandler(async (req, res) => {
  sendData(res, { materials: await learning.listMaterialsForTeacher(req.user, req.params.courseId) });
});

const createMaterial = asyncHandler(async (req, res) => {
  const material = await learning.addMaterial(
    req.user,
    req.params.courseId,
    matchedData(req, { locations: ['body'] }),
    req.file
  );
  sendData(res, { material }, 201);
});

const updateMaterial = asyncHandler(async (req, res) => {
  const material = await learning.updateMaterial(req.user, req.params.materialId, matchedData(req, { locations: ['body'] }), req.file);
  sendData(res, { material });
});

const removeMaterial = asyncHandler(async (req, res) => {
  sendData(res, await learning.deleteMaterial(req.user, req.params.materialId));
});

const assignments = asyncHandler(async (req, res) => {
  sendData(res, { assignments: await learning.listAssignmentsForTeacher(req.user, req.params.courseId) });
});

const createAssignment = asyncHandler(async (req, res) => {
  const assignment = await learning.createAssignment(
    req.user,
    req.params.courseId,
    matchedData(req, { locations: ['body'] }),
    req.file
  );
  sendData(res, { assignment }, 201);
});

const updateAssignment = asyncHandler(async (req, res) => {
  const assignment = await learning.updateAssignment(req.user, req.params.assignmentId, matchedData(req, { locations: ['body'] }), req.file);
  sendData(res, { assignment });
});

const removeAssignment = asyncHandler(async (req, res) => {
  sendData(res, await learning.deleteAssignment(req.user, req.params.assignmentId));
});

const assignmentStatus = asyncHandler(async (req, res) => {
  const { status } = matchedData(req, { locations: ['body'] });
  const assignment = await learning.setAssignmentStatus(req.user, req.params.assignmentId, status);
  sendData(res, { assignment });
});

const submissions = asyncHandler(async (req, res) => {
  sendData(res, await learning.listSubmissions(req.user, req.params.assignmentId));
});

const allSubmissions = asyncHandler(async (req, res) => {
  sendData(res, await learning.listTeacherSubmissions(req.user));
});

const grade = asyncHandler(async (req, res) => {
  const submission = await learning.gradeSubmission(
    req.user,
    req.params.submissionId,
    matchedData(req, { locations: ['body'] })
  );
  sendData(res, { submission });
});

const attendance = asyncHandler(async (req, res) => {
  sendData(res, { records: await learning.attendanceHistory(req.user, req.params.courseId, req.query.sessionDate) });
});

const ownAttendance = asyncHandler(async (req, res) => {
  sendData(res, { courses: await learning.teacherOwnAttendance(req.user) });
});

const saveAttendance = asyncHandler(async (req, res) => {
  const records = await learning.saveAttendance(req.user, req.params.courseId, req.body);
  sendData(res, { records });
});

const announcements = asyncHandler(async (req, res) => {
  sendData(res, { announcements: await learning.listAnnouncementsForTeacher(req.user, req.params.courseId) });
});

const adminAnnouncements = asyncHandler(async (req, res) => {
  sendData(res, { announcements: await learning.teacherAdminAnnouncements(req.user) });
});

const createAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await learning.publishAnnouncement(
    req.user,
    req.params.courseId,
    matchedData(req, { locations: ['body'] })
  );
  sendData(res, { announcement }, 201);
});

const updateAnnouncement = asyncHandler(async (req, res) => {
  const announcement = await learning.updateAnnouncement(req.user, req.params.announcementId, matchedData(req, { locations: ['body'] }));
  sendData(res, { announcement });
});

const removeAnnouncement = asyncHandler(async (req, res) => {
  sendData(res, await learning.deleteAnnouncement(req.user, req.params.announcementId));
});

const progress = asyncHandler(async (req, res) => {
  sendData(res, { courses: await learning.teacherProgress(req.user, req.query.courseId) });
});

const updateProfile = asyncHandler(async (req, res) => {
  const { name } = matchedData(req, { locations: ['body'] });
  const user = await learning.updateStudentProfile(req.user, name);
  sendData(res, { user: sanitizeUser(user) });
});

module.exports = {
  dashboard,
  courses,
  students,
  materials,
  createMaterial,
  updateMaterial,
  removeMaterial,
  assignments,
  createAssignment,
  updateAssignment,
  removeAssignment,
  assignmentStatus,
  submissions,
  allSubmissions,
  grade,
  attendance,
  ownAttendance,
  saveAttendance,
  announcements,
  adminAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  removeAnnouncement,
  progress,
  updateProfile,
};

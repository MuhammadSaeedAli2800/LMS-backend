const { matchedData } = require('express-validator');
const asyncHandler = require('../utils/asyncHandler');
const sanitizeUser = require('../utils/sanitizeUser');
const learning = require('../services/learningService');
const { sendData } = require('../utils/respond');

const dashboard = asyncHandler(async (req, res) => {
  sendData(res, await learning.studentDashboard(req.user));
});

const courses = asyncHandler(async (req, res) => {
  sendData(res, { courses: await learning.studentCourses(req.user) });
});

const course = asyncHandler(async (req, res) => {
  sendData(res, { course: await learning.studentCourseDetail(req.user, req.params.courseId) });
});

const assignments = asyncHandler(async (req, res) => {
  sendData(res, { assignments: await learning.studentAssignments(req.user) });
});

const submit = asyncHandler(async (req, res) => {
  const submission = await learning.submitAssignment(
    req.user,
    req.params.assignmentId,
    { submissionText: req.body.submissionText },
    req.file
  );
  sendData(res, { submission }, 201);
});

const grades = asyncHandler(async (req, res) => {
  sendData(res, { grades: await learning.studentGrades(req.user) });
});

const attendance = asyncHandler(async (req, res) => {
  sendData(res, { courses: await learning.studentAttendance(req.user) });
});

const materials = asyncHandler(async (req, res) => {
  sendData(res, { courses: await learning.studentMaterials(req.user) });
});

const announcements = asyncHandler(async (req, res) => {
  sendData(res, { announcements: await learning.studentAnnouncements(req.user) });
});

const profile = asyncHandler(async (req, res) => {
  sendData(res, { user: sanitizeUser(req.user) });
});

const updateProfile = asyncHandler(async (req, res) => {
  const { name } = matchedData(req, { locations: ['body'] });
  const user = await learning.updateStudentProfile(req.user, name);
  sendData(res, { user: sanitizeUser(user) });
});

module.exports = {
  dashboard,
  courses,
  course,
  assignments,
  submit,
  grades,
  attendance,
  materials,
  announcements,
  profile,
  updateProfile,
};

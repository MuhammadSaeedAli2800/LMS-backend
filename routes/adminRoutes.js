const express = require('express');
const adminAuthController = require('../controllers/adminAuthController');
const adminUserController = require('../controllers/adminUserController');
const adminDashboardController = require('../controllers/adminDashboardController');
const authenticateUser = require('../middleware/authenticateUser');
const requireRole = require('../middleware/requireRole');
const csrf = require('../middleware/csrf');
const validate = require('../middleware/validate');
const { loginRateLimiter } = require('../middleware/rateLimiter');
const { loginRules } = require('../validators/authValidators');
const userValidators = require('../validators/userValidators');
const courseValidators = require('../validators/courseValidators');
const adminCourseController = require('../controllers/adminCourseController');

const router = express.Router();
const read = [authenticateUser, requireRole('admin')];
const write = [authenticateUser, requireRole('admin'), csrf];

router.post(
  '/auth/login',
  loginRateLimiter,
  loginRules,
  validate,
  adminAuthController.login
);

router.get('/dashboard', ...read, adminDashboardController.getDashboard);
router.get('/announcements', ...read, adminCourseController.listAnnouncements);
router.post('/announcements', ...write, courseValidators.adminAnnouncementFields, validate, adminCourseController.createAnnouncement);
router.delete('/announcements/:id', ...write, adminCourseController.deleteAnnouncement);
router.patch('/profile', ...write, courseValidators.profileFields, validate, adminUserController.updateOwnProfile);

router.get('/students', ...read, userValidators.listStudents, validate, adminUserController.listStudents);
router.post('/students', ...write, userValidators.createStudent, validate, adminUserController.createStudent);
router.get('/students/:id', ...read, userValidators.idOnly, validate, adminUserController.getStudent);
router.patch(
  '/students/:id/status',
  ...write,
  userValidators.statusChange,
  validate,
  adminUserController.updateStudentStatus
);
router.patch(
  '/students/:id',
  ...write,
  userValidators.updateStudent,
  validate,
  adminUserController.updateStudent
);
router.post(
  '/students/:id/reset-password',
  ...write,
  userValidators.idOnly,
  validate,
  adminUserController.resetStudentPassword
);
router.delete(
  '/students/:id',
  ...write,
  userValidators.idOnly,
  validate,
  adminUserController.deleteStudent
);

router.get('/teachers', ...read, userValidators.listTeachers, validate, adminUserController.listTeachers);
router.post('/teachers', ...write, userValidators.createTeacher, validate, adminUserController.createTeacher);
router.get('/teachers/:id', ...read, userValidators.idOnly, validate, adminUserController.getTeacher);
router.patch(
  '/teachers/:id/status',
  ...write,
  userValidators.statusChange,
  validate,
  adminUserController.updateTeacherStatus
);
router.patch(
  '/teachers/:id',
  ...write,
  userValidators.updateTeacher,
  validate,
  adminUserController.updateTeacher
);
router.post(
  '/teachers/:id/reset-password',
  ...write,
  userValidators.idOnly,
  validate,
  adminUserController.resetTeacherPassword
);
router.delete(
  '/teachers/:id',
  ...write,
  userValidators.idOnly,
  validate,
  adminUserController.deleteTeacher
);

router.get('/admins', ...read, userValidators.listAdmins, validate, adminUserController.listAdmins);
router.post('/admins', ...write, userValidators.createAdmin, validate, adminUserController.createAdmin);

router.get('/courses', ...read, adminCourseController.listCourses);
router.post('/courses', ...write, courseValidators.courseFields, validate, adminCourseController.createCourse);
router.get('/courses/:id', ...read, adminCourseController.getCourse);
router.patch('/courses/:id', ...write, courseValidators.updateCourseFields, validate, adminCourseController.updateCourse);
router.patch('/courses/:id/status', ...write, courseValidators.statusField, validate, adminCourseController.updateCourseStatus);
router.delete('/courses/:id', ...write, adminCourseController.deleteCourse);

router.get('/enrollments', ...read, adminCourseController.listEnrollments);
router.post('/enrollments', ...write, courseValidators.enrollmentFields, validate, adminCourseController.createEnrollment);
router.delete('/enrollments/:id', ...write, adminCourseController.deleteEnrollment);

router.get('/reports', ...read, adminCourseController.reports);
router.get('/reports/work', ...read, adminCourseController.workReport);
router.get('/reports/courses/:courseId', ...read, adminCourseController.courseReport);
router.get('/reports/teachers/:teacherId', ...read, adminCourseController.teacherReport);
router.get('/audit-logs', ...read, adminCourseController.auditLogs);

router.get('/attendance/summary', ...read, adminCourseController.attendanceCards);
router.get('/attendance/courses/:courseId', ...read, adminCourseController.attendanceCourse);
router.get('/attendance', ...read, adminCourseController.listAttendance);
router.put('/attendance', ...write, courseValidators.attendanceFields, validate, adminCourseController.saveAttendanceRecord);
router.delete('/attendance/:audience/:id', ...write, adminCourseController.deleteAttendanceRecord);

module.exports = router;

const express = require('express');
const authenticateUser = require('../middleware/authenticateUser');
const requireRole = require('../middleware/requireRole');
const csrf = require('../middleware/csrf');
const validate = require('../middleware/validate');
const { uploadSingle, uploadLearningMaterial } = require('../middleware/upload');
const {
  materialFields,
  assignmentFields,
  updateAssignmentFields,
  assignmentStatusField,
  gradeFields,
  announcementFields,
  profileFields,
} = require('../validators/courseValidators');
const teacher = require('../controllers/teacherController');

const router = express.Router();
router.use(authenticateUser, requireRole('teacher'), csrf);

router.get('/dashboard', teacher.dashboard);
router.get('/courses', teacher.courses);
router.get('/courses/:courseId/students', teacher.students);
router.get('/progress', teacher.progress);
router.patch('/profile', profileFields, validate, teacher.updateProfile);
router.get('/submissions', teacher.allSubmissions);
router.get('/courses/:courseId/materials', teacher.materials);
router.post('/courses/:courseId/materials', uploadLearningMaterial, materialFields, validate, teacher.createMaterial);
router.patch('/materials/:materialId', uploadLearningMaterial, materialFields, validate, teacher.updateMaterial);
router.delete('/materials/:materialId', teacher.removeMaterial);
router.get('/courses/:courseId/assignments', teacher.assignments);
router.post('/courses/:courseId/assignments', uploadSingle, assignmentFields, validate, teacher.createAssignment);
router.patch('/assignments/:assignmentId/status', assignmentStatusField, validate, teacher.assignmentStatus);
router.delete('/assignments/:assignmentId', teacher.removeAssignment);
router.patch('/assignments/:assignmentId', uploadSingle, updateAssignmentFields, validate, teacher.updateAssignment);
router.get('/assignments/:assignmentId/submissions', teacher.submissions);
router.patch('/submissions/:submissionId/grade', gradeFields, validate, teacher.grade);
router.get('/attendance', teacher.ownAttendance);
router.get('/courses/:courseId/attendance', teacher.attendance);
router.post('/courses/:courseId/attendance', teacher.saveAttendance);
router.get('/announcements', teacher.adminAnnouncements);
router.get('/courses/:courseId/announcements', teacher.announcements);
router.post('/courses/:courseId/announcements', announcementFields, validate, teacher.createAnnouncement);
router.patch('/announcements/:announcementId', announcementFields, validate, teacher.updateAnnouncement);
router.delete('/announcements/:announcementId', teacher.removeAnnouncement);

module.exports = router;

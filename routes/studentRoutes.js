const express = require('express');
const authenticateUser = require('../middleware/authenticateUser');
const requireRole = require('../middleware/requireRole');
const csrf = require('../middleware/csrf');
const validate = require('../middleware/validate');
const { uploadStudentSubmission } = require('../middleware/upload');
const { profileFields } = require('../validators/courseValidators');
const student = require('../controllers/studentController');

const router = express.Router();
router.use(authenticateUser, requireRole('student'), csrf);

router.get('/dashboard', student.dashboard);
router.get('/courses', student.courses);
router.get('/courses/:courseId', student.course);
router.get('/assignments', student.assignments);
router.post('/assignments/:assignmentId/submissions', uploadStudentSubmission, student.submit);
router.get('/grades', student.grades);
router.get('/attendance', student.attendance);
router.get('/materials', student.materials);
router.get('/announcements', student.announcements);
router.get('/profile', student.profile);
router.patch('/profile', profileFields, validate, student.updateProfile);

module.exports = router;

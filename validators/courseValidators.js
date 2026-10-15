const { body } = require('express-validator');
const { WEEKDAYS, TIME_PATTERN } = require('../utils/schedule');

const scheduleRules = [
  body('days').optional().isArray().withMessage('Class days must be a list.'),
  body('days.*').isIn(WEEKDAYS).withMessage('Choose class days from Monday through Sunday.'),
  body('startTime').optional({ values: 'falsy' }).matches(TIME_PATTERN).withMessage('Start time must use HH:MM.'),
  body('endTime').optional({ values: 'falsy' }).matches(TIME_PATTERN).withMessage('End time must use HH:MM.'),
];

const courseFields = [
  body('title').isString().trim().isLength({ min: 2, max: 160 }).withMessage('Title must be between 2 and 160 characters.'),
  body('courseCode').isString().trim().isLength({ min: 2, max: 32 }).withMessage('Course code must be between 2 and 32 characters.'),
  body('description').optional({ values: 'falsy' }).isString().trim().isLength({ max: 4000 }).withMessage('Description is too long.'),
  body('thumbnail').optional({ values: 'falsy' }).isString().trim().isLength({ max: 500 }).withMessage('Thumbnail link is too long.'),
  body('academicTerm').isString().trim().isLength({ min: 2, max: 80 }).withMessage('Academic term is required.'),
  body('department').optional({ values: 'falsy' }).isString().trim().isLength({ max: 120 }).withMessage('Department is too long.'),
  body('status').optional().isIn(['draft', 'published', 'archived']).withMessage('Status must be draft, published, or archived.'),
  body('teacherIds').optional().isArray().withMessage('Teachers must be a list.'),
  ...scheduleRules,
];

const updateCourseFields = [
  body('title').optional().isString().trim().isLength({ min: 2, max: 160 }).withMessage('Title must be between 2 and 160 characters.'),
  body('courseCode').optional().isString().trim().isLength({ min: 2, max: 32 }).withMessage('Course code must be between 2 and 32 characters.'),
  body('description').optional().isString().trim().isLength({ max: 4000 }),
  body('thumbnail').optional().isString().trim().isLength({ max: 500 }),
  body('academicTerm').optional().isString().trim().isLength({ min: 2, max: 80 }).withMessage('Academic term is required.'),
  body('department').optional().isString().trim().isLength({ max: 120 }),
  body('teacherIds').optional().isArray().withMessage('Teachers must be a list.'),
  ...scheduleRules,
];

const attendanceFields = [
  body('audience').isIn(['student', 'teacher']).withMessage('Choose students or teachers.'),
  body('personId').isString().trim().notEmpty().withMessage('A person is required.'),
  body('courseId').isString().trim().notEmpty().withMessage('A course is required.'),
  body('sessionDate').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Choose a valid day.'),
  body('status').isIn(['present', 'absent', 'leave']).withMessage('Status must be present, absent, or leave.'),
];

const statusField = [
  body('status').isIn(['draft', 'published', 'archived']).withMessage('Status must be draft, published, or archived.'),
];

const enrollmentFields = [
  body('studentId').isString().trim().notEmpty().withMessage('Student is required.'),
  body('courseId').isString().trim().notEmpty().withMessage('Course is required.'),
];

const materialFields = [
  body('title').isString().trim().isLength({ min: 2, max: 160 }).withMessage('Title is required.'),
  body('description').optional({ values: 'falsy' }).isString().trim().isLength({ max: 2000 }),
  body('externalUrl').optional({ values: 'falsy' }).isString().trim(),
];

function assignmentNumberField() {
  return body('assignmentNumber')
    .optional({ values: 'undefined' })
    .custom((value) => {
      if (value === '' || value === null) return true;
      const number = Number(value);
      return Number.isInteger(number) && number >= 1 && number <= 999;
    })
    .withMessage('Assignment number must be a whole number from 1 to 999.')
    .customSanitizer((value) => (value === '' || value === null ? null : Number(value)));
}

const assignmentFields = [
  body('title').isString().trim().isLength({ min: 2, max: 160 }).withMessage('Title is required.'),
  assignmentNumberField(),
  body('description').optional({ values: 'falsy' }).isString().trim().isLength({ max: 4000 }),
  body('dueDate').isISO8601().withMessage('A valid deadline is required.'),
  body('maxMarks').isInt({ min: 1, max: 1000 }).withMessage('Maximum marks must be between 1 and 1000.').toInt(),
  body('allowResubmission').optional().custom((value) => ['true', 'false', true, false, 'on'].includes(value)).withMessage('allowResubmission must be true or false.'),
  body('allowLate').optional().custom((value) => ['true', 'false', true, false, 'on'].includes(value)).withMessage('allowLate must be true or false.'),
];

const updateAssignmentFields = [
  body('title').optional().isString().trim().isLength({ min: 2, max: 160 }).withMessage('Title is required.'),
  assignmentNumberField(),
  body('description').optional().isString().trim().isLength({ max: 4000 }),
  body('dueDate').optional().isISO8601().withMessage('A valid deadline is required.'),
  body('maxMarks').optional().isInt({ min: 1, max: 1000 }).withMessage('Maximum marks must be between 1 and 1000.').toInt(),
  body('allowResubmission').optional().custom((value) => ['true', 'false', true, false, 'on'].includes(value)),
  body('allowLate').optional().custom((value) => ['true', 'false', true, false, 'on'].includes(value)),
];

const assignmentStatusField = [
  body('status').isIn(['published', 'closed']).withMessage('Status must be published or closed.'),
];

const gradeFields = [
  body('marks').isFloat({ min: 0 }).withMessage('Marks are required.'),
  body('feedback').optional({ values: 'falsy' }).isString().trim().isLength({ max: 4000 }),
  body('release').optional().custom((value) => ['true', 'false', true, false].includes(value)),
];

const announcementFields = [
  body('title').isString().trim().isLength({ min: 2, max: 160 }).withMessage('Title is required.'),
  body('message').isString().trim().isLength({ min: 2, max: 4000 }).withMessage('Message is required.'),
];

const adminAnnouncementFields = [
  ...announcementFields,
  body('audience').optional({ values: 'falsy' }).isIn(['general', 'students', 'teachers']).withMessage('Choose General, All students, or All teachers.'),
  body('courseId').optional({ values: 'falsy' }).isMongoId().withMessage('Choose a valid course.'),
];

const profileFields = [
  body('name').isString().trim().isLength({ min: 2, max: 120 }).withMessage('Name must be between 2 and 120 characters.'),
];

module.exports = {
  courseFields,
  updateCourseFields,
  statusField,
  enrollmentFields,
  materialFields,
  assignmentFields,
  updateAssignmentFields,
  assignmentStatusField,
  gradeFields,
  announcementFields,
  adminAnnouncementFields,
  profileFields,
  attendanceFields,
};

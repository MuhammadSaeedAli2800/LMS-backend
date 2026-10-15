const { body, query, param } = require('express-validator');

const idPattern = /^[A-Za-z0-9-]{2,30}$/;

const idParam = [
  param('id').isMongoId().withMessage('Invalid id'),
];

const paginationQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('limit must be between 1 and 50')
    .toInt(),
  query('search')
    .optional()
    .isString()
    .isLength({ max: 120 })
    .withMessage('search must be at most 120 characters'),
];

const directoryFilters = [
  query('status')
    .optional({ values: 'falsy' })
    .custom((value) => {
      const normalized = String(value).trim().toLowerCase();
      if (normalized !== 'active' && normalized !== 'inactive') {
        throw new Error('status must be active or inactive');
      }
      return true;
    }),
  query('department')
    .optional()
    .isString()
    .isLength({ max: 120 })
    .withMessage('department must be at most 120 characters'),
];

const nameField = body('name')
  .trim()
  .notEmpty()
  .withMessage('Name is required')
  .bail()
  .isLength({ max: 120 })
  .withMessage('Name must be at most 120 characters');

const emailField = body('email')
  .trim()
  .toLowerCase()
  .isEmail()
  .withMessage('A valid email is required');

const optionalText = (field) => body(field)
  .optional({ values: 'falsy' })
  .trim()
  .isLength({ max: 120 })
  .withMessage(`${field} must be at most 120 characters`);

const accountStatusField = body('accountStatus')
  .optional()
  .isIn(['active', 'inactive'])
  .withMessage('accountStatus must be active or inactive');

const codeField = (field, label) => body(field)
  .trim()
  .matches(idPattern)
  .withMessage(`${label} must be 2-30 letters, numbers, or hyphens`);

const optionalCodeField = (field, label) => body(field)
  .optional()
  .trim()
  .matches(idPattern)
  .withMessage(`${label} must be 2-30 letters, numbers, or hyphens`);

const optionalName = body('name')
  .optional()
  .trim()
  .notEmpty()
  .withMessage('Name is required')
  .bail()
  .isLength({ max: 120 })
  .withMessage('Name must be at most 120 characters');

const optionalEmail = body('email')
  .optional()
  .trim()
  .toLowerCase()
  .isEmail()
  .withMessage('A valid email is required');

const listStudents = [
  ...paginationQuery,
  ...directoryFilters,
  query('className')
    .optional()
    .isString()
    .isLength({ max: 120 })
    .withMessage('className must be at most 120 characters'),
];

const listTeachers = [
  ...paginationQuery,
  ...directoryFilters,
];

const listAdmins = [...paginationQuery];

const createStudent = [
  nameField,
  emailField,
  codeField('studentId', 'Student ID'),
  optionalText('department'),
  optionalText('className'),
  optionalText('academicProgram'),
  accountStatusField,
  body('courseId').optional({ values: 'falsy' }).isMongoId().withMessage('Choose a valid course.'),
];

const createTeacher = [
  nameField,
  emailField,
  codeField('teacherId', 'Teacher ID'),
  optionalText('department'),
  optionalText('academicProgram'),
  accountStatusField,
];

const createAdmin = [
  nameField,
  emailField,
];

const updateStudent = [
  ...idParam,
  optionalName,
  optionalEmail,
  optionalCodeField('studentId', 'Student ID'),
  optionalText('department'),
  optionalText('className'),
  optionalText('academicProgram'),
  body('courseIds').optional().isArray().withMessage('Courses must be a list.'),
  body('courseIds.*').optional().isMongoId().withMessage('Choose a valid course.'),
];

const updateTeacher = [
  ...idParam,
  optionalName,
  optionalEmail,
  optionalCodeField('teacherId', 'Teacher ID'),
  optionalText('department'),
  optionalText('academicProgram'),
];

const statusChange = [
  ...idParam,
  body('accountStatus')
    .isIn(['active', 'inactive'])
    .withMessage('accountStatus must be active or inactive'),
];

const idOnly = [...idParam];

module.exports = {
  listStudents,
  listTeachers,
  listAdmins,
  createStudent,
  createTeacher,
  createAdmin,
  updateStudent,
  updateTeacher,
  statusChange,
  idOnly,
};

const { body } = require('express-validator');
const { isStrongPassword } = require('../utils/password');

const loginRules = [
  body('email')
    .trim()
    .toLowerCase()
    .isEmail()
    .withMessage('A valid email is required'),
  body('password')
    .isString()
    .withMessage('Password is required')
    .bail()
    .notEmpty()
    .withMessage('Password is required'),
  body('loginAs')
    .optional()
    .isIn(['student', 'teacher'])
    .withMessage('Choose student or teacher'),
  body('rememberMe')
    .optional()
    .custom((value) => {
      if (typeof value !== 'boolean') {
        throw new Error('rememberMe must be a boolean');
      }
      return true;
    }),
];

const changePasswordRules = [
  body('currentPassword')
    .isString()
    .withMessage('Current password is required')
    .bail()
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isString()
    .withMessage('New password is required')
    .bail()
    .custom((value) => {
      if (!isStrongPassword(value)) {
        throw new Error('Password must be at least 8 characters and include a letter and a number');
      }
      return true;
    }),
];

module.exports = {
  loginRules,
  changePasswordRules,
};

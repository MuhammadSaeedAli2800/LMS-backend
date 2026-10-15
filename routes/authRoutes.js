const express = require('express');
const authController = require('../controllers/authController');
const authenticateUser = require('../middleware/authenticateUser');
const csrf = require('../middleware/csrf');
const validate = require('../middleware/validate');
const { loginRateLimiter } = require('../middleware/rateLimiter');
const { loginRules, changePasswordRules } = require('../validators/authValidators');

const router = express.Router();

router.post('/login', loginRateLimiter, loginRules, validate, authController.login);
router.post('/logout', csrf, authenticateUser, authController.logout);
router.get('/me', authenticateUser, authController.me);
router.post(
  '/change-password',
  csrf,
  authenticateUser,
  changePasswordRules,
  validate,
  authController.changePassword
);

module.exports = router;

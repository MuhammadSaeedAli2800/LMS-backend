const express = require('express');
const validate = require('../middleware/validate');
const { sensitiveRouteLimiter } = require('../middleware/rateLimit');
const { loginValidators } = require('../validators/authValidators');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/login', sensitiveRouteLimiter, loginValidators, validate, authController.adminLogin);

module.exports = router;

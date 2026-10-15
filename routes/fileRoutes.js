const express = require('express');
const authenticateUser = require('../middleware/authenticateUser');
const files = require('../controllers/fileController');

const router = express.Router();
router.use(authenticateUser);
router.get('/materials/:id', files.material);
router.get('/assignments/:id', files.assignment);
router.get('/submissions/:id', files.submission);

module.exports = router;

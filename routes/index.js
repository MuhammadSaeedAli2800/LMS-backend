const express = require('express');
const authRoutes = require('./authRoutes');
const adminRoutes = require('./adminRoutes');
const teacherRoutes = require('./teacherRoutes');
const studentRoutes = require('./studentRoutes');
const fileRoutes = require('./fileRoutes');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/teacher', teacherRoutes);
router.use('/student', studentRoutes);
router.use('/files', fileRoutes);

module.exports = router;

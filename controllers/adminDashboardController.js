const asyncHandler = require('../utils/asyncHandler');
const adminUserService = require('../services/adminUserService');

const getDashboard = asyncHandler(async (req, res) => {
  const data = await adminUserService.getDashboard();
  res.json({ success: true, data });
});

module.exports = { getDashboard };

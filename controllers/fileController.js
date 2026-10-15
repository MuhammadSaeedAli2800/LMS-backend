const asyncHandler = require('../middleware/asyncHandler');
const { sendOwnedFile } = require('../services/learningService');

function download(kind) {
  return asyncHandler(async (req, res) => {
    await sendOwnedFile(res, kind, req.params.id, req.user);
  });
}

module.exports = {
  material: download('materials'),
  assignment: download('assignments'),
  submission: download('submissions'),
};

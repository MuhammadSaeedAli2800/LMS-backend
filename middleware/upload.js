const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const AppError = require('../utils/AppError');

const uploadsDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const ALLOWED = new Map([
  ['application/pdf', 'pdf'],
  ['application/vnd.ms-powerpoint', 'presentation'],
  ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'presentation'],
  ['application/msword', 'document'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'document'],
  ['image/png', 'image'],
  ['image/jpeg', 'image'],
  ['text/plain', 'document'],
]);

const storage = multer.diskStorage({
  destination(req, file, callback) {
    callback(null, uploadsDir);
  },
  filename(req, file, callback) {
    const extension = path.extname(file.originalname || '').toLowerCase().slice(0, 10);
    callback(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extension}`);
  },
});

function fileFilter(req, file, callback) {
  if (!ALLOWED.has(file.mimetype)) {
    callback(new AppError('File type not allowed.', 400));
    return;
  }
  callback(null, true);
}

const STUDENT_SUBMISSIONS = new Map([
  ['.pdf', 'application/pdf'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ['.doc', 'application/msword'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
]);

function studentSubmissionFilter(req, file, callback) {
  const extension = path.extname(file.originalname || '').toLowerCase();
  const expected = STUDENT_SUBMISSIONS.get(extension);
  const mime = String(file.mimetype || '').toLowerCase();
  const loose = mime === '' || mime === 'application/octet-stream';
  if (!expected || (mime !== expected && !loose)) {
    callback(new AppError('Upload a PDF, JPG, JPEG, PPTX, DOC, or DOCX file.', 400));
    return;
  }
  if (loose) file.mimetype = expected;
  callback(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

function fileTypeFor(mimeType, externalUrl) {
  if (externalUrl && !mimeType) return 'link';
  return ALLOWED.get(mimeType) || 'document';
}

function removeStoredFile(storedName) {
  if (!storedName) return;
  const fullPath = path.join(uploadsDir, path.basename(storedName));
  fs.unlink(fullPath, () => {});
}

function storedFilePath(storedName) {
  return path.join(uploadsDir, path.basename(storedName || ''));
}

const LEARNING_MATERIALS = new Map([
  ['.pdf', 'application/pdf'],
  ['.doc', 'application/msword'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.ppt', 'application/vnd.ms-powerpoint'],
  ['.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
]);

function learningMaterialFilter(req, file, callback) {
  const extension = path.extname(file.originalname || '').toLowerCase();
  const expected = LEARNING_MATERIALS.get(extension);
  const mime = String(file.mimetype || '').toLowerCase();
  const loose = mime === '' || mime === 'application/octet-stream';
  if (!expected || (mime !== expected && !loose)) {
    callback(new AppError('Upload a PDF, DOC, DOCX, PPT, or PPTX file.', 400));
    return;
  }
  if (loose) file.mimetype = expected;
  callback(null, true);
}

const materialUpload = multer({
  storage,
  fileFilter: learningMaterialFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const studentUpload = multer({
  storage,
  fileFilter: studentSubmissionFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

function handleUpload(middleware, req, res, next) {
  middleware(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') {
      next(new AppError('File is too large. Maximum size is 10 MB.', 400));
      return;
    }
    if (error.statusCode) {
      next(error);
      return;
    }
    next(new AppError('File type not allowed.', 400));
  });
}

function uploadSingle(req, res, next) {
  handleUpload(upload.single('file'), req, res, next);
}

function uploadStudentSubmission(req, res, next) {
  handleUpload(studentUpload.single('file'), req, res, next);
}

function uploadLearningMaterial(req, res, next) {
  handleUpload(materialUpload.single('file'), req, res, next);
}

module.exports = {
  upload,
  uploadSingle,
  uploadStudentSubmission,
  uploadLearningMaterial,
  uploadsDir,
  fileTypeFor,
  removeStoredFile,
  storedFilePath,
};

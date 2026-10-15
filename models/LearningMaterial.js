const mongoose = require('mongoose');

const learningMaterialSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, default: '', maxlength: 2000 },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    externalUrl: { type: String, trim: true, default: '' },
    fileType: { type: String, trim: true, default: 'link' },
    storedName: { type: String, default: '' },
    originalName: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    size: { type: Number, default: 0 },
  },
  { timestamps: true }
);

learningMaterialSchema.index({ courseId: 1, createdAt: -1 });

module.exports = mongoose.model('LearningMaterial', learningMaterialSchema);

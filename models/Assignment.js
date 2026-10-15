const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    assignmentNumber: { type: Number, min: 1, max: 999, default: null },
    description: { type: String, trim: true, default: '', maxlength: 4000 },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    dueDate: { type: Date, required: true },
    maxMarks: { type: Number, required: true, min: 1, max: 1000 },
    storedName: { type: String, default: '' },
    originalName: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    status: { type: String, enum: ['draft', 'published', 'closed'], default: 'published' },
    allowResubmission: { type: Boolean, default: false },
    allowLate: { type: Boolean, default: true },
  },
  { timestamps: true }
);

assignmentSchema.index({ courseId: 1, dueDate: 1 });

module.exports = mongoose.model('Assignment', assignmentSchema);

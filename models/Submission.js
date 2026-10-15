const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema(
  {
    assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    submissionText: { type: String, trim: true, default: '', maxlength: 20000 },
    storedName: { type: String, default: '' },
    originalName: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    submittedAt: { type: Date, default: Date.now },
    isLate: { type: Boolean, default: false },
    marks: { type: Number, default: null, min: 0 },
    feedback: { type: String, trim: true, default: '', maxlength: 4000 },
    gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    gradedAt: { type: Date, default: null },
    released: { type: Boolean, default: null },
  },
  { timestamps: true }
);

submissionSchema.index({ assignmentId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model('Submission', submissionSchema);

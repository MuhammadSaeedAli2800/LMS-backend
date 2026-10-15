const mongoose = require('mongoose');

const enrollmentSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    enrollmentDate: { type: Date, default: Date.now },
    status: { type: String, enum: ['active', 'withdrawn'], default: 'active' },
  },
  { timestamps: true }
);

enrollmentSchema.index({ studentId: 1, courseId: 1 }, { unique: true });
enrollmentSchema.index({ courseId: 1, status: 1 });

module.exports = mongoose.model('Enrollment', enrollmentSchema);

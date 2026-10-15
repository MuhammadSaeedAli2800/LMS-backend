const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sessionDate: { type: Date, required: true },
    status: { type: String, enum: ['present', 'absent', 'late', 'leave'], required: true },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

attendanceSchema.index({ courseId: 1, studentId: 1, sessionDate: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);

const mongoose = require('mongoose');

const teacherAttendanceSchema = new mongoose.Schema(
  {
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    sessionDate: { type: Date, required: true },
    status: { type: String, enum: ['present', 'absent', 'leave'], required: true },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

teacherAttendanceSchema.index({ courseId: 1, teacherId: 1, sessionDate: 1 }, { unique: true });

module.exports = mongoose.model('TeacherAttendance', teacherAttendanceSchema);

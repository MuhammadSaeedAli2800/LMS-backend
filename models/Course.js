const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 2, maxlength: 160 },
    courseCode: { type: String, required: true, trim: true, uppercase: true, maxlength: 32 },
    description: { type: String, trim: true, default: '', maxlength: 4000 },
    thumbnail: { type: String, trim: true, default: '', maxlength: 500 },
    teacherIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    academicTerm: { type: String, required: true, trim: true, maxlength: 80 },
    days: {
      type: [{
        type: String,
        enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      }],
      default: [],
    },
    startTime: { type: String, trim: true, default: '', maxlength: 5 },
    endTime: { type: String, trim: true, default: '', maxlength: 5 },
    department: { type: String, trim: true, default: '', maxlength: 120 },
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

courseSchema.index({ courseCode: 1 });
courseSchema.index({ status: 1, academicTerm: 1 });

module.exports = mongoose.model('Course', courseSchema);

const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    message: { type: String, required: true, trim: true, maxlength: 4000 },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
    audience: { type: String, enum: ['general', 'students', 'teachers'] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    publishedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

announcementSchema.index({ courseId: 1, publishedAt: -1 });

module.exports = mongoose.model('Announcement', announcementSchema);

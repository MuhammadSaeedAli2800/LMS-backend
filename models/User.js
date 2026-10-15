const mongoose = require('mongoose');

const idPattern = /^[A-Z0-9-]{2,30}$/;

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ['admin', 'teacher', 'student'],
      required: true,
    },
    studentId: {
      type: String,
      trim: true,
      uppercase: true,
      match: [idPattern, 'Student ID must be 2-30 letters, numbers, or hyphens'],
    },
    teacherId: {
      type: String,
      trim: true,
      uppercase: true,
      match: [idPattern, 'Teacher ID must be 2-30 letters, numbers, or hyphens'],
    },
    department: {
      type: String,
      trim: true,
      maxlength: 120,
      default: '',
    },
    className: {
      type: String,
      trim: true,
      maxlength: 120,
      default: '',
    },
    academicProgram: {
      type: String,
      trim: true,
      maxlength: 120,
      default: '',
    },
    profileImage: {
      type: String,
      default: '',
    },
    accountStatus: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    mustChangePassword: {
      type: Boolean,
      default: false,
    },
    passwordChangedAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

userSchema.index(
  { studentId: 1 },
  {
    unique: true,
    partialFilterExpression: { role: 'student' },
    name: 'unique_student_id',
  }
);

userSchema.index(
  { teacherId: 1 },
  {
    unique: true,
    partialFilterExpression: { role: 'teacher' },
    name: 'unique_teacher_id',
  }
);

userSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.passwordHash;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);

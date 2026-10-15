const mongoose = require('mongoose');
const config = require('../config/env');
const { connectDB } = require('../config/db');
const { hashPassword } = require('../utils/password');
const User = require('../models/User');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const LearningMaterial = require('../models/LearningMaterial');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const Attendance = require('../models/Attendance');
const TeacherAttendance = require('../models/TeacherAttendance');
const Announcement = require('../models/Announcement');
const AuditLog = require('../models/AuditLog');

const SAMPLE_PASSWORD = 'SmitTest1';

const sampleStudents = [
  { name: 'Hina Ali', email: 'sample.hina@smit.test', studentId: 'STU-S01', department: 'Software' },
  { name: 'Omar Farooq', email: 'sample.omar@smit.test', studentId: 'STU-S02', department: 'Software' },
  { name: 'Sara Iqbal', email: 'sample.sara@smit.test', studentId: 'STU-S03', department: 'Software' },
  { name: 'Usman Raza', email: 'sample.usman@smit.test', studentId: 'STU-S04', department: 'Software' },
];

const added = {
  students: 0,
  courses: 0,
  enrollments: 0,
  materials: 0,
  assignments: 0,
  submissions: 0,
  attendance: 0,
  teacherAttendance: 0,
  announcements: 0,
};

function daysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function sessionDate(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

async function ensureStudent(student, passwordHash, actorId) {
  const existing = await User.findOne({ email: student.email });
  if (existing) return existing;
  added.students += 1;
  return User.create({
    ...student,
    passwordHash,
    role: 'student',
    accountStatus: 'active',
    mustChangePassword: false,
    createdBy: actorId,
  });
}

async function ensureCourse(filter, fields) {
  const existing = await Course.findOne(filter);
  if (existing) return existing;
  added.courses += 1;
  return Course.create(fields);
}

async function ensureEnrollment(studentId, courseId) {
  const existing = await Enrollment.findOne({ studentId, courseId });
  if (existing) {
    if (existing.status !== 'active') {
      existing.status = 'active';
      await existing.save();
    }
    return existing;
  }
  added.enrollments += 1;
  return Enrollment.create({ studentId, courseId, status: 'active' });
}

async function ensureMaterial(course, teacherId, title, url) {
  const existing = await LearningMaterial.findOne({ courseId: course._id, title });
  if (existing) return existing;
  added.materials += 1;
  return LearningMaterial.create({
    title,
    description: `Reading for ${course.title}.`,
    courseId: course._id,
    uploadedBy: teacherId,
    externalUrl: url,
    fileType: 'link',
  });
}

async function ensureAssignment(course, teacherId, fields) {
  const existing = await Assignment.findOne({ courseId: course._id, title: fields.title });
  if (existing) return existing;
  added.assignments += 1;
  return Assignment.create({
    ...fields,
    courseId: course._id,
    createdBy: teacherId,
  });
}

async function ensureSubmission(assignmentId, studentId, fields) {
  const existing = await Submission.findOne({ assignmentId, studentId });
  if (existing) return existing;
  added.submissions += 1;
  return Submission.create({ assignmentId, studentId, ...fields });
}

async function ensureAttendance(courseId, studentId, date, status, markedBy) {
  const existing = await Attendance.findOne({ courseId, studentId, sessionDate: date });
  if (existing) return existing;
  added.attendance += 1;
  return Attendance.create({ courseId, studentId, sessionDate: date, status, markedBy });
}

async function ensureTeacherAttendance(courseId, teacherId, date, status, markedBy) {
  const existing = await TeacherAttendance.findOne({ courseId, teacherId, sessionDate: date });
  if (existing) return existing;
  added.teacherAttendance += 1;
  return TeacherAttendance.create({ courseId, teacherId, sessionDate: date, status, markedBy });
}

async function ensureAnnouncement(filter, fields) {
  const existing = await Announcement.findOne(filter);
  if (existing) return existing;
  added.announcements += 1;
  return Announcement.create(fields);
}

async function main() {
  if (!config.mongodbUri) {
    console.error('MONGODB_URI is required.');
    process.exit(1);
  }

  await connectDB();
  const admin = await User.findOne({ role: 'admin', accountStatus: 'active' });
  if (!admin) {
    console.error('An administrator account must already exist.');
    process.exit(1);
  }

  const passwordHash = await hashPassword(SAMPLE_PASSWORD);
  const students = [];
  for (const student of sampleStudents) {
    students.push(await ensureStudent(student, passwordHash, admin._id));
  }

  const teachers = await User.find({ role: 'teacher', accountStatus: 'active' }).sort({ name: 1 });
  const ayesha = teachers.find((teacher) => teacher.name === 'Ayesha Khan') || teachers[0];
  const bilal = teachers.find((teacher) => teacher.name === 'Bilal Ahmed') || teachers[0];
  const rajesh = teachers.find((teacher) => teacher.name === 'Rajesh Kumar') || teachers[0];

  const archived = await ensureCourse(
    { courseCode: 'SMIT-CAP', title: 'Capstone Project' },
    {
      title: 'Capstone Project',
      courseCode: 'SMIT-CAP',
      description: 'Archived sample course for reviewing a closed class.',
      teacherIds: ayesha ? [ayesha._id] : [],
      academicTerm: 'Fall 2026',
      days: ['Friday'],
      startTime: '14:00',
      endTime: '16:00',
      department: 'Software',
      status: 'archived',
      createdBy: admin._id,
    }
  );

  const drafts = await Course.find({ status: 'draft', teacherIds: { $size: 0 } });
  for (const course of drafts) {
    const teacher = course.courseCode === 'SMIT-OS' ? rajesh : bilal;
    if (!teacher) continue;
    course.teacherIds = [teacher._id];
    await course.save();
  }

  const courses = await Course.find({ status: { $in: ['published', 'archived'] } });
  const visibleCourses = courses.filter((course) => course.teacherIds.length > 0);

  for (const course of visibleCourses) {
    for (const student of students) {
      await ensureEnrollment(student._id, course._id);
    }
  }

  if (students[0] && archived) await ensureEnrollment(students[0]._id, archived._id);

  await ensureAnnouncement(
    { title: 'Student ID cards', audience: 'students' },
    {
      title: 'Student ID cards',
      message: 'Bring your student ID to class this week.',
      audience: 'students',
      createdBy: admin._id,
      publishedAt: new Date(),
    }
  );
  await ensureAnnouncement(
    { title: 'Faculty meeting', audience: 'teachers' },
    {
      title: 'Faculty meeting',
      message: 'Teachers meet Friday at 3:00 PM in the staff room.',
      audience: 'teachers',
      createdBy: admin._id,
      publishedAt: new Date(),
    }
  );
  await ensureAnnouncement(
    { title: 'Campus timetable', audience: 'general' },
    {
      title: 'Campus timetable',
      message: 'The shared timetable is posted for students and teachers.',
      audience: 'general',
      createdBy: admin._id,
      publishedAt: new Date(),
    }
  );

  const statuses = ['present', 'absent', 'late', 'leave'];
  const teacherStatuses = ['present', 'absent', 'leave'];

  for (const course of visibleCourses) {
    const teacherId = course.teacherIds[0];
    const code = course.courseCode;
    await ensureMaterial(course, teacherId, `${code} reading`, 'https://developer.mozilla.org/en-US/docs/Learn');
    await ensureAnnouncement(
      { title: `${code} class note`, courseId: course._id },
      {
        title: `${code} class note`,
        message: `Sample note for ${course.title}.`,
        courseId: course._id,
        createdBy: teacherId,
        publishedAt: new Date(),
      }
    );

    const upcoming = await ensureAssignment(course, teacherId, {
      title: `${code} class exercise`,
      description: 'Submit a short written answer before the deadline.',
      dueDate: daysFromNow(7),
      maxMarks: 20,
      status: 'published',
      allowLate: true,
    });
    const past = await ensureAssignment(course, teacherId, {
      title: `${code} past worksheet`,
      description: 'This deadline has passed. Late submissions are still open.',
      dueDate: daysFromNow(-2),
      maxMarks: 10,
      status: 'published',
      allowLate: true,
    });
    await ensureAssignment(course, teacherId, {
      title: `${code} closed task`,
      description: 'Finished task for this class.',
      dueDate: daysFromNow(-1),
      maxMarks: 10,
      status: 'closed',
      allowLate: false,
    });

    const enrolled = await Enrollment.find({ courseId: course._id, status: 'active' }).populate('studentId', 'name role');
    const classStudents = enrolled.map((row) => row.studentId).filter((student) => student && student.role === 'student');

    for (let index = 0; index < classStudents.length; index += 1) {
      const student = classStudents[index];
      await ensureAttendance(course._id, student._id, sessionDate(4), statuses[index % statuses.length], teacherId);
      await ensureAttendance(course._id, student._id, sessionDate(6), statuses[(index + 1) % statuses.length], teacherId);
      if (index === 0) {
        await ensureSubmission(upcoming._id, student._id, {
          submissionText: 'Submitted on time.',
          submittedAt: daysFromNow(-1),
          isLate: false,
          marks: 16,
          feedback: 'Clear answer.',
          gradedBy: teacherId,
          gradedAt: new Date(),
          released: true,
        });
      } else if (index === 1) {
        await ensureSubmission(past._id, student._id, {
          submissionText: 'Submitted after the deadline.',
          submittedAt: new Date(),
          isLate: true,
        });
      } else if (index === 2) {
        await ensureSubmission(past._id, student._id, {
          submissionText: 'Graded, but the mark is still hidden.',
          submittedAt: daysFromNow(-3),
          isLate: false,
          marks: 8,
          feedback: 'Held for review.',
          gradedBy: teacherId,
          gradedAt: new Date(),
          released: false,
        });
      }
    }

    for (let index = 0; index < course.teacherIds.length; index += 1) {
      const teacher = course.teacherIds[index];
      await ensureTeacherAttendance(course._id, teacher, sessionDate(7), teacherStatuses[index % teacherStatuses.length], admin._id);
      await ensureTeacherAttendance(course._id, teacher, sessionDate(8), 'present', admin._id);
      await ensureTeacherAttendance(course._id, teacher, sessionDate(9), 'leave', admin._id);
    }
  }

  if (added.assignments > 0) {
    await AuditLog.create({
      actorId: admin._id,
      action: 'ASSIGNMENT_CREATED',
      targetType: 'Assignment',
      details: { assignmentTitle: 'Sample class exercises', courseTitle: 'Existing courses' },
    });
  }

  console.log('Existing database records were kept.');
  console.log(`Added students ${added.students}, courses ${added.courses}, enrollments ${added.enrollments}, materials ${added.materials}, assignments ${added.assignments}, submissions ${added.submissions}, student attendance ${added.attendance}, teacher attendance ${added.teacherAttendance}, announcements ${added.announcements}.`);
  console.log('Sample students use password SmitTest1 and can sign in with Login as Student:');
  console.log(sampleStudents.map((student) => student.email).join(', '));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error && error.message ? error.message : 'Seed failed.');
  try {
    await mongoose.disconnect();
  } catch (disconnectError) {
    // Ignore disconnect failures while exiting.
  }
  process.exit(1);
});

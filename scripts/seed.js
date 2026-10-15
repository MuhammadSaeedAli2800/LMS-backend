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

const SEED_PASSWORD = 'SmitTest1';
const MAX_RECORDS = 30;

const teachers = [
  { name: 'Ayesha Khan', email: 'teacher1@smit.test', teacherId: 'TCH-01', department: 'Web Development' },
  { name: 'Bilal Ahmed', email: 'teacher2@smit.test', teacherId: 'TCH-02', department: 'Software' },
];

const students = [
  { name: 'Hina Ali', email: 'student1@smit.test', studentId: 'STU-01', className: 'WD-10', department: 'Web Development' },
  { name: 'Omar Farooq', email: 'student2@smit.test', studentId: 'STU-02', className: 'WD-10', department: 'Web Development' },
  { name: 'Sara Iqbal', email: 'student3@smit.test', studentId: 'STU-03', className: 'WD-10', department: 'Web Development' },
  { name: 'Usman Raza', email: 'student4@smit.test', studentId: 'STU-04', className: 'WD-11', department: 'Web Development' },
  { name: 'Maryam Noor', email: 'student5@smit.test', studentId: 'STU-05', className: 'PY-10', department: 'Software' },
  { name: 'Hamza Siddiqui', email: 'student6@smit.test', studentId: 'STU-06', className: 'PY-10', department: 'Software' },
  { name: 'Fatima Shah', email: 'student7@smit.test', studentId: 'STU-07', className: 'PY-10', department: 'Software' },
  { name: 'Zain Malik', email: 'student8@smit.test', studentId: 'STU-08', className: 'PY-11', department: 'Software' },
  { name: 'Amina Qureshi', email: 'student9@smit.test', studentId: 'STU-09', className: 'WD-11', department: 'Web Development' },
  { name: 'Bilal Hussain', email: 'student10@smit.test', studentId: 'STU-10', className: 'WD-11', department: 'Web Development' },
  { name: 'Sana Tariq', email: 'student11@smit.test', studentId: 'STU-11', className: 'PY-10', department: 'Software' },
  { name: 'Danish Ali', email: 'student12@smit.test', studentId: 'STU-12', className: 'PY-10', department: 'Software' },
  { name: 'Laiba Khan', email: 'student13@smit.test', studentId: 'STU-13', className: 'PY-11', department: 'Software' },
  { name: 'Rehan Malik', email: 'student14@smit.test', studentId: 'STU-14', className: 'PY-11', department: 'Software' },
  { name: 'Iqra Ahmed', email: 'student15@smit.test', studentId: 'STU-15', className: 'WD-10', department: 'Web Development' },
  { name: 'Farhan Javed', email: 'student16@smit.test', studentId: 'STU-16', className: 'WD-10', department: 'Web Development' },
  { name: 'Nida Saleem', email: 'student17@smit.test', studentId: 'STU-17', className: 'WD-11', department: 'Web Development' },
  { name: 'Kamran Shah', email: 'student18@smit.test', studentId: 'STU-18', className: 'PY-10', department: 'Software' },
];

function assertCap(label, count, limit = MAX_RECORDS) {
  if (count > limit) {
    throw new Error(`${label} has ${count} records. The seeder allows at most ${limit}.`);
  }
}

function daysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function sessionDate(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

async function clearPreviousSeed() {
  const seedUsers = await User.find({ email: /@smit\.test$/, role: { $ne: 'admin' } }).select('_id');
  const seedUserIds = seedUsers.map((user) => user._id);
  const seedCourses = await Course.find({ courseCode: /^SMIT-/ }).select('_id');
  const courseIds = seedCourses.map((course) => course._id);
  const assignments = await Assignment.find({ courseId: { $in: courseIds } }).select('_id');
  const assignmentIds = assignments.map((assignment) => assignment._id);

  await Submission.deleteMany({ assignmentId: { $in: assignmentIds } });
  await Assignment.deleteMany({ courseId: { $in: courseIds } });
  await LearningMaterial.deleteMany({ courseId: { $in: courseIds } });
  await Attendance.deleteMany({ courseId: { $in: courseIds } });
  await TeacherAttendance.deleteMany({ courseId: { $in: courseIds } });
  await Announcement.deleteMany({ courseId: { $in: courseIds } });
  await Enrollment.deleteMany({ courseId: { $in: courseIds } });
  await AuditLog.deleteMany({
    $or: [
      { targetId: { $in: courseIds } },
      { actorId: { $in: seedUserIds } },
      { targetId: { $in: seedUserIds } },
    ],
  });
  await Course.deleteMany({ _id: { $in: courseIds } });
  await User.deleteMany({ _id: { $in: seedUserIds } });
}

async function main() {
  if (!config.mongodbUri) {
    console.error('MONGODB_URI is required.');
    process.exit(1);
  }

  assertCap('teachers and students', teachers.length + students.length);
  await connectDB();
  await clearPreviousSeed();

  const passwordHash = await hashPassword(SEED_PASSWORD);
  const admin = await User.findOne({ role: 'admin', accountStatus: 'active' }).select('_id');
  const actorId = admin ? admin._id : null;

  const teacherDocs = await User.create(teachers.map((teacher) => ({
    ...teacher,
    passwordHash,
    role: 'teacher',
    accountStatus: 'active',
    mustChangePassword: false,
    createdBy: actorId,
  })));
  const studentDocs = await User.create(students.map((student) => ({
    ...student,
    passwordHash,
    role: 'student',
    accountStatus: 'active',
    mustChangePassword: false,
    createdBy: actorId,
  })));

  const [webTeacher, pythonTeacher] = teacherDocs;
  const courseDocs = await Course.create([
    {
      title: 'Web Development',
      courseCode: 'SMIT-WD',
      description: 'Morning section. HTML, CSS, and JavaScript.',
      teacherIds: [webTeacher._id],
      academicTerm: 'Fall 2026',
      days: ['Monday', 'Wednesday', 'Friday'],
      startTime: '09:00',
      endTime: '11:00',
      department: 'Web Development',
      status: 'published',
      createdBy: actorId || webTeacher._id,
    },
    {
      title: 'Web Development',
      courseCode: 'SMIT-WD',
      description: 'Evening section. Same course name and code, different days and time.',
      teacherIds: [pythonTeacher._id],
      academicTerm: 'Fall 2026',
      days: ['Tuesday', 'Thursday'],
      startTime: '16:00',
      endTime: '18:00',
      department: 'Web Development',
      status: 'published',
      createdBy: actorId || pythonTeacher._id,
    },
    {
      title: 'Python Programming',
      courseCode: 'SMIT-PY',
      description: 'Python basics, functions, and small programs.',
      teacherIds: [pythonTeacher._id],
      academicTerm: 'Fall 2026',
      days: ['Tuesday', 'Thursday'],
      startTime: '11:00',
      endTime: '13:00',
      department: 'Software',
      status: 'published',
      createdBy: actorId || pythonTeacher._id,
    },
    {
      title: 'Database Systems',
      courseCode: 'SMIT-DB',
      description: 'Draft course. Students should not see this until it is published.',
      teacherIds: [webTeacher._id, pythonTeacher._id],
      academicTerm: 'Fall 2026',
      days: ['Saturday'],
      startTime: '10:00',
      endTime: '12:00',
      department: 'Software',
      status: 'draft',
      createdBy: actorId || webTeacher._id,
    },
    {
      title: 'Capstone Project',
      courseCode: 'SMIT-CAP',
      description: 'Archived course. Enrolled students can still open it, and teachers cannot change it.',
      teacherIds: [webTeacher._id],
      academicTerm: 'Fall 2026',
      days: ['Friday'],
      startTime: '14:00',
      endTime: '16:00',
      department: 'Web Development',
      status: 'archived',
      createdBy: actorId || webTeacher._id,
    },
  ]);
  const [webCourse, eveningCourse, pythonCourse, draftCourse, archivedCourse] = courseDocs;

  const morningStudents = studentDocs.slice(0, 8);
  const eveningStudents = [studentDocs[2], studentDocs[3], studentDocs[8], studentDocs[9]];
  const pythonStudents = [...studentDocs.slice(4, 8), ...studentDocs.slice(10, 14)];
  const enrollmentDocs = [
    ...morningStudents.map((student) => ({ studentId: student._id, courseId: webCourse._id, status: 'active' })),
    ...eveningStudents.map((student) => ({ studentId: student._id, courseId: eveningCourse._id, status: 'active' })),
    ...pythonStudents.map((student) => ({ studentId: student._id, courseId: pythonCourse._id, status: 'active' })),
    { studentId: studentDocs[0]._id, courseId: archivedCourse._id, status: 'active' },
    { studentId: studentDocs[14]._id, courseId: archivedCourse._id, status: 'active' },
  ];
  assertCap('enrollments', enrollmentDocs.length);
  await Enrollment.create(enrollmentDocs);

  await LearningMaterial.create([
    { title: 'HTML notes', description: 'Week 1 reading.', courseId: webCourse._id, uploadedBy: webTeacher._id, externalUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTML', fileType: 'link' },
    { title: 'CSS layout guide', description: 'Flexbox and grid.', courseId: webCourse._id, uploadedBy: webTeacher._id, externalUrl: 'https://developer.mozilla.org/en-US/docs/Web/CSS', fileType: 'link' },
    { title: 'JavaScript intro', description: 'Variables and functions.', courseId: webCourse._id, uploadedBy: webTeacher._id, externalUrl: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript', fileType: 'link' },
    { title: 'Python tutorial', description: 'Official getting started guide.', courseId: pythonCourse._id, uploadedBy: pythonTeacher._id, externalUrl: 'https://docs.python.org/3/tutorial/', fileType: 'link' },
    { title: 'Practice problems', description: 'Short exercises for class.', courseId: pythonCourse._id, uploadedBy: pythonTeacher._id, externalUrl: 'https://docs.python.org/3/tutorial/introduction.html', fileType: 'link' },
    { title: 'Evening checklist', description: 'Setup for the evening section.', courseId: eveningCourse._id, uploadedBy: pythonTeacher._id, externalUrl: 'https://developer.mozilla.org/en-US/docs/Learn', fileType: 'link' },
    { title: 'Draft outline', description: 'Hidden while the course is a draft.', courseId: draftCourse._id, uploadedBy: webTeacher._id, externalUrl: 'https://www.mongodb.com/docs/manual/', fileType: 'link' },
    { title: 'Capstone brief', description: 'Still visible because the student is enrolled.', courseId: archivedCourse._id, uploadedBy: webTeacher._id, externalUrl: 'https://developer.mozilla.org/en-US/docs/Web', fileType: 'link' },
    { title: 'Forms guide', description: 'How a form is submitted.', courseId: webCourse._id, uploadedBy: webTeacher._id, externalUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element/form', fileType: 'link' },
    { title: 'Evening CSS', description: 'Layout notes for the evening section.', courseId: eveningCourse._id, uploadedBy: pythonTeacher._id, externalUrl: 'https://developer.mozilla.org/en-US/docs/Learn/CSS', fileType: 'link' },
    { title: 'Python lists', description: 'List methods used in class.', courseId: pythonCourse._id, uploadedBy: pythonTeacher._id, externalUrl: 'https://docs.python.org/3/tutorial/datastructures.html', fileType: 'link' },
    { title: 'Proposal outline', description: 'Archived course brief.', courseId: archivedCourse._id, uploadedBy: webTeacher._id, externalUrl: 'https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps', fileType: 'link' },
  ]);

  const assignments = await Assignment.create([
    { title: 'Homepage exercise', description: 'Build a one-page profile.', courseId: webCourse._id, createdBy: webTeacher._id, dueDate: daysFromNow(-2), maxMarks: 10, status: 'published' },
    { title: 'Responsive layout', description: 'Make the page work on a phone.', courseId: webCourse._id, createdBy: webTeacher._id, dueDate: daysFromNow(7), maxMarks: 20, status: 'published' },
    { title: 'Evening portfolio', description: 'A short page for the evening section.', courseId: eveningCourse._id, createdBy: pythonTeacher._id, dueDate: daysFromNow(-1), maxMarks: 10, status: 'published' },
    { title: 'Functions worksheet', description: 'Write five small functions.', courseId: pythonCourse._id, createdBy: pythonTeacher._id, dueDate: daysFromNow(-1), maxMarks: 10, status: 'published' },
    { title: 'Lists and loops', description: 'Practice lists with a short program.', courseId: pythonCourse._id, createdBy: pythonTeacher._id, dueDate: daysFromNow(5), maxMarks: 15, status: 'published' },
    { title: 'Draft quiz', description: 'Hidden while the assignment is a draft.', courseId: pythonCourse._id, createdBy: pythonTeacher._id, dueDate: daysFromNow(3), maxMarks: 5, status: 'draft' },
    { title: 'Capstone proposal', description: 'Visible to the enrolled student on an archived course.', courseId: archivedCourse._id, createdBy: webTeacher._id, dueDate: daysFromNow(10), maxMarks: 20, status: 'published' },
  ]);
  const [homepage, , eveningPortfolio, functionsWorksheet] = assignments;

  const submissions = [
    { assignmentId: homepage._id, studentId: morningStudents[0]._id, submissionText: 'Profile page with a heading and short bio.', submittedAt: daysFromNow(-3), isLate: false, marks: 9, feedback: 'Clear structure.', gradedBy: webTeacher._id, gradedAt: daysFromNow(-1) },
    { assignmentId: homepage._id, studentId: morningStudents[1]._id, submissionText: 'Page submitted after the deadline.', submittedAt: daysFromNow(-1), isLate: true, marks: 7, feedback: 'Late, but complete.', gradedBy: webTeacher._id, gradedAt: new Date() },
    { assignmentId: homepage._id, studentId: morningStudents[2]._id, submissionText: 'Waiting for a grade.', submittedAt: daysFromNow(-3), isLate: false },
    { assignmentId: eveningPortfolio._id, studentId: eveningStudents[1]._id, submissionText: 'Evening portfolio submitted on time.', submittedAt: daysFromNow(-2), isLate: false, marks: 8, feedback: 'Nice and short.', gradedBy: pythonTeacher._id, gradedAt: new Date() },
    { assignmentId: functionsWorksheet._id, studentId: pythonStudents[0]._id, submissionText: 'Five functions with sample calls.', submittedAt: daysFromNow(-2), isLate: false, marks: 8, feedback: 'Good naming.', gradedBy: pythonTeacher._id, gradedAt: new Date() },
    { assignmentId: functionsWorksheet._id, studentId: pythonStudents[1]._id, submissionText: 'Submitted on time.', submittedAt: daysFromNow(-2), isLate: false, marks: 10, feedback: 'All functions work.', gradedBy: pythonTeacher._id, gradedAt: new Date() },
    { assignmentId: functionsWorksheet._id, studentId: pythonStudents[2]._id, submissionText: 'Needs a grade.', submittedAt: new Date(), isLate: true },
    { assignmentId: homepage._id, studentId: morningStudents[3]._id, submissionText: 'Homepage submitted before the deadline.', submittedAt: daysFromNow(-3), isLate: false, marks: 8, feedback: 'Complete.', gradedBy: webTeacher._id, gradedAt: daysFromNow(-1) },
    { assignmentId: homepage._id, studentId: morningStudents[4]._id, submissionText: 'Homepage sent after the deadline.', submittedAt: daysFromNow(-1), isLate: true },
    { assignmentId: homepage._id, studentId: morningStudents[7]._id, submissionText: 'Homepage ready on time.', submittedAt: daysFromNow(-3), isLate: false },
    { assignmentId: eveningPortfolio._id, studentId: eveningStudents[2]._id, submissionText: 'Evening page sent late.', submittedAt: new Date(), isLate: true },
    { assignmentId: functionsWorksheet._id, studentId: pythonStudents[5]._id, submissionText: 'Functions submitted on time.', submittedAt: daysFromNow(-2), isLate: false, marks: 9, feedback: 'Clear examples.', gradedBy: pythonTeacher._id, gradedAt: new Date() },
    { assignmentId: functionsWorksheet._id, studentId: pythonStudents[6]._id, submissionText: 'Functions sent after the deadline.', submittedAt: new Date(), isLate: true },
  ];
  assertCap('submissions', submissions.length);
  await Submission.create(submissions);

  const attendance = [
    { courseId: webCourse._id, studentId: morningStudents[0]._id, sessionDate: sessionDate(0), status: 'present', markedBy: webTeacher._id },
    { courseId: webCourse._id, studentId: morningStudents[1]._id, sessionDate: sessionDate(0), status: 'absent', markedBy: webTeacher._id },
    { courseId: webCourse._id, studentId: morningStudents[2]._id, sessionDate: sessionDate(0), status: 'late', markedBy: webTeacher._id },
    { courseId: webCourse._id, studentId: morningStudents[0]._id, sessionDate: sessionDate(2), status: 'present', markedBy: webTeacher._id },
    { courseId: webCourse._id, studentId: morningStudents[1]._id, sessionDate: sessionDate(2), status: 'present', markedBy: webTeacher._id },
    { courseId: webCourse._id, studentId: morningStudents[2]._id, sessionDate: sessionDate(2), status: 'leave', markedBy: webTeacher._id },
    { courseId: eveningCourse._id, studentId: eveningStudents[0]._id, sessionDate: sessionDate(0), status: 'leave', markedBy: pythonTeacher._id },
    { courseId: eveningCourse._id, studentId: eveningStudents[1]._id, sessionDate: sessionDate(0), status: 'present', markedBy: pythonTeacher._id },
    { courseId: eveningCourse._id, studentId: eveningStudents[0]._id, sessionDate: sessionDate(1), status: 'present', markedBy: pythonTeacher._id },
    { courseId: eveningCourse._id, studentId: eveningStudents[1]._id, sessionDate: sessionDate(1), status: 'absent', markedBy: pythonTeacher._id },
    { courseId: pythonCourse._id, studentId: pythonStudents[0]._id, sessionDate: sessionDate(0), status: 'present', markedBy: pythonTeacher._id },
    { courseId: pythonCourse._id, studentId: pythonStudents[1]._id, sessionDate: sessionDate(0), status: 'late', markedBy: pythonTeacher._id },
    { courseId: pythonCourse._id, studentId: pythonStudents[2]._id, sessionDate: sessionDate(0), status: 'absent', markedBy: pythonTeacher._id },
    { courseId: pythonCourse._id, studentId: pythonStudents[3]._id, sessionDate: sessionDate(0), status: 'leave', markedBy: pythonTeacher._id },
    { courseId: pythonCourse._id, studentId: pythonStudents[0]._id, sessionDate: sessionDate(3), status: 'present', markedBy: pythonTeacher._id },
    { courseId: pythonCourse._id, studentId: pythonStudents[1]._id, sessionDate: sessionDate(3), status: 'present', markedBy: pythonTeacher._id },
    { courseId: pythonCourse._id, studentId: pythonStudents[2]._id, sessionDate: sessionDate(3), status: 'absent', markedBy: pythonTeacher._id },
    { courseId: pythonCourse._id, studentId: pythonStudents[3]._id, sessionDate: sessionDate(3), status: 'leave', markedBy: pythonTeacher._id },
    { courseId: archivedCourse._id, studentId: studentDocs[0]._id, sessionDate: sessionDate(0), status: 'present', markedBy: webTeacher._id },
    ...morningStudents.slice(3).map((student, index) => ({ courseId: webCourse._id, studentId: student._id, sessionDate: sessionDate(0), status: ['present', 'absent', 'late', 'leave', 'present'][index], markedBy: webTeacher._id })),
    ...eveningStudents.slice(2).map((student, index) => ({ courseId: eveningCourse._id, studentId: student._id, sessionDate: sessionDate(0), status: index === 0 ? 'late' : 'absent', markedBy: pythonTeacher._id })),
    ...pythonStudents.slice(4).map((student, index) => ({ courseId: pythonCourse._id, studentId: student._id, sessionDate: sessionDate(0), status: ['present', 'late', 'absent', 'leave'][index], markedBy: pythonTeacher._id })),
  ];
  assertCap('attendance', attendance.length);
  await Attendance.create(attendance);

  const teacherAttendance = [
    { courseId: webCourse._id, teacherId: webTeacher._id, sessionDate: sessionDate(0), status: 'present', markedBy: actorId || webTeacher._id },
    { courseId: webCourse._id, teacherId: webTeacher._id, sessionDate: sessionDate(2), status: 'present', markedBy: actorId || webTeacher._id },
    { courseId: webCourse._id, teacherId: webTeacher._id, sessionDate: sessionDate(1), status: 'absent', markedBy: actorId || webTeacher._id },
    { courseId: eveningCourse._id, teacherId: pythonTeacher._id, sessionDate: sessionDate(0), status: 'leave', markedBy: actorId || pythonTeacher._id },
    { courseId: eveningCourse._id, teacherId: pythonTeacher._id, sessionDate: sessionDate(1), status: 'present', markedBy: actorId || pythonTeacher._id },
    { courseId: pythonCourse._id, teacherId: pythonTeacher._id, sessionDate: sessionDate(0), status: 'present', markedBy: actorId || pythonTeacher._id },
    { courseId: pythonCourse._id, teacherId: pythonTeacher._id, sessionDate: sessionDate(3), status: 'absent', markedBy: actorId || pythonTeacher._id },
    { courseId: archivedCourse._id, teacherId: webTeacher._id, sessionDate: sessionDate(0), status: 'present', markedBy: actorId || webTeacher._id },
  ];
  assertCap('teacher attendance', teacherAttendance.length);
  await TeacherAttendance.create(teacherAttendance);

  await Announcement.create([
    { title: 'Class moved to lab 2', message: 'Tomorrow’s web class meets in lab 2.', courseId: webCourse._id, createdBy: webTeacher._id, publishedAt: daysFromNow(-1) },
    { title: 'Homepage exercise', message: 'Submit the profile page before the deadline.', courseId: webCourse._id, createdBy: webTeacher._id, publishedAt: daysFromNow(-3) },
    { title: 'Bring laptops', message: 'Python class will be hands-on.', courseId: pythonCourse._id, createdBy: pythonTeacher._id, publishedAt: daysFromNow(-1) },
    { title: 'Worksheet reminder', message: 'Functions worksheet is open for submission.', courseId: pythonCourse._id, createdBy: pythonTeacher._id, publishedAt: new Date() },
    { title: 'Evening room', message: 'Evening web class meets in lab 3.', courseId: eveningCourse._id, createdBy: pythonTeacher._id, publishedAt: new Date() },
    { title: 'Capstone is closed', message: 'This course is archived. You can still read this announcement.', courseId: archivedCourse._id, createdBy: webTeacher._id, publishedAt: daysFromNow(-2) },
    { title: 'Lab seats', message: 'Sit with your project partner.', courseId: webCourse._id, createdBy: webTeacher._id, publishedAt: new Date() },
    { title: 'Portfolio files', message: 'Export the evening page as a PDF.', courseId: eveningCourse._id, createdBy: pythonTeacher._id, publishedAt: new Date() },
    { title: 'Loop practice', message: 'Lists and loops opens after the functions worksheet.', courseId: pythonCourse._id, createdBy: pythonTeacher._id, publishedAt: new Date() },
    { title: 'Capstone partners', message: 'Iqra and Hina can still read the brief.', courseId: archivedCourse._id, createdBy: webTeacher._id, publishedAt: new Date() },
  ]);

  if (actorId) {
    const activity = [
      { actorId, action: 'TEACHER_CREATED', targetType: 'User', targetId: webTeacher._id, details: { role: 'teacher', name: 'Ayesha Khan', teacherId: 'TCH-01', email: 'teacher1@smit.test' } },
      { actorId, action: 'STUDENT_CREATED', targetType: 'User', targetId: studentDocs[0]._id, details: { role: 'student', name: 'Hina Ali', studentId: 'STU-01', email: 'student1@smit.test' } },
      { actorId, action: 'COURSE_CREATED', targetType: 'Course', targetId: webCourse._id, details: { courseTitle: 'Web Development', courseCode: 'SMIT-WD' } },
      { actorId, action: 'COURSE_CREATED', targetType: 'Course', targetId: eveningCourse._id, details: { courseTitle: 'Web Development', courseCode: 'SMIT-WD' } },
      { actorId, action: 'COURSE_STATUS_CHANGED', targetType: 'Course', targetId: archivedCourse._id, details: { courseTitle: 'Capstone Project', courseCode: 'SMIT-CAP', status: 'archived' } },
      { actorId, action: 'STUDENT_ENROLLED', targetType: 'Enrollment', targetId: webCourse._id, details: { courseTitle: 'Web Development', courseCode: 'SMIT-WD', count: morningStudents.length } },
      { actorId, action: 'ASSIGNMENT_CREATED', targetType: 'Assignment', targetId: homepage._id, details: { assignmentTitle: 'Homepage exercise', courseTitle: 'Web Development', courseCode: 'SMIT-WD' } },
      { actorId, action: 'SUBMISSION_GRADED', targetType: 'Submission', targetId: studentDocs[0]._id, details: { name: 'Hina Ali', studentId: 'STU-01', email: 'student1@smit.test', role: 'student', assignmentTitle: 'Homepage exercise', marks: 9, courseTitle: 'Web Development', courseCode: 'SMIT-WD' } },
      { actorId, action: 'ATTENDANCE_UPDATED', targetType: 'Attendance', targetId: eveningCourse._id, details: { audience: 'student', name: 'Sara Iqbal', studentId: 'STU-03', email: 'student3@smit.test', role: 'student', status: 'leave', courseTitle: 'Web Development', courseCode: 'SMIT-WD', sessionDate: sessionDate(0).toISOString().slice(0, 10) } },
      { actorId, action: 'ANNOUNCEMENT_PUBLISHED', targetType: 'Announcement', targetId: webCourse._id, details: { title: 'Class moved to lab 2', courseTitle: 'Web Development', courseCode: 'SMIT-WD' } },
    ];
    assertCap('activity', activity.length);
    await AuditLog.create(activity);
  }

  const counts = {
    users: teacherDocs.length + studentDocs.length,
    courses: courseDocs.length,
    enrollments: enrollmentDocs.length,
    materials: 12,
    assignments: assignments.length,
    submissions: submissions.length,
    attendance: attendance.length,
    teacherAttendance: teacherAttendance.length,
    announcements: 10,
  };
  Object.entries(counts).forEach(([label, count]) => {
    assertCap(label, count);
  });

  console.log('Sample data is ready. Each seeded group stays within 30 records.');
  console.log(`Teachers ${teachers.length}, students ${students.length}, courses ${counts.courses}, enrollments ${counts.enrollments}.`);
  console.log('Includes a second Web Development section, a draft course, an archived course, on-time, late, and missing submissions, and present, absent, late, and leave attendance.');
  console.log('Password for every sample account: SmitTest1');
  console.log('Teachers: teacher1@smit.test, teacher2@smit.test');
  console.log('Students: student1@smit.test through student18@smit.test');
  console.log('Use Login as Teacher or Login as Student to match the account.');
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

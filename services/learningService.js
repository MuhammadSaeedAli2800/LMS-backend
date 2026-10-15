const fs = require('fs');
const path = require('path');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const LearningMaterial = require('../models/LearningMaterial');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const Attendance = require('../models/Attendance');
const TeacherAttendance = require('../models/TeacherAttendance');
const Announcement = require('../models/Announcement');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { assertObjectId } = require('../utils/objectId');
const { recordAudit } = require('./auditService');
const { scheduleFields } = require('../utils/schedule');
const { fileTypeFor, removeStoredFile, storedFilePath } = require('../middleware/upload');
const {
  assertTeacherCanManage,
  assertTeacherCanView,
  assertStudentCanView,
  activeEnrollment,
} = require('./academicAccess');

function idOf(value) {
  return String(value && value._id ? value._id : value);
}

function flag(value) {
  return value === true || value === 'true' || value === 'on';
}

function presentMaterial(material) {
  return {
    id: idOf(material),
    title: material.title,
    description: material.description || '',
    courseId: idOf(material.courseId),
    fileType: material.fileType,
    externalUrl: material.externalUrl || null,
    originalName: material.originalName || null,
    downloadPath: material.storedName ? `/api/files/materials/${idOf(material)}` : null,
    createdAt: material.createdAt,
  };
}

function presentAssignment(assignment, extra = {}) {
  return {
    id: idOf(assignment),
    title: assignment.title,
    assignmentNumber: assignment.assignmentNumber || null,
    description: assignment.description || '',
    courseId: idOf(assignment.courseId),
    courseTitle: assignment.courseId && assignment.courseId.title ? assignment.courseId.title : extra.courseTitle,
    courseCode: assignment.courseId && assignment.courseId.courseCode ? assignment.courseId.courseCode : extra.courseCode,
    dueDate: assignment.dueDate,
    maxMarks: assignment.maxMarks,
    status: assignment.status,
    allowResubmission: assignment.allowResubmission,
    allowLate: assignment.allowLate !== false,
    originalName: assignment.originalName || null,
    downloadPath: assignment.storedName ? `/api/files/assignments/${idOf(assignment)}` : null,
    createdAt: assignment.createdAt,
    ...extra,
  };
}

function submissionStatus(submission, viewer = 'teacher') {
  if (!submission) return 'Not Submitted';
  const gradeVisible = viewer !== 'student' || submission.released !== false;
  if (submission.gradedAt && gradeVisible) return 'Graded';
  if (submission.isLate) return 'Late';
  return 'Submitted';
}

function presentSubmission(submission, viewer) {
  const graded = Boolean(submission.gradedAt);
  const showMarks = viewer === 'teacher' || (graded && submission.released !== false);
  return {
    id: idOf(submission),
    assignmentId: idOf(submission.assignmentId),
    studentId: idOf(submission.studentId),
    studentName: submission.studentId && submission.studentId.name ? submission.studentId.name : undefined,
    studentCode: submission.studentId && submission.studentId.studentId ? submission.studentId.studentId : undefined,
    submissionText: submission.submissionText || '',
    originalName: submission.originalName || null,
    downloadPath: submission.storedName ? `/api/files/submissions/${idOf(submission)}` : null,
    submittedAt: submission.submittedAt,
    isLate: submission.isLate,
    status: submissionStatus(submission),
    marks: showMarks ? submission.marks : null,
    feedback: showMarks ? submission.feedback || '' : '',
    gradedAt: showMarks ? submission.gradedAt : null,
    released: graded ? submission.released !== false : false,
  };
}

function fileFields(file, externalUrl) {
  if (!file) {
    return { storedName: '', originalName: '', mimeType: '', fileType: externalUrl ? 'link' : 'document' };
  }
  return {
    storedName: file.filename,
    originalName: file.originalname,
    mimeType: file.mimetype,
    fileType: fileTypeFor(file.mimetype),
  };
}

function isHttpUrl(value) {
  return /^https?:\/\/\S+$/i.test(value);
}

function parseSessionDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
    throw new AppError('Session date must use YYYY-MM-DD.', 400);
  }
  return new Date(`${value}T00:00:00.000Z`);
}

async function teacherDashboard(user) {
  const courses = await Course.find({ teacherIds: user._id }).select('title courseCode status');
  const courseIds = courses.map((course) => course._id);
  const courseMap = new Map(courses.map((course) => [String(course._id), course]));
  const [studentIds, assignments, pending, recent] = await Promise.all([
    Enrollment.distinct('studentId', { courseId: { $in: courseIds }, status: 'active' }),
    Assignment.find({ courseId: { $in: courseIds }, status: 'published' }).sort({ dueDate: 1 }),
    Submission.countDocuments({
      assignmentId: { $in: await Assignment.find({ courseId: { $in: courseIds } }).distinct('_id') },
      gradedAt: null,
    }),
    Submission.find({ assignmentId: { $in: await Assignment.find({ courseId: { $in: courseIds } }).distinct('_id') } })
      .sort({ submittedAt: -1 })
      .limit(5)
      .populate('studentId', 'name')
      .populate('assignmentId', 'title'),
  ]);
  return {
    assignedCourses: courses.length,
    totalStudents: studentIds.length,
    pendingGrading: pending,
    courses: courses.map((course) => ({
      id: idOf(course),
      title: course.title,
      courseCode: course.courseCode,
      status: course.status,
    })),
    upcomingDeadlines: assignments.map((assignment) => {
      const course = courseMap.get(String(assignment.courseId));
      return {
        id: idOf(assignment),
        title: assignment.title,
        assignmentNumber: assignment.assignmentNumber || null,
        dueDate: assignment.dueDate,
        courseId: idOf(assignment.courseId),
        courseTitle: course?.title || '',
      };
    }),
    recentSubmissions: recent.map((submission) => ({
      id: idOf(submission),
      studentName: submission.studentId?.name || 'Student',
      assignmentTitle: submission.assignmentId?.title || 'Assignment',
      submittedAt: submission.submittedAt,
      status: submissionStatus(submission),
    })),
  };
}

async function teacherCourses(user) {
  const courses = await Course.find({ teacherIds: user._id }).sort({ title: 1 });
  const counts = await Enrollment.aggregate([
    { $match: { courseId: { $in: courses.map((course) => course._id) }, status: 'active' } },
    { $group: { _id: '$courseId', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((row) => [String(row._id), row.count]));
  const enrollments = await Enrollment.find({ courseId: { $in: courses.map((course) => course._id) }, status: 'active' }).populate('studentId', 'name email studentId');
  const studentsByCourse = new Map();
  enrollments.forEach((enrollment) => {
    if (!enrollment.studentId) return;
    const key = idOf(enrollment.courseId);
    const list = studentsByCourse.get(key) || [];
    list.push({
      id: idOf(enrollment.studentId),
      name: enrollment.studentId.name,
      email: enrollment.studentId.email,
      studentId: enrollment.studentId.studentId,
    });
    studentsByCourse.set(key, list);
  });
  return courses.map((course) => ({
    id: idOf(course),
    title: course.title,
    courseCode: course.courseCode,
    description: course.description,
    academicTerm: course.academicTerm,
    ...scheduleFields(course),
    department: course.department,
    status: course.status,
    enrolledCount: countMap.get(idOf(course)) || 0,
    students: (studentsByCourse.get(idOf(course)) || []).sort((left, right) => left.name.localeCompare(right.name)),
  }));
}

async function courseStudents(user, courseId) {
  await assertTeacherCanView(user, courseId);
  const enrollments = await Enrollment.find({ courseId, status: 'active' }).populate('studentId', 'name email studentId accountStatus');
  return enrollments
    .filter((item) => item.studentId)
    .map((item) => ({
      id: idOf(item.studentId),
      name: item.studentId.name,
      email: item.studentId.email,
      studentId: item.studentId.studentId,
      accountStatus: item.studentId.accountStatus,
    }));
}

async function addMaterial(user, courseId, input, file) {
  const course = await assertTeacherCanManage(user, courseId);
  const externalUrl = String(input.externalUrl || '').trim();
  if (!file && !externalUrl) throw new AppError('Add a file or an external link.', 400);
  if (externalUrl && !isHttpUrl(externalUrl)) throw new AppError('External link must start with http:// or https://.', 400);
  const material = await LearningMaterial.create({
    title: input.title,
    description: input.description || '',
    courseId: course._id,
    uploadedBy: user._id,
    externalUrl,
    ...fileFields(file, externalUrl),
  });
  await recordAudit({
    actorId: user._id,
    action: 'MATERIAL_ADDED',
    targetType: 'LearningMaterial',
    targetId: material._id,
    details: { title: material.title, courseTitle: course.title, courseCode: course.courseCode },
  });
  return presentMaterial(material);
}

async function listMaterialsForTeacher(user, courseId) {
  await assertTeacherCanView(user, courseId);
  const materials = await LearningMaterial.find({ courseId }).sort({ createdAt: -1 });
  return materials.map(presentMaterial);
}

async function createAssignment(user, courseId, input, file) {
  const course = await assertTeacherCanManage(user, courseId);
  const dueDate = new Date(input.dueDate);
  if (Number.isNaN(dueDate.getTime())) throw new AppError('A valid deadline is required.', 400);
  const assignment = await Assignment.create({
    title: input.title,
    assignmentNumber: input.assignmentNumber || null,
    description: input.description || '',
    courseId: course._id,
    createdBy: user._id,
    dueDate,
    maxMarks: Number(input.maxMarks),
    status: input.status === 'closed' ? 'closed' : 'published',
    allowResubmission: flag(input.allowResubmission),
    allowLate: input.allowLate === undefined ? true : flag(input.allowLate),
    ...fileFields(file),
  });
  await recordAudit({
    actorId: user._id,
    action: 'ASSIGNMENT_CREATED',
    targetType: 'Assignment',
    targetId: assignment._id,
    details: { title: assignment.title, courseTitle: course.title, courseCode: course.courseCode },
  });
  return presentAssignment(assignment);
}

async function listAssignmentsForTeacher(user, courseId) {
  await assertTeacherCanView(user, courseId);
  const assignments = await Assignment.find({ courseId }).sort({ dueDate: 1 });
  return assignments.map((assignment) => presentAssignment(assignment));
}

async function listSubmissions(user, assignmentId) {
  assertObjectId(assignmentId, 'assignment id');
  const assignment = await Assignment.findById(assignmentId);
  if (!assignment) throw new AppError('Assignment not found.', 404);
  await assertTeacherCanView(user, idOf(assignment.courseId));
  const submissions = await Submission.find({ assignmentId }).populate('studentId', 'name email studentId').sort({ submittedAt: -1 });
  return {
    assignment: presentAssignment(assignment),
    submissions: submissions.map((submission) => presentSubmission(submission, 'teacher')),
  };
}

async function gradeSubmission(user, submissionId, input) {
  assertObjectId(submissionId, 'submission id');
  const submission = await Submission.findById(submissionId);
  if (!submission) throw new AppError('Submission not found.', 404);
  const assignment = await Assignment.findById(submission.assignmentId);
  if (!assignment) throw new AppError('Assignment not found.', 404);
  await assertTeacherCanManage(user, idOf(assignment.courseId));
  const marks = Number(input.marks);
  if (!Number.isFinite(marks) || marks < 0 || marks > assignment.maxMarks) {
    throw new AppError(`Marks must be between 0 and ${assignment.maxMarks}.`, 400);
  }
  submission.marks = marks;
  submission.feedback = String(input.feedback || '').trim();
  submission.gradedBy = user._id;
  submission.gradedAt = new Date();
  submission.released = input.release === undefined ? true : flag(input.release);
  await submission.save();
  const gradedStudent = await User.findById(submission.studentId).select('name email studentId');
  const gradedCourse = await Course.findById(assignment.courseId).select('title courseCode');
  await recordAudit({
    actorId: user._id,
    action: 'SUBMISSION_GRADED',
    targetType: 'Submission',
    targetId: submission._id,
    details: {
      name: gradedStudent?.name || '',
      email: gradedStudent?.email || '',
      role: 'student',
      studentId: gradedStudent?.studentId || '',
      assignmentTitle: assignment.title,
      courseTitle: gradedCourse?.title || '',
      courseCode: gradedCourse?.courseCode || '',
      marks,
    },
  });
  return presentSubmission(submission, 'teacher');
}

async function saveAttendance(user, courseId, input) {
  const course = await assertTeacherCanManage(user, courseId);
  const sessionDate = parseSessionDate(input.sessionDate);
  const records = Array.isArray(input.records) ? input.records : [];
  if (records.length === 0) throw new AppError('Add at least one attendance record.', 400);
  const enrollments = await Enrollment.find({ courseId: course._id, status: 'active' }).select('studentId');
  const allowed = new Set(enrollments.map((item) => idOf(item.studentId)));
  const saved = [];
  for (const record of records) {
    const studentId = String(record.studentId || '');
    assertObjectId(studentId, 'student id');
    if (!allowed.has(studentId)) throw new AppError('Attendance includes a student who is not enrolled.', 400);
    if (!['present', 'absent', 'late'].includes(record.status)) {
      throw new AppError('Attendance status must be present, absent, or late.', 400);
    }
    const doc = await Attendance.findOneAndUpdate(
      { courseId: course._id, studentId, sessionDate },
      { status: record.status, markedBy: user._id },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    saved.push(doc);
  }
  await recordAudit({
    actorId: user._id,
    action: 'ATTENDANCE_SAVED',
    targetType: 'Course',
    targetId: course._id,
    details: { courseTitle: course.title, courseCode: course.courseCode, sessionDate: input.sessionDate, count: saved.length },
  });
  return saved.map((item) => ({
    id: idOf(item),
    studentId: idOf(item.studentId),
    sessionDate: item.sessionDate,
    status: item.status,
  }));
}

async function attendanceHistory(user, courseId, sessionDate) {
  await assertTeacherCanView(user, courseId);
  const filter = { courseId };
  if (sessionDate) filter.sessionDate = parseSessionDate(sessionDate);
  const rows = await Attendance.find(filter).sort({ sessionDate: -1 }).populate('studentId', 'name studentId');
  return rows.map((row) => ({
    id: idOf(row),
    studentId: idOf(row.studentId),
    studentName: row.studentId?.name || '',
    studentNumber: row.studentId?.studentId || '',
    sessionDate: row.sessionDate,
    status: row.status,
  }));
}

function announcementAudienceLabel(item, courseTitle) {
  const title = courseTitle || (item.courseId && item.courseId.title ? item.courseId.title : '');
  if (title) return title;
  if (item.audience === 'general') return 'General';
  if (item.audience === 'teachers') return 'All teachers';
  return 'All students';
}

function presentPublishedAnnouncement(item, courseTitle) {
  const author = item.createdBy && item.createdBy.name ? item.createdBy : null;
  const course = item.courseId && item.courseId.title ? item.courseId : null;
  return {
    id: idOf(item),
    title: item.title,
    message: item.message,
    courseId: course ? idOf(course) : (item.courseId ? idOf(item.courseId) : ''),
    courseTitle: announcementAudienceLabel(item, courseTitle || (course ? course.title : '')),
    audience: item.audience || '',
    authorName: author ? author.name : '',
    publishedAt: item.publishedAt,
  };
}

async function publishAnnouncement(user, courseId, input) {
  const course = await assertTeacherCanManage(user, courseId);
  const announcement = await Announcement.create({
    title: input.title,
    message: input.message,
    courseId: course._id,
    createdBy: user._id,
    publishedAt: new Date(),
  });
  await recordAudit({
    actorId: user._id,
    action: 'ANNOUNCEMENT_PUBLISHED',
    targetType: 'Announcement',
    targetId: announcement._id,
    details: { title: announcement.title, courseTitle: course.title, courseCode: course.courseCode },
  });
  return {
    id: idOf(announcement),
    title: announcement.title,
    message: announcement.message,
    courseId: idOf(course),
    publishedAt: announcement.publishedAt,
  };
}

async function administratorIds() {
  const admins = await User.find({ role: 'admin' }).select('_id');
  return admins.map((admin) => admin._id);
}

async function assertAnnouncementIsEditableByTeacher(announcement) {
  const author = await User.findById(announcement.createdBy).select('role');
  if (author && author.role === 'admin') {
    throw new AppError('Administrator announcements cannot be changed here.', 403);
  }
}

async function listAnnouncementsForTeacher(user, courseId) {
  await assertTeacherCanView(user, courseId);
  const items = await Announcement.find({
    courseId,
    createdBy: { $nin: await administratorIds() },
  }).sort({ publishedAt: -1 });
  return items.map((item) => ({
    id: idOf(item),
    title: item.title,
    message: item.message,
    courseId: idOf(item.courseId),
    publishedAt: item.publishedAt,
  }));
}

async function teacherAdminAnnouncements(user) {
  const courses = await Course.find({ teacherIds: user._id }).select('title');
  const courseIds = courses.map((course) => course._id);
  const filter = {
    createdBy: { $in: await administratorIds() },
    $or: [
      { courseId: null, audience: { $in: ['general', 'teachers'] } },
      ...(courseIds.length ? [{ courseId: { $in: courseIds } }] : []),
    ],
  };
  const items = await Announcement.find(filter)
    .sort({ publishedAt: -1 })
    .limit(50)
    .populate('createdBy', 'name')
    .populate('courseId', 'title');
  const titles = new Map(courses.map((course) => [idOf(course), course.title]));
  return items.map((item) => presentPublishedAnnouncement(item, titles.get(idOf(item.courseId)) || ''));
}

async function studentDashboard(user) {
  const enrollments = await Enrollment.find({ studentId: user._id, status: 'active' }).populate('courseId');
  const courses = enrollments.map((item) => item.courseId).filter((course) => course && course.status !== 'draft');
  const courseIds = courses.map((course) => course._id);
  const [assignments, materials, grades, attendance, announcements] = await Promise.all([
    Assignment.find({ courseId: { $in: courseIds }, status: 'published', dueDate: { $gt: new Date() } }).sort({ dueDate: 1 }).populate('courseId', 'title'),
    LearningMaterial.find({ courseId: { $in: courseIds } }).sort({ createdAt: -1 }).limit(5),
    Submission.find({ studentId: user._id, gradedAt: { $ne: null }, released: { $ne: false } }).sort({ gradedAt: -1 }).limit(5).populate('assignmentId', 'title maxMarks courseId'),
    Attendance.find({ studentId: user._id, courseId: { $in: courseIds } }),
    Announcement.find({ courseId: { $in: courseIds } }).sort({ publishedAt: -1 }).limit(5).populate('courseId', 'title'),
  ]);
  const summary = { present: 0, absent: 0, late: 0, leave: 0, total: attendance.length };
  attendance.forEach((row) => {
    if (summary[row.status] !== undefined) summary[row.status] += 1;
  });
  return {
    courses: courses.map((course) => ({
      id: idOf(course),
      title: course.title,
      courseCode: course.courseCode,
      academicTerm: course.academicTerm,
      ...scheduleFields(course),
    })),
    upcomingAssignments: assignments.map((assignment) => ({
      id: idOf(assignment),
      title: assignment.title,
      dueDate: assignment.dueDate,
      courseTitle: assignment.courseId?.title || '',
    })),
    recentMaterials: materials.map(presentMaterial),
    recentGrades: grades.map((submission) => ({
      id: idOf(submission),
      title: submission.assignmentId?.title || 'Assignment',
      marks: submission.marks,
      maxMarks: submission.assignmentId?.maxMarks,
      feedback: submission.feedback,
    })),
    attendance: summary,
    announcements: announcements.map((item) => ({
      id: idOf(item),
      title: item.title,
      message: item.message,
      courseTitle: item.courseId?.title || '',
      publishedAt: item.publishedAt,
    })),
  };
}

async function studentCourses(user) {
  const enrollments = await Enrollment.find({ studentId: user._id, status: 'active' }).populate({
    path: 'courseId',
    populate: { path: 'teacherIds', select: 'name' },
  });
  return enrollments
    .map((item) => item.courseId)
    .filter((course) => course && course.status !== 'draft')
    .map((course) => ({
      id: idOf(course),
      title: course.title,
      courseCode: course.courseCode,
      description: course.description,
      academicTerm: course.academicTerm,
      ...scheduleFields(course),
      department: course.department,
      status: course.status,
      teachers: (course.teacherIds || []).map((teacher) => ({ id: idOf(teacher), name: teacher.name })),
    }));
}

async function studentCourseDetail(user, courseId) {
  const { course } = await assertStudentCanView(user, courseId);
  const populated = await Course.findById(course._id).populate('teacherIds', 'name email');
  const [materials, assignments, announcements, submissions] = await Promise.all([
    LearningMaterial.find({ courseId }).sort({ createdAt: -1 }),
    Assignment.find({ courseId, status: { $in: ['published', 'closed'] } }).sort({ dueDate: 1 }),
    Announcement.find({ courseId }).sort({ publishedAt: -1 }).populate('createdBy', 'name'),
    Submission.find({ studentId: user._id, assignmentId: { $in: await Assignment.find({ courseId }).distinct('_id') } }),
  ]);
  const submissionMap = new Map(submissions.map((item) => [idOf(item.assignmentId), item]));
  return {
    id: idOf(populated),
    title: populated.title,
    courseCode: populated.courseCode,
    description: populated.description,
    academicTerm: populated.academicTerm,
    ...scheduleFields(populated),
    department: populated.department,
    status: populated.status,
    teachers: (populated.teacherIds || []).map((teacher) => ({ id: idOf(teacher), name: teacher.name, email: teacher.email })),
    materials: materials.map(presentMaterial),
    assignments: assignments.map((assignment) => {
      const submission = submissionMap.get(idOf(assignment));
      return presentAssignment(assignment, { submissionStatus: submissionStatus(submission, 'student') });
    }),
    announcements: announcements.map((item) => presentPublishedAnnouncement(item, populated.title)),
  };
}

async function studentAssignments(user) {
  const enrollments = await Enrollment.find({ studentId: user._id, status: 'active' }).select('courseId');
  const courseIds = enrollments.map((item) => item.courseId);
  const visibleCourses = await Course.find({ _id: { $in: courseIds }, status: { $ne: 'draft' } }).select('_id title courseCode days startTime endTime');
  const assignments = await Assignment.find({ courseId: { $in: visibleCourses.map((course) => course._id) }, status: { $in: ['published', 'closed'] } }).sort({ dueDate: 1 });
  const submissions = await Submission.find({ studentId: user._id, assignmentId: { $in: assignments.map((item) => item._id) } });
  const submissionMap = new Map(submissions.map((item) => [idOf(item.assignmentId), item]));
  const courseMap = new Map(visibleCourses.map((course) => [idOf(course), course]));
  return assignments.map((assignment) => {
    const course = courseMap.get(idOf(assignment.courseId));
    const submission = submissionMap.get(idOf(assignment));
    return presentAssignment(assignment, {
      courseTitle: course?.title || '',
      courseCode: course?.courseCode || '',
      days: course?.days || [],
      startTime: course?.startTime || '',
      endTime: course?.endTime || '',
      submissionStatus: submissionStatus(submission, 'student'),
      submission: submission ? presentSubmission(submission, 'student') : null,
    });
  });
}

async function submitAssignment(user, assignmentId, input, file) {
  assertObjectId(assignmentId, 'assignment id');
  const assignment = await Assignment.findById(assignmentId);
  if (!assignment || !['published', 'closed'].includes(assignment.status)) throw new AppError('Assignment not found.', 404);
  if (assignment.status === 'closed') throw new AppError('This assignment is closed.', 403);
  const { course } = await assertStudentCanView(user, idOf(assignment.courseId));
  if (course.status === 'archived') throw new AppError('This course is archived.', 403);
  const text = String(input.submissionText || '').trim();
  if (!text && !file) throw new AppError('Add a written response or a file.', 400);
  const existing = await Submission.findOne({ assignmentId, studentId: user._id });
  if (existing && !assignment.allowResubmission) {
    throw new AppError('You have already submitted this assignment.', 409);
  }
  if (existing && existing.gradedAt) {
    throw new AppError('This submission has already been graded.', 409);
  }
  const submittedAt = new Date();
  const isLate = submittedAt.getTime() > new Date(assignment.dueDate).getTime();
  if (isLate && assignment.allowLate === false) throw new AppError('Late submissions are not accepted for this assignment.', 400);
  const files = fileFields(file);
  if (existing) {
    if (file && existing.storedName) removeStoredFile(existing.storedName);
    existing.submissionText = text || existing.submissionText;
    if (file) Object.assign(existing, files);
    existing.submittedAt = submittedAt;
    existing.isLate = isLate;
    await existing.save();
    return presentSubmission(existing, 'student');
  }
  const submission = await Submission.create({
    assignmentId,
    studentId: user._id,
    submissionText: text,
    submittedAt,
    isLate,
    ...files,
  });
  return presentSubmission(submission, 'student');
}

async function studentGrades(user) {
  const submissions = await Submission.find({ studentId: user._id, gradedAt: { $ne: null } })
    .sort({ gradedAt: -1 })
    .populate({ path: 'assignmentId', select: 'title maxMarks courseId', populate: { path: 'courseId', select: 'title courseCode' } });
  return submissions.filter((submission) => submission.released !== false).map((submission) => ({
    id: idOf(submission),
    assignmentId: submission.assignmentId ? idOf(submission.assignmentId) : null,
    title: submission.assignmentId?.title || 'Assignment',
    courseId: submission.assignmentId?.courseId ? idOf(submission.assignmentId.courseId) : null,
    courseTitle: submission.assignmentId?.courseId?.title || '',
    courseCode: submission.assignmentId?.courseId?.courseCode || '',
    marks: submission.marks,
    maxMarks: submission.assignmentId?.maxMarks,
    feedback: submission.feedback,
    gradedAt: submission.gradedAt,
  }));
}

async function studentAttendance(user) {
  const enrollments = await Enrollment.find({ studentId: user._id, status: 'active' }).populate('courseId', 'title courseCode status days startTime endTime');
  const courses = enrollments
    .map((enrollment) => enrollment.courseId)
    .filter((course) => course && course.status !== 'draft');
  const rows = await Attendance.find({
    studentId: user._id,
    courseId: { $in: courses.map((course) => course._id) },
  }).sort({ sessionDate: -1 });
  const byCourse = new Map();
  rows.forEach((row) => {
    const key = String(row.courseId);
    const list = byCourse.get(key) || [];
    list.push(row);
    byCourse.set(key, list);
  });
  return courses.map((course) => {
    const records = byCourse.get(String(course._id)) || [];
    const counts = { present: 0, absent: 0, late: 0, leave: 0 };
    const dates = new Set();
    records.forEach((row) => {
      dates.add(new Date(row.sessionDate).toISOString().slice(0, 10));
      if (counts[row.status] !== undefined) counts[row.status] += 1;
    });
    return {
      courseId: idOf(course),
      title: course.title,
      courseCode: course.courseCode,
      status: course.status,
      ...scheduleFields(course),
      classes: dates.size,
      ...counts,
      records: records.map((row) => ({
        id: idOf(row),
        sessionDate: row.sessionDate,
        status: row.status,
      })),
    };
  }).sort((left, right) => left.title.localeCompare(right.title) || left.startTime.localeCompare(right.startTime));
}

async function teacherOwnAttendance(user) {
  const courses = await Course.find({ teacherIds: user._id, status: { $ne: 'draft' } }).select('title courseCode status days startTime endTime');
  const rows = await TeacherAttendance.find({
    teacherId: user._id,
    courseId: { $in: courses.map((course) => course._id) },
  }).sort({ sessionDate: -1 });
  const byCourse = new Map();
  rows.forEach((row) => {
    const key = String(row.courseId);
    const list = byCourse.get(key) || [];
    list.push(row);
    byCourse.set(key, list);
  });
  return courses.map((course) => {
    const records = byCourse.get(String(course._id)) || [];
    const counts = { present: 0, absent: 0, leave: 0 };
    const dates = new Set();
    records.forEach((row) => {
      dates.add(new Date(row.sessionDate).toISOString().slice(0, 10));
      if (counts[row.status] !== undefined) counts[row.status] += 1;
    });
    return {
      courseId: idOf(course),
      title: course.title,
      courseCode: course.courseCode,
      status: course.status,
      ...scheduleFields(course),
      classes: dates.size,
      ...counts,
      records: records.map((row) => ({
        id: idOf(row),
        sessionDate: row.sessionDate,
        status: row.status,
      })),
    };
  }).sort((left, right) => left.title.localeCompare(right.title) || String(left.startTime).localeCompare(String(right.startTime)));
}

async function studentMaterials(user) {
  const enrollments = await Enrollment.find({ studentId: user._id, status: 'active' }).populate('courseId', 'title courseCode status days startTime endTime');
  const courses = enrollments
    .map((enrollment) => enrollment.courseId)
    .filter((course) => course && course.status !== 'draft');
  const materials = await LearningMaterial.find({ courseId: { $in: courses.map((course) => course._id) } }).sort({ createdAt: -1 });
  const byCourse = new Map();
  materials.forEach((material) => {
    const key = String(material.courseId);
    const list = byCourse.get(key) || [];
    list.push(material);
    byCourse.set(key, list);
  });
  return courses.map((course) => ({
    courseId: idOf(course),
    title: course.title,
    courseCode: course.courseCode,
    status: course.status,
    ...scheduleFields(course),
    materials: (byCourse.get(String(course._id)) || []).map(presentMaterial),
  })).sort((left, right) => left.title.localeCompare(right.title) || String(left.startTime).localeCompare(String(right.startTime)));
}

async function studentAnnouncements(user) {
  const enrollments = await Enrollment.find({ studentId: user._id, status: 'active' }).select('courseId');
  const courses = await Course.find({ _id: { $in: enrollments.map((item) => item.courseId) }, status: { $ne: 'draft' } }).select('title');
  const courseIds = courses.map((course) => course._id);
  const schoolWide = { courseId: null, audience: { $ne: 'teachers' } };
  const filter = courseIds.length
    ? { $or: [{ courseId: { $in: courseIds } }, schoolWide] }
    : schoolWide;
  const items = await Announcement.find(filter)
    .sort({ publishedAt: -1 })
    .limit(50)
    .populate('createdBy', 'name')
    .populate('courseId', 'title');
  const titles = new Map(courses.map((course) => [idOf(course), course.title]));
  return items.map((item) => presentPublishedAnnouncement(item, titles.get(idOf(item.courseId)) || ''));
}

async function listAnnouncementsForAdmin() {
  const items = await Announcement.find()
    .sort({ publishedAt: -1 })
    .limit(100)
    .populate('createdBy', 'name')
    .populate('courseId', 'title courseCode');
  return items.map((item) => presentPublishedAnnouncement(item));
}

async function publishAdminAnnouncement(user, input) {
  let course = null;
  if (input.courseId) {
    course = await Course.findById(input.courseId);
    if (!course) throw new AppError('Course not found.', 404);
  }
  const audience = ['general', 'students', 'teachers'].includes(input.audience) ? input.audience : 'students';
  const announcement = await Announcement.create({
    title: input.title,
    message: input.message,
    ...(course ? { courseId: course._id } : { audience }),
    createdBy: user._id,
    publishedAt: new Date(),
  });
  await recordAudit({
    actorId: user._id,
    action: 'ANNOUNCEMENT_PUBLISHED',
    targetType: 'Announcement',
    targetId: announcement._id,
    details: {
      title: announcement.title,
      courseTitle: course ? course.title : announcementAudienceLabel(announcement),
      courseCode: course ? course.courseCode : '',
    },
  });
  const stored = await Announcement.findById(announcement._id).populate('createdBy', 'name').populate('courseId', 'title courseCode');
  return presentPublishedAnnouncement(stored);
}

async function deleteAdminAnnouncement(user, announcementId) {
  assertObjectId(announcementId, 'announcement id');
  const announcement = await Announcement.findById(announcementId);
  if (!announcement) throw new AppError('Announcement not found.', 404);
  await announcement.deleteOne();
  await recordAudit({
    actorId: user._id,
    action: 'ANNOUNCEMENT_DELETED',
    targetType: 'Announcement',
    targetId: announcement._id,
    details: { title: announcement.title },
  });
  return { id: idOf(announcement) };
}

async function updateStudentProfile(user, name) {
  const nextName = String(name || '').trim();
  if (nextName.length < 2 || nextName.length > 120) {
    throw new AppError('Name must be between 2 and 120 characters.', 400);
  }
  const stored = await User.findById(user._id);
  stored.name = nextName;
  await stored.save();
  return stored;
}

async function sendOwnedFile(res, kind, id, user) {
  assertObjectId(id, 'file id');
  let record;
  let courseId;
  if (kind === 'materials') {
    record = await LearningMaterial.findById(id);
    courseId = record && record.courseId;
  } else if (kind === 'assignments') {
    record = await Assignment.findById(id);
    courseId = record && record.courseId;
  } else {
    record = await Submission.findById(id);
    const assignment = record && await Assignment.findById(record.assignmentId);
    courseId = assignment && assignment.courseId;
    if (record && user.role === 'student' && idOf(record.studentId) !== idOf(user._id)) {
      throw new AppError('You do not have access to this file.', 403);
    }
  }
  if (!record || !record.storedName) throw new AppError('File not found.', 404);
  if (user.role === 'admin') {
    // Admins may download files for courses they manage.
  } else if (user.role === 'teacher') {
    await assertTeacherCanView(user, idOf(courseId));
  } else if (user.role === 'student') {
    await assertStudentCanView(user, idOf(courseId));
  } else {
    throw new AppError('You do not have access to this file.', 403);
  }
  const fullPath = storedFilePath(record.storedName);
  if (!fs.existsSync(fullPath)) throw new AppError('File not found.', 404);
  res.download(fullPath, record.originalName || path.basename(fullPath));
}

async function ownedCourses(user) {
  return Course.find({ teacherIds: user._id }).sort({ title: 1, startTime: 1 });
}

async function updateMaterial(user, materialId, input, file) {
  assertObjectId(materialId, 'material id');
  const material = await LearningMaterial.findById(materialId);
  if (!material) throw new AppError('Material not found.', 404);
  const course = await assertTeacherCanManage(user, idOf(material.courseId));
  if (input.title) material.title = input.title;
  if (input.description !== undefined) material.description = input.description || '';
  if (input.externalUrl !== undefined) {
    const externalUrl = String(input.externalUrl || '').trim();
    if (externalUrl && !isHttpUrl(externalUrl)) throw new AppError('External link must start with http:// or https://.', 400);
    material.externalUrl = externalUrl;
  }
  if (!file && !material.storedName && !material.externalUrl) throw new AppError('Add a file or an external link.', 400);
  if (file) {
    if (material.storedName) removeStoredFile(material.storedName);
    Object.assign(material, fileFields(file, material.externalUrl));
  }
  await material.save();
  await recordAudit({
    actorId: user._id,
    action: 'MATERIAL_UPDATED',
    targetType: 'LearningMaterial',
    targetId: material._id,
    details: { title: material.title, courseTitle: course.title, courseCode: course.courseCode },
  });
  return presentMaterial(material);
}

async function deleteMaterial(user, materialId) {
  assertObjectId(materialId, 'material id');
  const material = await LearningMaterial.findById(materialId);
  if (!material) throw new AppError('Material not found.', 404);
  await assertTeacherCanManage(user, idOf(material.courseId));
  if (material.storedName) removeStoredFile(material.storedName);
  await material.deleteOne();
  return { id: idOf(material) };
}

async function updateAssignment(user, assignmentId, input, file) {
  assertObjectId(assignmentId, 'assignment id');
  const assignment = await Assignment.findById(assignmentId);
  if (!assignment) throw new AppError('Assignment not found.', 404);
  await assertTeacherCanManage(user, idOf(assignment.courseId));
  if (input.title) assignment.title = input.title;
  if (input.assignmentNumber !== undefined) assignment.assignmentNumber = input.assignmentNumber;
  if (input.description !== undefined) assignment.description = input.description || '';
  let dueChanged = false;
  if (input.dueDate) {
    const dueDate = new Date(input.dueDate);
    if (Number.isNaN(dueDate.getTime())) throw new AppError('A valid deadline is required.', 400);
    dueChanged = dueDate.getTime() !== new Date(assignment.dueDate).getTime();
    assignment.dueDate = dueDate;
  }
  if (input.maxMarks !== undefined) assignment.maxMarks = Number(input.maxMarks);
  if (input.allowResubmission !== undefined) assignment.allowResubmission = flag(input.allowResubmission);
  if (input.allowLate !== undefined) assignment.allowLate = flag(input.allowLate);
  if (file) {
    if (assignment.storedName) removeStoredFile(assignment.storedName);
    Object.assign(assignment, fileFields(file));
  }
  await assignment.save();
  if (dueChanged) {
    const submissions = await Submission.find({ assignmentId: assignment._id });
    await Promise.all(submissions.map((submission) => {
      submission.isLate = new Date(submission.submittedAt).getTime() > new Date(assignment.dueDate).getTime();
      return submission.save();
    }));
  }
  return presentAssignment(assignment);
}

async function setAssignmentStatus(user, assignmentId, status) {
  assertObjectId(assignmentId, 'assignment id');
  const assignment = await Assignment.findById(assignmentId);
  if (!assignment) throw new AppError('Assignment not found.', 404);
  await assertTeacherCanManage(user, idOf(assignment.courseId));
  if (!['published', 'closed'].includes(status)) throw new AppError('Status must be published or closed.', 400);
  assignment.status = status;
  await assignment.save();
  return presentAssignment(assignment);
}

async function deleteAssignment(user, assignmentId) {
  assertObjectId(assignmentId, 'assignment id');
  const assignment = await Assignment.findById(assignmentId);
  if (!assignment) throw new AppError('Assignment not found.', 404);
  const course = await assertTeacherCanManage(user, idOf(assignment.courseId));
  const submissions = await Submission.find({ assignmentId: assignment._id });
  submissions.forEach((submission) => {
    if (submission.storedName) removeStoredFile(submission.storedName);
  });
  if (assignment.storedName) removeStoredFile(assignment.storedName);
  await Submission.deleteMany({ assignmentId: assignment._id });
  await assignment.deleteOne();
  await recordAudit({
    actorId: user._id,
    action: 'ASSIGNMENT_DELETED',
    targetType: 'Assignment',
    targetId: assignment._id,
    details: { title: assignment.title, courseTitle: course.title, courseCode: course.courseCode },
  });
  return { id: idOf(assignment) };
}

async function listTeacherSubmissions(user) {
  const courses = await ownedCourses(user);
  const courseIds = courses.map((course) => course._id);
  const assignments = await Assignment.find({ courseId: { $in: courseIds }, status: { $ne: 'draft' } }).sort({ dueDate: 1 });
  const submissions = await Submission.find({ assignmentId: { $in: assignments.map((item) => item._id) } })
    .populate('studentId', 'name email studentId')
    .sort({ submittedAt: -1 });
  const enrollments = await Enrollment.find({ courseId: { $in: courseIds }, status: 'active' }).populate('studentId', 'name email studentId');
  const assignmentMap = new Map(assignments.map((item) => [idOf(item), item]));
  const courseMap = new Map(courses.map((course) => [idOf(course), course]));
  const flat = submissions.map((submission) => {
    const assignment = assignmentMap.get(idOf(submission.assignmentId));
    const course = assignment ? courseMap.get(idOf(assignment.courseId)) : null;
    return {
      ...presentSubmission(submission, 'teacher'),
      assignmentTitle: assignment?.title || 'Assignment',
      assignmentNumber: assignment?.assignmentNumber || null,
      courseId: assignment ? idOf(assignment.courseId) : '',
      courseTitle: course?.title || '',
      courseCode: course?.courseCode || '',
      maxMarks: assignment?.maxMarks,
    };
  });
  const grouped = assignments.map((assignment) => {
    const course = courseMap.get(idOf(assignment.courseId));
    const rows = flat.filter((item) => item.assignmentId === idOf(assignment));
    const submittedIds = new Set(rows.map((item) => item.studentId));
    const missing = enrollments
      .filter((enrollment) => idOf(enrollment.courseId) === idOf(assignment.courseId) && enrollment.studentId && !submittedIds.has(idOf(enrollment.studentId)))
      .map((enrollment) => ({
        id: idOf(enrollment.studentId),
        studentName: enrollment.studentId.name,
        studentCode: enrollment.studentId.studentId,
        email: enrollment.studentId.email,
      }))
      .sort((left, right) => left.studentName.localeCompare(right.studentName));
    return {
      id: idOf(assignment),
      title: assignment.title,
      assignmentNumber: assignment.assignmentNumber || null,
      dueDate: assignment.dueDate,
      maxMarks: assignment.maxMarks,
      courseId: course ? idOf(course) : '',
      courseTitle: course?.title || '',
      courseCode: course?.courseCode || '',
      ...scheduleFields(course || {}),
      onTime: rows.filter((item) => !item.isLate),
      late: rows.filter((item) => item.isLate),
      missing,
    };
  });
  return { submissions: flat, assignments: grouped };
}

async function updateAnnouncement(user, announcementId, input) {
  assertObjectId(announcementId, 'announcement id');
  const announcement = await Announcement.findById(announcementId);
  if (!announcement) throw new AppError('Announcement not found.', 404);
  await assertTeacherCanManage(user, idOf(announcement.courseId));
  await assertAnnouncementIsEditableByTeacher(announcement);
  announcement.title = input.title;
  announcement.message = input.message;
  await announcement.save();
  return {
    id: idOf(announcement),
    title: announcement.title,
    message: announcement.message,
    courseId: idOf(announcement.courseId),
    publishedAt: announcement.publishedAt,
  };
}

async function deleteAnnouncement(user, announcementId) {
  assertObjectId(announcementId, 'announcement id');
  const announcement = await Announcement.findById(announcementId);
  if (!announcement) throw new AppError('Announcement not found.', 404);
  await assertTeacherCanManage(user, idOf(announcement.courseId));
  await assertAnnouncementIsEditableByTeacher(announcement);
  await announcement.deleteOne();
  return { id: idOf(announcement) };
}

async function teacherProgress(user, courseId) {
  const courses = await ownedCourses(user);
  const selected = courseId ? courses.filter((course) => idOf(course) === String(courseId)) : courses;
  if (courseId && selected.length === 0) throw new AppError('You are not assigned to this course.', 403);
  const courseIds = selected.map((course) => course._id);
  const [enrollments, assignments, attendance] = await Promise.all([
    Enrollment.find({ courseId: { $in: courseIds }, status: 'active' }).populate('studentId', 'name email studentId'),
    Assignment.find({ courseId: { $in: courseIds }, status: { $in: ['published', 'closed'] } }),
    Attendance.find({ courseId: { $in: courseIds } }),
  ]);
  const relevantSubmissions = await Submission.find({ assignmentId: { $in: assignments.map((item) => item._id) } }).populate('assignmentId', 'courseId maxMarks');
  return selected.map((course) => {
    const courseAssignments = assignments.filter((item) => String(item.courseId) === String(course._id));
    const students = enrollments.filter((item) => String(item.courseId) === String(course._id) && item.studentId).map((enrollment) => {
      const studentId = idOf(enrollment.studentId);
      const work = relevantSubmissions.filter((submission) => idOf(submission.studentId) === studentId && String(submission.assignmentId.courseId) === String(course._id));
      const marks = work.filter((submission) => submission.gradedAt && submission.released !== false && submission.marks !== null);
      const possible = courseAssignments.reduce((sum, item) => sum + (Number(item.maxMarks) || 0), 0);
      const earned = marks.reduce((sum, submission) => sum + (Number(submission.marks) || 0), 0);
      const attendanceRows = attendance.filter((row) => String(row.courseId) === String(course._id) && String(row.studentId) === studentId);
      const attendanceCounts = { present: 0, absent: 0, late: 0, leave: 0 };
      attendanceRows.forEach((row) => {
        if (attendanceCounts[row.status] !== undefined) attendanceCounts[row.status] += 1;
      });
      return {
        id: studentId,
        name: enrollment.studentId.name,
        email: enrollment.studentId.email,
        studentId: enrollment.studentId.studentId,
        assigned: courseAssignments.length,
        submitted: work.length,
        missing: Math.max(courseAssignments.length - work.length, 0),
        graded: marks.length,
        marks: earned,
        possible,
        average: possible ? Math.round((earned / possible) * 1000) / 10 : null,
        attendance: attendanceCounts,
      };
    }).sort((left, right) => left.name.localeCompare(right.name));
    return {
      id: idOf(course),
      title: course.title,
      courseCode: course.courseCode,
      ...scheduleFields(course),
      students,
    };
  });
}

module.exports = {
  teacherDashboard,
  teacherCourses,
  courseStudents,
  addMaterial,
  updateMaterial,
  deleteMaterial,
  listMaterialsForTeacher,
  createAssignment,
  updateAssignment,
  setAssignmentStatus,
  deleteAssignment,
  listAssignmentsForTeacher,
  listSubmissions,
  listTeacherSubmissions,
  gradeSubmission,
  saveAttendance,
  attendanceHistory,
  teacherOwnAttendance,
  publishAnnouncement,
  listAnnouncementsForAdmin,
  publishAdminAnnouncement,
  deleteAdminAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  listAnnouncementsForTeacher,
  teacherAdminAnnouncements,
  teacherProgress,
  studentDashboard,
  studentCourses,
  studentCourseDetail,
  studentAssignments,
  submitAssignment,
  studentGrades,
  studentAttendance,
  studentMaterials,
  studentAnnouncements,
  updateStudentProfile,
  sendOwnedFile,
  submissionStatus,
};

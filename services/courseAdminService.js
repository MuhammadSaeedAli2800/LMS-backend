const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const Attendance = require('../models/Attendance');
const TeacherAttendance = require('../models/TeacherAttendance');
const LearningMaterial = require('../models/LearningMaterial');
const Announcement = require('../models/Announcement');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { assertObjectId } = require('../utils/objectId');
const { recordAudit, listRecent } = require('./auditService');
const { normalizeSchedule, scheduleFields } = require('../utils/schedule');
const { removeStoredFile } = require('../middleware/upload');

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function presentCourse(course, extra = {}) {
  const doc = course.toObject ? course.toObject() : course;
  return {
    id: String(doc._id),
    title: doc.title,
    courseCode: doc.courseCode,
    description: doc.description || '',
    thumbnail: doc.thumbnail || '',
    teacherIds: (doc.teacherIds || []).map((id) => String(id._id || id)),
    teachers: Array.isArray(doc.teacherIds) && doc.teacherIds[0] && doc.teacherIds[0].name
      ? doc.teacherIds.map((teacher) => ({
        id: String(teacher._id),
        name: teacher.name,
        email: teacher.email,
      }))
      : undefined,
    academicTerm: doc.academicTerm,
    ...scheduleFields(doc),
    department: doc.department || '',
    status: doc.status,
    createdBy: doc.createdBy ? String(doc.createdBy) : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    ...extra,
  };
}

function cleanCourse(course) {
  const presented = presentCourse(course);
  if (!presented.teachers) delete presented.teachers;
  return presented;
}

function sameSchedule(left, right) {
  return left.days.join('|') === right.days.join('|')
    && left.startTime === right.startTime
    && left.endTime === right.endTime;
}

async function allowRepeatedCourseCodes() {
  const indexes = await Course.collection.indexes();
  const uniqueCode = indexes.find((index) => (
    index.unique && index.key && index.key.courseCode === 1 && Object.keys(index.key).length === 1
  ));
  if (uniqueCode) await Course.collection.dropIndex(uniqueCode.name);
}

async function assertDistinctSchedule(title, schedule, excludeId) {
  const matches = await Course.find({
    title: new RegExp(`^${escapeRegex(String(title || '').trim())}$`, 'i'),
  }).select('days startTime endTime');
  const clash = matches.find((course) => {
    if (excludeId && String(course._id) === String(excludeId)) return false;
    return sameSchedule(normalizeSchedule(course), schedule);
  });
  if (clash) {
    throw new AppError('A course with this name already uses that schedule. Choose different days or a different time.', 409);
  }
}

async function assertTeachers(teacherIds) {
  const ids = [...new Set((teacherIds || []).map((id) => String(id)))];
  ids.forEach((id) => assertObjectId(id, 'teacher id'));
  if (ids.length === 0) return [];
  const teachers = await User.find({ _id: { $in: ids }, role: 'teacher', accountStatus: 'active' });
  if (teachers.length !== ids.length) {
    throw new AppError('One or more teachers are invalid or inactive.', 400);
  }
  return ids;
}

async function listCourses(query) {
  const filter = {};
  if (query.status && ['draft', 'published', 'archived'].includes(query.status)) {
    filter.status = query.status;
  }
  if (query.department) filter.department = new RegExp(escapeRegex(String(query.department).trim()), 'i');
  if (query.term) filter.academicTerm = new RegExp(escapeRegex(String(query.term).trim()), 'i');
  if (query.search) {
    const pattern = new RegExp(escapeRegex(String(query.search).trim().slice(0, 200)), 'i');
    filter.$or = [{ title: pattern }, { courseCode: pattern }];
  }
  const courses = await Course.find(filter).sort({ createdAt: -1 }).limit(100).populate('teacherIds', 'name email');
  return courses.map((course) => presentCourse(course));
}

async function createCourse(actorId, input) {
  const teacherIds = await assertTeachers(input.teacherIds);
  const schedule = normalizeSchedule(input);
  await allowRepeatedCourseCodes();
  await assertDistinctSchedule(input.title, schedule);
  try {
    const course = await Course.create({
      title: input.title,
      courseCode: input.courseCode,
      description: input.description || '',
      thumbnail: input.thumbnail || '',
      teacherIds,
      academicTerm: input.academicTerm,
      ...schedule,
      department: input.department || '',
      status: input.status || 'draft',
      createdBy: actorId,
    });
    await recordAudit({
      actorId,
      action: 'COURSE_CREATED',
      targetType: 'Course',
      targetId: course._id,
      details: { courseCode: course.courseCode, title: course.title },
    });
    return cleanCourse(course);
  } catch (error) {
    if (error.code === 11000) throw new AppError('Course code is already in use.', 409);
    throw error;
  }
}

async function getCourse(id) {
  assertObjectId(id, 'course id');
  const course = await Course.findById(id).populate('teacherIds', 'name email');
  if (!course) throw new AppError('Course not found.', 404);
  const enrolledCount = await Enrollment.countDocuments({ courseId: course._id, status: 'active' });
  return presentCourse(course, { enrolledCount });
}

async function updateCourse(actorId, id, input) {
  assertObjectId(id, 'course id');
  const course = await Course.findById(id);
  if (!course) throw new AppError('Course not found.', 404);
  const fields = ['title', 'courseCode', 'description', 'thumbnail', 'academicTerm', 'department'];
  fields.forEach((field) => {
    if (input[field] !== undefined) course[field] = input[field];
  });
  if (input.teacherIds) course.teacherIds = await assertTeachers(input.teacherIds);
  if (input.days !== undefined || input.startTime !== undefined || input.endTime !== undefined || input.title !== undefined) {
    const schedule = normalizeSchedule({
      days: input.days !== undefined ? input.days : course.days,
      startTime: input.startTime !== undefined ? input.startTime : course.startTime,
      endTime: input.endTime !== undefined ? input.endTime : course.endTime,
    });
    await assertDistinctSchedule(input.title !== undefined ? input.title : course.title, schedule, course._id);
    course.days = schedule.days;
    course.startTime = schedule.startTime;
    course.endTime = schedule.endTime;
  }
  try {
    await course.save();
  } catch (error) {
    if (error.code === 11000) throw new AppError('Course code is already in use.', 409);
    throw error;
  }
  await recordAudit({
    actorId,
    action: 'COURSE_UPDATED',
    targetType: 'Course',
    targetId: course._id,
    details: { title: course.title, courseCode: course.courseCode },
  });
  return cleanCourse(course);
}

async function deleteCourse(actorId, id) {
  assertObjectId(id, 'course id');
  const course = await Course.findById(id);
  if (!course) throw new AppError('Course not found.', 404);
  const assignments = await Assignment.find({ courseId: course._id }).select('_id storedName');
  const assignmentIds = assignments.map((item) => item._id);
  const [submissions, materials] = await Promise.all([
    Submission.find({ assignmentId: { $in: assignmentIds } }).select('storedName'),
    LearningMaterial.find({ courseId: course._id }).select('storedName'),
  ]);
  submissions.forEach((item) => removeStoredFile(item.storedName));
  assignments.forEach((item) => removeStoredFile(item.storedName));
  materials.forEach((item) => removeStoredFile(item.storedName));
  await Promise.all([
    Submission.deleteMany({ assignmentId: { $in: assignmentIds } }),
    Assignment.deleteMany({ courseId: course._id }),
    LearningMaterial.deleteMany({ courseId: course._id }),
    Announcement.deleteMany({ courseId: course._id }),
    Enrollment.deleteMany({ courseId: course._id }),
    Attendance.deleteMany({ courseId: course._id }),
    TeacherAttendance.deleteMany({ courseId: course._id }),
  ]);
  const details = { title: course.title, courseCode: course.courseCode };
  await course.deleteOne();
  await recordAudit({
    actorId,
    action: 'COURSE_DELETED',
    targetType: 'Course',
    targetId: course._id,
    details,
  });
  return { id: String(course._id) };
}

async function updateCourseStatus(actorId, id, status) {
  assertObjectId(id, 'course id');
  const course = await Course.findById(id);
  if (!course) throw new AppError('Course not found.', 404);
  course.status = status;
  await course.save();
  await recordAudit({
    actorId,
    action: 'COURSE_STATUS_CHANGED',
    targetType: 'Course',
    targetId: course._id,
    details: { title: course.title, courseCode: course.courseCode, status },
  });
  return cleanCourse(course);
}

function presentEnrollment(enrollment) {
  const student = enrollment.studentId || {};
  const course = enrollment.courseId || {};
  return {
    id: String(enrollment._id),
    studentId: String(student._id || enrollment.studentId),
    studentName: student.name || '',
    studentEmail: student.email || '',
    studentNumber: student.studentId || '',
    className: student.className || '',
    courseId: String(course._id || enrollment.courseId),
    courseTitle: course.title || '',
    courseCode: course.courseCode || '',
    academicTerm: course.academicTerm || '',
    department: course.department || '',
    enrollmentDate: enrollment.enrollmentDate,
    status: enrollment.status,
  };
}

async function listEnrollments(query) {
  const filter = { status: 'active' };
  if (query.studentId) {
    assertObjectId(String(query.studentId), 'student id');
    filter.studentId = query.studentId;
  }
  if (query.courseId) {
    assertObjectId(String(query.courseId), 'course id');
    filter.courseId = query.courseId;
  }
  let enrollments = await Enrollment.find(filter)
    .sort({ createdAt: -1 })
    .limit(200)
    .populate('studentId', 'name email studentId className')
    .populate('courseId', 'title courseCode academicTerm department');
  if (query.term) {
    const term = String(query.term).trim().toLowerCase();
    enrollments = enrollments.filter((item) => String(item.courseId?.academicTerm || '').toLowerCase().includes(term));
  }
  if (query.department) {
    const department = String(query.department).trim().toLowerCase();
    enrollments = enrollments.filter((item) => String(item.courseId?.department || '').toLowerCase().includes(department));
  }
  return enrollments.map(presentEnrollment);
}

async function enrollStudent(actorId, studentId, courseId) {
  assertObjectId(studentId, 'student id');
  assertObjectId(courseId, 'course id');
  const [student, course] = await Promise.all([
    User.findOne({ _id: studentId, role: 'student' }),
    Course.findById(courseId),
  ]);
  if (!student) throw new AppError('Student not found.', 404);
  if (student.accountStatus !== 'active') throw new AppError('Inactive students cannot be enrolled.', 400);
  if (!course) throw new AppError('Course not found.', 404);
  const existing = await Enrollment.findOne({ studentId, courseId });
  if (existing) throw new AppError('This student is already enrolled in the course.', 409);
  let enrollment;
  try {
    enrollment = await Enrollment.create({ studentId, courseId, status: 'active' });
  } catch (error) {
    if (error && error.code === 11000) throw new AppError('This student is already enrolled in the course.', 409);
    throw error;
  }
  await recordAudit({
    actorId,
    action: 'STUDENT_ENROLLED',
    targetType: 'Enrollment',
    targetId: enrollment._id,
    details: {
      studentName: student.name,
      studentEmail: student.email,
      studentId: student.studentId,
      courseTitle: course.title,
      courseCode: course.courseCode,
    },
  });
  return presentEnrollment(await enrollment.populate([
    { path: 'studentId', select: 'name email studentId className' },
    { path: 'courseId', select: 'title courseCode academicTerm department' },
  ]));
}

async function removeEnrollment(actorId, id) {
  assertObjectId(id, 'enrollment id');
  const enrollment = await Enrollment.findById(id);
  if (!enrollment) throw new AppError('Enrollment not found.', 404);
  const [student, course] = await Promise.all([
    User.findById(enrollment.studentId).select('name email studentId'),
    Course.findById(enrollment.courseId).select('title courseCode'),
  ]);
  await enrollment.deleteOne();
  await recordAudit({
    actorId,
    action: 'STUDENT_UNENROLLED',
    targetType: 'Enrollment',
    targetId: enrollment._id,
    details: {
      studentName: student?.name || '',
      studentEmail: student?.email || '',
      studentId: student?.studentId || '',
      courseTitle: course?.title || '',
      courseCode: course?.courseCode || '',
    },
  });
}

function emptyCounts(keys) {
  return keys.reduce((counts, key) => ({ ...counts, [key]: 0 }), {});
}

function addCount(map, key, status, amount, allowed) {
  if (!allowed.includes(status)) return;
  const current = map.get(key) || emptyCounts(allowed);
  current[status] += amount;
  map.set(key, current);
}

async function reports() {
  const [courses, enrollments, assignments, submissions, attendance, teacherAttendance, teacherUsers] = await Promise.all([
    Course.find().select('title courseCode teacherIds status days startTime endTime'),
    Enrollment.find({ status: 'active' }).select('courseId'),
    Assignment.find({ status: 'published' }).select('courseId'),
    Submission.find().select('assignmentId isLate gradedAt'),
    Attendance.aggregate([{ $group: { _id: { courseId: '$courseId', status: '$status' }, count: { $sum: 1 } } }]),
    TeacherAttendance.aggregate([{ $group: { _id: { courseId: '$courseId', teacherId: '$teacherId', status: '$status' }, count: { $sum: 1 } } }]),
    User.find({ role: 'teacher' }).select('name email teacherId accountStatus'),
  ]);
  const studentStatuses = ['present', 'absent', 'late', 'leave'];
  const teacherStatuses = ['present', 'absent', 'leave'];
  const studentsByCourse = new Map();
  enrollments.forEach((item) => {
    const key = String(item.courseId);
    studentsByCourse.set(key, (studentsByCourse.get(key) || 0) + 1);
  });
  const assignmentsByCourse = new Map();
  const assignmentCourse = new Map();
  assignments.forEach((assignment) => {
    const courseId = String(assignment.courseId);
    const assignmentId = String(assignment._id);
    assignmentCourse.set(assignmentId, courseId);
    assignmentsByCourse.set(courseId, (assignmentsByCourse.get(courseId) || 0) + 1);
  });
  const submissionStats = new Map();
  submissions.forEach((item) => {
    const courseId = assignmentCourse.get(String(item.assignmentId));
    if (!courseId) return;
    const stats = submissionStats.get(courseId) || { submitted: 0, late: 0, graded: 0 };
    stats.submitted += 1;
    if (item.isLate) stats.late += 1;
    if (item.gradedAt) stats.graded += 1;
    submissionStats.set(courseId, stats);
  });
  const attendanceByCourse = new Map();
  attendance.forEach((row) => {
    addCount(attendanceByCourse, String(row._id.courseId), row._id.status, row.count, studentStatuses);
  });
  const teacherAttendanceByCourse = new Map();
  teacherAttendance.forEach((row) => {
    addCount(
      teacherAttendanceByCourse,
      `${String(row._id.teacherId)}:${String(row._id.courseId)}`,
      row._id.status,
      row.count,
      teacherStatuses,
    );
  });

  const courseReports = courses.map((course) => {
    const courseId = String(course._id);
    const students = studentsByCourse.get(courseId) || 0;
    const assignmentCount = assignmentsByCourse.get(courseId) || 0;
    const stats = submissionStats.get(courseId) || { submitted: 0, late: 0, graded: 0 };
    return {
      courseId,
      title: course.title,
      courseCode: course.courseCode,
      status: course.status,
      ...scheduleFields(course),
      teacherIds: (course.teacherIds || []).map((id) => String(id)),
      students,
      assignments: assignmentCount,
      submitted: stats.submitted,
      notSubmitted: Math.max(0, assignmentCount * students - stats.submitted),
      lateSubmissions: stats.late,
      graded: stats.graded,
      attendance: attendanceByCourse.get(courseId) || emptyCounts(studentStatuses),
    };
  }).sort((left, right) => left.title.localeCompare(right.title) || left.startTime.localeCompare(right.startTime));

  const teacherReports = teacherUsers.map((teacher) => {
    const teacherId = String(teacher._id);
    const assigned = courseReports.filter((course) => course.teacherIds.includes(teacherId));
    const attendanceTotals = emptyCounts(teacherStatuses);
    const teacherCourses = assigned.map((course) => {
      const attendanceForCourse = teacherAttendanceByCourse.get(`${teacherId}:${course.courseId}`) || emptyCounts(teacherStatuses);
      teacherStatuses.forEach((status) => {
        attendanceTotals[status] += attendanceForCourse[status];
      });
      return {
        courseId: course.courseId,
        title: course.title,
        courseCode: course.courseCode,
        status: course.status,
        days: course.days,
        startTime: course.startTime,
        endTime: course.endTime,
        students: course.students,
        attendance: attendanceForCourse,
      };
    });
    return {
      id: teacherId,
      name: teacher.name,
      email: teacher.email,
      teacherCode: teacher.teacherId || '',
      accountStatus: teacher.accountStatus,
      courseCount: teacherCourses.length,
      students: teacherCourses.reduce((sum, course) => sum + course.students, 0),
      attendance: attendanceTotals,
      courses: teacherCourses,
    };
  }).sort((left, right) => left.name.localeCompare(right.name));

  const summary = courseReports.reduce((totals, course) => {
    totals.enrollments += course.students;
    totals.assignments += course.assignments;
    totals.submitted += course.submitted;
    totals.notSubmitted += course.notSubmitted;
    totals.lateSubmissions += course.lateSubmissions;
    studentStatuses.forEach((status) => {
      totals.attendance[status] += course.attendance[status];
    });
    return totals;
  }, {
    courses: courseReports.length,
    teachers: teacherReports.length,
    enrollments: 0,
    assignments: 0,
    submitted: 0,
    notSubmitted: 0,
    lateSubmissions: 0,
    attendance: emptyCounts(studentStatuses),
  });

  return {
    summary,
    courses: courseReports.map(({ teacherIds, ...course }) => course),
    teachers: teacherReports,
  };
}

function submissionState(submission) {
  if (!submission) return 'missing';
  return submission.isLate ? 'late' : 'submitted';
}

function studentAttendanceCounts(records) {
  const counts = emptyCounts(['present', 'absent', 'late', 'leave']);
  records.forEach((record) => {
    if (counts[record.status] !== undefined) counts[record.status] += 1;
  });
  return counts;
}

async function loadCourseWork(courseId) {
  const courseFilter = courseId ? { _id: courseId } : {};
  const courses = await Course.find(courseFilter).select('title courseCode status days startTime endTime');
  const courseIds = courses.map((course) => course._id);
  const [enrollments, assignments, attendanceRows, submissions] = await Promise.all([
    Enrollment.find({ courseId: { $in: courseIds }, status: 'active' }).populate('studentId', 'name email studentId'),
    Assignment.find({ courseId: { $in: courseIds }, status: 'published' }).select('title dueDate maxMarks courseId').sort({ dueDate: 1 }),
    Attendance.find({ courseId: { $in: courseIds } }).select('courseId studentId sessionDate status').sort({ sessionDate: -1 }),
    Submission.find().select('assignmentId studentId isLate marks submittedAt gradedAt'),
  ]);
  const assignmentsByCourse = new Map();
  assignments.forEach((assignment) => {
    const key = String(assignment.courseId);
    const list = assignmentsByCourse.get(key) || [];
    list.push(assignment);
    assignmentsByCourse.set(key, list);
  });
  const assignmentIds = new Set(assignments.map((assignment) => String(assignment._id)));
  const submissionByPair = new Map();
  submissions.forEach((submission) => {
    const assignmentId = String(submission.assignmentId);
    if (!assignmentIds.has(assignmentId)) return;
    submissionByPair.set(`${String(submission.studentId)}:${assignmentId}`, submission);
  });
  const attendanceByStudent = new Map();
  attendanceRows.forEach((record) => {
    const key = `${String(record.courseId)}:${String(record.studentId)}`;
    const list = attendanceByStudent.get(key) || [];
    list.push(record);
    attendanceByStudent.set(key, list);
  });
  const enrollmentsByCourse = new Map();
  enrollments.forEach((enrollment) => {
    const key = String(enrollment.courseId);
    const list = enrollmentsByCourse.get(key) || [];
    list.push(enrollment);
    enrollmentsByCourse.set(key, list);
  });

  return courses.map((course) => {
    const id = String(course._id);
    const courseAssignments = assignmentsByCourse.get(id) || [];
    const students = (enrollmentsByCourse.get(id) || [])
      .filter((enrollment) => enrollment.studentId && enrollment.studentId._id)
      .map((enrollment) => {
        const student = enrollment.studentId;
        const studentId = String(student._id);
        const records = attendanceByStudent.get(`${id}:${studentId}`) || [];
        return {
          id: studentId,
          name: student.name || 'Student',
          email: student.email || '',
          studentNumber: student.studentId || '',
          attendance: studentAttendanceCounts(records),
          records: records.map((record) => ({
            sessionDate: record.sessionDate,
            status: record.status,
          })),
          assignments: courseAssignments.map((assignment) => {
            const submission = submissionByPair.get(`${studentId}:${String(assignment._id)}`);
            return {
              id: String(assignment._id),
              title: assignment.title,
              dueDate: assignment.dueDate,
              maxMarks: assignment.maxMarks,
              state: submissionState(submission),
              marks: submission && submission.gradedAt ? submission.marks : null,
              submittedAt: submission ? submission.submittedAt : null,
            };
          }),
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));
    return {
      courseId: id,
      title: course.title,
      courseCode: course.courseCode,
      status: course.status,
      ...scheduleFields(course),
      students,
    };
  }).sort((left, right) => left.title.localeCompare(right.title) || left.startTime.localeCompare(right.startTime));
}

async function workReport() {
  return { courses: await loadCourseWork() };
}

async function courseReport(courseId) {
  assertObjectId(courseId, 'course id');
  const courses = await loadCourseWork(courseId);
  if (!courses[0]) throw new AppError('Course not found.', 404);
  return { course: courses[0] };
}

async function teacherReport(teacherId) {
  assertObjectId(teacherId, 'teacher id');
  const teacher = await User.findOne({ _id: teacherId, role: 'teacher' }).select('name email teacherId accountStatus');
  if (!teacher) throw new AppError('Teacher not found.', 404);
  const courses = await Course.find({ teacherIds: teacherId }).select('title courseCode status days startTime endTime');
  const courseIds = courses.map((course) => course._id);
  const [records, enrollmentCounts] = await Promise.all([
    TeacherAttendance.find({ teacherId, courseId: { $in: courseIds } }).select('courseId sessionDate status').sort({ sessionDate: -1 }),
    Enrollment.aggregate([
      { $match: { courseId: { $in: courseIds }, status: 'active' } },
      { $group: { _id: '$courseId', count: { $sum: 1 } } },
    ]),
  ]);
  const studentsByCourse = new Map(enrollmentCounts.map((row) => [String(row._id), row.count]));
  const recordsByCourse = new Map();
  records.forEach((record) => {
    const key = String(record.courseId);
    const list = recordsByCourse.get(key) || [];
    list.push({ sessionDate: record.sessionDate, status: record.status });
    recordsByCourse.set(key, list);
  });
  const teacherCourses = courses.map((course) => {
    const id = String(course._id);
    const courseRecords = recordsByCourse.get(id) || [];
    return {
      courseId: id,
      title: course.title,
      courseCode: course.courseCode,
      status: course.status,
      ...scheduleFields(course),
      students: studentsByCourse.get(id) || 0,
      attendance: studentAttendanceCounts(courseRecords.map((record) => ({ status: record.status }))),
      records: courseRecords,
    };
  }).sort((left, right) => left.title.localeCompare(right.title) || left.startTime.localeCompare(right.startTime));
  const attendance = emptyCounts(['present', 'absent', 'leave']);
  teacherCourses.forEach((course) => {
    attendance.present += course.attendance.present || 0;
    attendance.absent += course.attendance.absent || 0;
    attendance.leave += course.attendance.leave || 0;
  });
  return {
    teacher: {
      id: String(teacher._id),
      name: teacher.name,
      email: teacher.email,
      teacherCode: teacher.teacherId || '',
      courseCount: teacherCourses.length,
      students: teacherCourses.reduce((sum, course) => sum + course.students, 0),
      attendance,
      courses: teacherCourses,
    },
  };
}

async function listAuditLogs() {
  return listRecent(100);
}

module.exports = {
  listCourses,
  createCourse,
  getCourse,
  updateCourse,
  deleteCourse,
  updateCourseStatus,
  listEnrollments,
  enrollStudent,
  removeEnrollment,
  reports,
  workReport,
  courseReport,
  teacherReport,
  listAuditLogs,
  presentCourse,
};

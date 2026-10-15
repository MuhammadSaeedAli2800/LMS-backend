const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const Attendance = require('../models/Attendance');
const TeacherAttendance = require('../models/TeacherAttendance');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { assertObjectId } = require('../utils/objectId');
const { scheduleFields } = require('../utils/schedule');
const { recordAudit } = require('./auditService');

function parseSessionDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
    throw new AppError('Choose a valid day.', 400);
  }
  return new Date(`${value}T00:00:00.000Z`);
}

function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function presentRecord({ attendance, audience, person, course, sessionDate }) {
  return {
    id: attendance ? String(attendance._id) : null,
    audience,
    personId: String(person._id),
    personName: person.name,
    personCode: audience === 'teacher' ? (person.teacherId || '') : (person.studentId || ''),
    courseId: String(course._id),
    courseTitle: course.title,
    courseCode: course.courseCode,
    ...scheduleFields(course),
    sessionDate,
    status: attendance ? attendance.status : '',
  };
}

async function coursesFor(courseId) {
  const filter = {};
  if (courseId) {
    assertObjectId(String(courseId), 'course id');
    filter._id = courseId;
  }
  return Course.find(filter).select('title courseCode days startTime endTime teacherIds').sort({ title: 1 });
}

async function listAttendance({ audience, date, courseId }) {
  if (audience !== 'student' && audience !== 'teacher') {
    throw new AppError('Choose students or teachers.', 400);
  }
  const sessionDate = parseSessionDate(date);
  const courses = await coursesFor(courseId);
  const courseIds = courses.map((course) => course._id);
  if (audience === 'teacher') return listTeachers(courses, courseIds, sessionDate, date);
  return listStudents(courses, courseIds, sessionDate, date);
}

async function listStudents(courses, courseIds, sessionDate, date) {
  const [enrollments, saved, students] = await Promise.all([
    Enrollment.find({ courseId: { $in: courseIds }, status: 'active' }).select('courseId studentId'),
    Attendance.find({ courseId: { $in: courseIds }, sessionDate }),
    User.find({ role: 'student' }).select('name studentId'),
  ]);
  const courseMap = new Map(courses.map((course) => [String(course._id), course]));
  const studentMap = new Map(students.map((student) => [String(student._id), student]));
  const savedMap = new Map(saved.map((row) => [`${row.courseId}:${row.studentId}`, row]));
  return enrollments
    .map((enrollment) => {
      const course = courseMap.get(String(enrollment.courseId));
      const student = studentMap.get(String(enrollment.studentId));
      if (!course || !student) return null;
      return presentRecord({
        attendance: savedMap.get(`${course._id}:${student._id}`),
        audience: 'student',
        person: student,
        course,
        sessionDate: date,
      });
    })
    .filter(Boolean)
    .sort((left, right) => left.personName.localeCompare(right.personName) || left.courseTitle.localeCompare(right.courseTitle));
}

async function listTeachers(courses, courseIds, sessionDate, date) {
  const saved = await TeacherAttendance.find({ courseId: { $in: courseIds }, sessionDate });
  const teacherIds = [...new Set(courses.flatMap((course) => (course.teacherIds || []).map((id) => String(id))))];
  const teachers = await User.find({ _id: { $in: teacherIds }, role: 'teacher' }).select('name teacherId');
  const teacherMap = new Map(teachers.map((teacher) => [String(teacher._id), teacher]));
  const savedMap = new Map(saved.map((row) => [`${row.courseId}:${row.teacherId}`, row]));
  const records = [];
  courses.forEach((course) => {
    (course.teacherIds || []).forEach((teacherId) => {
      const teacher = teacherMap.get(String(teacherId));
      if (!teacher) return;
      records.push(presentRecord({
        attendance: savedMap.get(`${course._id}:${teacher._id}`),
        audience: 'teacher',
        person: teacher,
        course,
        sessionDate: date,
      }));
    });
  });
  return records.sort((left, right) => left.personName.localeCompare(right.personName) || left.courseTitle.localeCompare(right.courseTitle));
}

async function saveAttendance(actorId, input) {
  const { audience, personId, courseId, status } = input;
  if (!['present', 'absent', 'leave'].includes(status)) {
    throw new AppError('Status must be present, absent, or leave.', 400);
  }
  assertObjectId(String(personId), 'person id');
  assertObjectId(String(courseId), 'course id');
  const sessionDate = parseSessionDate(input.sessionDate);
  const course = await Course.findById(courseId).select('title courseCode teacherIds');
  if (!course) throw new AppError('Course not found.', 404);

  if (audience === 'teacher') {
    const assigned = (course.teacherIds || []).some((id) => String(id) === String(personId));
    if (!assigned) throw new AppError('This teacher is not assigned to the course.', 400);
    const teacher = await User.findOne({ _id: personId, role: 'teacher' }).select('name teacherId');
    if (!teacher) throw new AppError('Teacher not found.', 404);
    const attendance = await TeacherAttendance.findOneAndUpdate(
      { courseId, teacherId: personId, sessionDate },
      { status, markedBy: actorId },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await recordAudit({
      actorId,
      action: 'ATTENDANCE_UPDATED',
      targetType: 'TeacherAttendance',
      targetId: attendance._id,
      details: auditDetails('teacher', teacher, course, input.sessionDate, status),
    });
    return presentRecord({ attendance, audience: 'teacher', person: teacher, course, sessionDate: input.sessionDate });
  }

  const enrolled = await Enrollment.findOne({ courseId, studentId: personId, status: 'active' });
  if (!enrolled) throw new AppError('This student is not enrolled in the course.', 400);
  const student = await User.findOne({ _id: personId, role: 'student' }).select('name studentId');
  if (!student) throw new AppError('Student not found.', 404);
  const attendance = await Attendance.findOneAndUpdate(
    { courseId, studentId: personId, sessionDate },
    { status, markedBy: actorId },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await recordAudit({
    actorId,
    action: 'ATTENDANCE_UPDATED',
    targetType: 'Attendance',
    targetId: attendance._id,
    details: auditDetails('student', student, course, input.sessionDate, status),
  });
  return presentRecord({ attendance, audience: 'student', person: student, course, sessionDate: input.sessionDate });
}

async function deleteAttendance(actorId, audience, id) {
  assertObjectId(String(id), 'attendance id');
  if (audience === 'teacher') {
    const attendance = await TeacherAttendance.findById(id);
    if (!attendance) throw new AppError('Attendance not found.', 404);
    const [teacher, course] = await Promise.all([
      User.findById(attendance.teacherId).select('name teacherId'),
      Course.findById(attendance.courseId).select('title courseCode'),
    ]);
    await attendance.deleteOne();
    await recordAudit({
      actorId,
      action: 'ATTENDANCE_DELETED',
      targetType: 'TeacherAttendance',
      targetId: attendance._id,
      details: auditDetails('teacher', teacher, course, dayKey(attendance.sessionDate), attendance.status),
    });
    return;
  }
  if (audience !== 'student') throw new AppError('Choose students or teachers.', 400);
  const attendance = await Attendance.findById(id);
  if (!attendance) throw new AppError('Attendance not found.', 404);
  const [student, course] = await Promise.all([
    User.findById(attendance.studentId).select('name studentId'),
    Course.findById(attendance.courseId).select('title courseCode'),
  ]);
  await attendance.deleteOne();
  await recordAudit({
    actorId,
    action: 'ATTENDANCE_DELETED',
    targetType: 'Attendance',
    targetId: attendance._id,
    details: auditDetails('student', student, course, dayKey(attendance.sessionDate), attendance.status),
  });
}

function auditDetails(audience, person, course, sessionDate, status) {
  return {
    audience,
    name: person?.name || '',
    email: person?.email || '',
    role: audience,
    studentId: person?.studentId || '',
    teacherId: person?.teacherId || '',
    courseTitle: course?.title || '',
    courseCode: course?.courseCode || '',
    sessionDate,
    status,
  };
}

function countMarks(rows) {
  const counts = { present: 0, absent: 0, leave: 0, late: 0 };
  const dates = new Set();
  rows.forEach((row) => {
    dates.add(dayKey(row.sessionDate));
    if (counts[row.status] !== undefined) counts[row.status] += 1;
  });
  return { classes: dates.size, ...counts };
}

function courseSummary(course, rows) {
  return {
    courseId: String(course._id),
    title: course.title,
    courseCode: course.courseCode,
    status: course.status,
    ...scheduleFields(course),
    ...countMarks(rows),
  };
}

async function attendanceCards(audience) {
  if (audience !== 'student' && audience !== 'teacher') {
    throw new AppError('Choose students or teachers.', 400);
  }
  const courses = await Course.find().select('title courseCode status days startTime endTime').sort({ title: 1, startTime: 1 });
  const Model = audience === 'teacher' ? TeacherAttendance : Attendance;
  const rows = await Model.find({ courseId: { $in: courses.map((course) => course._id) } }).select('courseId sessionDate status');
  const byCourse = new Map();
  rows.forEach((row) => {
    const key = String(row.courseId);
    const list = byCourse.get(key) || [];
    list.push(row);
    byCourse.set(key, list);
  });
  return courses.map((course) => courseSummary(course, byCourse.get(String(course._id)) || []));
}

async function attendanceCourse(audience, courseId) {
  if (audience !== 'student' && audience !== 'teacher') {
    throw new AppError('Choose students or teachers.', 400);
  }
  assertObjectId(String(courseId), 'course id');
  const course = await Course.findById(courseId).select('title courseCode status days startTime endTime');
  if (!course) throw new AppError('Course not found.', 404);
  const rows = audience === 'teacher'
    ? await TeacherAttendance.find({ courseId }).sort({ sessionDate: -1 }).populate('teacherId', 'name teacherId')
    : await Attendance.find({ courseId }).sort({ sessionDate: -1 }).populate('studentId', 'name studentId');
  const records = rows.map((row) => {
    const person = audience === 'teacher' ? row.teacherId : row.studentId;
    return {
      id: String(row._id),
      personName: person?.name || '',
      personCode: audience === 'teacher' ? (person?.teacherId || '') : (person?.studentId || ''),
      sessionDate: row.sessionDate,
      status: row.status,
    };
  });
  return {
    course: courseSummary(course, rows),
    records,
  };
}

module.exports = {
  listAttendance,
  saveAttendance,
  deleteAttendance,
  attendanceCards,
  attendanceCourse,
};

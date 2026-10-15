process.env.NODE_ENV = 'test';
process.env.BCRYPT_ROUNDS = '4';
process.env.JWT_SECRET = 'test-jwt-secret-must-be-at-least-32-characters-long';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const {
  start,
  stop,
  resetData,
  extractCookies,
  cookieHeader,
  seedUser,
} = require('./setup');

describe('academic access', () => {
  let app;

  before(async () => {
    app = await start();
    await Promise.all([
      require('../models/Course').init(),
      require('../models/Enrollment').init(),
      require('../models/LearningMaterial').init(),
      require('../models/Assignment').init(),
      require('../models/Submission').init(),
      require('../models/Attendance').init(),
      require('../models/Announcement').init(),
    ]);
  });

  after(async () => {
    await stop();
  });

  beforeEach(async () => {
    await resetData();
  });

  async function login(email, password, path) {
    const res = await request(app).post(path).send({ email, password });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return extractCookies(res);
  }

  function authed(method, path, cookies) {
    return request(app)[method](path)
      .set('Cookie', cookieHeader(cookies))
      .set('X-CSRF-Token', cookies.lms_csrf);
  }

  it('enforces course assignment, enrollment, and grading permissions', async () => {
    const admin = await seedUser({
      name: 'Admin',
      email: 'admin@example.com',
      password: 'Password1',
      role: 'admin',
    });
    const teacher = await seedUser({
      name: 'Teacher Assigned',
      email: 'teacher@example.com',
      password: 'Password1',
      role: 'teacher',
      teacherId: 'TCH-200',
    });
    await seedUser({
      name: 'Teacher Other',
      email: 'other@example.com',
      password: 'Password1',
      role: 'teacher',
      teacherId: 'TCH-201',
    });
    const student = await seedUser({
      name: 'Student One',
      email: 'student@example.com',
      password: 'Password1',
      role: 'student',
      studentId: 'STU-200',
    });

    const adminCookies = await login('admin@example.com', 'Password1', '/api/admin/auth/login');
    const teacherCookies = await login('teacher@example.com', 'Password1', '/api/auth/login');
    const otherCookies = await login('other@example.com', 'Password1', '/api/auth/login');
    const studentCookies = await login('student@example.com', 'Password1', '/api/auth/login');

    const created = await authed('post', '/api/admin/courses', adminCookies)
      .send({
        title: 'Biology',
        courseCode: 'BIO-101',
        academicTerm: 'Fall 2026',
        department: 'Science',
        status: 'published',
        teacherIds: [String(teacher._id)],
      });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const courseId = created.body.data.course.id;

    const scheduled = await authed('patch', `/api/admin/courses/${courseId}`, adminCookies).send({
      days: ['Monday', 'Wednesday'],
      startTime: '09:00',
      endTime: '11:00',
    });
    assert.equal(scheduled.status, 200, JSON.stringify(scheduled.body));
    assert.deepEqual(scheduled.body.data.course.days, ['Monday', 'Wednesday']);
    assert.equal(scheduled.body.data.course.startTime, '09:00');

    const sameName = await authed('post', '/api/admin/courses', adminCookies).send({
      title: 'Biology',
      courseCode: 'BIO-101',
      academicTerm: 'Fall 2026',
      status: 'published',
      teacherIds: [String(teacher._id)],
      days: ['Tuesday'],
      startTime: '14:00',
      endTime: '16:00',
    });
    assert.equal(sameName.status, 201, JSON.stringify(sameName.body));

    const sameSchedule = await authed('post', '/api/admin/courses', adminCookies).send({
      title: 'Biology',
      courseCode: 'BIO-102',
      academicTerm: 'Fall 2026',
      status: 'draft',
      teacherIds: [String(teacher._id)],
      days: ['Wednesday', 'Monday'],
      startTime: '09:00',
      endTime: '11:00',
    });
    assert.equal(sameSchedule.status, 409);

    const badTime = await authed('patch', `/api/admin/courses/${courseId}`, adminCookies).send({
      startTime: '18:00',
      endTime: '09:00',
    });
    assert.equal(badTime.status, 400);

    const blockedMaterial = await authed('post', `/api/teacher/courses/${courseId}/materials`, otherCookies)
      .send({ title: 'Notes', externalUrl: 'https://example.com/notes' });
    assert.equal(blockedMaterial.status, 403);

    const material = await authed('post', `/api/teacher/courses/${courseId}/materials`, teacherCookies)
      .send({ title: 'Notes', externalUrl: 'https://example.com/notes' });
    assert.equal(material.status, 201, JSON.stringify(material.body));

    const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const assignment = await authed('post', `/api/teacher/courses/${courseId}/assignments`, teacherCookies)
      .send({ title: 'Lab 1', dueDate, maxMarks: 10, assignmentNumber: 1 });
    assert.equal(assignment.status, 201, JSON.stringify(assignment.body));
    assert.equal(assignment.body.data.assignment.assignmentNumber, 1);
    const badNumber = await authed('post', `/api/teacher/courses/${courseId}/assignments`, teacherCookies)
      .send({ title: 'Lab zero', dueDate, maxMarks: 10, assignmentNumber: 0 });
    assert.equal(badNumber.status, 400);
    const assignmentId = assignment.body.data.assignment.id;

    const hidden = await authed('get', `/api/student/courses/${courseId}`, studentCookies);
    assert.equal(hidden.status, 403);

    const enrolled = await authed('post', '/api/admin/enrollments', adminCookies)
      .send({ studentId: String(student._id), courseId });
    assert.equal(enrolled.status, 201, JSON.stringify(enrolled.body));

    const marked = await authed('put', '/api/admin/attendance', adminCookies).send({
      audience: 'student',
      personId: String(student._id),
      courseId,
      sessionDate: '2026-10-14',
      status: 'leave',
    });
    assert.equal(marked.status, 200, JSON.stringify(marked.body));
    const teacherMarked = await authed('put', '/api/admin/attendance', adminCookies).send({
      audience: 'teacher',
      personId: String(teacher._id),
      courseId,
      sessionDate: '2026-10-14',
      status: 'absent',
    });
    assert.equal(teacherMarked.status, 200, JSON.stringify(teacherMarked.body));
    const listed = await authed('get', `/api/admin/attendance?audience=student&date=2026-10-14&courseId=${courseId}`, adminCookies);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.data.records[0].status, 'leave');
    assert.equal(listed.body.data.records[0].days[0], 'Monday');
    const removed = await authed('delete', `/api/admin/attendance/student/${marked.body.data.record.id}`, adminCookies);
    assert.equal(removed.status, 200);
    const cleared = await authed('get', `/api/admin/attendance?audience=student&date=2026-10-14&courseId=${courseId}`, adminCookies);
    assert.equal(cleared.body.data.records[0].status, '');

    const duplicate = await authed('post', '/api/admin/enrollments', adminCookies)
      .send({ studentId: String(student._id), courseId });
    assert.equal(duplicate.status, 409);

    const fileAssignment = await authed('post', `/api/teacher/courses/${courseId}/assignments`, teacherCookies)
      .send({ title: 'Lab file', dueDate, maxMarks: 10 });
    assert.equal(fileAssignment.status, 201, JSON.stringify(fileAssignment.body));
    const fileAssignmentId = fileAssignment.body.data.assignment.id;
    const rejected = await request(app)
      .post(`/api/student/assignments/${fileAssignmentId}/submissions`)
      .set('Cookie', cookieHeader(studentCookies))
      .set('X-CSRF-Token', studentCookies.lms_csrf)
      .attach('file', Buffer.from('not-an-image'), 'diagram.png');
    assert.equal(rejected.status, 400);
    const uploaded = await request(app)
      .post(`/api/student/assignments/${fileAssignmentId}/submissions`)
      .set('Cookie', cookieHeader(studentCookies))
      .set('X-CSRF-Token', studentCookies.lms_csrf)
      .attach('file', Buffer.from('%PDF-1.1\n'), { filename: 'lab.pdf', contentType: 'application/pdf' });
    assert.equal(uploaded.status, 201, JSON.stringify(uploaded.body));

    const submitted = await authed('post', `/api/student/assignments/${assignmentId}/submissions`, studentCookies)
      .send({ submissionText: 'My lab notes' });
    assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
    const submissionId = submitted.body.data.submission.id;

    const again = await authed('post', `/api/student/assignments/${assignmentId}/submissions`, studentCookies)
      .send({ submissionText: 'Second try' });
    assert.equal(again.status, 409);

    const studentGrade = await authed('patch', `/api/teacher/submissions/${submissionId}/grade`, studentCookies)
      .send({ marks: 8, feedback: 'Good' });
    assert.equal(studentGrade.status, 403);

    const graded = await authed('patch', `/api/teacher/submissions/${submissionId}/grade`, teacherCookies)
      .send({ marks: 8, feedback: 'Clear work' });
    assert.equal(graded.status, 200, JSON.stringify(graded.body));

    const grades = await authed('get', '/api/student/grades', studentCookies);
    assert.equal(grades.status, 200);
    assert.equal(grades.body.data.grades[0].marks, 8);
    assert.equal(grades.body.data.grades[0].feedback, 'Clear work');

    const teacherDashboard = await authed('get', '/api/teacher/dashboard', teacherCookies);
    assert.equal(teacherDashboard.status, 200, JSON.stringify(teacherDashboard.body));
    const deadlineTitles = teacherDashboard.body.data.upcomingDeadlines.map((item) => item.title);
    assert.ok(deadlineTitles.includes('Lab 1'));
    assert.ok(deadlineTitles.includes('Lab file'));

    const progress = await authed('get', '/api/teacher/progress', teacherCookies);
    assert.equal(progress.status, 200, JSON.stringify(progress.body));
    const biologyProgress = progress.body.data.courses.find((course) => course.courseCode === 'BIO-101' && course.days.includes('Monday'));
    const progressStudent = biologyProgress.students.find((person) => person.studentId === 'STU-200');
    assert.equal(progressStudent.assigned, 2);
    assert.equal(progressStudent.graded, 1);
    assert.equal(progressStudent.marks, 8);
    assert.equal(progressStudent.possible, 20);
    assert.equal(progressStudent.average, 40);

    const activity = await authed('get', '/api/admin/audit-logs', adminCookies);
    assert.equal(activity.status, 200);
    const summaries = activity.body.data.logs.map((item) => item.summary).join('\n');
    assert.match(summaries, /Course created: Biology \(BIO-101\)/);
    assert.match(summaries, /Student One, STU-200, student@example.com enrolled in Biology \(BIO-101\)/);
    assert.match(summaries, /Learning material added: Notes in Biology \(BIO-101\)/);
    assert.match(summaries, /Assignment created: Lab 1 in Biology \(BIO-101\)/);
    assert.match(summaries, /Graded Student One, STU-200, student@example.com on Lab 1: 8 marks in Biology \(BIO-101\)/);

    const dashboard = await authed('get', '/api/admin/dashboard', adminCookies);
    assert.equal(dashboard.status, 200);
    const biology = dashboard.body.data.courseBreakdown.find((course) => course.courseCode === 'BIO-101');
    assert.equal(biology.studentCount, 1);
    assert.equal(biology.teacherCount, 1);
    assert.equal(biology.teachers[0].name, 'Teacher Assigned');
    const assignedTeacher = dashboard.body.data.teacherBreakdown.find((teacher) => teacher.teacherId === 'TCH-200');
    const unassignedTeacher = dashboard.body.data.teacherBreakdown.find((teacher) => teacher.teacherId === 'TCH-201');
    assert.equal(assignedTeacher.courses[0].courseCode, 'BIO-101');
    assert.equal(unassignedTeacher.courseCount, 0);
    const enrolledStudent = dashboard.body.data.studentBreakdown.find((student) => student.studentId === 'STU-200');
    assert.equal(enrolledStudent.name, 'Student One');
    assert.equal(enrolledStudent.courses[0].courseCode, 'BIO-101');
    assert.equal(dashboard.body.data.studentBreakdown.length, 1);
    assert.equal(biology.assignmentCount, 2);
    assert.ok(biology.assignments.some((item) => item.title === 'Lab 1'));
    assert.equal(dashboard.body.data.activeCourses, 2);

    const reports = await authed('get', '/api/admin/reports', adminCookies);
    assert.equal(reports.status, 200, JSON.stringify(reports.body));
    const biologyReport = reports.body.data.courses.find((course) => course.courseCode === 'BIO-101' && course.days.includes('Monday'));
    assert.equal(biologyReport.students, 1);
    assert.equal(biologyReport.submitted, 2);
    assert.equal(biologyReport.notSubmitted, 0);
    assert.equal(biologyReport.lateSubmissions, 0);
    assert.equal(biologyReport.attendance.leave, 0);
    const teacherReport = reports.body.data.teachers.find((person) => person.teacherCode === 'TCH-200');
    assert.equal(teacherReport.courseCount, 2);
    assert.equal(teacherReport.attendance.absent, 1);
    const mondayCourse = teacherReport.courses.find((course) => course.days.includes('Monday'));
    assert.equal(mondayCourse.students, 1);
    assert.equal(mondayCourse.attendance.absent, 1);

    const courseDetail = await authed('get', `/api/admin/reports/courses/${courseId}`, adminCookies);
    assert.equal(courseDetail.status, 200, JSON.stringify(courseDetail.body));
    assert.equal(courseDetail.body.data.course.students[0].name, 'Student One');
    assert.equal(courseDetail.body.data.course.students[0].assignments[0].state, 'submitted');
    const teacherDetail = await authed('get', `/api/admin/reports/teachers/${teacher._id}`, adminCookies);
    assert.equal(teacherDetail.status, 200, JSON.stringify(teacherDetail.body));
    const detailedMonday = teacherDetail.body.data.teacher.courses.find((course) => course.days.includes('Monday'));
    assert.equal(detailedMonday.records[0].status, 'absent');

    const viewedAttendance = await authed('get', `/api/teacher/courses/${courseId}/attendance`, teacherCookies);
    assert.equal(viewedAttendance.status, 200);
    const savedAttendance = await authed('post', `/api/teacher/courses/${courseId}/attendance`, teacherCookies)
      .send({
        sessionDate: '2026-10-14',
        records: [{ studentId: String(student._id), status: 'present' }],
      });
    assert.equal(savedAttendance.status, 200, JSON.stringify(savedAttendance.body));
    const blockedSave = await authed('post', `/api/teacher/courses/${courseId}/attendance`, otherCookies)
      .send({
        sessionDate: '2026-10-14',
        records: [{ studentId: String(student._id), status: 'present' }],
      });
    assert.equal(blockedSave.status, 403);

    const disposable = await authed('post', `/api/teacher/courses/${courseId}/assignments`, teacherCookies)
      .send({ title: 'Disposable lab', dueDate, maxMarks: 10 });
    assert.equal(disposable.status, 201, JSON.stringify(disposable.body));
    const disposableId = disposable.body.data.assignment.id;
    const blockedDelete = await authed('delete', `/api/teacher/assignments/${disposableId}`, otherCookies);
    assert.equal(blockedDelete.status, 403);
    const deleted = await authed('delete', `/api/teacher/assignments/${disposableId}`, teacherCookies);
    assert.equal(deleted.status, 200, JSON.stringify(deleted.body));
    const afterDelete = await authed('get', `/api/teacher/courses/${courseId}/assignments`, teacherCookies);
    assert.equal(afterDelete.body.data.assignments.some((item) => item.id === disposableId), false);

    const register = await request(app).post('/api/auth/register').send({ email: 'x@example.com' });
    assert.equal(register.status, 404);
    assert.equal(admin.role, 'admin');
  });

  it('rejects anonymous access, a student opening admin courses, and an incomplete course', async () => {
    const anonymous = await request(app).get('/api/teacher/courses');
    assert.equal(anonymous.status, 401);

    await seedUser({
      name: 'Admin Two',
      email: 'admin2@example.com',
      password: 'Password1',
      role: 'admin',
    });
    await seedUser({
      name: 'Student Two',
      email: 'student2@example.com',
      password: 'Password1',
      role: 'student',
      studentId: 'STU-300',
    });
    const adminCookies = await login('admin2@example.com', 'Password1', '/api/admin/auth/login');
    const studentCookies = await login('student2@example.com', 'Password1', '/api/auth/login');

    const forbidden = await authed('get', '/api/admin/courses', studentCookies);
    assert.equal(forbidden.status, 403);

    const invalid = await authed('post', '/api/admin/courses', adminCookies).send({ title: 'A' });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.success, false);
  });

  it('lets a teacher read only their own attendance', async () => {
    const teacher = await seedUser({
      name: 'Teacher Assigned',
      email: 'teacher@example.com',
      password: 'Password1',
      role: 'teacher',
      teacherId: 'TCH-200',
    });
    await seedUser({
      name: 'Teacher Other',
      email: 'other@example.com',
      password: 'Password1',
      role: 'teacher',
      teacherId: 'TCH-201',
    });
    await seedUser({
      name: 'Admin',
      email: 'admin@example.com',
      password: 'Password1',
      role: 'admin',
    });
    const adminCookies = await login('admin@example.com', 'Password1', '/api/admin/auth/login');
    const teacherCookies = await login('teacher@example.com', 'Password1', '/api/auth/login');
    const otherCookies = await login('other@example.com', 'Password1', '/api/auth/login');
    const created = await authed('post', '/api/admin/courses', adminCookies).send({
      title: 'Biology',
      courseCode: 'BIO-101',
      academicTerm: 'Fall 2026',
      status: 'published',
      teacherIds: [String(teacher._id)],
      days: ['Monday'],
      startTime: '09:00',
      endTime: '11:00',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const courseId = created.body.data.course.id;
    const marked = await authed('put', '/api/admin/attendance', adminCookies).send({
      audience: 'teacher',
      personId: String(teacher._id),
      courseId,
      sessionDate: '2026-10-14',
      status: 'present',
    });
    assert.equal(marked.status, 200, JSON.stringify(marked.body));
    const own = await authed('get', '/api/teacher/attendance', teacherCookies);
    assert.equal(own.status, 200, JSON.stringify(own.body));
    assert.equal(own.body.data.courses.length, 1);
    assert.equal(own.body.data.courses[0].present, 1);
    assert.equal(own.body.data.courses[0].records[0].status, 'present');
    const other = await authed('get', '/api/teacher/attendance', otherCookies);
    assert.equal(other.status, 200);
    assert.equal(other.body.data.courses.length, 0);
  });

  it('shows teacher and administrator announcements to a student by name', async () => {
    const teacher = await seedUser({
      name: 'Teacher Assigned',
      email: 'teacher@example.com',
      password: 'Password1',
      role: 'teacher',
      teacherId: 'TCH-200',
    });
    const student = await seedUser({
      name: 'Student One',
      email: 'student@example.com',
      password: 'Password1',
      role: 'student',
      studentId: 'STU-200',
    });
    await seedUser({
      name: 'Admin',
      email: 'admin@example.com',
      password: 'Password1',
      role: 'admin',
    });
    const adminCookies = await login('admin@example.com', 'Password1', '/api/admin/auth/login');
    const teacherCookies = await login('teacher@example.com', 'Password1', '/api/auth/login');
    const studentCookies = await login('student@example.com', 'Password1', '/api/auth/login');
    const created = await authed('post', '/api/admin/courses', adminCookies).send({
      title: 'Biology',
      courseCode: 'BIO-101',
      academicTerm: 'Fall 2026',
      status: 'published',
      teacherIds: [String(teacher._id)],
      days: ['Monday'],
      startTime: '09:00',
      endTime: '11:00',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const courseId = created.body.data.course.id;
    const enrolled = await authed('post', '/api/admin/enrollments', adminCookies).send({
      studentId: String(student._id),
      courseId,
    });
    assert.equal(enrolled.status, 201, JSON.stringify(enrolled.body));
    const fromTeacher = await authed('post', `/api/teacher/courses/${courseId}/announcements`, teacherCookies).send({
      title: 'Lab moved',
      message: 'Meet in the other room.',
    });
    assert.equal(fromTeacher.status, 201, JSON.stringify(fromTeacher.body));
    const fromAdmin = await authed('post', '/api/admin/announcements', adminCookies).send({
      title: 'Campus notice',
      message: 'The office is closed Friday.',
      audience: 'general',
    });
    assert.equal(fromAdmin.status, 201, JSON.stringify(fromAdmin.body));
    const teachersOnly = await authed('post', '/api/admin/announcements', adminCookies).send({
      title: 'Teachers only',
      message: 'Staff room.',
      audience: 'teachers',
    });
    assert.equal(teachersOnly.status, 201, JSON.stringify(teachersOnly.body));
    const listed = await authed('get', '/api/student/announcements', studentCookies);
    assert.equal(listed.status, 200, JSON.stringify(listed.body));
    const names = listed.body.data.announcements.map((item) => item.authorName).sort();
    assert.deepEqual(names, ['Admin', 'Teacher Assigned']);
    assert.equal(listed.body.data.announcements.find((item) => item.title === 'Campus notice').courseTitle, 'General');
    assert.equal(listed.body.data.announcements.some((item) => item.title === 'Teachers only'), false);
  });

  it('shows administrator announcements to teachers without letting them change them', async () => {
    const teacher = await seedUser({
      name: 'Teacher Assigned',
      email: 'teacher@example.com',
      password: 'Password1',
      role: 'teacher',
      teacherId: 'TCH-200',
    });
    await seedUser({
      name: 'Teacher Other',
      email: 'other@example.com',
      password: 'Password1',
      role: 'teacher',
      teacherId: 'TCH-201',
    });
    await seedUser({
      name: 'Admin',
      email: 'admin@example.com',
      password: 'Password1',
      role: 'admin',
    });
    const adminCookies = await login('admin@example.com', 'Password1', '/api/admin/auth/login');
    const teacherCookies = await login('teacher@example.com', 'Password1', '/api/auth/login');
    const otherCookies = await login('other@example.com', 'Password1', '/api/auth/login');
    const created = await authed('post', '/api/admin/courses', adminCookies).send({
      title: 'Biology',
      courseCode: 'BIO-101',
      academicTerm: 'Fall 2026',
      status: 'published',
      teacherIds: [String(teacher._id)],
      days: ['Monday'],
      startTime: '09:00',
      endTime: '11:00',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const courseId = created.body.data.course.id;
    const schoolWide = await authed('post', '/api/admin/announcements', adminCookies).send({
      title: 'Campus notice',
      message: 'The office is closed Friday.',
      audience: 'general',
    });
    assert.equal(schoolWide.status, 201, JSON.stringify(schoolWide.body));
    const teachersOnly = await authed('post', '/api/admin/announcements', adminCookies).send({
      title: 'Teachers only',
      message: 'Staff room.',
      audience: 'teachers',
    });
    assert.equal(teachersOnly.status, 201, JSON.stringify(teachersOnly.body));
    const studentsOnly = await authed('post', '/api/admin/announcements', adminCookies).send({
      title: 'Students only',
      message: 'Bring ID cards.',
      audience: 'students',
    });
    assert.equal(studentsOnly.status, 201, JSON.stringify(studentsOnly.body));
    const courseNotice = await authed('post', '/api/admin/announcements', adminCookies).send({
      title: 'Lab closed',
      message: 'Use the other room.',
      courseId,
    });
    assert.equal(courseNotice.status, 201, JSON.stringify(courseNotice.body));
    const own = await authed('post', `/api/teacher/courses/${courseId}/announcements`, teacherCookies).send({
      title: 'Bring laptops',
      message: 'Class starts on time.',
    });
    assert.equal(own.status, 201, JSON.stringify(own.body));
    const listed = await authed('get', '/api/teacher/announcements', teacherCookies);
    assert.equal(listed.status, 200, JSON.stringify(listed.body));
    const titles = listed.body.data.announcements.map((item) => item.title).sort();
    assert.deepEqual(titles, ['Campus notice', 'Lab closed', 'Teachers only']);
    assert.equal(listed.body.data.announcements.find((item) => item.title === 'Campus notice').authorName, 'Admin');
    assert.equal(listed.body.data.announcements.find((item) => item.title === 'Campus notice').courseTitle, 'General');
    assert.equal(listed.body.data.announcements.find((item) => item.title === 'Teachers only').courseTitle, 'All teachers');
    assert.equal(listed.body.data.announcements.find((item) => item.title === 'Lab closed').courseTitle, 'Biology');
    const other = await authed('get', '/api/teacher/announcements', otherCookies);
    assert.equal(other.status, 200, JSON.stringify(other.body));
    assert.deepEqual(other.body.data.announcements.map((item) => item.title).sort(), ['Campus notice', 'Teachers only']);
    const courseList = await authed('get', `/api/teacher/courses/${courseId}/announcements`, teacherCookies);
    assert.equal(courseList.status, 200, JSON.stringify(courseList.body));
    assert.deepEqual(courseList.body.data.announcements.map((item) => item.title), ['Bring laptops']);
    const blocked = await authed('patch', `/api/teacher/announcements/${courseNotice.body.data.announcement.id}`, teacherCookies).send({
      title: 'Changed',
      message: 'This should stay.',
    });
    assert.equal(blocked.status, 403);
  });

  it('shows learning materials only for the student enrolled course', async () => {
    const teacher = await seedUser({
      name: 'Teacher Assigned',
      email: 'teacher@example.com',
      password: 'Password1',
      role: 'teacher',
      teacherId: 'TCH-200',
    });
    const student = await seedUser({
      name: 'Student One',
      email: 'student@example.com',
      password: 'Password1',
      role: 'student',
      studentId: 'STU-200',
    });
    await seedUser({
      name: 'Student Other',
      email: 'other.student@example.com',
      password: 'Password1',
      role: 'student',
      studentId: 'STU-201',
    });
    await seedUser({
      name: 'Admin',
      email: 'admin@example.com',
      password: 'Password1',
      role: 'admin',
    });
    const adminCookies = await login('admin@example.com', 'Password1', '/api/admin/auth/login');
    const teacherCookies = await login('teacher@example.com', 'Password1', '/api/auth/login');
    const studentCookies = await login('student@example.com', 'Password1', '/api/auth/login');
    const otherCookies = await login('other.student@example.com', 'Password1', '/api/auth/login');
    const created = await authed('post', '/api/admin/courses', adminCookies).send({
      title: 'Biology',
      courseCode: 'BIO-101',
      academicTerm: 'Fall 2026',
      status: 'published',
      teacherIds: [String(teacher._id)],
      days: ['Monday'],
      startTime: '09:00',
      endTime: '11:00',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const courseId = created.body.data.course.id;
    const enrolled = await authed('post', '/api/admin/enrollments', adminCookies).send({
      studentId: String(student._id),
      courseId,
    });
    assert.equal(enrolled.status, 201, JSON.stringify(enrolled.body));
    const material = await authed('post', `/api/teacher/courses/${courseId}/materials`, teacherCookies).send({
      title: 'Notes',
      externalUrl: 'https://example.com/notes',
    });
    assert.equal(material.status, 201, JSON.stringify(material.body));
    const listed = await authed('get', '/api/student/materials', studentCookies);
    assert.equal(listed.status, 200, JSON.stringify(listed.body));
    assert.equal(listed.body.data.courses.length, 1);
    assert.equal(listed.body.data.courses[0].materials[0].title, 'Notes');
    assert.equal(listed.body.data.courses[0].materials[0].externalUrl, 'https://example.com/notes');
    const hidden = await authed('get', '/api/student/materials', otherCookies);
    assert.equal(hidden.status, 200);
    assert.equal(hidden.body.data.courses.length, 0);
  });
});

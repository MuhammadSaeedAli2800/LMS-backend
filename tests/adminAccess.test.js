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

describe('admin access', () => {
  let app;

  before(async () => {
    app = await start();
  });

  after(async () => {
    await stop();
  });

  beforeEach(async () => {
    await resetData();
  });

  async function login(email, password, path) {
    const res = await request(app).post(path).send({ email, password });
    assert.equal(res.status, 200);
    return extractCookies(res);
  }

  it('returns 401 for an unauthenticated student list', async () => {
    const res = await request(app).get('/api/admin/students');
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });

  it('returns 403 when a student token requests the student list', async () => {
    await seedUser({
      name: 'Student One',
      email: 'student@example.com',
      password: 'Password1',
      role: 'student',
      studentId: 'STU-100',
    });
    const cookies = await login('student@example.com', 'Password1', '/api/auth/login');

    const res = await request(app)
      .get('/api/admin/students')
      .set('Cookie', cookieHeader(cookies));

    assert.equal(res.status, 403);
    assert.equal(res.body.message, 'Forbidden');
    assert.equal(res.body.code, undefined);
  });

  it('lets an admin create a student and shows the temporary password only once', async () => {
    await seedUser({
      name: 'Principal',
      email: 'admin@example.com',
      password: 'Adminpass1',
      role: 'admin',
    });
    const cookies = await login('admin@example.com', 'Adminpass1', '/api/admin/auth/login');

    const created = await request(app)
      .post('/api/admin/students')
      .set('Cookie', cookieHeader(cookies))
      .set('X-CSRF-Token', cookies.lms_csrf)
      .send({
        name: 'New Student',
        email: 'new.student@example.com',
        studentId: 'stu-new',
        department: 'Science',
        className: '10-A',
        role: 'admin',
        passwordHash: 'should-not-stick',
        mustChangePassword: false,
      });

    assert.equal(created.status, 201);
    assert.equal(created.body.success, true);
    assert.equal(typeof created.body.data.temporaryPassword, 'string');
    assert.ok(created.body.data.temporaryPassword.length >= 12);
    assert.match(created.body.data.temporaryPassword, /[A-Za-z]/);
    assert.match(created.body.data.temporaryPassword, /[0-9]/);
    assert.equal(JSON.stringify(created.body).includes('passwordHash'), false);
    assert.equal(created.body.data.user.role, 'student');
    assert.equal(created.body.data.user.studentId, 'STU-NEW');
    assert.equal(created.body.data.user.mustChangePassword, true);

    const fetched = await request(app)
      .get(`/api/admin/students/${created.body.data.user.id}`)
      .set('Cookie', cookieHeader(cookies));

    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.data.user.email, 'new.student@example.com');
    assert.equal(JSON.stringify(fetched.body).includes('temporaryPassword'), false);
    assert.equal(JSON.stringify(fetched.body).includes('passwordHash'), false);
  });

  it('returns 409 for a duplicate email or student id', async () => {
    await seedUser({
      name: 'Principal',
      email: 'admin@example.com',
      password: 'Adminpass1',
      role: 'admin',
    });
    const cookies = await login('admin@example.com', 'Adminpass1', '/api/admin/auth/login');

    const first = await request(app)
      .post('/api/admin/students')
      .set('Cookie', cookieHeader(cookies))
      .set('X-CSRF-Token', cookies.lms_csrf)
      .send({
        name: 'New Student',
        email: 'new.student@example.com',
        studentId: 'STU-NEW',
      });
    assert.equal(first.status, 201);

    const duplicateEmail = await request(app)
      .post('/api/admin/students')
      .set('Cookie', cookieHeader(cookies))
      .set('X-CSRF-Token', cookies.lms_csrf)
      .send({
        name: 'Other Student',
        email: 'new.student@example.com',
        studentId: 'STU-OTHER',
      });
    const duplicateId = await request(app)
      .post('/api/admin/students')
      .set('Cookie', cookieHeader(cookies))
      .set('X-CSRF-Token', cookies.lms_csrf)
      .send({
        name: 'Other Student',
        email: 'other.student@example.com',
        studentId: 'stu-new',
      });

    assert.equal(duplicateEmail.status, 409);
    assert.equal(duplicateEmail.body.success, false);
    assert.match(duplicateEmail.body.message, /email/i);
    assert.equal(duplicateId.status, 409);
    assert.equal(duplicateId.body.success, false);
    assert.match(duplicateId.body.message, /student id/i);

    const firstCourse = await request(app)
      .post('/api/admin/courses')
      .set('Cookie', cookieHeader(cookies))
      .set('X-CSRF-Token', cookies.lms_csrf)
      .send({ title: 'Morning lab', courseCode: 'LAB-AM', academicTerm: 'Fall 2026', days: ['Monday'], startTime: '09:00', endTime: '11:00' });
    const secondCourse = await request(app)
      .post('/api/admin/courses')
      .set('Cookie', cookieHeader(cookies))
      .set('X-CSRF-Token', cookies.lms_csrf)
      .send({ title: 'Evening lab', courseCode: 'LAB-PM', academicTerm: 'Fall 2026', days: ['Tuesday'], startTime: '16:00', endTime: '18:00' });
    assert.equal(firstCourse.status, 201, JSON.stringify(firstCourse.body));
    assert.equal(secondCourse.status, 201, JSON.stringify(secondCourse.body));
    const enrolled = await request(app)
      .post('/api/admin/enrollments')
      .set('Cookie', cookieHeader(cookies))
      .set('X-CSRF-Token', cookies.lms_csrf)
      .send({ studentId: first.body.data.user.id, courseId: firstCourse.body.data.course.id });
    assert.equal(enrolled.status, 201, JSON.stringify(enrolled.body));
    const anotherCourse = await request(app)
      .post('/api/admin/students')
      .set('Cookie', cookieHeader(cookies))
      .set('X-CSRF-Token', cookies.lms_csrf)
      .send({
        name: 'New Student',
        email: 'new.student@example.com',
        studentId: 'STU-NEW',
        courseId: secondCourse.body.data.course.id,
      });
    assert.equal(anotherCourse.status, 200, JSON.stringify(anotherCourse.body));
    assert.equal(anotherCourse.body.data.enrolledExisting, true);
    assert.equal(anotherCourse.body.data.enrollment.courseId, secondCourse.body.data.course.id);

    const fresh = await request(app)
      .post('/api/admin/students')
      .set('Cookie', cookieHeader(cookies))
      .set('X-CSRF-Token', cookies.lms_csrf)
      .send({
        name: 'Course Student',
        email: 'course.student@example.com',
        studentId: 'STU-COURSE',
        courseId: firstCourse.body.data.course.id,
      });
    assert.equal(fresh.status, 201, JSON.stringify(fresh.body));
    assert.equal(fresh.body.data.enrollment.courseId, firstCourse.body.data.course.id);
    assert.equal(fresh.body.data.enrollment.studentId, fresh.body.data.user.id);
  });

  it('forces a created student to change password before using other routes', async () => {
    await seedUser({
      name: 'Principal',
      email: 'admin@example.com',
      password: 'Adminpass1',
      role: 'admin',
    });
    const adminCookies = await login('admin@example.com', 'Adminpass1', '/api/admin/auth/login');

    const created = await request(app)
      .post('/api/admin/students')
      .set('Cookie', cookieHeader(adminCookies))
      .set('X-CSRF-Token', adminCookies.lms_csrf)
      .send({
        name: 'New Student',
        email: 'new.student@example.com',
        studentId: 'STU-NEW',
      });
    const temporaryPassword = created.body.data.temporaryPassword;

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'new.student@example.com', password: temporaryPassword });
    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.body.data.user.mustChangePassword, true);
    const studentCookies = extractCookies(loginRes);

    const blocked = await request(app)
      .get('/api/admin/students')
      .set('Cookie', cookieHeader(studentCookies));
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.success, false);
    assert.equal(blocked.body.code, 'MUST_CHANGE_PASSWORD');
    assert.equal(blocked.body.message, 'You must change your password before continuing.');

    const changed = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', cookieHeader(studentCookies))
      .set('X-CSRF-Token', studentCookies.lms_csrf)
      .send({ currentPassword: temporaryPassword, newPassword: 'Changed12' });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.data.user.mustChangePassword, false);
    assert.equal(JSON.stringify(changed.body).includes('passwordHash'), false);

    const nextCookies = extractCookies(changed);
    const me = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookieHeader(nextCookies));
    assert.equal(me.status, 200);
    assert.equal(me.body.data.user.mustChangePassword, false);
    assert.equal(me.body.data.user.role, 'student');
    assert.ok(extractCookies(me).lms_csrf);
  });

  it('returns 403 for an admin write without the CSRF token', async () => {
    await seedUser({
      name: 'Principal',
      email: 'admin@example.com',
      password: 'Adminpass1',
      role: 'admin',
    });
    const cookies = await login('admin@example.com', 'Adminpass1', '/api/admin/auth/login');

    const missing = await request(app)
      .post('/api/admin/students')
      .set('Cookie', cookieHeader(cookies))
      .send({
        name: 'New Student',
        email: 'new.student@example.com',
        studentId: 'STU-NEW',
      });
    const mismatched = await request(app)
      .post('/api/admin/students')
      .set('Cookie', cookieHeader(cookies))
      .set('X-CSRF-Token', 'not-the-cookie-value')
      .send({
        name: 'New Student',
        email: 'new.student@example.com',
        studentId: 'STU-NEW',
      });

    assert.equal(missing.status, 403);
    assert.equal(mismatched.status, 403);
    assert.equal(missing.body.success, false);
  });

  it('returns 403 when a non-admin creates a student', async () => {
    await seedUser({
      name: 'Teacher One',
      email: 'teacher@example.com',
      password: 'Password1',
      role: 'teacher',
      teacherId: 'TCH-100',
    });
    const cookies = await login('teacher@example.com', 'Password1', '/api/auth/login');

    const res = await request(app)
      .post('/api/admin/students')
      .set('Cookie', cookieHeader(cookies))
      .set('X-CSRF-Token', cookies.lms_csrf)
      .send({
        name: 'New Student',
        email: 'new.student@example.com',
        studentId: 'STU-NEW',
      });

    assert.equal(res.status, 403);
    assert.equal(res.body.message, 'Forbidden');
  });

  it('lets an admin create a teacher and another admin', async () => {
    await seedUser({
      name: 'Principal',
      email: 'admin@example.com',
      password: 'Adminpass1',
      role: 'admin',
    });
    const cookies = await login('admin@example.com', 'Adminpass1', '/api/admin/auth/login');

    const teacher = await request(app)
      .post('/api/admin/teachers')
      .set('Cookie', cookieHeader(cookies))
      .set('X-CSRF-Token', cookies.lms_csrf)
      .send({
        name: 'New Teacher',
        email: 'new.teacher@example.com',
        teacherId: 'tch-20',
        department: 'Math',
        role: 'student',
      });
    assert.equal(teacher.status, 201);
    assert.equal(teacher.body.data.user.role, 'teacher');
    assert.equal(teacher.body.data.user.teacherId, 'TCH-20');
    assert.equal(teacher.body.data.user.mustChangePassword, true);
    assert.ok(teacher.body.data.temporaryPassword);

    const admin = await request(app)
      .post('/api/admin/admins')
      .set('Cookie', cookieHeader(cookies))
      .set('X-CSRF-Token', cookies.lms_csrf)
      .send({ name: 'Vice Principal', email: 'vice@example.com', role: 'student' });
    assert.equal(admin.status, 201);
    assert.equal(admin.body.data.user.role, 'admin');
    assert.equal(admin.body.data.user.mustChangePassword, true);

    const list = await request(app)
      .get('/api/admin/admins?search=vice')
      .set('Cookie', cookieHeader(cookies));
    assert.equal(list.status, 200);
    assert.equal(list.body.data.admins.length, 1);
    assert.equal(list.body.data.pagination.total, 1);
  });

  it('lets an admin delete a student and a teacher', async () => {
    await seedUser({
      name: 'Principal',
      email: 'admin@example.com',
      password: 'Adminpass1',
      role: 'admin',
    });
    const cookies = await login('admin@example.com', 'Adminpass1', '/api/admin/auth/login');
    function authed(method, path) {
      return request(app)[method](path)
        .set('Cookie', cookieHeader(cookies))
        .set('X-CSRF-Token', cookies.lms_csrf);
    }

    const student = await authed('post', '/api/admin/students').send({
      name: 'Delete Me',
      email: 'delete.student@example.com',
      studentId: 'STU-DEL',
      department: 'Science',
    });
    assert.equal(student.status, 201, JSON.stringify(student.body));
    const studentId = student.body.data.user.id;
    const course = await authed('post', '/api/admin/courses').send({
      title: 'Delete lab',
      courseCode: 'DEL-1',
      academicTerm: 'Fall 2026',
      days: ['Monday'],
      startTime: '09:00',
      endTime: '11:00',
    });
    assert.equal(course.status, 201, JSON.stringify(course.body));
    const enrolled = await authed('post', '/api/admin/enrollments').send({
      studentId,
      courseId: course.body.data.course.id,
    });
    assert.equal(enrolled.status, 201, JSON.stringify(enrolled.body));
    const removedStudent = await authed('delete', `/api/admin/students/${studentId}`);
    assert.equal(removedStudent.status, 200, JSON.stringify(removedStudent.body));
    const missingStudent = await authed('get', `/api/admin/students/${studentId}`);
    assert.equal(missingStudent.status, 404);
    const roster = await authed('get', `/api/admin/courses/${course.body.data.course.id}`);
    assert.equal(roster.status, 200, JSON.stringify(roster.body));
    assert.equal(roster.body.data.course.enrolledCount, 0);

    const teacher = await authed('post', '/api/admin/teachers').send({
      name: 'Delete Teacher',
      email: 'delete.teacher@example.com',
      teacherId: 'TCH-DEL',
      department: 'Science',
    });
    assert.equal(teacher.status, 201, JSON.stringify(teacher.body));
    const teacherId = teacher.body.data.user.id;
    const assigned = await authed('patch', `/api/admin/courses/${course.body.data.course.id}`).send({
      teacherIds: [teacherId],
    });
    assert.equal(assigned.status, 200, JSON.stringify(assigned.body));
    const removedTeacher = await authed('delete', `/api/admin/teachers/${teacherId}`);
    assert.equal(removedTeacher.status, 200, JSON.stringify(removedTeacher.body));
    const after = await authed('get', `/api/admin/courses/${course.body.data.course.id}`);
    assert.equal(after.body.data.course.teacherIds.length, 0);
    const missingTeacher = await authed('get', `/api/admin/teachers/${teacherId}`);
    assert.equal(missingTeacher.status, 404);
    const removedCourse = await authed('delete', `/api/admin/courses/${course.body.data.course.id}`);
    assert.equal(removedCourse.status, 200, JSON.stringify(removedCourse.body));
    const missingCourse = await authed('get', `/api/admin/courses/${course.body.data.course.id}`);
    assert.equal(missingCourse.status, 404);
    const notAStudent = await authed('delete', `/api/admin/students/${teacherId}`);
    assert.equal(notAStudent.status, 404);
  });

  it('lets an admin update their own name', async () => {
    await seedUser({
      name: 'Principal',
      email: 'admin@example.com',
      password: 'Adminpass1',
      role: 'admin',
    });
    const cookies = await login('admin@example.com', 'Adminpass1', '/api/admin/auth/login');
    const updated = await request(app)
      .patch('/api/admin/profile')
      .set('Cookie', cookieHeader(cookies))
      .set('X-CSRF-Token', cookies.lms_csrf)
      .send({ name: 'School Admin' });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(updated.body.data.user.name, 'School Admin');
    assert.equal(updated.body.data.user.email, 'admin@example.com');
  });

  it('replaces a student enrollment when their courses are edited', async () => {
    await seedUser({
      name: 'Principal',
      email: 'admin@example.com',
      password: 'Adminpass1',
      role: 'admin',
    });
    const cookies = await login('admin@example.com', 'Adminpass1', '/api/admin/auth/login');
    function authed(method, path) {
      return request(app)[method](path)
        .set('Cookie', cookieHeader(cookies))
        .set('X-CSRF-Token', cookies.lms_csrf);
    }
    const firstCourse = await authed('post', '/api/admin/courses').send({
      title: 'Morning lab',
      courseCode: 'LAB-AM',
      academicTerm: 'Fall 2026',
      days: ['Monday'],
      startTime: '09:00',
      endTime: '11:00',
    });
    const secondCourse = await authed('post', '/api/admin/courses').send({
      title: 'Evening lab',
      courseCode: 'LAB-PM',
      academicTerm: 'Fall 2026',
      days: ['Tuesday'],
      startTime: '16:00',
      endTime: '18:00',
    });
    assert.equal(firstCourse.status, 201, JSON.stringify(firstCourse.body));
    assert.equal(secondCourse.status, 201, JSON.stringify(secondCourse.body));
    const created = await authed('post', '/api/admin/students').send({
      name: 'Course Student',
      email: 'course.student@example.com',
      studentId: 'STU-EDIT',
      courseId: firstCourse.body.data.course.id,
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const edited = await authed('patch', `/api/admin/students/${created.body.data.user.id}`).send({
      courseIds: [secondCourse.body.data.course.id],
    });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    const morning = await authed('get', `/api/admin/enrollments?courseId=${firstCourse.body.data.course.id}`);
    const evening = await authed('get', `/api/admin/enrollments?courseId=${secondCourse.body.data.course.id}`);
    assert.equal(morning.status, 200);
    assert.equal(evening.status, 200);
    assert.equal(morning.body.data.enrollments.length, 0);
    assert.equal(evening.body.data.enrollments.length, 1);
    assert.equal(evening.body.data.enrollments[0].studentId, created.body.data.user.id);
  });
});

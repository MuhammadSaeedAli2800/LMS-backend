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
  setCookieLine,
  seedUser,
} = require('./setup');

const LOGIN_ERROR = 'Invalid email or password';

describe('authentication', () => {
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

  it('POST /api/auth/register returns 404', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Ada', email: 'ada@example.com', password: 'Password1' });

    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { success: false, message: 'Not found' });
  });

  it('lets students and teachers log in with an httpOnly token cookie and no password hash', async () => {
    await seedUser({
      name: 'Student One',
      email: 'student@example.com',
      password: 'Password1',
      role: 'student',
      studentId: 'STU-100',
    });
    await seedUser({
      name: 'Teacher One',
      email: 'teacher@example.com',
      password: 'Password1',
      role: 'teacher',
      teacherId: 'TCH-100',
    });

    const studentRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'student@example.com', password: 'Password1' });
    const teacherRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'teacher@example.com', password: 'Password1', rememberMe: false });

    for (const res of [studentRes, teacherRes]) {
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.user.passwordHash, undefined);
      assert.equal(JSON.stringify(res.body).includes('passwordHash'), false);
      assert.ok(extractCookies(res).lms_token);
      const tokenAttrs = setCookieLine(res, 'lms_token').split(';').slice(1).join(';');
      const csrfAttrs = setCookieLine(res, 'lms_csrf').split(';').slice(1).join(';');
      assert.match(tokenAttrs, /HttpOnly/i);
      assert.match(tokenAttrs, /SameSite=Lax/i);
      assert.doesNotMatch(csrfAttrs, /HttpOnly/i);
      assert.doesNotMatch(tokenAttrs, /Secure/i);
    }

    assert.equal(studentRes.body.data.user.role, 'student');
    assert.equal(teacherRes.body.data.user.role, 'teacher');

    const studentAsTeacher = await request(app)
      .post('/api/auth/login')
      .send({ email: 'student@example.com', password: 'Password1', loginAs: 'teacher' });
    const teacherAsStudent = await request(app)
      .post('/api/auth/login')
      .send({ email: 'teacher@example.com', password: 'Password1', loginAs: 'student' });
    assert.equal(studentAsTeacher.status, 401);
    assert.equal(teacherAsStudent.status, 401);
    assert.equal(studentAsTeacher.body.message, LOGIN_ERROR);

    const matched = await request(app)
      .post('/api/auth/login')
      .send({ email: 'student@example.com', password: 'Password1', loginAs: 'student' });
    assert.equal(matched.status, 200);
    assert.equal(matched.body.data.user.role, 'student');
    assert.doesNotMatch(setCookieLine(studentRes, 'lms_token').split(';').slice(1).join(';'), /Max-Age=/i);
  });

  it('sets a persistent cookie when rememberMe is true', async () => {
    await seedUser({
      name: 'Student One',
      email: 'student@example.com',
      password: 'Password1',
      role: 'student',
      studentId: 'STU-100',
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'student@example.com', password: 'Password1', rememberMe: true });

    assert.equal(res.status, 200);
    assert.match(setCookieLine(res, 'lms_token').split(';').slice(1).join(';'), /Max-Age=/i);
    assert.match(setCookieLine(res, 'lms_csrf').split(';').slice(1).join(';'), /Max-Age=/i);
  });

  it('returns the same 401 for a wrong password and an unknown email', async () => {
    await seedUser({
      name: 'Student One',
      email: 'student@example.com',
      password: 'Password1',
      role: 'student',
      studentId: 'STU-100',
    });

    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email: 'student@example.com', password: 'Wrongpass1' });
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'missing@example.com', password: 'Wrongpass1' });

    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.body.message, LOGIN_ERROR);
    assert.deepEqual(wrong.body, unknown.body);
    assert.equal(extractCookies(wrong).lms_token, undefined);
    assert.equal(extractCookies(unknown).lms_token, undefined);
  });

  it('rejects an admin on the public login with the generic 401', async () => {
    await seedUser({
      name: 'Principal',
      email: 'admin@example.com',
      password: 'Adminpass1',
      role: 'admin',
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'Adminpass1' });

    assert.equal(res.status, 401);
    assert.equal(res.body.message, LOGIN_ERROR);
    assert.equal(extractCookies(res).lms_token, undefined);
  });

  it('rejects a student on the admin login with the generic 401', async () => {
    await seedUser({
      name: 'Student One',
      email: 'student@example.com',
      password: 'Password1',
      role: 'student',
      studentId: 'STU-100',
    });

    const res = await request(app)
      .post('/api/admin/auth/login')
      .send({ email: 'student@example.com', password: 'Password1' });

    assert.equal(res.status, 401);
    assert.equal(res.body.message, LOGIN_ERROR);
    assert.equal(extractCookies(res).lms_token, undefined);
  });

  it('blocks an inactive student after the correct password', async () => {
    await seedUser({
      name: 'Student One',
      email: 'student@example.com',
      password: 'Password1',
      role: 'student',
      studentId: 'STU-100',
      accountStatus: 'inactive',
    });

    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ email: 'student@example.com', password: 'Wrongpass1' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'student@example.com', password: 'Password1' });

    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.message, LOGIN_ERROR);
    assert.equal(res.status, 403);
    assert.equal(res.body.message, 'This account is inactive. Contact your administrator.');
    assert.equal(extractCookies(res).lms_token, undefined);
  });

  it('rejects a wrong current password', async () => {
    await seedUser({
      name: 'Student One',
      email: 'student@example.com',
      password: 'Password1',
      role: 'student',
      studentId: 'STU-100',
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'student@example.com', password: 'Password1' });
    const cookies = extractCookies(loginRes);

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', cookieHeader(cookies))
      .set('X-CSRF-Token', cookies.lms_csrf)
      .send({ currentPassword: 'Wrongpass1', newPassword: 'Changed12' });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Current password is incorrect');
  });

  it('clears cookies on logout so the next profile request is unauthorized', async () => {
    await seedUser({
      name: 'Student One',
      email: 'student@example.com',
      password: 'Password1',
      role: 'student',
      studentId: 'STU-100',
    });

    const agent = request.agent(app);
    const loginRes = await agent
      .post('/api/auth/login')
      .send({ email: 'student@example.com', password: 'Password1' });
    assert.equal(loginRes.status, 200);
    const cookies = extractCookies(loginRes);

    const logoutRes = await agent
      .post('/api/auth/logout')
      .set('X-CSRF-Token', cookies.lms_csrf);
    assert.equal(logoutRes.status, 200);
    assert.match(setCookieLine(logoutRes, 'lms_token'), /Expires=/i);
    assert.match(setCookieLine(logoutRes, 'lms_csrf'), /Expires=/i);

    const me = await agent.get('/api/auth/me');
    assert.equal(me.status, 401);
    assert.equal(me.body.success, false);
  });
});

const asyncHandler = require('../utils/asyncHandler');
const adminUserService = require('../services/adminUserService');

function listQuery(req) {
  return {
    search: req.query.search,
    status: req.query.status,
    department: req.query.department,
    className: req.query.className,
    page: req.query.page,
    limit: req.query.limit,
  };
}

const listStudents = asyncHandler(async (req, res) => {
  const result = await adminUserService.listUsers({ role: 'student', ...listQuery(req) });
  res.json({
    success: true,
    data: {
      students: result.users,
      pagination: result.pagination,
    },
  });
});

const createStudent = asyncHandler(async (req, res) => {
  const result = await adminUserService.createStudent(req.user._id, req.body);
  res.status(result.enrolledExisting ? 200 : 201).json({
    success: true,
    message: result.enrolledExisting ? 'Student enrolled' : 'Student created',
    data: result,
  });
});

const getStudent = asyncHandler(async (req, res) => {
  const user = await adminUserService.getByRole(req.params.id, 'student');
  res.json({
    success: true,
    data: { user: adminUserService.sanitizeUser(user) },
  });
});

const updateStudent = asyncHandler(async (req, res) => {
  const user = await adminUserService.updateStudent(req.params.id, req.body, req.user._id);
  res.json({
    success: true,
    message: 'Student updated',
    data: { user },
  });
});

const updateStudentStatus = asyncHandler(async (req, res) => {
  const user = await adminUserService.setStudentStatus(
    req.params.id,
    req.body.accountStatus,
    req.user._id
  );
  res.json({
    success: true,
    message: 'Student status updated',
    data: { user },
  });
});

const deleteStudent = asyncHandler(async (req, res) => {
  const result = await adminUserService.deleteStudent(req.params.id, req.user._id);
  res.json({
    success: true,
    message: 'Student deleted',
    data: result,
  });
});

const resetStudentPassword = asyncHandler(async (req, res) => {
  const result = await adminUserService.resetStudentPassword(req.params.id, req.user._id);
  res.json({
    success: true,
    message: 'Password reset',
    data: result,
  });
});

const listTeachers = asyncHandler(async (req, res) => {
  const result = await adminUserService.listUsers({ role: 'teacher', ...listQuery(req) });
  res.json({
    success: true,
    data: {
      teachers: result.users,
      pagination: result.pagination,
    },
  });
});

const createTeacher = asyncHandler(async (req, res) => {
  const result = await adminUserService.createTeacher(req.user._id, req.body);
  res.status(201).json({
    success: true,
    message: 'Teacher created',
    data: result,
  });
});

const getTeacher = asyncHandler(async (req, res) => {
  const user = await adminUserService.getByRole(req.params.id, 'teacher');
  res.json({
    success: true,
    data: { user: adminUserService.sanitizeUser(user) },
  });
});

const updateTeacher = asyncHandler(async (req, res) => {
  const user = await adminUserService.updateTeacher(req.params.id, req.body);
  res.json({
    success: true,
    message: 'Teacher updated',
    data: { user },
  });
});

const updateTeacherStatus = asyncHandler(async (req, res) => {
  const user = await adminUserService.setTeacherStatus(
    req.params.id,
    req.body.accountStatus,
    req.user._id
  );
  res.json({
    success: true,
    message: 'Teacher status updated',
    data: { user },
  });
});

const deleteTeacher = asyncHandler(async (req, res) => {
  const result = await adminUserService.deleteTeacher(req.params.id, req.user._id);
  res.json({
    success: true,
    message: 'Teacher deleted',
    data: result,
  });
});

const resetTeacherPassword = asyncHandler(async (req, res) => {
  const result = await adminUserService.resetTeacherPassword(req.params.id, req.user._id);
  res.json({
    success: true,
    message: 'Password reset',
    data: result,
  });
});

const listAdmins = asyncHandler(async (req, res) => {
  const result = await adminUserService.listUsers({
    role: 'admin',
    search: req.query.search,
    page: req.query.page,
    limit: req.query.limit,
  });
  res.json({
    success: true,
    data: {
      admins: result.users,
      pagination: result.pagination,
    },
  });
});

const updateOwnProfile = asyncHandler(async (req, res) => {
  const user = await adminUserService.updateOwnProfile(req.user._id, req.body.name);
  res.json({ success: true, data: { user } });
});

const createAdmin = asyncHandler(async (req, res) => {
  const result = await adminUserService.createAdmin(req.user._id, req.body);
  res.status(201).json({
    success: true,
    message: 'Admin created',
    data: result,
  });
});

module.exports = {
  listStudents,
  createStudent,
  getStudent,
  updateStudent,
  updateStudentStatus,
  deleteStudent,
  resetStudentPassword,
  listTeachers,
  createTeacher,
  getTeacher,
  updateTeacher,
  updateTeacherStatus,
  deleteTeacher,
  resetTeacherPassword,
  listAdmins,
  createAdmin,
  updateOwnProfile,
};

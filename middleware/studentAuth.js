const jwt = require('jsonwebtoken');
const Student = require('../models/Student');

async function studentAuthMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    let student = null;

    // Prefer the authenticated student's database ID.
    if (decoded.id) {
      student = await Student.findById(decoded.id).lean();
    }

    // Fallback for older tokens. Keep the lookup school-scoped when the token
    // contains a school ID, preventing registration-number collisions between schools.
    if (!student && decoded.regNo) {
      const fallbackQuery = { regNo: decoded.regNo };
      if (decoded.schoolId) fallbackQuery.schoolId = decoded.schoolId;
      student = await Student.findOne(fallbackQuery).lean();
    }

    if (!student) {
      return res.status(401).json({ error: 'Student not found.' });
    }

    // Older student records without accountStatus remain active for backward
    // compatibility. Explicitly inactive accounts are blocked on every request,
    // including requests made with tokens issued before the account was disabled.
    const accountStatus = String(student.accountStatus || 'active').toLowerCase();
    if (accountStatus !== 'active') {
      return res.status(403).json({
        success: false,
        code: 'STUDENT_ACCOUNT_INACTIVE',
        error: 'Your student account is inactive. Please contact your school administrator to activate it.'
      });
    }

    // Remove password before putting the student on req.
    delete student.password;

    req.student = {
      id: student._id.toString(),
      ...student
    };

    // Shared middleware compatibility.
    req.user = {
      id: student._id.toString(),
      name: `${student.firstname} ${student.surname}`,
      regNo: student.regNo,
      role: 'student',
      schoolId: student.schoolId || null
    };

    return next();
  } catch (err) {
    console.error('Student auth error:', err);
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

module.exports = studentAuthMiddleware;

const jwt = require('jsonwebtoken');
const Student = require('../models/Student');

async function studentAuthMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'No token provided.'
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    let student = null;

    // Prefer the authenticated student's database ID.
    if (decoded.id) {
      student = await Student.findById(decoded.id).lean();
    }

    // Fallback for older tokens.
    if (!student && decoded.regNo) {
      student = await Student.findOne({
        regNo: decoded.regNo
      }).lean();
    }

    if (!student) {
      return res.status(401).json({
        error: 'Student not found.'
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

    next();

  } catch (err) {
    console.error('Student auth error:', err);

    return res.status(401).json({
      error: 'Invalid or expired token.'
    });
  }
}

module.exports = studentAuthMiddleware;

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Staff = require('../models/Staff');

module.exports = async function adminAuth(req, res, next) {
  try {
    if (req.user && req.user.role) {
      const allowedRoles = ['superadmin', 'admin', 'teacher', 'Teacher', 'Head Teacher', 'Principal', 'HR', 'Account/Admin'];
      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({
          error: 'Admin access required.'
        });
      }
      return next();
    }
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'No token provided.'
      });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (user) {
      const allowedUserRoles = ['superadmin', 'admin', 'teacher'];
      if (!allowedUserRoles.includes(user.role)) {
        return res.status(403).json({
          error: 'Admin access required.'
        });
      }
      req.user = {
        id: user._id,
        name: user.name,
        email: user.email,
        regNo: user.regNo || null,
        role: user.role,
        schoolId: user.schoolId || null
      };
      return next();
    }
    const staff = await Staff.findById(decoded.id);
    if (staff) {
      const allowedStaffRoles = ['Teacher', 'Head Teacher', 'Principal', 'HR', 'Account/Admin'];
      if (!allowedStaffRoles.includes(staff.access_level)) {
        return res.status(403).json({
          error: 'Admin access required.'
        });
      }
      req.user = {
        id: staff._id,
        name: `${staff.first_name} ${staff.last_name}`,
        email: staff.login_email || staff.email,
        role: staff.access_level,
        department: staff.department,
        designation: staff.designation,
        schoolId: staff.schoolId || null
      };
      return next();
    }
    return res.status(401).json({
      error: 'User not found.'
    });
  } catch (err) {
    console.error('[ADMIN AUTH ERROR]', err);
    return res.status(401).json({
      error: 'Invalid or expired token.'
    });
  }
};

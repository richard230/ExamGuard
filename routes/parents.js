const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Parent = require('../models/Parent');
const Student = require('../models/Student');
const { authMiddleware } = require('./auth');
function getSchoolId(req) {
  if (!req.user) return null;
  if (req.user.role === 'superadmin') {
    return null;
  }
  return req.user.schoolId || null;
}
function requireSchool(req, res) {
  const schoolId = getSchoolId(req);
  if (req.user?.role !== 'superadmin' && !schoolId) {
    res.status(403).json({
      error: 'Your account is not assigned to a school.'
    });
    return null;
  }
  return schoolId;
}
function addSchoolFilter(req, query = {}) {
  const schoolId = getSchoolId(req);
  if (req.user?.role !== 'superadmin') {
    if (!schoolId) {
      throw new Error('Your account is not assigned to a school.');
    }
    query.schoolId = schoolId;
  }
  return query;
}
function generateTemporaryPassword() {
  const length = 12;
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(
      Math.floor(Math.random() * chars.length)
    );
  }
  return password;
}
async function resolveStudentObjectIds(studentIds, schoolId, isSuperAdmin = false) {
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    return [];
  }
  const validObjectIds = studentIds
    .filter(id => mongoose.Types.ObjectId.isValid(id))
    .map(id => new mongoose.Types.ObjectId(id));
  let query = {};
  if (validObjectIds.length > 0) {
    query._id = { $in: validObjectIds };
  } else {
    query.student_id = { $in: studentIds };
  }
  if (!isSuperAdmin) {
    query.schoolId = schoolId;
  }
  const students = await Student.find(query).select('_id');
  return students.map(student => student._id);
}
async function getAuthenticatedParent(req, res) {
  if (!req.user || req.user.role !== 'parent') {
    res.status(403).json({
      error: 'Parent access required.'
    });
    return null;
  }
  const parentId = req.user.id || req.user._id;
  if (!parentId || !mongoose.Types.ObjectId.isValid(parentId)) {
    res.status(401).json({
      error: 'Invalid parent account.'
    });
    return null;
  }
  const query = {
    _id: parentId
  };
  if (req.user.schoolId) {
    query.schoolId = req.user.schoolId;
  }
  const parent = await Parent.findOne(query)
    .select('+password +temporaryPassword');
  if (!parent) {
    res.status(404).json({
      error: 'Parent not found.'
    });
    return null;
  }
  return parent;
}
function isParentAdmin(req) {
  return [
    'superadmin',
    'admin',
    'teacher',
    'Teacher',
    'Head Teacher',
    'Principal',
    'HR',
    'Account/Admin'
  ].includes(req.user?.role);
}
function isSuperAdmin(req) {
  return req.user?.role === 'superadmin';
}
router.post('/login', async (req, res) => {
  try {
    const {
      email,
      password,
      schoolId
    } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password required'
      });
    }
    const normalizedEmail = email.toLowerCase().trim();
    const query = {
      email: normalizedEmail
    };
    if (schoolId) {
      if (!mongoose.Types.ObjectId.isValid(schoolId)) {
        return res.status(400).json({
          error: 'Invalid school ID.'
        });
      }
      query.schoolId = schoolId;
    }
    const parent = await Parent.findOne(query)
      .select('+password');
    if (!parent) {
      return res.status(401).json({
        error: 'Invalid email or password'
      });
    }
    if (!parent.password) {
      return res.status(401).json({
        error:
          'Account not activated. Please contact the school to set your password.'
      });
    }
    let isPasswordValid = false;
    try {
      isPasswordValid = await bcrypt.compare(
        password,
        parent.password
      );
    } catch (compareErr) {
      console.error('Bcrypt comparison error:', compareErr);
      return res.status(500).json({
        error: 'Authentication system error'
      });
    }
    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Invalid email or password'
      });
    }
    parent.lastLogin = new Date();
    await parent.save();
    const token = jwt.sign(
      {
        id: parent._id,
        _id: parent._id,
        email: parent.email,
        role: 'parent',
        schoolId: parent.schoolId || null
      },
      process.env.JWT_SECRET || 'your-secret-key',
      {
        expiresIn: '7d'
      }
    );
    res.json({
      success: true,
      token,
      parent: {
        _id: parent._id,
        name: parent.name,
        email: parent.email,
        phone: parent.phone,
        address: parent.address,
        role: 'parent',
        schoolId: parent.schoolId || null
      }
    });
  } catch (error) {
    console.error('Parent login error:', error);
    res.status(500).json({
      error: 'Server error: ' + error.message
    });
  }
});
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const parent = await getAuthenticatedParent(req, res);
    if (!parent) return;
    const parentQuery = {
      _id: parent._id
    };
    if (!isSuperAdmin(req)) {
      parentQuery.schoolId = req.user.schoolId;
    }
    const populatedParent = await Parent.findOne(parentQuery)
      .populate({
        path: 'studentIds',
        select: `
          _id
          schoolId
          student_id
          firstname
          surname
          othernames
          class
          classArm
          regNo
          dob
          gender
          photoBase64
          academic
          attendance
          fees
          parentName
          parentEmail
          studentEmail
          studentPhone
        `
      })
      .select('-password -temporaryPassword');
    if (!populatedParent) {
      return res.status(404).json({
        error: 'Parent not found'
      });
    }
    const parentData = populatedParent.toObject();
    parentData.students = (parentData.studentIds || [])
      .filter(student => {
        if (isSuperAdmin(req)) return true;
        return String(student.schoolId) ===
          String(req.user.schoolId);
      })
      .map(student => ({
        _id: student._id,
        student_id: student.student_id,
        name:
          `${student.firstname} ${student.surname}${
            student.othernames
              ? ' ' + student.othernames
              : ''
          }`.trim(),
        firstname: student.firstname,
        surname: student.surname,
        class: student.class,
        classArm: student.classArm,
        regNo: student.regNo,
        dob: student.dob,
        gender: student.gender,
        photoBase64: student.photoBase64,
        email:
          student.studentEmail ||
          student.parentEmail,
        phone: student.studentPhone,
        academicStats: {
          totalRecords:
            (student.academic || []).length,
          latestGrade:
            student.academic &&
            student.academic.length > 0
              ? student.academic[
                  student.academic.length - 1
                ].grade
              : null,
          averageScore:
            calculateAverageScore(
              student.academic
            ),
          subjects:
            extractSubjects(
              student.academic
            ),
          byTerm:
            groupByTerm(
              student.academic
            )
        },
        attendanceStats: {
          totalRecords:
            (student.attendance || []).length,
          latestAttendance:
            student.attendance &&
            student.attendance.length > 0
              ? student.attendance[
                  student.attendance.length - 1
                ]
              : null,
          averageAttendancePercentage:
            calculateAverageAttendance(
              student.attendance
            ),
          byTerm:
            groupAttendanceByTerm(
              student.attendance
            )
        },
        feesStats: {
          total:
            (student.fees || []).length,
          pending:
            (student.fees || []).filter(f => {
              const status =
                String(
                  f.status || ''
                ).toLowerCase();
              return (
                status === 'unpaid' ||
                status === 'pending'
              );
            }).length,
          paid:
            (student.fees || []).filter(f => {
              const status =
                String(
                  f.status || ''
                ).toLowerCase();
              return (
                status === 'paid' ||
                status === 'waived'
              );
            }).length,
          outstanding:
            calculateOutstandingFees(
              student.fees
            ),
          byTerm:
            groupFeesByTerm(
              student.fees
            )
        }
      }));
    parentData.dashboardSummary = {
      totalChildren:
        parentData.students.length,
      averageAttendance:
        calculateGlobalAttendance(
          parentData.students
        ),
      averageGrade:
        calculateGlobalAverageGrade(
          parentData.students
        ),
      pendingFeesTotal:
        parentData.students.reduce(
          (sum, student) =>
            sum +
            (student.feesStats?.outstanding || 0),
          0
        ),
      allStudentsPending:
        parentData.students.reduce(
          (sum, student) =>
            sum +
            (student.feesStats?.pending || 0),
          0
        )
    };
    delete parentData.studentIds;
    res.json(parentData);
  } catch (error) {
    console.error(
      'Error getting parent:',
      error
    );
    res.status(500).json({
      error: error.message
    });
  }
});
async function verifyParentStudent(req, res) {
  const parent = await getAuthenticatedParent(req, res);
  if (!parent) return null;
  const studentId = req.params.studentId;
  if (!mongoose.Types.ObjectId.isValid(studentId)) {
    res.status(400).json({
      error: 'Invalid student ID'
    });
    return null;
  }
  const belongsToParent = parent.studentIds.some(
    id => String(id) === String(studentId)
  );
  if (!belongsToParent) {
    res.status(403).json({
      error: 'Access denied to this student'
    });
    return null;
  }
  return parent;
}
router.get(
  '/me/students/:studentId/results',
  authMiddleware,
  async (req, res) => {
    try {
      const parent =
        await verifyParentStudent(req, res);
      if (!parent) return;
      const Result =
        require('../models/Result');
      const resultQuery = {
        student: req.params.studentId
      };
      const results =
        await Result.find(resultQuery)
          .populate('subject', 'name')
          .populate('session', 'name')
          .populate('term', 'name')
          .sort({ createdAt: -1 })
          .limit(5)
          .lean();
      const transformedResults =
        results.map(result => {
          const ca1 =
            result.ca1_score || 0;
          const ca2 =
            result.ca2_score || 0;
          const exam =
            result.exam_score || 0;
          const totalScore =
            result.score ||
            (ca1 + ca2 + exam) ||
            0;
          let grade = result.grade;
          if (!grade || grade === '') {
            if (totalScore >= 70) grade = 'A';
            else if (totalScore >= 60) grade = 'B';
            else if (totalScore >= 50) grade = 'C';
            else if (totalScore >= 45) grade = 'D';
            else if (totalScore >= 40) grade = 'E';
            else grade = 'F';
          }
          return {
            _id: result._id,
            subject:
              result.subject?.name ||
              'Unknown',
            score: totalScore,
            total: totalScore,
            ca1,
            ca2,
            exam,
            grade,
            remarks:
              result.remarks || '',
            session:
              result.session?.name || '',
            term:
              result.term?.name || '',
            status:
              result.status ||
              'Published'
          };
        });
      res.json({
        success: true,
        results: transformedResults,
        recordCount:
          transformedResults.length,
        session:
          results.length > 0
            ? results[0].session?.name
            : '',
        term:
          results.length > 0
            ? results[0].term?.name
            : ''
      });
    } catch (error) {
      console.error(
        'Error getting student results:',
        error
      );
      res.status(500).json({
        error: error.message
      });
    }
  }
);
router.get(
  '/me/students/:studentId/assignments',
  authMiddleware,
  async (req, res) => {
    try {
      const parent =
        await verifyParentStudent(req, res);
      if (!parent) return;
      const Assignment =
        require('../models/Assignment');
      const assignments =
        await Assignment.find({
          assignedTo: req.params.studentId,
          dueDate: {
            $gte:
              new Date(
                Date.now() -
                7 * 24 * 60 * 60 * 1000
              )
          }
        })
          .populate('subject', 'name')
          .populate('teacher', 'name')
          .sort({ dueDate: 1 })
          .lean();
      const transformedAssignments =
        assignments.map(assignment => ({
          _id: assignment._id,
          title:
            assignment.title ||
            'Untitled Assignment',
          description:
            assignment.description ||
            'No description provided',
          subject:
            assignment.subject?.name ||
            'Unknown Subject',
          teacher:
            assignment.teacher?.name ||
            'Unknown Teacher',
          dueDate:
            assignment.dueDate,
          deadline:
            assignment.dueDate,
          createdAt:
            assignment.createdAt,
          files:
            assignment.files || [],
          status:
            new Date(assignment.dueDate) <
            new Date()
              ? 'Overdue'
              : 'Active'
        }));
      res.json({
        success: true,
        assignments:
          transformedAssignments,
        recordCount:
          transformedAssignments.length
      });
    } catch (error) {
      console.error(
        'Error getting student assignments:',
        error
      );
      res.status(500).json({
        error: error.message
      });
    }
  }
);
router.get(
  '/me/students/:studentId/grades',
  authMiddleware,
  async (req, res) => {
    try {
      const parent =
        await verifyParentStudent(req, res);
      if (!parent) return;
      const student =
        await Student.findOne({
          _id: req.params.studentId,
          ...(isSuperAdmin(req)
            ? {}
            : {
                schoolId:
                  req.user.schoolId
              })
        })
          .select(
            'academic firstname surname'
          );
      if (!student) {
        return res.status(404).json({
          error: 'Student not found'
        });
      }
      const { term } =
        req.query;
      let academicData =
        student.academic || [];
      if (term) {
        academicData =
          academicData.filter(
            record =>
              record.term === term
          );
      }
      const subjectGrades = {};
      academicData.forEach(record => {
        if (!subjectGrades[record.subject]) {
          subjectGrades[
            record.subject
          ] = [];
        }
        subjectGrades[
          record.subject
        ].push({
          session:
            record.session,
          term:
            record.term,
          score:
            record.score,
          grade:
            record.grade,
          remarks:
            record.remarks,
          date:
            record.date,
          class:
            record.class
        });
      });
      const stats = {
        totalSubjects:
          Object.keys(
            subjectGrades
          ).length,
        averageScore:
          academicData.length > 0
            ? (
                academicData.reduce(
                  (sum, r) =>
                    sum +
                    (r.score || 0),
                  0
                ) /
                academicData.length
              ).toFixed(2)
            : 0,
        highestScore:
          academicData.length > 0
            ? Math.max(
                ...academicData.map(
                  r => r.score || 0
                )
              )
            : 0,
        lowestScore:
          academicData.length > 0
            ? Math.min(
                ...academicData.map(
                  r => r.score || 0
                )
              )
            : 0,
        gradeDistribution: {
          a: academicData.filter(
            r => r.grade === 'A'
          ).length,
          b: academicData.filter(
            r => r.grade === 'B'
          ).length,
          c: academicData.filter(
            r => r.grade === 'C'
          ).length,
          d: academicData.filter(
            r => r.grade === 'D'
          ).length,
          e: academicData.filter(
            r => r.grade === 'E'
          ).length,
          f: academicData.filter(
            r => r.grade === 'F'
          ).length
        }
      };
      res.json({
        student: {
          _id: student._id,
          name:
            `${student.firstname} ${student.surname}`,
          firstname:
            student.firstname,
          surname:
            student.surname
        },
        term:
          term || 'all',
        stats,
        subjectGrades,
        records:
          academicData,
        recordCount:
          academicData.length
      });
    } catch (error) {
      console.error(
        'Error getting student grades:',
        error
      );
      res.status(500).json({
        error: error.message
      });
    }
  }
);
router.get(
  '/me/students/:studentId/attendance',
  authMiddleware,
  async (req, res) => {
    try {
      const parent =
        await verifyParentStudent(req, res);
      if (!parent) return;
      const student =
        await Student.findOne({
          _id: req.params.studentId,
          ...(isSuperAdmin(req)
            ? {}
            : {
                schoolId:
                  req.user.schoolId
              })
        })
          .select(
            'attendance firstname surname'
          );
      if (!student) {
        return res.status(404).json({
          error: 'Student not found'
        });
      }
      const attendanceData =
        student.attendance || [];
      const byTerm = {};
      attendanceData.forEach(record => {
        if (!byTerm[record.term]) {
          byTerm[record.term] = [];
        }
        byTerm[record.term].push({
          session:
            record.session,
          term:
            record.term,
          present:
            record.present,
          total:
            record.total,
          percentage:
            record.total > 0
              ? (
                  (record.present /
                    record.total) *
                  100
                ).toFixed(2)
              : 0,
          date:
            record.date
        });
      });
      let totalPresent = 0;
      let totalDays = 0;
      attendanceData.forEach(record => {
        totalPresent +=
          record.present || 0;
        totalDays +=
          record.total || 0;
      });
      res.json({
        student: {
          _id: student._id,
          name:
            `${student.firstname} ${student.surname}`,
          firstname:
            student.firstname,
          surname:
            student.surname
        },
        stats: {
          totalDays,
          totalPresent,
          overallPercentage:
            totalDays > 0
              ? (
                  (totalPresent /
                    totalDays) *
                  100
                ).toFixed(2)
              : 0,
          recordCount:
            attendanceData.length
        },
        byTerm,
        records:
          attendanceData
      });
    } catch (error) {
      console.error(
        'Error getting student attendance:',
        error
      );
      res.status(500).json({
        error: error.message
      });
    }
  }
);
router.get(
  '/me/students/:studentId/fees',
  authMiddleware,
  async (req, res) => {
    try {
      const parent =
        await verifyParentStudent(req, res);
      if (!parent) return;
      const student =
        await Student.findOne({
          _id: req.params.studentId,
          ...(isSuperAdmin(req)
            ? {}
            : {
                schoolId:
                  req.user.schoolId
              })
        })
          .select(
            'fees firstname surname'
          );
      if (!student) {
        return res.status(404).json({
          error: 'Student not found'
        });
      }
      const feesData =
        student.fees || [];
      const byTerm = {};
      let totalOutstanding = 0;
      feesData.forEach(record => {
        if (!byTerm[record.term]) {
          byTerm[record.term] = {
            paid: [],
            pending: [],
            total: 0,
            outstanding: 0
          };
        }
        const feeRecord = {
          session:
            record.session,
          term:
            record.term,
          type:
            record.type,
          amount:
            record.amount,
          status:
            record.status,
          date:
            record.date
        };
        if (
          record.status === 'paid'
        ) {
          byTerm[
            record.term
          ].paid.push(feeRecord);
        } else if (
          record.status === 'pending'
        ) {
          byTerm[
            record.term
          ].pending.push(feeRecord);
          totalOutstanding +=
            record.amount || 0;
        }
        byTerm[
          record.term
        ].total +=
          record.amount || 0;
      });
      const stats = {
        totalFees:
          feesData.reduce(
            (sum, fee) =>
              sum +
              (fee.amount || 0),
            0
          ),
        totalPaid:
          feesData
            .filter(
              fee =>
                fee.status ===
                'paid'
            )
            .reduce(
              (sum, fee) =>
                sum +
                (fee.amount || 0),
              0
            ),
        totalOutstanding,
        pendingCount:
          feesData.filter(
            fee =>
              fee.status ===
              'pending'
          ).length,
        paidCount:
          feesData.filter(
            fee =>
              fee.status ===
              'paid'
          ).length
      };
      res.json({
        student: {
          _id: student._id,
          name:
            `${student.firstname} ${student.surname}`,
          firstname:
            student.firstname,
          surname:
            student.surname
        },
        stats,
        byTerm,
        records:
          feesData
      });
    } catch (error) {
      console.error(
        'Error getting student fees:',
        error
      );
      res.status(500).json({
        error: error.message
      });
    }
  }
);
router.post(
  '/resend-credentials/:id',
  authMiddleware,
  async (req, res) => {
    try {
      if (!isParentAdmin(req)) {
        return res.status(403).json({
          error: 'Admin access required.'
        });
      }
      const query = {
        _id: req.params.id
      };
      if (!isSuperAdmin(req)) {
        query.schoolId =
          requireSchool(req, res);
        if (!query.schoolId) return;
      }
      const parent =
        await Parent.findOne(query)
          .select(
            '+temporaryPassword'
          );
      if (!parent) {
        return res.status(404).json({
          error: 'Parent not found'
        });
      }
      const credentials = {
        email:
          parent.email,
        password:
          parent.temporaryPassword ||
          'Not available',
        loginUrl:
          `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login.html`
      };
      res.json({
        success: true,
        message:
          'Credentials retrieved',
        credentials
      });
    } catch (error) {
      res.status(500).json({
        error: error.message
      });
    }
  }
);
router.post(
  '/:id/change-password',
  authMiddleware,
  async (req, res) => {
    try {
      if (req.user.role !== 'parent') {
        return res.status(403).json({
          error: 'Parent access required.'
        });
      }
      if (
        String(req.user.id) !==
        String(req.params.id)
      ) {
        return res.status(403).json({
          error:
            'You can only change your own password.'
        });
      }
      const {
        currentPassword,
        newPassword
      } = req.body;
      if (
        !currentPassword ||
        !newPassword
      ) {
        return res.status(400).json({
          error:
            'Current and new password required'
        });
      }
      const parent =
        await getAuthenticatedParent(
          req,
          res
        );
      if (!parent) return;
      const isValid =
        await bcrypt.compare(
          currentPassword,
          parent.password
        );
      if (!isValid) {
        return res.status(401).json({
          error:
            'Current password is incorrect'
        });
      }
      const hashedPassword =
        await bcrypt.hash(
          newPassword,
          10
        );
      parent.password =
        hashedPassword;
      parent.temporaryPassword =
        null;
      await parent.save();
      res.json({
        success: true,
        message:
          'Password changed successfully'
      });
    } catch (error) {
      res.status(500).json({
        error: error.message
      });
    }
  }
);
router.post(
  '/:id/reset-password',
  authMiddleware,
  async (req, res) => {
    try {
      if (!isParentAdmin(req)) {
        return res.status(403).json({
          error: 'Admin access required.'
        });
      }
      const {
        newPassword
      } = req.body;
      if (!newPassword) {
        return res.status(400).json({
          error:
            'New password required'
        });
      }
      const query = {
        _id: req.params.id
      };
      if (!isSuperAdmin(req)) {
        query.schoolId =
          requireSchool(req, res);
        if (!query.schoolId) return;
      }
      const hashedPassword =
        await bcrypt.hash(
          newPassword,
          10
        );
      const parent =
        await Parent.findOneAndUpdate(
          query,
          {
            password:
              hashedPassword,
            temporaryPassword:
              newPassword
          },
          {
            new: true,
            runValidators: true
          }
        )
          .select(
            '+temporaryPassword'
          );
      if (!parent) {
        return res.status(404).json({
          error:
            'Parent not found'
        });
      }
      res.json({
        success: true,
        message:
          'Password reset successful',
        temporaryPassword:
          newPassword,
        parent
      });
    } catch (error) {
      res.status(500).json({
        error: error.message
      });
    }
  }
);
router.get(
  '/',
  authMiddleware,
  async (req, res) => {
    try {
      if (!isParentAdmin(req)) {
        return res.status(403).json({
          error: 'Admin access required.'
        });
      }
      const query = {
        status: 'active'
      };
      addSchoolFilter(req, query);
      const parents =
        await Parent.find(query)
          .populate({
            path: 'studentIds',
            select:
              'schoolId firstname surname class regNo student_id'
          })
          .select(
            '-password -temporaryPassword'
          );
      res.json(parents);
    } catch (error) {
      console.error(
        'Error getting parents:',
        error
      );
      res.status(500).json({
        error: error.message
      });
    }
  }
);
router.get(
  '/:id',
  authMiddleware,
  async (req, res) => {
    try {
      if (!isParentAdmin(req)) {
        return res.status(403).json({
          error: 'Admin access required.'
        });
      }
      const query = {
        _id: req.params.id
      };
      addSchoolFilter(req, query);
      const parent =
        await Parent.findOne(query)
          .populate({
            path: 'studentIds',
            select:
              'schoolId firstname surname class regNo student_id'
          })
          .select(
            '-password -temporaryPassword'
          );
      if (!parent) {
        return res.status(404).json({
          error:
            'Parent not found'
        });
      }
      res.json(parent);
    } catch (error) {
      res.status(500).json({
        error: error.message
      });
    }
  }
);
router.post(
  '/',
  authMiddleware,
  async (req, res) => {
    try {
      if (!isParentAdmin(req)) {
        return res.status(403).json({
          error: 'Admin access required.'
        });
      }
      const schoolId =
        requireSchool(req, res);
      if (
        !schoolId &&
        !isSuperAdmin(req)
      ) {
        return;
      }
      const {
        name,
        email,
        phone,
        address,
        occupation,
        emergencyContactName,
        emergencyContactPhone,
        families,
        studentIds
      } = req.body;
      if (!name || !email) {
        return res.status(400).json({
          error:
            'Name and email are required'
        });
      }
      const normalizedEmail =
        email.toLowerCase().trim();
      const existingQuery = {
        email: normalizedEmail
      };
      if (!isSuperAdmin(req)) {
        existingQuery.schoolId =
          schoolId;
      }
      const existingParent =
        await Parent.findOne(
          existingQuery
        );
      if (existingParent) {
        return res.status(400).json({
          error:
            'Email already registered in this school'
        });
      }
      const temporaryPassword =
        generateTemporaryPassword();
      const hashedPassword =
        await bcrypt.hash(
          temporaryPassword,
          10
        );
      const resolvedStudentIds =
        await resolveStudentObjectIds(
          studentIds,
          schoolId,
          isSuperAdmin(req)
        );
      if (
        Array.isArray(studentIds) &&
        resolvedStudentIds.length !==
          studentIds.length
      ) {
        return res.status(400).json({
          error:
            'One or more selected students do not belong to your school or do not exist.'
        });
      }
      const parentData = {
        schoolId:
          schoolId || null,
        name:
          name.trim(),
        email:
          normalizedEmail,
        phone:
          phone
            ? phone.trim()
            : '',
        address:
          address
            ? address.trim()
            : '',
        occupation:
          occupation
            ? occupation.trim()
            : '',
        emergencyContactName:
          emergencyContactName
            ? emergencyContactName.trim()
            : '',
        emergencyContactPhone:
          emergencyContactPhone
            ? emergencyContactPhone.trim()
            : '',
        families:
          Array.isArray(families)
            ? families.filter(
                family =>
                  family &&
                  family.trim()
              )
            : [],
        studentIds:
          resolvedStudentIds,
        password:
          hashedPassword,
        temporaryPassword,
        role: 'parent',
        status: 'active'
      };
      const parent =
        await Parent.create(
          parentData
        );
      await parent.populate({
        path: 'studentIds',
        select:
          'firstname surname class regNo student_id'
      });
      const parentResponse =
        parent.toObject();
      delete parentResponse.password;
      res.status(201).json({
        ...parentResponse,
        temporaryPassword
      });
    } catch (error) {
      console.error(
        'Error creating parent:',
        error
      );
      res.status(400).json({
        error:
          error.message
      });
    }
  }
);
router.patch(
  '/:id',
  authMiddleware,
  async (req, res) => {
    try {
      if (!isParentAdmin(req)) {
        return res.status(403).json({
          error: 'Admin access required.'
        });
      }
      const parentQuery = {
        _id: req.params.id
      };
      addSchoolFilter(
        req,
        parentQuery
      );
      const existingParent =
        await Parent.findOne(
          parentQuery
        );
      if (!existingParent) {
        return res.status(404).json({
          error:
            'Parent not found'
        });
      }
      const {
        name,
        email,
        phone,
        address,
        occupation,
        emergencyContactName,
        emergencyContactPhone,
        families,
        studentIds
      } = req.body;
      const updateData = {};
      if (name) {
        updateData.name =
          name.trim();
      }
      if (email) {
        const normalizedEmail =
          email.toLowerCase().trim();
        const emailQuery = {
          email:
            normalizedEmail,
          _id: {
            $ne:
              existingParent._id
          }
        };
        if (!isSuperAdmin(req)) {
          emailQuery.schoolId =
            req.user.schoolId;
        }
        const existingEmail =
          await Parent.findOne(
            emailQuery
          );
        if (existingEmail) {
          return res.status(400).json({
            error:
              'Email already registered in this school'
          });
        }
        updateData.email =
          normalizedEmail;
      }
      if (phone !== undefined) {
        updateData.phone =
          phone
            ? phone.trim()
            : '';
      }
      if (address !== undefined) {
        updateData.address =
          address
            ? address.trim()
            : '';
      }
      if (occupation !== undefined) {
        updateData.occupation =
          occupation
            ? occupation.trim()
            : '';
      }
      if (
        emergencyContactName !==
        undefined
      ) {
        updateData.emergencyContactName =
          emergencyContactName
            ? emergencyContactName.trim()
            : '';
      }
      if (
        emergencyContactPhone !==
        undefined
      ) {
        updateData.emergencyContactPhone =
          emergencyContactPhone
            ? emergencyContactPhone.trim()
            : '';
      }
      if (families !== undefined) {
        updateData.families =
          Array.isArray(families)
            ? families.filter(
                family =>
                  family &&
                  family.trim()
              )
            : [];
      }
      if (studentIds !== undefined) {
        const schoolId =
          getSchoolId(req);
        const resolvedStudentIds =
          await resolveStudentObjectIds(
            studentIds,
            schoolId,
            isSuperAdmin(req)
          );
        if (
          resolvedStudentIds.length !==
          studentIds.length
        ) {
          return res.status(400).json({
            error:
              'One or more selected students do not belong to your school or do not exist.'
          });
        }
        updateData.studentIds =
          resolvedStudentIds;
      }
      if (req.body.password) {
        return res.status(400).json({
          error:
            'Use reset-password endpoint'
        });
      }
      updateData.updatedAt =
        new Date();
      const updatedParent =
        await Parent.findOneAndUpdate(
          parentQuery,
          updateData,
          {
            new: true,
            runValidators: true
          }
        )
          .populate({
            path: 'studentIds',
            select:
              'firstname surname class regNo student_id'
          })
          .select(
            '-password -temporaryPassword'
          );
      if (!updatedParent) {
        return res.status(404).json({
          error:
            'Parent not found'
        });
      }
      res.json(updatedParent);
    } catch (error) {
      console.error(
        'Error updating parent:',
        error
      );
      res.status(400).json({
        error:
          error.message
      });
    }
  }
);
router.patch(
  '/:id/update-profile',
  authMiddleware,
  async (req, res) => {
    try {
      if (req.user.role !== 'parent') {
        return res.status(403).json({
          error:
            'Parent access required.'
        });
      }
      if (
        String(req.user.id) !==
        String(req.params.id)
      ) {
        return res.status(403).json({
          error:
            'You can only update your own profile.'
        });
      }
      const {
        phone,
        address,
        occupation,
        emergencyContactName,
        emergencyContactPhone
      } = req.body;
      const updateData = {};
      if (phone !== undefined) {
        updateData.phone =
          phone
            ? phone.trim()
            : '';
      }
      if (address !== undefined) {
        updateData.address =
          address
            ? address.trim()
            : '';
      }
      if (occupation !== undefined) {
        updateData.occupation =
          occupation
            ? occupation.trim()
            : '';
      }
      if (
        emergencyContactName !==
        undefined
      ) {
        updateData.emergencyContactName =
          emergencyContactName
            ? emergencyContactName.trim()
            : '';
      }
      if (
        emergencyContactPhone !==
        undefined
      ) {
        updateData.emergencyContactPhone =
          emergencyContactPhone
            ? emergencyContactPhone.trim()
            : '';
      }
      const parentQuery = {
        _id: req.params.id,
        schoolId:
          req.user.schoolId
      };
      const parent =
        await Parent.findOneAndUpdate(
          parentQuery,
          updateData,
          {
            new: true,
            runValidators: true
          }
        )
          .select(
            '-password -temporaryPassword'
          );
      if (!parent) {
        return res.status(404).json({
          error:
            'Parent not found'
        });
      }
      res.json({
        success: true,
        parent
      });
    } catch (error) {
      res.status(400).json({
        error:
          error.message
      });
    }
  }
);
router.delete(
  '/:id',
  authMiddleware,
  async (req, res) => {
    try {
      if (!isParentAdmin(req)) {
        return res.status(403).json({
          error:
            'Admin access required.'
        });
      }
      const parentQuery = {
        _id: req.params.id
      };
      addSchoolFilter(
        req,
        parentQuery
      );
      const parent =
        await Parent.findOneAndDelete(
          parentQuery
        );
      if (!parent) {
        return res.status(404).json({
          error:
            'Parent not found'
        });
      }
      if (
        parent.studentIds &&
        parent.studentIds.length > 0
      ) {
        const studentQuery = {
          _id: {
            $in:
              parent.studentIds
          }
        };
        if (!isSuperAdmin(req)) {
          studentQuery.schoolId =
            req.user.schoolId;
        }
        await Student.updateMany(
          studentQuery,
          {
            $set: {
              parentId: null
            }
          }
        );
      }
      res.json({
        message:
          'Parent deleted successfully!'
      });
    } catch (error) {
      console.error(
        'Error deleting parent:',
        error
      );
      res.status(500).json({
        error:
          error.message
      });
    }
  }
);
function calculateAverageScore(
  academic
) {
  if (
    !academic ||
    academic.length === 0
  ) {
    return 0;
  }
  const total =
    academic.reduce(
      (sum, record) =>
        sum +
        (record.score || 0),
      0
    );
  return (
    total /
    academic.length
  ).toFixed(2);
}
function calculateAverageAttendance(
  attendance
) {
  if (
    !attendance ||
    attendance.length === 0
  ) {
    return 0;
  }
  let totalPresent = 0;
  let totalDays = 0;
  attendance.forEach(record => {
    totalPresent +=
      record.present || 0;
    totalDays +=
      record.total || 0;
  });
  return totalDays > 0
    ? (
        (totalPresent /
          totalDays) *
        100
      ).toFixed(2)
    : 0;
}
function calculateOutstandingFees(
  fees
) {
  if (
    !fees ||
    fees.length === 0
  ) {
    return 0;
  }
  return fees
    .filter(fee => {
      const status =
        String(
          fee.status || ''
        ).toLowerCase();
      return (
        status === 'unpaid' ||
        status === 'pending'
      );
    })
    .reduce(
      (sum, fee) =>
        sum +
        (fee.amount || 0),
      0
    );
}
function extractSubjects(
  academic
) {
  if (!academic) return [];
  const subjects =
    new Set();
  academic.forEach(record => {
    if (record.subject) {
      subjects.add(
        record.subject
      );
    }
  });
  return Array.from(
    subjects
  );
}
function groupByTerm(
  academic
) {
  if (!academic) return {};
  const grouped = {};
  academic.forEach(record => {
    if (!grouped[record.term]) {
      grouped[record.term] =
        [];
    }
    grouped[
      record.term
    ].push({
      subject:
        record.subject,
      score:
        record.score,
      grade:
        record.grade,
      remarks:
        record.remarks,
      class:
        record.class
    });
  });
  return grouped;
}
function groupAttendanceByTerm(
  attendance
) {
  if (!attendance) return {};
  const grouped = {};
  attendance.forEach(record => {
    if (!grouped[record.term]) {
      grouped[record.term] =
        [];
    }
    const percentage =
      record.total > 0
        ? (
            (record.present /
              record.total) *
            100
          ).toFixed(2)
        : 0;
    grouped[
      record.term
    ].push({
      present:
        record.present,
      total:
        record.total,
      percentage,
      session:
        record.session
    });
  });
  return grouped;
}
function groupFeesByTerm(
  fees
) {
  if (!fees) return {};
  const grouped = {};
  fees.forEach(record => {
    if (!grouped[record.term]) {
      grouped[record.term] = {
        paid: 0,
        pending: 0,
        total: 0
      };
    }
    grouped[
      record.term
    ].total +=
      record.amount || 0;
    const status =
      String(
        record.status || ''
      ).toLowerCase();
    if (
      status === 'paid' ||
      status === 'waived'
    ) {
      grouped[
        record.term
      ].paid +=
        record.amount || 0;
    } else if (
      status === 'unpaid' ||
      status === 'pending'
    ) {
      grouped[
        record.term
      ].pending +=
        record.amount || 0;
    }
  });
  return grouped;
}
function calculateGlobalAttendance(
  students
) {
  if (
    !students ||
    students.length === 0
  ) {
    return 0;
  }
  const percentages =
    students.map(
      student =>
        parseFloat(
          student
            .attendanceStats
            ?.averageAttendancePercentage
        ) || 0
    );
  return (
    percentages.reduce(
      (a, b) => a + b,
      0
    ) /
    students.length
  ).toFixed(2);
}
function calculateGlobalAverageGrade(
  students
) {
  if (
    !students ||
    students.length === 0
  ) {
    return 0;
  }
  const scores =
    students.map(
      student =>
        parseFloat(
          student
            .academicStats
            ?.averageScore
        ) || 0
    );
  return (
    scores.reduce(
      (a, b) => a + b,
      0
    ) /
    students.length
  ).toFixed(2);
}
module.exports = router;

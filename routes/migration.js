const express = require('express');
const router = express.Router();

const School = require('../models/School');
const Student = require('../models/Student');
const Session = require('../models/Session');
const Term = require('../models/Term');
const Class = require('../models/Class');
const Subject = require('../models/Subject');
const Result = require('../models/Result');

router.post('/existing-school', async (req, res) => {
  try {
    const migrationSecret = process.env.MIGRATION_SECRET;

    if (!migrationSecret) {
      return res.status(500).json({
        error: 'MIGRATION_SECRET is not configured.'
      });
    }

    const suppliedSecret = req.headers['x-migration-secret'];

    if (!suppliedSecret || suppliedSecret !== migrationSecret) {
      return res.status(403).json({
        error: 'Invalid migration secret.'
      });
    }

    const SCHOOL_ID = '6ab7ce3b5ea11151ee5ae580';

    const school = await School.findById(SCHOOL_ID);

    if (!school) {
      return res.status(404).json({
        error: 'School not found.'
      });
    }

    const migrateModel = async (Model, name) => {
      const before = await Model.countDocuments({
        $or: [
          { schoolId: { $exists: false } },
          { schoolId: null }
        ]
      });

      const update = await Model.updateMany(
        {
          $or: [
            { schoolId: { $exists: false } },
            { schoolId: null }
          ]
        },
        {
          $set: {
            schoolId: school._id
          }
        }
      );

      const after = await Model.countDocuments({
        schoolId: school._id
      });

      return {
        before,
        migrated: update.modifiedCount,
        after
      };
    };

    const students = await migrateModel(Student, 'Students');
    const sessions = await migrateModel(Session, 'Sessions');
    const terms = await migrateModel(Term, 'Terms');
    const classes = await migrateModel(Class, 'Classes');
    const subjects = await migrateModel(Subject, 'Subjects');
    const results = await migrateModel(Result, 'Results');

    res.json({
      success: true,
      message: 'School migration completed successfully.',
      school: {
        id: school._id,
        schoolId: school.schoolId,
        schoolName: school.schoolName
      },
      migrated: {
        students,
        sessions,
        terms,
        classes,
        subjects,
        results
      }
    });

  } catch (error) {
    console.error('School migration error:', error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

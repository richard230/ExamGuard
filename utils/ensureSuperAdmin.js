const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const School = require('../models/School');

async function ensureSuperAdmin({
  schoolKey,
  email,
  password,
  name
}) {
  if (!schoolKey) {
    throw new Error(
      'schoolKey is required when creating a school superadmin.'
    );
  }
  if (!email) {
    throw new Error(
      'Superadmin email is required.'
    );
  }
  if (!password) {
    throw new Error(
      'Superadmin password is required.'
    );
  }
  if (!name) {
    throw new Error(
      'Superadmin name is required.'
    );
  }
  try {
    const key = String(schoolKey).trim();
    let school = null;
    school = await School.findOne({
      schoolId: key
    }).select(
      '_id schoolId schoolName status'
    );
    if (!school && mongoose.Types.ObjectId.isValid(key)) {
      school = await School.findById(key).select(
        '_id schoolId schoolName status'
      );
    }
    if (!school) {
      throw new Error(
        `School not found: ${key}`
      );
    }
    if (
      school.status &&
      school.status !== 'active'
    ) {
      throw new Error(
        `School "${school.schoolName}" is not active.`
      );
    }
    const normalizedEmail =
      String(email)
        .trim()
        .toLowerCase();
    let existingUser = await User.findOne({
      email: normalizedEmail,
      schoolId: school._id,
      role: 'superadmin'
    });
    const passwordHash =
      await bcrypt.hash(password, 10);
    if (existingUser) {
      existingUser.name = name;
      existingUser.password = passwordHash;
      existingUser.role = 'superadmin';
      existingUser.schoolId = school._id;
      await existingUser.save();
      console.log(
        `Superadmin updated for ${school.schoolName}.`
      );
    } else {
      await User.create({
        name,
        email: normalizedEmail,
        password: passwordHash,
        role: 'superadmin',
        schoolId: school._id
      });
      console.log(
        `Superadmin created for ${school.schoolName}.`
      );
    }
    console.log(
      '\x1b[32m%s\x1b[0m',
      '==> School superadmin ensured'
    );
    console.log(
      'School:',
      school.schoolName
    );
    console.log(
      'School ID:',
      school.schoolId
    );
    console.log(
      'MongoDB School ID:',
      school._id.toString()
    );
    console.log(
      'Superadmin Email:',
      normalizedEmail
    );
    return {
      school,
      user: existingUser
    };
  } catch (error) {
    console.error(
      'Error in ensureSuperAdmin:',
      error
    );
    throw error;
  }
}

module.exports = ensureSuperAdmin;

// scripts/ensureSuperAdmin.js

const bcrypt = require('bcryptjs');
const User = require('../models/User');

/**
 * Ensures that a superadmin user exists in MongoDB.
 */
async function ensureSuperAdmin() {
  const superEmail = process.env.SUPERADMIN_EMAIL || 'admin@gold.com';
  const superPassword = process.env.SUPERADMIN_PASSWORD || 'GoldLinc1238';
  const superName = process.env.SUPERADMIN_NAME || 'School Registrar';

  try {
    const hash = await bcrypt.hash(superPassword, 10);

    const existingUser = await User.findOne({ email: superEmail });

    if (existingUser) {
      existingUser.name = superName;
      existingUser.password = hash;
      existingUser.role = 'superadmin';
      await existingUser.save();
      console.log('Superadmin updated.');
    } else {
      await User.create({
        name: superName,
        email: superEmail,
        password: hash,
        role: 'superadmin'
      });
      console.log('Superadmin created.');
    }

    console.log('\x1b[32m%s\x1b[0m', '==> Superadmin ensured');
    console.log('Email:', superEmail);
    console.log('Password:', superPassword);
  } catch (error) {
    console.error('Error in ensureSuperAdmin:', error);
    throw error;
  }
}

module.exports = ensureSuperAdmin;

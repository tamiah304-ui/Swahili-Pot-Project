'use strict';

const bcrypt = require('bcrypt');
const pool = require('./pool');

const DEFAULT_PASSWORD = 'Swahilipot@2024';

const DEPARTMENTS = [
  { name: 'Communication', slug: 'communication', has_trainees: true, has_radio_report: true },
  { name: 'Creatives', slug: 'creatives', has_trainees: true, has_radio_report: false },
  { name: 'Tech Department', slug: 'tech', has_trainees: true, has_radio_report: false },
  { name: 'Community Experience', slug: 'community-experience', has_trainees: true, has_radio_report: false },
  { name: 'Youth Engagement', slug: 'youth-engagement', has_trainees: true, has_radio_report: false },
  { name: 'Heritage', slug: 'heritage', has_trainees: true, has_radio_report: false },
  { name: 'Admin', slug: 'admin', has_trainees: false, has_radio_report: false },
  { name: 'Finance', slug: 'finance', has_trainees: false, has_radio_report: false },
  { name: 'Entrepreneurship', slug: 'entrepreneurship', has_trainees: true, has_radio_report: false },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Departments
    for (const d of DEPARTMENTS) {
      await client.query(
        `INSERT INTO departments (name, slug, has_trainees, has_radio_report)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (slug) DO NOTHING`,
        [d.name, d.slug, d.has_trainees, d.has_radio_report]
      );
    }

    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    // 0. System administrator — global, not tied to a department.
    await client.query(
      `INSERT INTO users (name, email, password_hash, role, department_id)
       VALUES ($1, $2, $3, 'admin', NULL)
       ON CONFLICT (email) DO NOTHING`,
      ['System Administrator', 'admin@swahilipothub.co.ke', passwordHash]
    );

    // 2 + 3. One supervisor and one instructor per department
    const { rows: departments } = await client.query(
      'SELECT id, name, slug FROM departments ORDER BY name'
    );

    for (const dept of departments) {
      const supervisorEmail = `supervisor.${dept.slug}@swahilipothub.co.ke`;
      const instructorEmail = `instructor.${dept.slug}@swahilipothub.co.ke`;

      await client.query(
        `INSERT INTO users (name, email, password_hash, role, department_id)
         VALUES ($1, $2, $3, 'supervisor', $4)
         ON CONFLICT (email) DO NOTHING`,
        [`${dept.name} Supervisor`, supervisorEmail, passwordHash, dept.id]
      );

      await client.query(
        `INSERT INTO users (name, email, password_hash, role, department_id)
         VALUES ($1, $2, $3, 'instructor', $4)
         ON CONFLICT (email) DO NOTHING`,
        [`${dept.name} Instructor`, instructorEmail, passwordHash, dept.id]
      );

      // One attachee (intern) per department.
      await client.query(
        `INSERT INTO users (name, email, password_hash, role, department_id)
         VALUES ($1, $2, $3, 'attachee', $4)
         ON CONFLICT (email) DO NOTHING`,
        [`${dept.name} Attachee`, `attachee.${dept.slug}@swahilipothub.co.ke`, passwordHash, dept.id]
      );
    }

    await client.query('COMMIT');
    console.log('Seed complete — 1 admin, 9 departments, 9 supervisors, 9 instructors, 9 attachees ensured.');
    console.log(`Default password for all seeded accounts: ${DEFAULT_PASSWORD}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  require('dotenv').config();
  seed()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err.message);
      process.exit(1);
    });
}

module.exports = seed;

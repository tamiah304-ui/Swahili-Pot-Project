'use strict';

const express = require('express');
const pool = require('../db/pool');
const verifyToken = require('../middleware/auth');

const router = express.Router();

// GET /api/dashboard — role-aware summary, strictly department-scoped.
router.get('/', verifyToken, async (req, res, next) => {
  try {
    const deptId = req.user.department_id;

    // Does this department use radio/downtime reporting?
    const deptResult = await pool.query(
      `SELECT has_radio_report, has_trainees, name FROM departments WHERE id = $1`,
      [deptId]
    );
    const dept = deptResult.rows[0] || {};

    if (req.user.role === 'instructor') {
      const [trainees, attachees, sessions, submissions, downtime, recent] = await Promise.all([
        pool.query(
          `SELECT COUNT(*)::int AS count FROM trainees
            WHERE department_id = $1 AND is_active = true`,
          [deptId]
        ),
        pool.query(
          `SELECT COUNT(*)::int AS count FROM users
            WHERE role = 'attachee' AND department_id = $1 AND is_active = true`,
          [deptId]
        ),
        pool.query(
          `SELECT COUNT(*)::int AS count FROM attendance_sessions
            WHERE instructor_id = $1 AND created_at >= date_trunc('month', NOW())`,
          [req.user.id]
        ),
        pool.query(
          `SELECT status, COUNT(*)::int AS count FROM form_submissions
            WHERE instructor_id = $1 AND submitted_at >= date_trunc('month', NOW())
            GROUP BY status`,
          [req.user.id]
        ),
        dept.has_radio_report
          ? pool.query(
              `SELECT COUNT(*)::int AS count FROM downtime_reports
                WHERE instructor_id = $1 AND status = 'open'`,
              [req.user.id]
            )
          : Promise.resolve({ rows: [{ count: 0 }] }),
        pool.query(
          `SELECT id, title, form_type, status, submitted_at FROM form_submissions
            WHERE instructor_id = $1
            ORDER BY submitted_at DESC LIMIT 5`,
          [req.user.id]
        ),
      ]);

      const submissionsByStatus = { submitted: 0, acknowledged: 0, returned: 0 };
      let submissionsTotal = 0;
      for (const r of submissions.rows) {
        submissionsByStatus[r.status] = r.count;
        submissionsTotal += r.count;
      }

      return res.json({
        role: 'instructor',
        department_name: dept.name,
        has_radio_report: dept.has_radio_report,
        has_trainees: dept.has_trainees,
        stats: {
          trainees: trainees.rows[0].count,
          attachees: attachees.rows[0].count,
          sessionsThisMonth: sessions.rows[0].count,
          submissionsThisMonth: submissionsTotal,
          submissionsByStatus,
          openDowntime: downtime.rows[0].count,
        },
        recent: recent.rows,
      });
    }

    // supervisor
    const [instructors, attachees, trainees, pending, downtime, recent] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS count FROM users
          WHERE role = 'instructor' AND department_id = $1`,
        [deptId]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count FROM users
          WHERE role = 'attachee' AND department_id = $1 AND is_active = true`,
        [deptId]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count FROM trainees
          WHERE department_id = $1 AND is_active = true`,
        [deptId]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count FROM form_submissions
          WHERE department_id = $1 AND status = 'submitted'`,
        [deptId]
      ),
      dept.has_radio_report
        ? pool.query(
            `SELECT COUNT(*)::int AS count FROM downtime_reports dr
               JOIN users u ON u.id = dr.instructor_id
              WHERE u.department_id = $1 AND dr.status = 'open'`,
            [deptId]
          )
        : Promise.resolve({ rows: [{ count: 0 }] }),
      pool.query(
        `SELECT fs.id, fs.title, fs.form_type, fs.status, fs.submitted_at, u.name AS instructor_name
           FROM form_submissions fs
           JOIN users u ON u.id = fs.instructor_id
          WHERE fs.department_id = $1 AND fs.status = 'submitted'
          ORDER BY fs.submitted_at DESC LIMIT 5`,
        [deptId]
      ),
    ]);

    return res.json({
      role: 'supervisor',
      department_name: dept.name,
      has_radio_report: dept.has_radio_report,
      has_trainees: dept.has_trainees,
      stats: {
        instructors: instructors.rows[0].count,
        attachees: attachees.rows[0].count,
        trainees: trainees.rows[0].count,
        pendingSubmissions: pending.rows[0].count,
        openDowntime: downtime.rows[0].count,
      },
      recent: recent.rows,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

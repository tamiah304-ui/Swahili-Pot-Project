'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db/pool');
const verifyToken = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { notifyUser } = require('../lib/notify');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// All admin routes require an authenticated admin.
router.use(verifyToken, requireRole('admin'));

// GET /api/admin/stats — system-wide overview
router.get('/stats', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM users WHERE role = 'admin') AS admins,
         (SELECT COUNT(*)::int FROM users WHERE role = 'supervisor') AS supervisors,
         (SELECT COUNT(*)::int FROM users WHERE role = 'instructor') AS instructors,
         (SELECT COUNT(*)::int FROM users WHERE role = 'attachee') AS attachees,
         (SELECT COUNT(*)::int FROM users WHERE is_active = false) AS suspended,
         (SELECT COUNT(*)::int FROM departments) AS departments,
         (SELECT COUNT(*)::int FROM trainees WHERE is_active = true) AS trainees,
         (SELECT COUNT(*)::int FROM form_submissions) AS submissions,
         (SELECT COUNT(*)::int FROM downtime_reports WHERE status = 'open') AS open_downtime`
    );
    return res.json({ stats: rows[0] });
  } catch (err) {
    return next(err);
  }
});

// GET /api/admin/users — list all users with filters
router.get('/users', async (req, res, next) => {
  try {
    const conditions = [];
    const params = [];

    if (req.query.role && ['admin', 'supervisor', 'instructor', 'attachee'].includes(req.query.role)) {
      params.push(req.query.role);
      conditions.push(`u.role = $${params.length}`);
    }
    if (req.query.department_id) {
      params.push(parseInt(req.query.department_id, 10));
      conditions.push(`u.department_id = $${params.length}`);
    }
    if (req.query.status === 'active') conditions.push('u.is_active = true');
    if (req.query.status === 'suspended') conditions.push('u.is_active = false');
    if (req.query.search) {
      params.push(`%${req.query.search.trim().toLowerCase()}%`);
      conditions.push(`(LOWER(u.name) LIKE $${params.length} OR LOWER(u.email) LIKE $${params.length})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.department_id, u.is_active, u.created_at,
              d.name AS department_name
         FROM users u
         LEFT JOIN departments d ON d.id = u.department_id
         ${where}
        ORDER BY u.role, u.name`,
      params
    );
    return res.json({ users: rows });
  } catch (err) {
    return next(err);
  }
});

// GET /api/admin/users/:id — full profile of a single user
router.get('/users/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid user id' });

    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.department_id, u.is_active, u.created_at,
              d.name AS department_name
         FROM users u
         LEFT JOIN departments d ON d.id = u.department_id
        WHERE u.id = $1`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: rows[0] });
  } catch (err) {
    return next(err);
  }
});

// POST /api/admin/users — create a supervisor or instructor in any department
router.post('/users', async (req, res, next) => {
  try {
    const { name, email, password, role, department_id } = req.body || {};

    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    if (!email || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'A valid email is required' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!['supervisor', 'instructor', 'attachee'].includes(role)) {
      return res.status(400).json({ error: 'Role must be supervisor, instructor, or attachee' });
    }
    const deptId = parseInt(department_id, 10);
    if (Number.isNaN(deptId)) return res.status(400).json({ error: 'Department is required' });

    const dept = await pool.query('SELECT id FROM departments WHERE id = $1', [deptId]);
    if (dept.rows.length === 0) return res.status(400).json({ error: 'Department not found' });

    const normalized = email.toLowerCase().trim();
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [normalized]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, department_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, department_id, is_active, created_at`,
      [name.trim(), normalized, hash, role, deptId]
    );

    await notifyUser({
      userId: rows[0].id,
      type: 'account_created',
      title: 'Welcome to SwahiliPot IMS',
      body: `Your ${role} account has been created by an administrator.`,
      link: '/profile',
    });

    return res.status(201).json({ user: rows[0] });
  } catch (err) {
    return next(err);
  }
});

// PATCH /api/admin/users/:id/suspend — toggle active/suspended
router.patch('/users/:id/suspend', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid user id' });
    if (id === req.user.id) {
      return res.status(400).json({ error: 'You cannot suspend your own account' });
    }

    const { rows } = await pool.query(
      `UPDATE users SET is_active = NOT is_active
        WHERE id = $1
        RETURNING id, name, email, role, department_id, is_active, created_at`,
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const user = rows[0];
    await notifyUser({
      userId: user.id,
      type: user.is_active ? 'account_reactivated' : 'account_suspended',
      title: user.is_active ? 'Account reactivated' : 'Account suspended',
      body: user.is_active
        ? 'Your account has been reactivated by an administrator.'
        : 'Your account has been suspended by an administrator.',
    });

    return res.json({ user });
  } catch (err) {
    return next(err);
  }
});

// PATCH /api/admin/users/:id/reset-password — admin sets a new password
router.patch('/users/:id/reset-password', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid user id' });

    const { new_password } = req.body || {};
    if (!new_password || new_password.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const hash = await bcrypt.hash(new_password, 10);
    const { rows } = await pool.query(
      `UPDATE users SET password_hash = $1 WHERE id = $2
       RETURNING id, name, email, role`,
      [hash, id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

    await notifyUser({
      userId: id,
      type: 'password_reset',
      title: 'Your password was reset',
      body: 'An administrator reset your password. If this was not expected, contact your administrator.',
    });

    return res.json({ message: 'Password reset', user: rows[0] });
  } catch (err) {
    return next(err);
  }
});

// DELETE /api/admin/users/:id — delete an account
router.delete('/users/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid user id' });
    if (id === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    const exists = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
    if (exists.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    try {
      await pool.query('DELETE FROM users WHERE id = $1', [id]);
    } catch (delErr) {
      // Foreign-key violation: the user owns records (trainees, sessions, ...).
      if (delErr.code === '23503') {
        return res.status(409).json({
          error:
            'This account has associated records and cannot be deleted. Suspend it instead.',
        });
      }
      throw delErr;
    }

    return res.json({ message: 'User deleted' });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db/pool');
const verifyToken = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { notifyUser } = require('../lib/notify');
const { sendMail } = require('../lib/mailer');
const { renderEmail } = require('../lib/emailTemplate');
const { audit } = require('../lib/auditLog');
const { getSettings, setSettings, DEFAULTS } = require('../lib/platformSettings');

const ROLE_LABELS = { supervisor: 'Supervisor', instructor: 'Instructor', attachee: 'Attachee' };

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

    // Email the new user their login details (fire-and-forget: never block or fail
    // account creation on email delivery).
    const { html, text } = renderEmail({
      heading: 'Welcome to SwahiliPot IMS',
      name: rows[0].name,
      intro: `An administrator has created a ${ROLE_LABELS[role] || role} account for you on the Swahilipot Hub internal management system. Sign in with your email (${normalized}) and the temporary password below, then change it from your profile.`,
      code: password,
      ctaLabel: 'Sign In',
      ctaUrl: `${process.env.CLIENT_URL}/login`,
      outro: 'For your security, please change this password after your first sign-in. If you did not expect this email, please contact your administrator.',
    });
    sendMail({ to: normalized, subject: 'Your SwahiliPot IMS account', text, html }).catch((e) =>
      console.error(`[admin] welcome email to ${normalized} failed: ${e.message}`)
    );

    audit(req, 'user_create', {
      targetType: 'user',
      targetId: rows[0].id,
      targetDescription: `${rows[0].name} (${role})`,
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

    audit(req, user.is_active ? 'user_reactivate' : 'user_suspend', {
      targetType: 'user',
      targetId: user.id,
      targetDescription: user.name,
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

    audit(req, 'user_password_reset', {
      targetType: 'user',
      targetId: rows[0].id,
      targetDescription: rows[0].name,
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

    audit(req, 'user_delete', { targetType: 'user', targetId: id });

    return res.json({ message: 'User deleted' });
  } catch (err) {
    return next(err);
  }
});

// ----------------------------------------------------------------------------
// Audit log
// ----------------------------------------------------------------------------

const AUDIT_COLUMNS =
  'id, actor_id, actor_name, actor_role, action, target_type, target_id, target_description, ip_address, created_at';

function buildAuditWhere(query) {
  const conditions = [];
  const params = [];
  if (query.action) {
    params.push(query.action);
    conditions.push(`action = $${params.length}`);
  }
  if (query.actor_id) {
    params.push(parseInt(query.actor_id, 10));
    conditions.push(`actor_id = $${params.length}`);
  }
  if (query.search) {
    params.push(`%${query.search.trim().toLowerCase()}%`);
    conditions.push(
      `(LOWER(actor_name) LIKE $${params.length} OR LOWER(action) LIKE $${params.length} OR LOWER(COALESCE(target_description,'')) LIKE $${params.length})`
    );
  }
  if (query.from) {
    params.push(query.from);
    conditions.push(`created_at >= $${params.length}`);
  }
  if (query.to) {
    params.push(query.to);
    conditions.push(`created_at <= $${params.length}`);
  }
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

// GET /api/admin/audit — paginated, filterable audit log
router.get('/audit', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const offset = (page - 1) * limit;

    const { where, params } = buildAuditWhere(req.query);
    const totalRes = await pool.query(`SELECT COUNT(*)::int AS n FROM audit_log ${where}`, params);
    const total = totalRes.rows[0].n;

    const { rows } = await pool.query(
      `SELECT ${AUDIT_COLUMNS} FROM audit_log ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    return res.json({ entries: rows, total, page, limit, pages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    return next(err);
  }
});

// GET /api/admin/audit/actions — distinct action names (for the filter dropdown)
router.get('/audit/actions', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT DISTINCT action FROM audit_log ORDER BY action'
    );
    return res.json({ actions: rows.map((r) => r.action) });
  } catch (err) {
    return next(err);
  }
});

// GET /api/admin/audit/export — CSV of the (filtered) audit log
router.get('/audit/export', async (req, res, next) => {
  try {
    const { where, params } = buildAuditWhere(req.query);
    const { rows } = await pool.query(
      `SELECT ${AUDIT_COLUMNS} FROM audit_log ${where}
        ORDER BY created_at DESC, id DESC LIMIT 10000`,
      params
    );

    const esc = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['Time', 'Actor', 'Role', 'Action', 'Target type', 'Target id', 'Target', 'IP'];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push(
        [
          esc(r.created_at && r.created_at.toISOString ? r.created_at.toISOString() : r.created_at),
          esc(r.actor_name),
          esc(r.actor_role),
          esc(r.action),
          esc(r.target_type),
          esc(r.target_id),
          esc(r.target_description),
          esc(r.ip_address),
        ].join(',')
      );
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
    return res.send(lines.join('\n'));
  } catch (err) {
    return next(err);
  }
});

// ----------------------------------------------------------------------------
// Departments management
// ----------------------------------------------------------------------------

// GET /api/admin/departments — all departments with member counts
router.get('/departments', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.id, d.name, d.has_trainees, d.has_radio_report, d.created_at,
              (SELECT COUNT(*)::int FROM users u WHERE u.department_id = d.id) AS member_count
         FROM departments d
        ORDER BY d.name`
    );
    return res.json({ departments: rows });
  } catch (err) {
    return next(err);
  }
});

// POST /api/admin/departments — create
router.post('/departments', async (req, res, next) => {
  try {
    const { name, has_trainees, has_radio_report } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'Department name is required' });

    const exists = await pool.query('SELECT id FROM departments WHERE LOWER(name) = LOWER($1)', [
      name.trim(),
    ]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ error: 'A department with this name already exists' });
    }

    const { rows } = await pool.query(
      `INSERT INTO departments (name, has_trainees, has_radio_report)
       VALUES ($1, $2, $3)
       RETURNING id, name, has_trainees, has_radio_report, created_at`,
      [name.trim(), has_trainees === true, has_radio_report === true]
    );
    audit(req, 'department_create', {
      targetType: 'department',
      targetId: rows[0].id,
      targetDescription: rows[0].name,
    });
    return res.status(201).json({ department: { ...rows[0], member_count: 0 } });
  } catch (err) {
    return next(err);
  }
});

// PATCH /api/admin/departments/:id — update name/flags
router.patch('/departments/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid department id' });

    const { name, has_trainees, has_radio_report } = req.body || {};
    const sets = [];
    const params = [];
    const add = (frag, val) => {
      params.push(val);
      sets.push(`${frag} = $${params.length}`);
    };
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ error: 'Name cannot be empty' });
      add('name', String(name).trim());
    }
    if (has_trainees !== undefined) add('has_trainees', has_trainees === true);
    if (has_radio_report !== undefined) add('has_radio_report', has_radio_report === true);
    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    params.push(id);
    const { rows } = await pool.query(
      `UPDATE departments SET ${sets.join(', ')} WHERE id = $${params.length}
       RETURNING id, name, has_trainees, has_radio_report, created_at`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Department not found' });
    audit(req, 'department_update', {
      targetType: 'department',
      targetId: id,
      targetDescription: rows[0].name,
    });
    return res.json({ department: rows[0] });
  } catch (err) {
    return next(err);
  }
});

// DELETE /api/admin/departments/:id — delete (blocked if it has members)
router.delete('/departments/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid department id' });

    const members = await pool.query(
      'SELECT COUNT(*)::int AS n FROM users WHERE department_id = $1',
      [id]
    );
    if (members.rows[0].n > 0) {
      return res.status(409).json({
        error: 'This department has members. Reassign or remove them before deleting it.',
      });
    }

    try {
      const { rowCount } = await pool.query('DELETE FROM departments WHERE id = $1', [id]);
      if (rowCount === 0) return res.status(404).json({ error: 'Department not found' });
    } catch (delErr) {
      if (delErr.code === '23503') {
        return res.status(409).json({
          error: 'This department has associated records and cannot be deleted.',
        });
      }
      throw delErr;
    }
    audit(req, 'department_delete', { targetType: 'department', targetId: id });
    return res.json({ message: 'Department deleted' });
  } catch (err) {
    return next(err);
  }
});

// ----------------------------------------------------------------------------
// Platform settings
// ----------------------------------------------------------------------------

// GET /api/admin/settings — current platform settings
router.get('/settings', async (req, res, next) => {
  try {
    const settings = await getSettings();
    return res.json({ settings, defaults: DEFAULTS });
  } catch (err) {
    return next(err);
  }
});

// PUT /api/admin/settings — update platform settings
router.put('/settings', async (req, res, next) => {
  try {
    const body = req.body || {};
    const patch = {};

    if (body.maintenance_mode !== undefined) {
      patch.maintenance_mode = body.maintenance_mode === true || body.maintenance_mode === 'true';
    }
    if (body.maintenance_message !== undefined) {
      patch.maintenance_message = String(body.maintenance_message || '').slice(0, 300) || null;
    }
    if (body.system_ai_enabled !== undefined) {
      patch.system_ai_enabled = body.system_ai_enabled === true || body.system_ai_enabled === 'true';
    }
    const numericFields = {
      attendance_expiry_hours: [1, 24],
      max_file_size_mb: [1, 50],
      downtime_escalation_hours: [1, 72],
    };
    for (const [field, [min, max]] of Object.entries(numericFields)) {
      if (body[field] !== undefined) {
        const n = parseInt(body[field], 10);
        if (Number.isNaN(n) || n < min || n > max) {
          return res.status(400).json({ error: `${field} must be between ${min} and ${max}` });
        }
        patch[field] = n;
      }
    }
    if (body.org_name !== undefined) patch.org_name = String(body.org_name).trim().slice(0, 150);
    if (body.org_email !== undefined) {
      const e = String(body.org_email).trim();
      if (e && !EMAIL_RE.test(e)) return res.status(400).json({ error: 'Invalid organisation email' });
      patch.org_email = e;
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const settings = await setSettings(patch);
    audit(req, 'settings_update', {
      targetType: 'platform',
      targetDescription: Object.keys(patch).join(', '),
    });
    return res.json({ settings });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

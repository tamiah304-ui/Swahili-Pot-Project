'use strict';

// Attachee management — staff-facing CRUD for university attachees (login users
// with role 'attachee'), extended by the attachee_profiles table. Distinct from
// routes/attachee.js, which is the attachee's own self-service portal.

const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db/pool');
const verifyToken = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { notifyUser } = require('../lib/notify');
const { sendMail } = require('../lib/mailer');
const { renderEmail } = require('../lib/emailTemplate');
const { audit } = require('../lib/auditLog');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KENYAN_PHONE_RE = /^(\+?254|0)(7|1)\d{8}$/;

router.use(verifyToken);

async function logActivity({ departmentId, actor, actionType, entityId, description }) {
  try {
    await pool.query(
      `INSERT INTO activity_log (department_id, actor_id, actor_name, action_type, entity_type, entity_id, description)
       VALUES ($1, $2, $3, $4, 'attachee', $5, $6)`,
      [departmentId, actor.id, actor.name, actionType, entityId, description]
    );
  } catch (err) {
    console.error(`[attachees] activity log failed: ${err.message}`);
  }
}

const ATTACHEE_SELECT = `
  SELECT u.id, u.name, u.email, u.phone, u.is_active, u.last_login, u.created_at,
         ap.university_name, ap.course_of_study, ap.student_id_number,
         ap.attachment_start_date, ap.attachment_end_date,
         ap.is_active AS attachment_active,
         ap.supervisor_id, ap.instructor_id,
         sup.name AS supervisor_name, inst.name AS instructor_name
    FROM users u
    LEFT JOIN attachee_profiles ap ON ap.user_id = u.id
    LEFT JOIN users sup ON sup.id = ap.supervisor_id
    LEFT JOIN users inst ON inst.id = ap.instructor_id`;

// GET /api/attachees/meta/staff — supervisors + instructors in the department
// (used to populate the "assign supervisor/instructor" dropdowns).
router.get('/meta/staff', requireRole('instructor', 'supervisor'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, role FROM users
        WHERE department_id = $1 AND role IN ('supervisor','instructor') AND is_active = true
        ORDER BY role, name`,
      [req.user.department_id]
    );
    return res.json({
      supervisors: rows.filter((r) => r.role === 'supervisor'),
      instructors: rows.filter((r) => r.role === 'instructor'),
    });
  } catch (err) {
    return next(err);
  }
});

// GET /api/attachees — list attachees in the staff member's department
router.get('/', requireRole('instructor', 'supervisor'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `${ATTACHEE_SELECT}
        WHERE u.role = 'attachee' AND u.department_id = $1
        ORDER BY u.is_active DESC, u.name ASC`,
      [req.user.department_id]
    );
    return res.json({ attachees: rows });
  } catch (err) {
    return next(err);
  }
});

// GET /api/attachees/:id — full profile (department-scoped)
router.get('/:id', requireRole('instructor', 'supervisor'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid attachee id' });
    const { rows } = await pool.query(
      `${ATTACHEE_SELECT} WHERE u.id = $1 AND u.role = 'attachee' AND u.department_id = $2`,
      [id, req.user.department_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Attachee not found' });
    return res.json({ attachee: rows[0] });
  } catch (err) {
    return next(err);
  }
});

// GET /api/attachees/:id/summary — profile + task stats + recent activity
router.get('/:id/summary', requireRole('instructor', 'supervisor'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid attachee id' });

    const profileRes = await pool.query(
      `${ATTACHEE_SELECT} WHERE u.id = $1 AND u.role = 'attachee' AND u.department_id = $2`,
      [id, req.user.department_id]
    );
    if (!profileRes.rows.length) return res.status(404).json({ error: 'Attachee not found' });
    const attachee = profileRes.rows[0];

    const [stats, recentTasks, hasAi] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status IN ('open','pending'))::int AS pending,
                COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
                COUNT(*) FILTER (WHERE status IN ('submitted','reviewed','completed'))::int AS submitted,
                COUNT(*) FILTER (WHERE status IN ('reviewed','completed'))::int AS reviewed
           FROM tasks WHERE assigned_to = $1`,
        [id]
      ),
      pool.query(
        `SELECT t.id, t.title, t.status, t.priority, t.due_date, t.created_at, b.name AS assigned_by_name
           FROM tasks t JOIN users b ON b.id = t.assigned_by
          WHERE t.assigned_to = $1
          ORDER BY t.created_at DESC LIMIT 5`,
        [id]
      ),
      pool.query('SELECT 1 FROM attachee_ai_profiles WHERE attachee_id = $1', [id]),
    ]);

    const s = stats.rows[0];
    const completionRate = s.total > 0 ? Math.round((s.submitted / s.total) * 100) : 0;

    // Attachment timeline
    let daysElapsed = null;
    let daysRemaining = null;
    let progressPercent = null;
    if (attachee.attachment_start_date && attachee.attachment_end_date) {
      const start = new Date(attachee.attachment_start_date);
      const end = new Date(attachee.attachment_end_date);
      const now = new Date();
      const totalDays = Math.max(1, Math.round((end - start) / 86400000));
      daysElapsed = Math.max(0, Math.round((now - start) / 86400000));
      daysRemaining = Math.max(0, Math.round((end - now) / 86400000));
      progressPercent = Math.min(100, Math.round((daysElapsed / totalDays) * 100));
    }

    return res.json({
      attachee,
      stats: { ...s, completion_rate: completionRate },
      recentTasks: recentTasks.rows,
      timeline: { daysElapsed, daysRemaining, progressPercent },
      ai_profile_exists: hasAi.rows.length > 0,
    });
  } catch (err) {
    return next(err);
  }
});

// POST /api/attachees — create an attachee account + attachment profile
router.post('/', requireRole('instructor', 'supervisor'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      name, email, phone, university_name, course_of_study, student_id_number,
      attachment_start_date, attachment_end_date, supervisor_id, instructor_id,
    } = req.body || {};

    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    if (!email || !EMAIL_RE.test(email.trim())) return res.status(400).json({ error: 'A valid email is required' });
    if (!university_name || !university_name.trim()) return res.status(400).json({ error: 'University name is required' });
    if (!course_of_study || !course_of_study.trim()) return res.status(400).json({ error: 'Course of study is required' });
    if (!attachment_start_date || !attachment_end_date) {
      return res.status(400).json({ error: 'Attachment start and end dates are required' });
    }
    if (new Date(attachment_end_date) <= new Date(attachment_start_date)) {
      return res.status(400).json({ error: 'End date must be after the start date' });
    }
    if (phone && phone.trim() && !KENYAN_PHONE_RE.test(phone.trim())) {
      return res.status(400).json({ error: 'Enter a valid Kenyan phone number' });
    }

    const departmentId = req.user.department_id;

    // Supervisor/instructor (if provided) must belong to this department.
    for (const [label, sid, role] of [
      ['Supervisor', supervisor_id, 'supervisor'],
      ['Instructor', instructor_id, 'instructor'],
    ]) {
      if (sid) {
        const r = await client.query(
          'SELECT 1 FROM users WHERE id = $1 AND role = $2 AND department_id = $3',
          [sid, role, departmentId]
        );
        if (!r.rows.length) return res.status(400).json({ error: `${label} must be in your department` });
      }
    }

    const normalized = email.toLowerCase().trim();
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [normalized]);
    if (existing.rows.length) return res.status(409).json({ error: 'A user with this email already exists' });

    // Temporary password: Attach@<year><4 digits>. Derived without Math.random
    // (unavailable in some sandboxes) — uses time + a tiny counter source.
    const year = new Date(attachment_start_date).getFullYear() || new Date().getFullYear();
    const rand4 = String(Math.floor((Date.now() % 9000) + 1000));
    const tempPassword = `Attach@${year}${rand4}`;
    const hash = await bcrypt.hash(tempPassword, 12);

    await client.query('BEGIN');

    const userRes = await client.query(
      `INSERT INTO users (name, email, password_hash, role, department_id)
       VALUES ($1, $2, $3, 'attachee', $4)
       RETURNING id, name, email, phone, role, department_id, is_active, created_at`,
      [name.trim(), normalized, hash, departmentId]
    );
    const user = userRes.rows[0];
    if (phone && phone.trim()) {
      await client.query('UPDATE users SET phone = $1 WHERE id = $2', [phone.trim(), user.id]);
    }

    await client.query(
      `INSERT INTO attachee_profiles
         (user_id, university_name, course_of_study, student_id_number,
          attachment_start_date, attachment_end_date, supervisor_id, instructor_id, department_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        user.id, university_name.trim(), course_of_study.trim(),
        student_id_number && student_id_number.trim() ? student_id_number.trim() : null,
        attachment_start_date, attachment_end_date,
        supervisor_id || null, instructor_id || null, departmentId,
      ]
    );

    await client.query('COMMIT');

    // Welcome email with temporary password (fire-and-forget).
    const { html, text } = renderEmail({
      heading: 'Welcome to SwahiliPot IMS',
      name: user.name,
      intro: `An attachee account has been created for you at Swahilipot Hub Foundation. Sign in with your email (${normalized}) and the temporary password below, then change it from your profile.`,
      code: tempPassword,
      ctaLabel: 'Sign In',
      ctaUrl: `${process.env.CLIENT_URL}/login`,
      outro: 'For your security, please change this password after your first sign-in.',
    });
    sendMail({ to: normalized, subject: 'Your SwahiliPot IMS attachee account', text, html }).catch(
      (e) => console.error(`[attachees] welcome email failed: ${e.message}`)
    );

    await notifyUser({
      userId: user.id,
      type: 'account_created',
      title: 'Welcome to SwahiliPot IMS',
      body: 'Your attachee account has been created. Check your email for sign-in details.',
      link: '/profile',
    });
    audit(req, 'attachee_account_created', { targetType: 'user', targetId: user.id, targetDescription: user.name });
    await logActivity({
      departmentId, actor: req.user, actionType: 'attachee_added',
      entityId: user.id, description: `${req.user.name} added attachee ${user.name}`,
    });

    return res.status(201).json({
      attachee: { ...user, university_name, course_of_study, attachment_start_date, attachment_end_date },
      email_sent_to: normalized,
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    return next(err);
  } finally {
    client.release();
  }
});

// PATCH /api/attachees/:id — update account + attachment profile
router.patch('/:id', requireRole('instructor', 'supervisor'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid attachee id' });

    const own = await client.query(
      "SELECT id FROM users WHERE id = $1 AND role = 'attachee' AND department_id = $2",
      [id, req.user.department_id]
    );
    if (!own.rows.length) return res.status(404).json({ error: 'Attachee not found' });

    const b = req.body || {};
    if (b.attachment_start_date && b.attachment_end_date &&
        new Date(b.attachment_end_date) <= new Date(b.attachment_start_date)) {
      return res.status(400).json({ error: 'End date must be after the start date' });
    }
    if (b.phone && b.phone.trim() && !KENYAN_PHONE_RE.test(b.phone.trim())) {
      return res.status(400).json({ error: 'Enter a valid Kenyan phone number' });
    }

    await client.query('BEGIN');

    // users fields
    const uSets = [];
    const uParams = [];
    if (b.name !== undefined) { uParams.push(String(b.name).trim()); uSets.push(`name = $${uParams.length}`); }
    if (b.phone !== undefined) { uParams.push(b.phone && b.phone.trim() ? b.phone.trim() : null); uSets.push(`phone = $${uParams.length}`); }
    if (uSets.length) {
      uParams.push(id);
      await client.query(`UPDATE users SET ${uSets.join(', ')} WHERE id = $${uParams.length}`, uParams);
    }

    // attachee_profiles fields (upsert so existing accounts without a profile get one)
    const pFields = {
      university_name: b.university_name,
      course_of_study: b.course_of_study,
      student_id_number: b.student_id_number,
      attachment_start_date: b.attachment_start_date,
      attachment_end_date: b.attachment_end_date,
      supervisor_id: b.supervisor_id,
      instructor_id: b.instructor_id,
    };
    const provided = Object.entries(pFields).filter(([, v]) => v !== undefined);
    if (provided.length) {
      // Ensure a profile row exists.
      await client.query(
        `INSERT INTO attachee_profiles (user_id, department_id) VALUES ($1, $2)
         ON CONFLICT (user_id) DO NOTHING`,
        [id, req.user.department_id]
      );
      const sets = [];
      const params = [];
      for (const [k, v] of provided) {
        params.push(v === '' ? null : v);
        sets.push(`${k} = $${params.length}`);
      }
      params.push(id);
      await client.query(
        `UPDATE attachee_profiles SET ${sets.join(', ')}, updated_at = NOW() WHERE user_id = $${params.length}`,
        params
      );
    }

    await client.query('COMMIT');
    audit(req, 'attachee_updated', { targetType: 'user', targetId: id });
    return res.json({ message: 'Attachee updated' });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    return next(err);
  } finally {
    client.release();
  }
});

// PATCH /api/attachees/:id/deactivate — supervisor deactivates an attachee
router.patch('/:id/deactivate', requireRole('supervisor'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid attachee id' });

    const { rows } = await pool.query(
      `UPDATE users SET is_active = false
        WHERE id = $1 AND role = 'attachee' AND department_id = $2
        RETURNING id, name, email`,
      [id, req.user.department_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Attachee not found' });
    await pool.query('UPDATE attachee_profiles SET is_active = false, updated_at = NOW() WHERE user_id = $1', [id]);

    await notifyUser({
      userId: id,
      type: 'account_suspended',
      title: 'Attachment ended',
      body: 'Your attachee account has been deactivated by your supervisor.',
    });
    audit(req, 'attachee_deactivated', { targetType: 'user', targetId: id, targetDescription: rows[0].name });
    return res.json({ message: 'Attachee deactivated' });
  } catch (err) {
    return next(err);
  }
});

// GET /api/attachees/:id/notes — task comments + general notes about an attachee
router.get('/:id/notes', requireRole('instructor', 'supervisor'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid attachee id' });

    const { rows } = await pool.query(
      `SELECT tc.id, tc.body, tc.is_general_note, tc.created_at,
              u.name AS author_name, u.role AS author_role,
              t.title AS task_title
         FROM task_comments tc
         JOIN users u ON u.id = tc.author_id
         LEFT JOIN tasks t ON t.id = tc.task_id
        WHERE (tc.attachee_id = $1 OR t.assigned_to = $1)
          AND u.role IN ('instructor','supervisor')
        ORDER BY tc.created_at DESC
        LIMIT 100`,
      [id]
    );
    return res.json({ notes: rows });
  } catch (err) {
    return next(err);
  }
});

// POST /api/attachees/:id/notes — add a general (not task-bound) note
router.post('/:id/notes', requireRole('instructor', 'supervisor'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid attachee id' });
    const { body } = req.body || {};
    if (!body || !body.trim()) return res.status(400).json({ error: 'Note text is required' });

    const own = await pool.query(
      "SELECT id FROM users WHERE id = $1 AND role = 'attachee' AND department_id = $2",
      [id, req.user.department_id]
    );
    if (!own.rows.length) return res.status(404).json({ error: 'Attachee not found' });

    const { rows } = await pool.query(
      `INSERT INTO task_comments (task_id, author_id, body, is_general_note, attachee_id)
       VALUES (NULL, $1, $2, true, $3)
       RETURNING id, body, is_general_note, created_at`,
      [req.user.id, body.trim(), id]
    );
    return res.status(201).json({ note: { ...rows[0], author_name: req.user.name, author_role: req.user.role } });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

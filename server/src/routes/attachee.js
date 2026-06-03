'use strict';

const express = require('express');
const pool = require('../db/pool');
const verifyToken = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

// ---- Staff helpers ----

// GET /api/attachee/list — active attachees in the staff member's department
router.get('/list', verifyToken, requireRole('instructor', 'supervisor'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email FROM users
        WHERE role = 'attachee' AND department_id = $1 AND is_active = true
        ORDER BY name`,
      [req.user.department_id]
    );
    return res.json({ attachees: rows });
  } catch (err) {
    return next(err);
  }
});

// GET /api/attachee/checkins/department — staff view of attachee check-ins
router.get('/checkins/department', verifyToken, requireRole('instructor', 'supervisor'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.attachee_id, c.check_in, c.check_out, u.name AS attachee_name
         FROM attachee_checkins c
         JOIN users u ON u.id = c.attachee_id
        WHERE c.department_id = $1
        ORDER BY c.check_in DESC
        LIMIT 200`,
      [req.user.department_id]
    );
    return res.json({ checkins: rows });
  } catch (err) {
    return next(err);
  }
});

// ---- Attachee self-service ----
router.use(verifyToken);

// GET /api/attachee/dashboard
router.get('/dashboard', requireRole('attachee'), async (req, res, next) => {
  try {
    const [tasks, openTasks, reminders, inquiries, today] = await Promise.all([
      pool.query("SELECT COUNT(*)::int c FROM tasks WHERE assigned_to = $1 AND status != 'completed'", [req.user.id]),
      pool.query("SELECT COUNT(*)::int c FROM tasks WHERE assigned_to = $1 AND status = 'open'", [req.user.id]),
      pool.query('SELECT COUNT(*)::int c FROM reminders WHERE user_id = $1 AND is_done = false', [req.user.id]),
      pool.query("SELECT COUNT(*)::int c FROM inquiries WHERE attachee_id = $1 AND status != 'closed'", [req.user.id]),
      pool.query(
        `SELECT id, check_in, check_out FROM attachee_checkins
          WHERE attachee_id = $1 AND check_in::date = (NOW() AT TIME ZONE 'Africa/Nairobi')::date
          ORDER BY check_in DESC LIMIT 1`,
        [req.user.id]
      ),
    ]);

    const recent = await pool.query(
      `SELECT t.id, t.title, t.status, t.priority, t.due_date, b.name AS assigned_by_name
         FROM tasks t JOIN users b ON b.id = t.assigned_by
        WHERE t.assigned_to = $1
        ORDER BY (t.status = 'completed'), t.due_date NULLS LAST, t.created_at DESC
        LIMIT 5`,
      [req.user.id]
    );

    return res.json({
      stats: {
        activeTasks: tasks.rows[0].c,
        openTasks: openTasks.rows[0].c,
        reminders: reminders.rows[0].c,
        openInquiries: inquiries.rows[0].c,
      },
      today: today.rows[0] || null,
      recentTasks: recent.rows,
    });
  } catch (err) {
    return next(err);
  }
});

// ---- Check-in / check-out ----

// GET /api/attachee/checkin/today — today's status
router.get('/checkin/today', requireRole('attachee'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, check_in, check_out FROM attachee_checkins
        WHERE attachee_id = $1 AND check_in::date = (NOW() AT TIME ZONE 'Africa/Nairobi')::date
        ORDER BY check_in DESC LIMIT 1`,
      [req.user.id]
    );
    return res.json({ checkin: rows[0] || null });
  } catch (err) {
    return next(err);
  }
});

// POST /api/attachee/checkin — click to check in
router.post('/checkin', requireRole('attachee'), async (req, res, next) => {
  try {
    const existing = await pool.query(
      `SELECT id FROM attachee_checkins
        WHERE attachee_id = $1 AND check_in::date = (NOW() AT TIME ZONE 'Africa/Nairobi')::date
          AND check_out IS NULL`,
      [req.user.id]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'You are already checked in for today.' });
    }

    const { rows } = await pool.query(
      `INSERT INTO attachee_checkins (attachee_id, department_id)
       VALUES ($1, $2) RETURNING id, check_in, check_out`,
      [req.user.id, req.user.department_id]
    );
    return res.status(201).json({ checkin: rows[0] });
  } catch (err) {
    return next(err);
  }
});

// PATCH /api/attachee/checkout — close today's open check-in
router.patch('/checkout', requireRole('attachee'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE attachee_checkins SET check_out = NOW()
        WHERE id = (
          SELECT id FROM attachee_checkins
           WHERE attachee_id = $1 AND check_out IS NULL
           ORDER BY check_in DESC LIMIT 1
        )
        RETURNING id, check_in, check_out`,
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'No open check-in to close.' });
    return res.json({ checkin: rows[0] });
  } catch (err) {
    return next(err);
  }
});

// ---- Reminders ----

router.get('/reminders', requireRole('attachee'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, note, remind_at, is_done, created_at
         FROM reminders WHERE user_id = $1
        ORDER BY is_done, remind_at`,
      [req.user.id]
    );
    return res.json({ reminders: rows });
  } catch (err) {
    return next(err);
  }
});

router.post('/reminders', requireRole('attachee'), async (req, res, next) => {
  try {
    const { title, note, remind_at } = req.body || {};
    if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });
    if (!remind_at) return res.status(400).json({ error: 'A date and time is required' });
    const when = new Date(remind_at);
    if (Number.isNaN(when.getTime())) return res.status(400).json({ error: 'Invalid date/time' });

    const { rows } = await pool.query(
      `INSERT INTO reminders (user_id, title, note, remind_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id, title, note, remind_at, is_done, created_at`,
      [req.user.id, title.trim(), note && note.trim() ? note.trim() : null, when.toISOString()]
    );
    return res.status(201).json({ reminder: rows[0] });
  } catch (err) {
    return next(err);
  }
});

router.patch('/reminders/:id', requireRole('attachee'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid reminder id' });
    const { is_done } = req.body || {};

    const { rows } = await pool.query(
      `UPDATE reminders SET is_done = COALESCE($1, is_done)
        WHERE id = $2 AND user_id = $3
        RETURNING id, title, note, remind_at, is_done, created_at`,
      [typeof is_done === 'boolean' ? is_done : null, id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Reminder not found' });
    return res.json({ reminder: rows[0] });
  } catch (err) {
    return next(err);
  }
});

router.delete('/reminders/:id', requireRole('attachee'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid reminder id' });
    const { rowCount } = await pool.query(
      'DELETE FROM reminders WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Reminder not found' });
    return res.json({ message: 'Reminder deleted' });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

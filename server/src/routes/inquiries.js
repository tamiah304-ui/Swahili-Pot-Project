'use strict';

const express = require('express');
const pool = require('../db/pool');
const verifyToken = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { notifyUser } = require('../lib/notify');

const router = express.Router();

const AUDIENCES = ['instructors', 'supervisors', 'both'];
const STAFF = ['instructor', 'supervisor'];

// Roles a given staff member is eligible to receive an inquiry for.
function audienceFilterFor(role) {
  // instructor sees instructors|both; supervisor sees supervisors|both
  return role === 'instructor' ? ['instructors', 'both'] : ['supervisors', 'both'];
}

async function notifyStaff({ departmentId, audience, type, title, body, link }, excludeId) {
  const roles = [];
  if (audience === 'instructors' || audience === 'both') roles.push('instructor');
  if (audience === 'supervisors' || audience === 'both') roles.push('supervisor');
  if (roles.length === 0) return;
  const { rows } = await pool.query(
    `SELECT id FROM users WHERE department_id = $1 AND is_active = true AND role = ANY($2)`,
    [departmentId, roles]
  );
  for (const r of rows) {
    if (r.id !== excludeId) await notifyUser({ userId: r.id, type, title, body, link });
  }
}

// GET /api/inquiries — role-aware list
router.get('/', verifyToken, async (req, res, next) => {
  try {
    if (req.user.role === 'attachee') {
      const { rows } = await pool.query(
        `SELECT i.id, i.subject, i.audience, i.status, i.created_at, i.updated_at,
                (SELECT COUNT(*)::int FROM inquiry_messages m WHERE m.inquiry_id = i.id) AS message_count
           FROM inquiries i
          WHERE i.attachee_id = $1
          ORDER BY i.updated_at DESC`,
        [req.user.id]
      );
      return res.json({ inquiries: rows });
    }

    if (STAFF.includes(req.user.role)) {
      const { rows } = await pool.query(
        `SELECT i.id, i.subject, i.audience, i.status, i.created_at, i.updated_at,
                u.name AS attachee_name,
                (SELECT COUNT(*)::int FROM inquiry_messages m WHERE m.inquiry_id = i.id) AS message_count
           FROM inquiries i
           JOIN users u ON u.id = i.attachee_id
          WHERE i.department_id = $1 AND i.audience = ANY($2)
          ORDER BY i.updated_at DESC`,
        [req.user.department_id, audienceFilterFor(req.user.role)]
      );
      return res.json({ inquiries: rows });
    }

    return res.status(403).json({ error: 'Forbidden' });
  } catch (err) {
    return next(err);
  }
});

// POST /api/inquiries — attachee opens a new inquiry
router.post('/', verifyToken, requireRole('attachee'), async (req, res, next) => {
  try {
    const { subject, message, audience } = req.body || {};
    if (!subject || !subject.trim()) return res.status(400).json({ error: 'Subject is required' });
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });
    const aud = AUDIENCES.includes(audience) ? audience : 'both';

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ins = await client.query(
        `INSERT INTO inquiries (attachee_id, department_id, subject, audience)
         VALUES ($1, $2, $3, $4) RETURNING id, subject, audience, status, created_at, updated_at`,
        [req.user.id, req.user.department_id, subject.trim(), aud]
      );
      const inquiry = ins.rows[0];
      await client.query(
        'INSERT INTO inquiry_messages (inquiry_id, sender_id, body) VALUES ($1, $2, $3)',
        [inquiry.id, req.user.id, message.trim()]
      );
      await client.query('COMMIT');

      await notifyStaff({
        departmentId: req.user.department_id,
        audience: aud,
        type: 'inquiry_opened',
        title: 'New inquiry',
        body: `${req.user.name}: "${subject.trim()}"`,
        link: '/inquiries',
      });

      return res.status(201).json({ inquiry });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    return next(err);
  }
});

// Load an inquiry the current user is allowed to see.
async function loadScopedInquiry(req) {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return { error: 400 };
  const { rows } = await pool.query(
    `SELECT id, attachee_id, department_id, subject, audience, status FROM inquiries WHERE id = $1`,
    [id]
  );
  const inquiry = rows[0];
  if (!inquiry) return { error: 404 };

  if (req.user.role === 'attachee') {
    if (inquiry.attachee_id !== req.user.id) return { error: 403 };
  } else if (STAFF.includes(req.user.role)) {
    if (inquiry.department_id !== req.user.department_id) return { error: 403 };
    if (!audienceFilterFor(req.user.role).includes(inquiry.audience)) return { error: 403 };
  } else {
    return { error: 403 };
  }
  return { inquiry };
}

// GET /api/inquiries/:id — thread
router.get('/:id', verifyToken, async (req, res, next) => {
  try {
    const { inquiry, error } = await loadScopedInquiry(req);
    if (error) return res.status(error).json({ error: error === 404 ? 'Inquiry not found' : 'Forbidden' });

    const { rows: messages } = await pool.query(
      `SELECT m.id, m.sender_id, m.body, m.created_at, u.name AS sender_name, u.role AS sender_role
         FROM inquiry_messages m JOIN users u ON u.id = m.sender_id
        WHERE m.inquiry_id = $1 ORDER BY m.created_at`,
      [inquiry.id]
    );
    return res.json({ inquiry, messages });
  } catch (err) {
    return next(err);
  }
});

// POST /api/inquiries/:id/messages — reply in thread
router.post('/:id/messages', verifyToken, async (req, res, next) => {
  try {
    const { inquiry, error } = await loadScopedInquiry(req);
    if (error) return res.status(error).json({ error: error === 404 ? 'Inquiry not found' : 'Forbidden' });

    const { body } = req.body || {};
    if (!body || !body.trim()) return res.status(400).json({ error: 'Message is required' });

    const { rows } = await pool.query(
      `INSERT INTO inquiry_messages (inquiry_id, sender_id, body) VALUES ($1, $2, $3)
       RETURNING id, sender_id, body, created_at`,
      [inquiry.id, req.user.id, body.trim()]
    );

    const isStaff = STAFF.includes(req.user.role);
    await pool.query(
      `UPDATE inquiries SET updated_at = NOW(), status = $2 WHERE id = $1`,
      [inquiry.id, isStaff ? 'answered' : 'open']
    );

    if (isStaff) {
      // Notify the attachee who opened it.
      await notifyUser({
        userId: inquiry.attachee_id,
        type: 'inquiry_reply',
        title: 'Reply to your inquiry',
        body: `${req.user.name} replied to "${inquiry.subject}".`,
        link: '/inquiries',
      });
    } else {
      // Attachee replied — notify staff audience.
      await notifyStaff(
        {
          departmentId: inquiry.department_id,
          audience: inquiry.audience,
          type: 'inquiry_reply',
          title: 'New reply on an inquiry',
          body: `${req.user.name} replied on "${inquiry.subject}".`,
          link: '/inquiries',
        },
        req.user.id
      );
    }

    return res.status(201).json({ message: { ...rows[0], sender_name: req.user.name, sender_role: req.user.role } });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

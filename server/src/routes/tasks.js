'use strict';

const express = require('express');
const pool = require('../db/pool');
const verifyToken = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { notifyUser } = require('../lib/notify');

const router = express.Router();

const PRIORITIES = ['low', 'medium', 'high'];
const STAFF = ['instructor', 'supervisor'];

const TASK_SELECT = `t.id, t.department_id, t.assigned_to, t.assigned_by, t.title,
  t.description, t.priority, t.due_date, t.status, t.created_at, t.updated_at,
  a.name AS attachee_name, b.name AS assigned_by_name`;

// GET /api/tasks — role-aware
router.get('/', verifyToken, async (req, res, next) => {
  try {
    if (req.user.role === 'attachee') {
      const { rows } = await pool.query(
        `SELECT ${TASK_SELECT}
           FROM tasks t
           JOIN users a ON a.id = t.assigned_to
           JOIN users b ON b.id = t.assigned_by
          WHERE t.assigned_to = $1
          ORDER BY (t.status = 'completed'), t.due_date NULLS LAST, t.created_at DESC`,
        [req.user.id]
      );
      return res.json({ tasks: rows });
    }

    if (STAFF.includes(req.user.role)) {
      const { rows } = await pool.query(
        `SELECT ${TASK_SELECT}
           FROM tasks t
           JOIN users a ON a.id = t.assigned_to
           JOIN users b ON b.id = t.assigned_by
          WHERE t.department_id = $1
          ORDER BY (t.status = 'completed'), t.created_at DESC`,
        [req.user.department_id]
      );
      return res.json({ tasks: rows });
    }

    return res.status(403).json({ error: 'Forbidden' });
  } catch (err) {
    return next(err);
  }
});

// POST /api/tasks — instructor/supervisor assigns a task to an attachee
router.post('/', verifyToken, requireRole('instructor', 'supervisor'), async (req, res, next) => {
  try {
    const { title, description, assigned_to, due_date, priority } = req.body || {};
    if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });

    const attacheeId = parseInt(assigned_to, 10);
    if (Number.isNaN(attacheeId)) return res.status(400).json({ error: 'An attachee must be selected' });

    const prio = priority && PRIORITIES.includes(priority) ? priority : 'medium';

    // The assignee must be an active attachee in the assigner's department.
    const target = await pool.query(
      `SELECT id FROM users
        WHERE id = $1 AND role = 'attachee' AND department_id = $2 AND is_active = true`,
      [attacheeId, req.user.department_id]
    );
    if (target.rows.length === 0) {
      return res.status(400).json({ error: 'Attachee not found in your department' });
    }

    const { rows } = await pool.query(
      `INSERT INTO tasks (department_id, assigned_to, assigned_by, title, description, priority, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        req.user.department_id,
        attacheeId,
        req.user.id,
        title.trim(),
        description && description.trim() ? description.trim() : null,
        prio,
        due_date || null,
      ]
    );

    const { rows: full } = await pool.query(
      `SELECT ${TASK_SELECT}
         FROM tasks t JOIN users a ON a.id = t.assigned_to JOIN users b ON b.id = t.assigned_by
        WHERE t.id = $1`,
      [rows[0].id]
    );

    await notifyUser({
      userId: attacheeId,
      type: 'task_assigned',
      title: 'New task assigned',
      body: `${req.user.name} assigned you: "${title.trim()}".`,
      link: '/tasks',
    });

    return res.status(201).json({ task: full[0] });
  } catch (err) {
    return next(err);
  }
});

// PATCH /api/tasks/:id/status
router.patch('/:id/status', verifyToken, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid task id' });

    const { status } = req.body || {};
    const ALLOWED = ['open', 'in_progress', 'submitted', 'completed'];
    if (!ALLOWED.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const { rows: existing } = await pool.query(
      'SELECT assigned_to, assigned_by, department_id FROM tasks WHERE id = $1',
      [id]
    );
    const task = existing[0];
    if (!task) return res.status(404).json({ error: 'Task not found' });

    // Permissions: the attachee owner may move between open/in_progress/submitted;
    // staff in the department may set any status (incl. completed).
    if (req.user.role === 'attachee') {
      if (task.assigned_to !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
      if (status === 'completed') {
        return res.status(403).json({ error: 'Only staff can mark a task completed' });
      }
    } else if (STAFF.includes(req.user.role)) {
      if (task.department_id !== req.user.department_id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    } else {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { rows } = await pool.query(
      `UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2
       RETURNING id, assigned_to, assigned_by, status, title`,
      [status, id]
    );

    // Notify the other party of the change.
    const updated = rows[0];
    if (req.user.role === 'attachee') {
      await notifyUser({
        userId: task.assigned_by,
        type: 'task_updated',
        title: 'Task progress updated',
        body: `${req.user.name} marked "${updated.title}" as ${status.replace('_', ' ')}.`,
        link: '/tasks',
      });
    } else {
      await notifyUser({
        userId: task.assigned_to,
        type: 'task_updated',
        title: 'Task updated',
        body: `Your task "${updated.title}" was marked ${status.replace('_', ' ')}.`,
        link: '/tasks',
      });
    }

    return res.json({ task: updated });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

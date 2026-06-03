'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const pool = require('../db/pool');
const verifyToken = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const upload = require('../middleware/upload');
const { getS3, S3_BUCKET } = require('../lib/s3');
const { notifyUser, notifyDepartmentSupervisors } = require('../lib/notify');

const router = express.Router();

const FORM_TYPES = [
  'Learner Onboarding Form',
  'Session Outline',
  'Progress Report',
  'Assignment',
  'General Submission',
];

const SUBMISSION_COLS = `id, instructor_id, department_id, form_type, title, description,
  file_url, file_original_name, file_storage, task_id, status, supervisor_note,
  submitted_at, acknowledged_at, acknowledged_by`;

// GET /api/submissions — role-aware
router.get('/', verifyToken, async (req, res, next) => {
  try {
    // Instructors and attachees see only their own submissions.
    if (req.user.role === 'instructor' || req.user.role === 'attachee') {
      const { rows } = await pool.query(
        `SELECT ${SUBMISSION_COLS} FROM form_submissions
          WHERE instructor_id = $1
          ORDER BY submitted_at DESC`,
        [req.user.id]
      );
      return res.json({ submissions: rows });
    }

    // Supervisors see all submissions in their department.
    const { rows } = await pool.query(
      `SELECT fs.id, fs.instructor_id, fs.department_id, fs.form_type, fs.title, fs.description,
              fs.file_url, fs.file_original_name, fs.file_storage, fs.task_id, fs.status,
              fs.supervisor_note, fs.submitted_at, fs.acknowledged_at, fs.acknowledged_by,
              u.name AS instructor_name, u.role AS filer_role
         FROM form_submissions fs
         JOIN users u ON u.id = fs.instructor_id
        WHERE fs.department_id = $1
        ORDER BY fs.submitted_at DESC`,
      [req.user.department_id]
    );
    return res.json({ submissions: rows });
  } catch (err) {
    return next(err);
  }
});

// POST /api/submissions — instructors and attachees, optional file under "attachment"
router.post(
  '/',
  verifyToken,
  requireRole('instructor', 'attachee'),
  upload.single('attachment'),
  async (req, res, next) => {
    try {
      const { title, form_type, description, task_id } = req.body || {};

      if (!title || !title.trim()) {
        return res.status(400).json({ error: 'Title is required' });
      }
      if (!form_type || !form_type.trim()) {
        return res.status(400).json({ error: 'Form type is required' });
      }
      if (!FORM_TYPES.includes(form_type.trim())) {
        return res.status(400).json({ error: 'Invalid form type' });
      }

      // Optional link to a task (validate it belongs to this user).
      let taskId = null;
      if (task_id) {
        taskId = parseInt(task_id, 10);
        if (Number.isNaN(taskId)) return res.status(400).json({ error: 'Invalid task id' });
        const t = await pool.query(
          'SELECT id FROM tasks WHERE id = $1 AND assigned_to = $2',
          [taskId, req.user.id]
        );
        if (t.rows.length === 0) {
          return res.status(400).json({ error: 'Task not found or not assigned to you' });
        }
      }

      let fileUrl = null;
      let fileOriginalName = null;
      let fileStorage = null;
      if (req.file) {
        // S3 storage exposes .key; disk storage exposes .filename.
        fileUrl = req.file.key || req.file.filename;
        fileOriginalName = req.file.originalname;
        fileStorage = upload.STORAGE_DRIVER;
      }

      const { rows } = await pool.query(
        `INSERT INTO form_submissions
           (instructor_id, department_id, form_type, title, description,
            file_url, file_original_name, file_storage, task_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING ${SUBMISSION_COLS}`,
        [
          req.user.id,
          req.user.department_id,
          form_type.trim(),
          title.trim(),
          description && description.trim() ? description.trim() : null,
          fileUrl,
          fileOriginalName,
          fileStorage,
          taskId,
        ]
      );

      const submission = rows[0];

      // If this submission answers a task, mark the task submitted + notify its owner.
      if (taskId) {
        const upd = await pool.query(
          `UPDATE tasks SET status = 'submitted', updated_at = NOW()
            WHERE id = $1 RETURNING assigned_by`,
          [taskId]
        );
        if (upd.rows[0]) {
          await notifyUser({
            userId: upd.rows[0].assigned_by,
            type: 'task_submitted',
            title: 'Task submission received',
            body: `${req.user.name} submitted work for a task.`,
            link: '/tasks',
          });
        }
      }

      // Notify the department's supervisor(s) that a submission was filed.
      await notifyDepartmentSupervisors({
        departmentId: req.user.department_id,
        type: 'submission_filed',
        title: 'New submission to review',
        body: `${req.user.name} filed "${submission.title}".`,
        link: '/submissions',
      });

      return res.status(201).json({ submission });
    } catch (err) {
      return next(err);
    }
  }
);

// PATCH /api/submissions/:id/acknowledge — supervisor only, own department
router.patch('/:id/acknowledge', verifyToken, requireRole('supervisor'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid submission id' });

    const { supervisor_note } = req.body || {};
    const note = supervisor_note && supervisor_note.trim() ? supervisor_note.trim() : null;

    const { rows } = await pool.query(
      `UPDATE form_submissions
          SET status = 'acknowledged', acknowledged_at = NOW(),
              acknowledged_by = $2, supervisor_note = $3
        WHERE id = $1 AND department_id = $4
        RETURNING ${SUBMISSION_COLS}`,
      [id, req.user.id, note, req.user.department_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Submission not found in your department' });
    }

    const submission = rows[0];
    await notifyUser({
      userId: submission.instructor_id,
      type: 'submission_acknowledged',
      title: 'Submission acknowledged',
      body: `Your submission "${submission.title}" was acknowledged.`,
      link: '/submissions',
    });

    return res.json({ submission });
  } catch (err) {
    return next(err);
  }
});

// PATCH /api/submissions/:id/return — supervisor only, note required
router.patch('/:id/return', verifyToken, requireRole('supervisor'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid submission id' });

    const { supervisor_note } = req.body || {};
    if (!supervisor_note || !supervisor_note.trim()) {
      return res.status(400).json({ error: 'A note explaining the return is required' });
    }

    const { rows } = await pool.query(
      `UPDATE form_submissions
          SET status = 'returned', supervisor_note = $2,
              acknowledged_at = NOW(), acknowledged_by = $3
        WHERE id = $1 AND department_id = $4
        RETURNING ${SUBMISSION_COLS}`,
      [id, supervisor_note.trim(), req.user.id, req.user.department_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Submission not found in your department' });
    }

    const submission = rows[0];
    await notifyUser({
      userId: submission.instructor_id,
      type: 'submission_returned',
      title: 'Submission returned',
      body: `Your submission "${submission.title}" was returned. ${submission.supervisor_note || ''}`.trim(),
      link: '/submissions',
    });

    return res.json({ submission });
  } catch (err) {
    return next(err);
  }
});

// GET /api/submissions/:id/file — serve file (local disk or S3), same department only
router.get('/:id/file', verifyToken, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid submission id' });

    const { rows } = await pool.query(
      `SELECT instructor_id, file_url, file_original_name, file_storage, department_id
         FROM form_submissions WHERE id = $1`,
      [id]
    );

    const submission = rows[0];
    if (!submission) return res.status(404).json({ error: 'Submission not found' });

    // Same department, or the filer themselves (attachees have department too).
    if (
      submission.department_id !== req.user.department_id &&
      submission.instructor_id !== req.user.id
    ) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!submission.file_url) {
      return res.status(404).json({ error: 'No file attached to this submission' });
    }

    const downloadName = submission.file_original_name || 'attachment';

    // Local disk storage
    if ((submission.file_storage || 's3') === 'local') {
      const uploadsDir = path.resolve(process.env.UPLOADS_DIR || './uploads');
      const filePath = path.join(uploadsDir, path.basename(submission.file_url));
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File no longer exists on the server' });
      }
      return res.download(filePath, downloadName);
    }

    // S3 storage — stream through the server (keeps the bucket private).
    let s3Object;
    try {
      s3Object = await getS3().send(
        new GetObjectCommand({ Bucket: S3_BUCKET, Key: submission.file_url })
      );
    } catch (s3Err) {
      if (s3Err.name === 'NoSuchKey' || s3Err.$metadata?.httpStatusCode === 404) {
        return res.status(404).json({ error: 'File no longer exists in storage' });
      }
      throw s3Err;
    }

    res.setHeader('Content-Type', s3Object.ContentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadName)}"`);
    if (s3Object.ContentLength != null) res.setHeader('Content-Length', s3Object.ContentLength);
    s3Object.Body.on('error', next);
    return s3Object.Body.pipe(res);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

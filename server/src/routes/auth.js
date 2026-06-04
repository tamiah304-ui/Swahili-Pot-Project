'use strict';

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const verifyToken = require('../middleware/auth');
const { sendMail } = require('../lib/mailer');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_TTL_MINUTES = 60;

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email is required' });
    if (!password) return res.status(400).json({ error: 'Password is required' });

    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.password_hash, u.role, u.department_id,
              u.is_active, d.name AS department_name
         FROM users u
         LEFT JOIN departments d ON d.id = u.department_id
        WHERE u.email = $1`,
      [email.toLowerCase().trim()]
    );

    const user = rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department_id: user.department_id,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, COOKIE_OPTS);
    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department_id: user.department_id,
        department_name: user.department_name,
      },
    });
  } catch (err) {
    return next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, sameSite: 'lax' });
  return res.json({ message: 'Logged out' });
});

// GET /api/auth/me
router.get('/me', verifyToken, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.department_id, u.created_at,
              d.name AS department_name,
              COALESCE(d.has_trainees, false) AS has_trainees,
              COALESCE(d.has_radio_report, false) AS has_radio_report
         FROM users u
         LEFT JOIN departments d ON d.id = u.department_id
        WHERE u.id = $1`,
      [req.user.id]
    );

    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    return res.json({ user });
  } catch (err) {
    return next(err);
  }
});

// PATCH /api/auth/profile — update own display name
router.patch('/profile', verifyToken, async (req, res, next) => {
  try {
    const { name } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

    const { rows } = await pool.query(
      `UPDATE users SET name = $1 WHERE id = $2
       RETURNING id, name, email, role, department_id, created_at`,
      [name.trim(), req.user.id]
    );
    return res.json({ user: rows[0] });
  } catch (err) {
    return next(err);
  }
});

// POST /api/auth/change-password — change own password (requires current)
router.post('/change-password', verifyToken, async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body || {};
    if (!current_password) return res.status(400).json({ error: 'Current password is required' });
    if (!new_password) return res.status(400).json({ error: 'New password is required' });
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [
      req.user.id,
    ]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const match = await bcrypt.compare(current_password, user.password_hash);
    if (!match) return res.status(400).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);

    return res.json({ message: 'Password updated' });
  } catch (err) {
    return next(err);
  }
});

// POST /api/auth/forgot-password — email a reset link
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body || {};
    if (!email || !EMAIL_RE.test(email.trim())) {
      return res.status(400).json({ error: 'A valid email is required' });
    }
    const normalized = email.toLowerCase().trim();

    const { rows } = await pool.query(
      'SELECT id, name, is_active FROM users WHERE email = $1',
      [normalized]
    );
    const user = rows[0];

    // Always respond the same way so we never reveal which emails exist.
    if (user && user.is_active) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000);

      // Invalidate any prior unused tokens, then store the new one.
      await pool.query(
        'UPDATE password_resets SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
        [user.id]
      );
      await pool.query(
        'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [user.id, tokenHash, expiresAt.toISOString()]
      );

      const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${rawToken}`;
      // Always log the link so it's recoverable from the server logs even if
      // email delivery is unavailable.
      console.log(`[reset] link for ${normalized}: ${resetUrl}`);

      const text =
        `Hello ${user.name},\n\n` +
        `We received a request to reset your SwahiliPot IMS password.\n` +
        `Use the link below within ${RESET_TTL_MINUTES} minutes:\n\n${resetUrl}\n\n` +
        `If you didn't request this, you can safely ignore this email.`;
      const html =
        `<p>Hello ${user.name},</p>` +
        `<p>We received a request to reset your SwahiliPot IMS password. ` +
        `This link is valid for ${RESET_TTL_MINUTES} minutes:</p>` +
        `<p><a href="${resetUrl}">Reset your password</a></p>` +
        `<p>If you didn't request this, you can safely ignore this email.</p>`;

      // Fire-and-forget: never block the HTTP response on email delivery, so
      // the request can't hang if the mail provider is slow or unreachable.
      sendMail({ to: normalized, subject: 'Reset your SwahiliPot IMS password', text, html }).catch(
        (mailErr) => {
          console.error(`[${new Date().toISOString()}] [reset] email send failed:`, mailErr.message);
        }
      );
    }

    return res.json({ message: 'If that account exists, a reset link has been sent.' });
  } catch (err) {
    return next(err);
  }
});

// POST /api/auth/reset-password — set a new password using a reset token
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body || {};
    if (!token) return res.status(400).json({ error: 'Reset token is required' });
    if (!password || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const { rows } = await pool.query(
      `SELECT id, user_id FROM password_resets
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
      [tokenHash]
    );
    const reset = rows[0];
    if (!reset) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
    }

    const hash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, reset.user_id]);
    await pool.query('UPDATE password_resets SET used_at = NOW() WHERE id = $1', [reset.id]);

    return res.json({ message: 'Password reset successfully. You can now sign in.' });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

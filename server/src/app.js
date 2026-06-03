'use strict';

const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const multer = require('multer');

const authRoutes = require('./routes/auth');
const departmentRoutes = require('./routes/departments');
const userRoutes = require('./routes/users');
const traineeRoutes = require('./routes/trainees');
const attendanceRoutes = require('./routes/attendance');
const attendPublicRoutes = require('./routes/attend');
const submissionRoutes = require('./routes/submissions');
const downtimeRoutes = require('./routes/downtime');
const dashboardRoutes = require('./routes/dashboard');
const notificationRoutes = require('./routes/notifications');
const adminRoutes = require('./routes/admin');
const taskRoutes = require('./routes/tasks');
const attacheeRoutes = require('./routes/attachee');
const inquiryRoutes = require('./routes/inquiries');

const app = express();

// CORS — allow only the configured React frontend origin, with credentials.
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/trainees', traineeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/attend', attendPublicRoutes); // public, no auth
app.use('/api/submissions', submissionRoutes);
app.use('/api/downtime', downtimeRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/attachee', attacheeRoutes);
app.use('/api/inquiries', inquiryRoutes);

// 404 fallback for unknown API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler — MUST be last.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] Error:`, err.message);

  // Multer-specific errors get a 400 with a clear message.
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
    }
    return res.status(400).json({ error: err.message });
  }

  // File-filter rejections surface as plain Errors from the upload middleware.
  if (err.message && err.message.startsWith('Unsupported file type')) {
    return res.status(400).json({ error: err.message });
  }

  const status = err.status || 500;
  const message = status === 500 ? 'Something went wrong on the server.' : err.message;
  return res.status(status).json({ error: message });
});

module.exports = app;

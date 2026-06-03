-- SwahiliPot IMS — Database schema
-- All timestamps are stored in UTC (TIMESTAMPTZ).

CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  has_trainees BOOLEAN NOT NULL DEFAULT true,
  has_radio_report BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('supervisor', 'instructor', 'admin', 'attachee')),
  -- NULL for system admins, who are not bound to a single department.
  department_id INTEGER REFERENCES departments(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trainees (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  added_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attendance_sessions (
  id SERIAL PRIMARY KEY,
  instructor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  session_label VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '3 hours')
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  trainee_name VARCHAR(150) NOT NULL,
  trainee_phone VARCHAR(20) NOT NULL,
  tasks_completed TEXT NOT NULL,
  check_in TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  check_out TIMESTAMPTZ,
  is_confirmed BOOLEAN NOT NULL DEFAULT false,
  confirmed_by INTEGER REFERENCES users(id),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS form_submissions (
  id SERIAL PRIMARY KEY,
  instructor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  form_type VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  file_url VARCHAR(500),
  file_original_name VARCHAR(255),
  status VARCHAR(30) NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'acknowledged', 'returned')),
  supervisor_note TEXT,
  file_storage VARCHAR(10),
  task_id INTEGER,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS downtime_reports (
  id SERIAL PRIMARY KEY,
  instructor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  frequency_band VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  severity VARCHAR(10) NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolved_by INTEGER REFERENCES users(id),
  resolution_note TEXT,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body TEXT,
  link VARCHAR(300),
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id, is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS password_resets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets (token_hash);

-- ---- Attachment / internship programme ----

-- Tasks & assignments allocated to attachees by instructors/supervisors.
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  assigned_to INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  priority VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  due_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'submitted', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks (assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_tasks_department ON tasks (department_id);

-- Personal reminders an attachee sets for themselves.
CREATE TABLE IF NOT EXISTS reminders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  note TEXT,
  remind_at TIMESTAMPTZ NOT NULL,
  is_done BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders (user_id, remind_at);

-- Simple click-to-check-in attendance for attachees (no QR session).
CREATE TABLE IF NOT EXISTS attachee_checkins (
  id SERIAL PRIMARY KEY,
  attachee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  check_in TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  check_out TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checkins_attachee ON attachee_checkins (attachee_id, check_in DESC);
CREATE INDEX IF NOT EXISTS idx_checkins_department ON attachee_checkins (department_id, check_in DESC);

-- Inquiries from attachees to their instructors / supervisors (threaded).
CREATE TABLE IF NOT EXISTS inquiries (
  id SERIAL PRIMARY KEY,
  attachee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  subject VARCHAR(200) NOT NULL,
  audience VARCHAR(20) NOT NULL DEFAULT 'both' CHECK (audience IN ('instructors', 'supervisors', 'both')),
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inquiries_attachee ON inquiries (attachee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inquiries_department ON inquiries (department_id, created_at DESC);

CREATE TABLE IF NOT EXISTS inquiry_messages (
  id SERIAL PRIMARY KEY,
  inquiry_id INTEGER NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inquiry_messages_inquiry ON inquiry_messages (inquiry_id, created_at);

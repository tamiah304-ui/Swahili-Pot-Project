import { Routes, Route, Navigate } from 'react-router-dom';

import Layout from './components/layout/Layout';
import PrivateRoute from './routes/PrivateRoute';
import RoleRoute from './routes/RoleRoute';

import LoginPage from './pages/LoginPage';
import AttendPage from './pages/AttendPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/auth/ResetPasswordPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import TraineesPage from './pages/trainees/TraineesPage';
import AttendancePage from './pages/attendance/AttendancePage';
import SessionDetailPage from './pages/attendance/SessionDetailPage';
import SubmissionsPage from './pages/submissions/SubmissionsPage';
import NewSubmissionPage from './pages/submissions/NewSubmissionPage';
import DowntimePage from './pages/downtime/DowntimePage';
import InstructorsPage from './pages/users/InstructorsPage';
import UsersPage from './pages/admin/UsersPage';
import ProfilePage from './pages/account/ProfilePage';
import SettingsPage from './pages/account/SettingsPage';
import TasksPage from './pages/tasks/TasksPage';
import InquiriesPage from './pages/inquiries/InquiriesPage';
import RemindersPage from './pages/attachee/RemindersPage';
import AttacheesPage from './pages/attachees/AttacheesPage';
import TermsPage from './pages/legal/TermsPage';
import PrivacyPage from './pages/legal/PrivacyPage';

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/attend/:token" element={<AttendPage />} />

      {/* Legal (public) */}
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      {/* Common aliases → canonical paths */}
      <Route path="/terms-of-service" element={<Navigate to="/terms" replace />} />
      <Route path="/privacy-policy" element={<Navigate to="/privacy" replace />} />

      {/* Authenticated (wrapped in Layout) */}
      <Route
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />

        <Route
          path="/trainees"
          element={
            <RoleRoute roles={['instructor']} requireFlag="has_trainees">
              <TraineesPage />
            </RoleRoute>
          }
        />
        <Route
          path="/attendance"
          element={
            <RoleRoute roles={['instructor']} requireFlag="has_trainees">
              <AttendancePage />
            </RoleRoute>
          }
        />
        <Route
          path="/attendance/:sessionId"
          element={
            <RoleRoute roles={['instructor', 'supervisor']}>
              <SessionDetailPage />
            </RoleRoute>
          }
        />

        <Route path="/submissions" element={<SubmissionsPage />} />
        <Route
          path="/submissions/new"
          element={
            <RoleRoute roles={['instructor', 'attachee']}>
              <NewSubmissionPage />
            </RoleRoute>
          }
        />

        {/* Attachment / internship programme */}
        <Route
          path="/tasks"
          element={
            <RoleRoute roles={['attachee', 'instructor', 'supervisor']}>
              <TasksPage />
            </RoleRoute>
          }
        />
        <Route
          path="/inquiries"
          element={
            <RoleRoute roles={['attachee', 'instructor', 'supervisor']}>
              <InquiriesPage />
            </RoleRoute>
          }
        />
        <Route
          path="/reminders"
          element={
            <RoleRoute roles={['attachee']}>
              <RemindersPage />
            </RoleRoute>
          }
        />
        <Route
          path="/attachees"
          element={
            <RoleRoute roles={['instructor', 'supervisor']}>
              <AttacheesPage />
            </RoleRoute>
          }
        />

        <Route path="/downtime" element={<DowntimePage />} />

        <Route
          path="/instructors"
          element={
            <RoleRoute roles={['supervisor']}>
              <InstructorsPage />
            </RoleRoute>
          }
        />

        {/* System admin */}
        <Route
          path="/users"
          element={
            <RoleRoute roles={['admin']}>
              <UsersPage />
            </RoleRoute>
          }
        />

        {/* Account (all authenticated users) */}
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

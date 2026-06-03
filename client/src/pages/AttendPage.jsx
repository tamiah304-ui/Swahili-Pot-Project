import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import { getAttendSession, checkIn, checkOut } from '../api/attendance';
import { formatEAT, formatTimeEAT } from '../lib/datetime';
import Logo from '../components/ui/Logo';
import Spinner from '../components/ui/Spinner';

const INPUT =
  'w-full rounded-lg border border-[#e2e8f0] bg-white px-3 text-base text-[#374151] focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200';

export default function AttendPage() {
  const { token } = useParams();

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [invalid, setInvalid] = useState(false);

  const [form, setForm] = useState({ trainee_name: '', trainee_phone: '', tasks_completed: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [record, setRecord] = useState(null); // { record_id, trainee_name, check_in }
  const [checkedOut, setCheckedOut] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  useEffect(() => {
    let active = true;
    getAttendSession(token)
      .then((res) => {
        if (active) setSession(res.data);
      })
      .catch(() => {
        if (active) setInvalid(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  function validate() {
    const e = {};
    if (!form.trainee_name.trim()) e.trainee_name = 'Full name is required';
    if (!form.trainee_phone.trim()) e.trainee_phone = 'Phone number is required';
    if (!form.tasks_completed.trim()) e.tasks_completed = 'Please describe your tasks';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleCheckIn(e) {
    e.preventDefault();
    setSubmitError('');
    if (!validate()) return;

    setSubmitting(true);
    try {
      const res = await checkIn(token, {
        trainee_name: form.trainee_name.trim(),
        trainee_phone: form.trainee_phone.trim(),
        tasks_completed: form.tasks_completed.trim(),
      });
      setRecord(res.data);
    } catch (err) {
      setSubmitError(err.response?.data?.error || 'Unable to check in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCheckOut() {
    if (!record) return;
    setCheckingOut(true);
    try {
      await checkOut(record.record_id, new Date().toISOString());
      setCheckedOut(true);
    } catch (err) {
      setSubmitError(err.response?.data?.error || 'Unable to check out. Please try again.');
    } finally {
      setCheckingOut(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-[#f8faff] px-4 py-8">
      <div className="mb-6 flex justify-center">
        <Logo size={24} />
      </div>

      <div className="w-full max-w-md rounded-xl border border-[#e2e8f0] bg-white p-6 shadow-sm">
        {loading && <Spinner />}

        {!loading && invalid && (
          <div className="flex flex-col items-center py-6 text-center">
            <XCircle size={48} className="text-[#dc2626]" />
            <p className="mt-4 text-base font-medium text-[#374151]">
              This attendance link has expired or is no longer valid.
            </p>
          </div>
        )}

        {!loading && session && !record && (
          <>
            <div className="mb-5 border-b border-[#e2e8f0] pb-4">
              <h2 className="font-display text-lg font-semibold text-[#374151]">
                {session.department_name} Attendance
              </h2>
              <p className="mt-1 text-sm text-[#6b7280]">Instructor: {session.instructor_name}</p>
              {session.session_label && (
                <p className="text-sm text-[#6b7280]">Session: {session.session_label}</p>
              )}
              <p className="mt-2 text-xs text-[#6b7280]">
                This link expires at {formatEAT(session.expires_at)}
              </p>
            </div>

            <form onSubmit={handleCheckIn} className="space-y-4" noValidate>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#374151]">Full Name</label>
                <input
                  className={`${INPUT} h-12 ${errors.trainee_name ? 'border-[#dc2626]' : ''}`}
                  value={form.trainee_name}
                  onChange={(e) => setForm({ ...form, trainee_name: e.target.value })}
                />
                {errors.trainee_name && (
                  <p className="mt-1 text-xs text-[#dc2626]">{errors.trainee_name}</p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#374151]">
                  Phone Number
                </label>
                <input
                  className={`${INPUT} h-12 ${errors.trainee_phone ? 'border-[#dc2626]' : ''}`}
                  value={form.trainee_phone}
                  onChange={(e) => setForm({ ...form, trainee_phone: e.target.value })}
                  inputMode="tel"
                />
                {errors.trainee_phone && (
                  <p className="mt-1 text-xs text-[#dc2626]">{errors.trainee_phone}</p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#374151]">
                  Tasks Completed Today
                </label>
                <textarea
                  rows={4}
                  placeholder="Briefly describe what you worked on today"
                  className={`${INPUT} py-3 ${errors.tasks_completed ? 'border-[#dc2626]' : ''}`}
                  value={form.tasks_completed}
                  onChange={(e) => setForm({ ...form, tasks_completed: e.target.value })}
                />
                {errors.tasks_completed && (
                  <p className="mt-1 text-xs text-[#dc2626]">{errors.tasks_completed}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="h-12 w-full rounded-lg bg-brand-600 text-base font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {submitting ? 'Checking in…' : 'Check In'}
              </button>

              {submitError && <p className="text-center text-sm text-[#dc2626]">{submitError}</p>}
            </form>
          </>
        )}

        {!loading && record && !checkedOut && (
          <div className="flex flex-col items-center py-4 text-center">
            <CheckCircle2 size={48} className="text-[#16a34a]" />
            <h2 className="mt-4 font-display text-lg font-semibold text-[#374151]">
              You&apos;re checked in!
            </h2>
            <p className="mt-1 text-sm text-[#374151]">{record.trainee_name}</p>
            <p className="text-sm text-[#6b7280]">Checked in at {formatTimeEAT(record.check_in)}</p>

            <button
              onClick={handleCheckOut}
              disabled={checkingOut}
              className="mt-6 h-12 w-full rounded-lg border border-brand-600 bg-white text-base font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-50"
            >
              {checkingOut ? 'Checking out…' : 'Check Out'}
            </button>
            {submitError && <p className="mt-3 text-sm text-[#dc2626]">{submitError}</p>}
          </div>
        )}

        {!loading && checkedOut && (
          <div className="flex flex-col items-center py-6 text-center">
            <CheckCircle2 size={48} className="text-[#16a34a]" />
            <p className="mt-4 text-base font-medium text-[#374151]">
              You have checked out. See you tomorrow!
            </p>
          </div>
        )}
      </div>

      <p className="mt-6 max-w-md text-center text-xs leading-relaxed text-[#6b7280]">
        By checking in, you agree to our{' '}
        <Link to="/terms" className="font-medium text-brand-600 hover:underline">
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link to="/privacy" className="font-medium text-brand-600 hover:underline">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}

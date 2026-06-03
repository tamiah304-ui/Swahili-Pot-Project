import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ListTodo, AlarmClock, MessageSquare, LogIn, LogOut, CheckCircle2 } from 'lucide-react';
import { getAttacheeDashboard, checkInNow, checkOutNow } from '../../api/attachee';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { formatTimeEAT, formatDateEAT } from '../../lib/datetime';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';

function StatCard({ icon: Icon, label, value }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-subtle">{label}</p>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accentSoft">
          <Icon size={18} className="text-brand-600" />
        </div>
      </div>
      <p className="mt-3 font-display text-3xl font-bold text-ink">{value}</p>
    </Card>
  );
}

export default function AttacheeDashboard() {
  const { user } = useAuth();
  const { show } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await getAttacheeDashboard();
    setData(res.data);
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  async function handleCheckIn() {
    setBusy(true);
    try {
      await checkInNow();
      show('Checked in — have a great day!');
      await load();
    } catch (err) {
      show(err.response?.data?.error || 'Check-in failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckOut() {
    setBusy(true);
    try {
      await checkOutNow();
      show('Checked out. See you tomorrow!');
      await load();
    } catch (err) {
      show(err.response?.data?.error || 'Check-out failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner />;
  if (!data) return null;

  const { stats, today, recentTasks } = data;
  const checkedIn = today && !today.check_out;
  const checkedOut = today && today.check_out;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-ink">Welcome, {user.name}</h2>
        <p className="mt-1 text-sm text-subtle">{user.department_name} Department · Attachee</p>
      </div>

      {/* Check-in widget */}
      <Card className="p-5">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h3 className="font-display text-base font-semibold text-ink">Daily Attendance</h3>
            {!today && <p className="mt-1 text-sm text-subtle">You haven&apos;t checked in today.</p>}
            {checkedIn && (
              <p className="mt-1 text-sm text-subtle">
                Checked in at <span className="font-medium text-ink">{formatTimeEAT(today.check_in)}</span>
              </p>
            )}
            {checkedOut && (
              <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-[#16a34a]">
                <CheckCircle2 size={15} /> In {formatTimeEAT(today.check_in)} · Out {formatTimeEAT(today.check_out)}
              </p>
            )}
          </div>
          {!today && (
            <Button onClick={handleCheckIn} disabled={busy}>
              <LogIn size={16} /> Check In
            </Button>
          )}
          {checkedIn && (
            <Button variant="secondary" onClick={handleCheckOut} disabled={busy}>
              <LogOut size={16} /> Check Out
            </Button>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={ListTodo} label="Active Tasks" value={stats.activeTasks} />
        <StatCard icon={AlarmClock} label="Reminders" value={stats.reminders} />
        <StatCard icon={MessageSquare} label="Open Inquiries" value={stats.openInquiries} />
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-semibold text-ink">Your Tasks</h3>
          <Link to="/tasks" className="text-sm font-medium text-brand-600 hover:underline">
            View all
          </Link>
        </div>
        {recentTasks.length === 0 ? (
          <p className="mt-4 text-sm text-subtle">No tasks assigned yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {recentTasks.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{t.title}</p>
                  <p className="text-xs text-subtle">
                    {t.assigned_by_name}
                    {t.due_date ? ` · due ${formatDateEAT(t.due_date)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge status={t.priority} />
                  <Badge status={t.status === 'completed' ? 'resolved' : t.status === 'submitted' ? 'acknowledged' : 'open'}>
                    {t.status.replace('_', ' ')}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

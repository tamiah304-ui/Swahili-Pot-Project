import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  ClipboardCheck,
  FileText,
  Radio,
  UserCog,
  Clock,
  Inbox,
  ShieldCheck,
  Building2,
  UserX,
} from 'lucide-react';
import { getDashboard } from '../../api/dashboard';
import { getAdminStats } from '../../api/admin';
import { useAuth } from '../../context/AuthContext';
import AttacheeDashboard from '../attachee/AttacheeDashboard';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import { formatEAT } from '../../lib/datetime';

function StatCard({ icon: Icon, label, value, hint }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-subtle">{label}</p>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accentSoft">
          <Icon size={18} className="text-brand-600" />
        </div>
      </div>
      <p className="mt-3 font-display text-3xl font-bold text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-subtle">{hint}</p>}
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  if (user.role === 'admin') return <AdminDashboard />;
  if (user.role === 'attachee') return <AttacheeDashboard />;
  return <StaffDashboard user={user} />;
}

function AdminDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getAdminStats()
      .then((res) => active && setStats(res.data.stats))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <Spinner />;
  if (!stats) return <EmptyState icon={Inbox} title="No data available" description="Try again later." />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-ink">Welcome, {user.name}</h2>
        <p className="mt-1 text-sm text-subtle">System Administrator · All departments</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={UserCog} label="Supervisors" value={stats.supervisors} />
        <StatCard icon={Users} label="Instructors" value={stats.instructors} />
        <StatCard icon={Building2} label="Departments" value={stats.departments} />
        <StatCard icon={UserX} label="Suspended Accounts" value={stats.suspended} />
        <StatCard icon={ShieldCheck} label="Admins" value={stats.admins} />
        <StatCard icon={Users} label="Active Trainees" value={stats.trainees} />
        <StatCard icon={FileText} label="Total Submissions" value={stats.submissions} />
        <StatCard icon={Radio} label="Open Downtime" value={stats.open_downtime} />
      </div>

      <Card className="p-5">
        <h3 className="font-display text-base font-semibold text-ink">Account Management</h3>
        <p className="mt-1 text-sm text-subtle">
          Create, suspend, reset passwords, and manage every account in the system.
        </p>
        <Link
          to="/users"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <ShieldCheck size={16} /> Manage Users
        </Link>
      </Card>
    </div>
  );
}

function StaffDashboard({ user }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getDashboard()
      .then((res) => {
        if (active) setData(res.data);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <Spinner />;
  if (!data) return <EmptyState icon={Inbox} title="No data available" description="Try again later." />;

  const { stats, recent } = data;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-ink">Welcome, {user.name}</h2>
        <p className="mt-1 text-sm text-subtle">
          {data.department_name} Department · {user.role === 'supervisor' ? 'Supervisor' : 'Instructor'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data.role === 'instructor' ? (
          <>
            <StatCard icon={Users} label="Active Trainees" value={stats.trainees} />
            <StatCard
              icon={ClipboardCheck}
              label="Sessions This Month"
              value={stats.sessionsThisMonth}
            />
            <StatCard
              icon={FileText}
              label="Submissions This Month"
              value={stats.submissionsThisMonth}
              hint={`${stats.submissionsByStatus.acknowledged} acknowledged · ${stats.submissionsByStatus.returned} returned`}
            />
            {data.has_radio_report && (
              <StatCard icon={Radio} label="Open Downtime Reports" value={stats.openDowntime} />
            )}
          </>
        ) : (
          <>
            <StatCard icon={UserCog} label="Instructors" value={stats.instructors} />
            <StatCard icon={Users} label="Active Trainees" value={stats.trainees} />
            <StatCard
              icon={FileText}
              label="Pending Submissions"
              value={stats.pendingSubmissions}
              hint="Awaiting your review"
            />
            {data.has_radio_report && (
              <StatCard icon={Radio} label="Open Downtime Reports" value={stats.openDowntime} />
            )}
          </>
        )}
      </div>

      <Card className="p-5">
        <h3 className="font-display text-base font-semibold text-ink">
          {data.role === 'instructor' ? 'Your Recent Submissions' : 'Submissions Pending Review'}
        </h3>

        {recent.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={Inbox}
              title="Nothing here yet"
              description={
                data.role === 'instructor'
                  ? 'Submissions you file will appear here.'
                  : 'New submissions awaiting review will appear here.'
              }
            />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {recent.map((item) => (
              <li key={item.id}>
                <Link
                  to="/submissions"
                  className="flex items-center justify-between gap-3 py-3 hover:opacity-80"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{item.title}</p>
                    <p className="text-xs text-subtle">
                      {item.form_type}
                      {item.instructor_name ? ` · ${item.instructor_name}` : ''} ·{' '}
                      <Clock size={11} className="mb-0.5 inline" /> {formatEAT(item.submitted_at)}
                    </p>
                  </div>
                  <Badge status={item.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

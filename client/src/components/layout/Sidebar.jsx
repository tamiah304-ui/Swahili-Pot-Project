import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  ClipboardCheck,
  FileText,
  Radio,
  UserCog,
  ShieldCheck,
  ListTodo,
  GraduationCap,
  MessageSquare,
  AlarmClock,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Logo from '../ui/Logo';

const ROLE_LABEL = {
  admin: 'System Admin',
  supervisor: 'Supervisor',
  instructor: 'Instructor',
  attachee: 'Attachee',
};

function buildNav(user) {
  const items = [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }];

  // System admin: global account management only.
  if (user.role === 'admin') {
    items.push({ to: '/users', label: 'User Management', icon: ShieldCheck });
    return items;
  }

  // Attachee (intern) portal.
  if (user.role === 'attachee') {
    items.push({ to: '/tasks', label: 'My Tasks', icon: ListTodo });
    items.push({ to: '/submissions', label: 'Submissions', icon: FileText });
    items.push({ to: '/reminders', label: 'Reminders', icon: AlarmClock });
    items.push({ to: '/inquiries', label: 'Inquiries', icon: MessageSquare });
    return items;
  }

  // Instructor / supervisor.
  if (user.role === 'instructor' && user.has_trainees) {
    items.push({ to: '/trainees', label: 'Trainees', icon: Users });
    items.push({ to: '/attendance', label: 'Attendance', icon: ClipboardCheck });
  }

  items.push({ to: '/submissions', label: 'Submissions', icon: FileText });
  items.push({ to: '/tasks', label: 'Tasks', icon: ListTodo });
  items.push({ to: '/attachees', label: 'Attachees', icon: GraduationCap });
  items.push({ to: '/inquiries', label: 'Inquiries', icon: MessageSquare });

  if (user.has_radio_report) {
    items.push({ to: '/downtime', label: 'Downtime Reports', icon: Radio });
  }

  if (user.role === 'supervisor') {
    items.push({ to: '/instructors', label: 'Instructors', icon: UserCog });
  }

  return items;
}

export default function Sidebar() {
  const { user, logout } = useAuth();
  const nav = buildNav(user);

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-card md:flex">
      <div className="border-b border-line px-5 py-4">
        <Logo size={18} />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/dashboard'}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-accentSoft font-medium text-brand-600'
                  : 'text-ink hover:bg-hover'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-line px-4 py-4">
        <div className="mb-2">
          <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
          <span className="mt-1 inline-block rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-medium text-white">
            {ROLE_LABEL[user.role]}
          </span>
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink transition-colors hover:bg-red-50 hover:text-[#dc2626]"
        >
          <LogOut size={16} />
          Log out
        </button>
      </div>
    </aside>
  );
}

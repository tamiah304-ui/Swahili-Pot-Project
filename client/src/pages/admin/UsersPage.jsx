import { useEffect, useState, useCallback } from 'react';
import { UserPlus, Search, ShieldCheck, KeyRound, Ban, CircleCheck, Trash2, Eye } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  getAdminUsers,
  createAdminUser,
  suspendAdminUser,
  resetAdminUserPassword,
  deleteAdminUser,
} from '../../api/admin';
import { getDepartments } from '../../api/departments';
import { useToast } from '../../components/ui/Toast';
import { formatEAT } from '../../lib/datetime';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import { Table, THead, TH, TBody, TR, TD } from '../../components/ui/Table';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_LABEL = { admin: 'Admin', supervisor: 'Supervisor', instructor: 'Instructor', attachee: 'Attachee' };
const ROLE_VARIANT = { admin: 'blue', supervisor: 'amber', instructor: 'green', attachee: 'gray' };
const ROLE_TABS = [
  { value: '', label: 'All' },
  { value: 'supervisor', label: 'Supervisors' },
  { value: 'instructor', label: 'Instructors' },
  { value: 'attachee', label: 'Attachees' },
  { value: 'admin', label: 'Admins' },
];

export default function UsersPage() {
  const { user: me } = useAuth();
  const { show } = useToast();

  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', role: '', department_id: '', status: '' });

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: '', department_id: '' });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const [viewUser, setViewUser] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPw, setResetPw] = useState('');
  const [resetErr, setResetErr] = useState('');
  const [confirmAction, setConfirmAction] = useState(null); // { type:'suspend'|'delete', user }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.search) params.search = filters.search;
      if (filters.role) params.role = filters.role;
      if (filters.department_id) params.department_id = filters.department_id;
      if (filters.status) params.status = filters.status;
      const res = await getAdminUsers(params);
      setUsers(res.data.users);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    getDepartments().then((res) => setDepartments(res.data.departments)).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 250); // debounce search/filter changes
    return () => clearTimeout(t);
  }, [load]);

  function validateCreate() {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!EMAIL_RE.test(form.email.trim())) e.email = 'Enter a valid email';
    if (!form.password) e.password = 'Password is required';
    else if (form.password.length < 8) e.password = 'Must be at least 8 characters';
    if (!form.role) e.role = 'Role is required';
    if (!form.department_id) e.department_id = 'Department is required';
    setFormErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!validateCreate()) return;
    setSubmitting(true);
    try {
      await createAdminUser({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        department_id: Number(form.department_id),
      });
      setCreateOpen(false);
      setForm({ name: '', email: '', password: '', role: '', department_id: '' });
      setFormErrors({});
      show('Account created');
      load();
    } catch (err) {
      show(err.response?.data?.error || 'Failed to create account', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset() {
    if (resetPw.length < 8) return setResetErr('Must be at least 8 characters');
    try {
      await resetAdminUserPassword(resetTarget.id, { new_password: resetPw });
      setResetTarget(null);
      setResetPw('');
      setResetErr('');
      show(`Password reset for ${resetTarget.name}`);
    } catch (err) {
      show(err.response?.data?.error || 'Failed to reset password', 'error');
    }
  }

  async function handleConfirm() {
    const { type, user } = confirmAction;
    try {
      if (type === 'suspend') {
        await suspendAdminUser(user.id);
        show(user.is_active ? 'Account suspended' : 'Account reactivated');
      } else {
        await deleteAdminUser(user.id);
        show('Account deleted');
      }
      setConfirmAction(null);
      load();
    } catch (err) {
      show(err.response?.data?.error || 'Action failed', 'error');
      setConfirmAction(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Role tabs — group accounts by type */}
      <div className="flex flex-wrap gap-2">
        {ROLE_TABS.map((t) => (
          <button
            key={t.value || 'all'}
            onClick={() => setFilters({ ...filters, role: t.value })}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              filters.role === t.value ? 'bg-accentSoft text-brand-600' : 'text-subtle hover:bg-hover'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters + create */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <input
            placeholder="Search name or email…"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="w-full rounded-lg border border-line bg-card py-2 pl-9 pr-3 text-sm text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </div>
        <select
          value={filters.role}
          onChange={(e) => setFilters({ ...filters, role: e.target.value })}
          className="rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-200"
        >
          <option value="">All roles</option>
          <option value="supervisor">Supervisors</option>
          <option value="instructor">Instructors</option>
          <option value="attachee">Attachees</option>
          <option value="admin">Admins</option>
        </select>
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          className="rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-200"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <Button onClick={() => setCreateOpen(true)}>
          <UserPlus size={16} /> New Account
        </Button>
      </div>

      {loading ? (
        <Spinner />
      ) : users.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No accounts match" description="Try adjusting the filters." />
      ) : (
        <Table>
          <THead>
            <TH>Name</TH>
            <TH>Email</TH>
            <TH>Role</TH>
            <TH>Department</TH>
            <TH>Status</TH>
            <TH className="text-right">Actions</TH>
          </THead>
          <TBody>
            {users.map((u, i) => (
              <TR key={u.id} index={i}>
                <TD className="font-medium">{u.name}</TD>
                <TD>{u.email}</TD>
                <TD>
                  <Badge variant={ROLE_VARIANT[u.role]}>{ROLE_LABEL[u.role]}</Badge>
                </TD>
                <TD>{u.department_name || '—'}</TD>
                <TD>
                  <Badge status={u.is_active ? 'active' : 'inactive'} />
                </TD>
                <TD>
                  <div className="flex items-center justify-end gap-1">
                    <IconBtn title="View profile" onClick={() => setViewUser(u)} icon={Eye} />
                    <IconBtn
                      title="Reset password"
                      onClick={() => { setResetTarget(u); setResetPw(''); setResetErr(''); }}
                      icon={KeyRound}
                    />
                    {u.id !== me.id && (
                      <>
                        <IconBtn
                          title={u.is_active ? 'Suspend' : 'Reactivate'}
                          onClick={() => setConfirmAction({ type: 'suspend', user: u })}
                          icon={u.is_active ? Ban : CircleCheck}
                        />
                        <IconBtn
                          title="Delete"
                          danger
                          onClick={() => setConfirmAction({ type: 'delete', user: u })}
                          icon={Trash2}
                        />
                      </>
                    )}
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {/* Create account modal */}
      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Account"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? 'Creating…' : 'Create Account'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreate} className="space-y-4" noValidate>
          <Input label="Full Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={formErrors.name} />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={formErrors.email} />
          <Input label="Temporary Password" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} error={formErrors.password} />
          <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} error={formErrors.role}>
            <option value="">Select a role…</option>
            <option value="supervisor">Supervisor</option>
            <option value="instructor">Instructor</option>
            <option value="attachee">Attachee</option>
          </Select>
          <Select label="Department" value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })} error={formErrors.department_id}>
            <option value="">Select a department…</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
        </form>
      </Modal>

      {/* View profile modal */}
      <Modal isOpen={!!viewUser} onClose={() => setViewUser(null)} title="User Profile">
        {viewUser && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white">
                {viewUser.name.charAt(0).toUpperCase()}
              </span>
              <div>
                <p className="font-display text-base font-semibold text-ink">{viewUser.name}</p>
                <Badge variant={ROLE_VARIANT[viewUser.role]}>{ROLE_LABEL[viewUser.role]}</Badge>
              </div>
            </div>
            <dl className="grid grid-cols-1 gap-3 text-sm">
              <Row label="Email" value={viewUser.email} />
              <Row label="Department" value={viewUser.department_name || 'All departments'} />
              <Row label="Status" value={viewUser.is_active ? 'Active' : 'Suspended'} />
              <Row label="Created" value={formatEAT(viewUser.created_at)} />
            </dl>
          </div>
        )}
      </Modal>

      {/* Reset password modal */}
      <Modal
        isOpen={!!resetTarget}
        onClose={() => setResetTarget(null)}
        title="Reset Password"
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetTarget(null)}>Cancel</Button>
            <Button onClick={handleReset}>Reset Password</Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-subtle">
          Set a new password for <span className="font-medium text-ink">{resetTarget?.name}</span>.
          They will be notified.
        </p>
        <Input
          label="New Password"
          type="text"
          value={resetPw}
          onChange={(e) => setResetPw(e.target.value)}
          error={resetErr}
        />
      </Modal>

      {/* Confirm suspend/delete */}
      <Modal
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        title={
          confirmAction?.type === 'delete'
            ? 'Delete Account'
            : confirmAction?.user?.is_active
            ? 'Suspend Account'
            : 'Reactivate Account'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmAction(null)}>Cancel</Button>
            <Button
              variant={confirmAction?.type === 'delete' || confirmAction?.user?.is_active ? 'danger' : 'primary'}
              onClick={handleConfirm}
            >
              {confirmAction?.type === 'delete'
                ? 'Delete'
                : confirmAction?.user?.is_active
                ? 'Suspend'
                : 'Reactivate'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink">
          {confirmAction?.type === 'delete'
            ? `Permanently delete ${confirmAction?.user?.name}? Accounts with existing records can't be deleted — suspend them instead.`
            : confirmAction?.user?.is_active
            ? `Suspend ${confirmAction?.user?.name}? They will be unable to sign in.`
            : `Reactivate ${confirmAction?.user?.name}? They will regain access.`}
        </p>
      </Modal>
    </div>
  );
}

function IconBtn({ icon: Icon, title, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`rounded-md p-1.5 hover:bg-hover ${danger ? 'text-[#dc2626]' : 'text-subtle hover:text-ink'}`}
    >
      <Icon size={16} />
    </button>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line pb-2 last:border-0">
      <dt className="text-subtle">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}

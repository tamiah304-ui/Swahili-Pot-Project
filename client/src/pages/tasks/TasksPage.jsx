import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListTodo, Plus } from 'lucide-react';
import { getTasks, createTask, updateTaskStatus } from '../../api/tasks';
import { getDeptAttachees } from '../../api/attachee';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { formatDateEAT } from '../../lib/datetime';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';

const TASK_VARIANT = { open: 'gray', in_progress: 'amber', submitted: 'blue', completed: 'green' };
const label = (s) => s.replace('_', ' ');

export default function TasksPage() {
  const { user } = useAuth();
  const { show } = useToast();
  const navigate = useNavigate();
  const isStaff = user.role === 'instructor' || user.role === 'supervisor';

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const [attachees, setAttachees] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ assigned_to: '', title: '', description: '', priority: 'medium', due_date: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await getTasks();
      setTasks(res.data.tasks);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    if (isStaff) getDeptAttachees().then((res) => setAttachees(res.data.attachees)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function validate() {
    const e = {};
    if (!form.assigned_to) e.assigned_to = 'Select an attachee';
    if (!form.title.trim()) e.title = 'Title is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleAssign(e) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await createTask({
        assigned_to: form.assigned_to,
        title: form.title.trim(),
        description: form.description.trim(),
        priority: form.priority,
        due_date: form.due_date || null,
      });
      setModalOpen(false);
      setForm({ assigned_to: '', title: '', description: '', priority: 'medium', due_date: '' });
      setErrors({});
      show('Task assigned');
      await load();
    } catch (err) {
      show(err.response?.data?.error || 'Failed to assign task', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function changeStatus(task, status) {
    try {
      await updateTaskStatus(task.id, status);
      show('Task updated');
      await load();
    } catch (err) {
      show(err.response?.data?.error || 'Update failed', 'error');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold text-ink">
          {isStaff ? 'Attachee Tasks' : 'My Tasks'}
        </h2>
        {isStaff && (
          <Button onClick={() => setModalOpen(true)} disabled={attachees.length === 0}>
            <Plus size={16} /> Assign Task
          </Button>
        )}
      </div>

      {isStaff && attachees.length === 0 && !loading && (
        <p className="text-sm text-subtle">
          No attachees in your department yet — ask an administrator to create attachee accounts.
        </p>
      )}

      {loading ? (
        <Spinner />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="No tasks"
          description={isStaff ? 'Assign a task to an attachee to get started.' : 'No tasks have been assigned to you yet.'}
        />
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => (
            <Card key={t.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ink">{t.title}</p>
                    <Badge status={t.priority} />
                    <Badge variant={TASK_VARIANT[t.status]}>{label(t.status)}</Badge>
                  </div>
                  {t.description && (
                    <p className="mt-1.5 whitespace-pre-wrap text-sm text-subtle">{t.description}</p>
                  )}
                  <p className="mt-2 text-xs text-subtle">
                    {isStaff ? `Assigned to ${t.attachee_name}` : `From ${t.assigned_by_name}`}
                    {t.due_date ? ` · due ${formatDateEAT(t.due_date)}` : ''}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                {!isStaff && t.status === 'open' && (
                  <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => changeStatus(t, 'in_progress')}>
                    Start
                  </Button>
                )}
                {!isStaff && t.status !== 'completed' && (
                  <Button
                    className="px-3 py-1 text-xs"
                    onClick={() => navigate(`/submissions/new?task=${t.id}`)}
                  >
                    Submit Work
                  </Button>
                )}
                {isStaff && t.status === 'submitted' && (
                  <Button className="px-3 py-1 text-xs" onClick={() => changeStatus(t, 'completed')}>
                    Mark Completed
                  </Button>
                )}
                {isStaff && t.status !== 'completed' && t.status !== 'submitted' && (
                  <span className="text-xs text-subtle">Awaiting the attachee&apos;s submission.</span>
                )}
                {t.status === 'completed' && <span className="text-xs text-[#16a34a]">Completed ✓</span>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Assign task modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Assign Task"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleAssign} disabled={submitting}>
              {submitting ? 'Assigning…' : 'Assign'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleAssign} className="space-y-4" noValidate>
          <Select
            label="Attachee"
            value={form.assigned_to}
            onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
            error={errors.assigned_to}
          >
            <option value="">Select an attachee…</option>
            {attachees.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
          <Input
            label="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            error={errors.title}
          />
          <Textarea
            label="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Select>
            <Input
              label="Due date (optional)"
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}

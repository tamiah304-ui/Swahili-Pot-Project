import { useEffect, useState } from 'react';
import { AlarmClock, Plus, Trash2, Check } from 'lucide-react';
import { getReminders, createReminder, updateReminder, deleteReminder } from '../../api/attachee';
import { useToast } from '../../components/ui/Toast';
import { formatEAT } from '../../lib/datetime';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Textarea from '../../components/ui/Textarea';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';

export default function RemindersPage() {
  const { show } = useToast();
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ title: '', note: '', remind_at: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await getReminders();
      setReminders(res.data.reminders);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function validate() {
    const e = {};
    if (!form.title.trim()) e.title = 'Title is required';
    if (!form.remind_at) e.remind_at = 'Pick a date and time';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await createReminder({
        title: form.title.trim(),
        note: form.note.trim(),
        remind_at: new Date(form.remind_at).toISOString(),
      });
      setModalOpen(false);
      setForm({ title: '', note: '', remind_at: '' });
      setErrors({});
      show('Reminder added');
      await load();
    } catch (err) {
      show(err.response?.data?.error || 'Failed to add reminder', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleDone(r) {
    try {
      await updateReminder(r.id, { is_done: !r.is_done });
      await load();
    } catch (err) {
      show(err.response?.data?.error || 'Update failed', 'error');
    }
  }

  async function remove(r) {
    try {
      await deleteReminder(r.id);
      show('Reminder deleted');
      await load();
    } catch (err) {
      show(err.response?.data?.error || 'Delete failed', 'error');
    }
  }

  const now = Date.now();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold text-ink">Reminders</h2>
        <Button onClick={() => setModalOpen(true)}>
          <Plus size={16} /> New Reminder
        </Button>
      </div>

      {loading ? (
        <Spinner />
      ) : reminders.length === 0 ? (
        <EmptyState
          icon={AlarmClock}
          title="No reminders"
          description="Set a reminder so you never miss a task or deadline."
          action={{ label: 'New Reminder', onClick: () => setModalOpen(true) }}
        />
      ) : (
        <div className="space-y-2">
          {reminders.map((r) => {
            const overdue = !r.is_done && new Date(r.remind_at).getTime() < now;
            return (
              <Card key={r.id} className="flex items-start gap-3 p-4">
                <button
                  onClick={() => toggleDone(r)}
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                    r.is_done ? 'border-[#16a34a] bg-[#16a34a] text-white' : 'border-line'
                  }`}
                  aria-label={r.is_done ? 'Mark not done' : 'Mark done'}
                >
                  {r.is_done && <Check size={13} />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${r.is_done ? 'text-subtle line-through' : 'text-ink'}`}>
                    {r.title}
                  </p>
                  {r.note && <p className="mt-0.5 whitespace-pre-wrap text-sm text-subtle">{r.note}</p>}
                  <p className={`mt-1 text-xs ${overdue ? 'font-medium text-[#dc2626]' : 'text-subtle'}`}>
                    {formatEAT(r.remind_at)}
                    {overdue ? ' · overdue' : ''}
                  </p>
                </div>
                <button onClick={() => remove(r)} className="text-subtle hover:text-[#dc2626]" aria-label="Delete">
                  <Trash2 size={16} />
                </button>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New Reminder"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={submitting}>
              {submitting ? 'Saving…' : 'Add Reminder'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleAdd} className="space-y-4" noValidate>
          <Input
            label="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            error={errors.title}
          />
          <Input
            label="Date & time"
            type="datetime-local"
            value={form.remind_at}
            onChange={(e) => setForm({ ...form, remind_at: e.target.value })}
            error={errors.remind_at}
          />
          <Textarea
            label="Note (optional)"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </form>
      </Modal>
    </div>
  );
}

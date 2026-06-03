import { useEffect, useState } from 'react';
import { MessageSquare, Plus, ArrowLeft, Send } from 'lucide-react';
import { getInquiries, createInquiry, getInquiry, replyInquiry } from '../../api/inquiries';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { formatEAT } from '../../lib/datetime';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';

const STATUS_VARIANT = { open: 'amber', answered: 'green', closed: 'gray' };

export default function InquiriesPage() {
  const { user } = useAuth();
  const { show } = useToast();
  const isAttachee = user.role === 'attachee';

  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  // new inquiry modal
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ subject: '', message: '', audience: 'both' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await getInquiries();
      setInquiries(res.data.inquiries);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function validate() {
    const e = {};
    if (!form.subject.trim()) e.subject = 'Subject is required';
    if (!form.message.trim()) e.message = 'Message is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await createInquiry({ subject: form.subject.trim(), message: form.message.trim(), audience: form.audience });
      setModalOpen(false);
      setForm({ subject: '', message: '', audience: 'both' });
      setErrors({});
      show('Inquiry sent');
      await load();
    } catch (err) {
      show(err.response?.data?.error || 'Failed to send inquiry', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (openId) {
    return <Thread id={openId} onBack={() => { setOpenId(null); load(); }} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold text-ink">Inquiries</h2>
        {isAttachee && (
          <Button onClick={() => setModalOpen(true)}>
            <Plus size={16} /> New Inquiry
          </Button>
        )}
      </div>

      {loading ? (
        <Spinner />
      ) : inquiries.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No inquiries"
          description={isAttachee ? 'Ask your instructor or supervisor a question.' : 'Inquiries from attachees will appear here.'}
          action={isAttachee ? { label: 'New Inquiry', onClick: () => setModalOpen(true) } : undefined}
        />
      ) : (
        <div className="space-y-2">
          {inquiries.map((i) => (
            <Card
              key={i.id}
              className="cursor-pointer p-4 hover:bg-canvas"
              onClick={() => setOpenId(i.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{i.subject}</p>
                  <p className="mt-0.5 text-xs text-subtle">
                    {!isAttachee && i.attachee_name ? `${i.attachee_name} · ` : ''}
                    {i.message_count} message{i.message_count === 1 ? '' : 's'} · {formatEAT(i.updated_at)}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[i.status]}>{i.status}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New Inquiry"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={submitting}>{submitting ? 'Sending…' : 'Send'}</Button>
          </>
        }
      >
        <form onSubmit={handleCreate} className="space-y-4" noValidate>
          <Input
            label="Subject"
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            error={errors.subject}
          />
          <Select label="Send to" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
            <option value="both">Instructors & Supervisors</option>
            <option value="instructors">Instructors only</option>
            <option value="supervisors">Supervisors only</option>
          </Select>
          <Textarea
            label="Message"
            rows={4}
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            error={errors.message}
          />
        </form>
      </Modal>
    </div>
  );
}

function Thread({ id, onBack }) {
  const { user } = useAuth();
  const { show } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  async function load() {
    const res = await getInquiry(id);
    setData(res.data);
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function send(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      await replyInquiry(id, body.trim());
      setBody('');
      await load();
    } catch (err) {
      show(err.response?.data?.error || 'Failed to send', 'error');
    } finally {
      setSending(false);
    }
  }

  if (loading) return <Spinner />;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-subtle hover:text-ink">
        <ArrowLeft size={16} /> Back to inquiries
      </button>

      <div>
        <h2 className="font-display text-xl font-bold text-ink">{data.inquiry.subject}</h2>
        <p className="mt-1 text-sm text-subtle capitalize">{data.inquiry.status}</p>
      </div>

      <Card className="space-y-3 p-4">
        {data.messages.map((m) => {
          const mine = m.sender_id === user.id;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-xl px-3 py-2 ${mine ? 'bg-brand-600 text-white' : 'bg-canvas text-ink'}`}>
                {!mine && (
                  <p className="mb-0.5 text-xs font-medium opacity-80">
                    {m.sender_name} · {m.sender_role}
                  </p>
                )}
                <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                <p className={`mt-1 text-[10px] ${mine ? 'text-white/70' : 'text-subtle'}`}>
                  {formatEAT(m.created_at)}
                </p>
              </div>
            </div>
          );
        })}
      </Card>

      <form onSubmit={send} className="flex items-end gap-2">
        <div className="flex-1">
          <Textarea
            rows={2}
            placeholder="Write a reply…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={sending || !body.trim()}>
          <Send size={16} /> Send
        </Button>
      </form>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { createSubmission } from '../../api/submissions';
import { useToast } from '../../components/ui/Toast';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';

const FORM_TYPES = [
  'Learner Onboarding Form',
  'Session Outline',
  'Progress Report',
  'Assignment',
  'General Submission',
];

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png';
const MAX_BYTES = 10 * 1024 * 1024;

export default function NewSubmissionPage() {
  const navigate = useNavigate();
  const { show } = useToast();
  const [searchParams] = useSearchParams();
  const taskId = searchParams.get('task');

  const [form, setForm] = useState({
    title: '',
    form_type: taskId ? 'Assignment' : '',
    description: '',
  });
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  function validate() {
    const e = {};
    if (!form.title.trim()) e.title = 'Title is required';
    if (!form.form_type) e.form_type = 'Form type is required';
    if (file && file.size > MAX_BYTES) e.file = 'File must be 10MB or smaller';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;

    const fd = new FormData();
    fd.append('title', form.title.trim());
    fd.append('form_type', form.form_type);
    if (form.description.trim()) fd.append('description', form.description.trim());
    if (taskId) fd.append('task_id', taskId);
    if (file) fd.append('attachment', file);

    setSubmitting(true);
    try {
      await createSubmission(fd);
      show('Submission filed successfully');
      navigate('/submissions');
    } catch (err) {
      show(err.response?.data?.error || 'Failed to submit', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h2 className="mb-5 font-display text-xl font-bold text-ink">New Submission</h2>
      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <Input
            label="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            error={errors.title}
          />

          <Select
            label="Form Type"
            value={form.form_type}
            onChange={(e) => setForm({ ...form, form_type: e.target.value })}
            error={errors.form_type}
          >
            <option value="">Select a form type…</option>
            {FORM_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>

          <Textarea
            label="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">
              Attachment (optional)
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line bg-canvas px-3 py-3 text-sm text-subtle hover:border-brand-500">
              <Upload size={16} />
              <span className="truncate">{file ? file.name : 'Choose a file…'}</span>
              <input
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
            <p className="mt-1 text-xs text-subtle">
              pdf, doc, docx, xls, xlsx, ppt, pptx, jpg, jpeg, png · max 10MB
            </p>
            {errors.file && <p className="mt-1 text-xs text-[#dc2626]">{errors.file}</p>}
          </div>

          <div className="flex gap-3 pt-1">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate('/submissions')}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

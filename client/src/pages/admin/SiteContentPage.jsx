import { useEffect, useState } from 'react';
import { Plus, Trash2, Upload, ExternalLink, Save } from 'lucide-react';
import {
  getSiteContent,
  updateSection,
  getPartnersAdmin,
  createPartner,
  updatePartner,
  deletePartner,
  partnerLogoUrl,
  uploadMedia,
  deleteMedia,
  mediaUrl,
} from '../../api/site';
import { useToast } from '../../components/ui/Toast';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Textarea from '../../components/ui/Textarea';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';

const TABS = ['Numbers', 'Hero', 'Story', 'About', 'Programs', 'Partners', 'Footer'];

const METRIC_FIELDS = [
  ['youthImpacted', 'Youth Impacted'],
  ['projectsLaunched', 'Projects Launched'],
  ['startupsIncubated', 'Startups Incubated'],
  ['communityCenters', 'Community Centers'],
  ['yearsOfImpact', 'Years of Impact'],
  ['youthEmpowered', 'Youth Empowered'],
  ['successStories', 'Success Stories'],
];

export default function SiteContentPage() {
  const { show } = useToast();
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('Numbers');

  async function load() {
    const res = await getSiteContent();
    setContent(res.data.content);
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  async function save(key, value) {
    try {
      await updateSection(key, value);
      setContent((c) => ({ ...c, [key]: value }));
      show('Saved — the website is updated');
    } catch (err) {
      show(err.response?.data?.error || 'Failed to save', 'error');
    }
  }

  if (loading) return <Spinner />;
  if (!content) return null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-bold text-ink">Website Content</h2>
        <p className="mt-1 text-sm text-subtle">
          Edit the public landing page. Changes go live immediately.{' '}
          <a href="/" target="_blank" rel="noreferrer" className="font-medium text-brand-600 hover:underline">
            View site ↗
          </a>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t ? 'bg-accentSoft text-brand-600' : 'text-subtle hover:bg-hover'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Numbers' && <MetricsEditor value={content.metrics} onSave={(v) => save('metrics', v)} />}
      {tab === 'Hero' && <HeroEditor value={content.hero} hasMedia={!!content.media?.hero} onSave={(v) => save('hero', v)} />}
      {tab === 'Story' && (
        <StoryEditor decade={content.decade} journey={content.journey} onSaveDecade={(v) => save('decade', v)} onSaveJourney={(v) => save('journey', v)} />
      )}
      {tab === 'About' && <AboutEditor value={content.about} hasMedia={!!content.media?.about} onSave={(v) => save('about', v)} />}
      {tab === 'Programs' && <ProgramsEditor value={content.programs} onSave={(v) => save('programs', v)} />}
      {tab === 'Partners' && <PartnersEditor />}
      {tab === 'Footer' && (
        <FooterEditor contact={content.contact} newsletter={content.newsletter} onSaveContact={(v) => save('contact', v)} onSaveNewsletter={(v) => save('newsletter', v)} />
      )}
    </div>
  );
}

function MediaUploader({ mediaKey, label, initialHas }) {
  const { show } = useToast();
  const [has, setHas] = useState(initialHas);
  const [bust, setBust] = useState(0);
  const [busy, setBusy] = useState(false);

  async function onPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    setBusy(true);
    try {
      await uploadMedia(mediaKey, fd);
      setHas(true);
      setBust((b) => b + 1);
      show('Image updated — live on the site');
    } catch (err) {
      show(err.response?.data?.error || 'Upload failed', 'error');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  async function remove() {
    try {
      await deleteMedia(mediaKey);
      setHas(false);
      show('Image removed');
    } catch (err) {
      show(err.response?.data?.error || 'Failed to remove', 'error');
    }
  }

  return (
    <div className="rounded-lg border border-line p-3">
      <p className="mb-2 text-sm font-medium text-ink">{label}</p>
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded bg-canvas">
          {has ? (
            <img src={`${mediaUrl(mediaKey)}?v=${bust}`} alt={label} className="h-full w-full object-cover" />
          ) : (
            <span className="text-xs text-subtle">No image</span>
          )}
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line bg-canvas px-3 py-2 text-sm text-subtle hover:border-brand-500">
          <Upload size={15} /> {busy ? 'Uploading…' : has ? 'Replace' : 'Upload'}
          <input type="file" accept=".png,.jpg,.jpeg" className="hidden" onChange={onPick} disabled={busy} />
        </label>
        {has && (
          <button onClick={remove} className="text-sm text-[#dc2626] hover:underline">Remove</button>
        )}
      </div>
      <p className="mt-2 text-xs text-subtle">Recommended: a wide, high-quality photo (JPG/PNG). Stored in your S3 bucket.</p>
    </div>
  );
}

function SectionCard({ title, children, onSave, saving }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
        {onSave && (
          <Button onClick={onSave} disabled={saving} className="px-3 py-1.5 text-sm">
            <Save size={15} /> Save
          </Button>
        )}
      </div>
      {children}
    </Card>
  );
}

function MetricsEditor({ value, onSave }) {
  const [m, setM] = useState(value);
  return (
    <SectionCard title="The Numbers" onSave={() => onSave(m)}>
      <p className="mb-4 text-sm text-subtle">These appear in the hero, the “10 Years” section, and Our Impact.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {METRIC_FIELDS.map(([key, label]) => (
          <Input
            key={key}
            label={label}
            type="number"
            min="0"
            value={m[key] ?? 0}
            onChange={(e) => setM({ ...m, [key]: parseInt(e.target.value, 10) || 0 })}
          />
        ))}
      </div>
    </SectionCard>
  );
}

function HeroEditor({ value, hasMedia, onSave }) {
  const [h, setH] = useState(value);
  const f = (k) => (e) => setH({ ...h, [k]: e.target.value });
  return (
    <SectionCard title="Hero Section" onSave={() => onSave(h)}>
      <div className="space-y-4">
        <MediaUploader mediaKey="hero" label="Hero background photo" initialHas={hasMedia} />
        <Input label="Badge text" value={h.badge || ''} onChange={f('badge')} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Title — start" value={h.titleLead || ''} onChange={f('titleLead')} />
          <Input label="Title — highlighted" value={h.titleHighlight || ''} onChange={f('titleHighlight')} />
          <Input label="Title — end" value={h.titleTrail || ''} onChange={f('titleTrail')} />
        </div>
        <Textarea label="Subtitle" value={h.subtitle || ''} onChange={f('subtitle')} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Primary button label" value={h.primaryLabel || ''} onChange={f('primaryLabel')} />
          <Input label="Secondary button label" value={h.secondaryLabel || ''} onChange={f('secondaryLabel')} />
        </div>
      </div>
    </SectionCard>
  );
}

function StoryEditor({ decade, journey, onSaveDecade, onSaveJourney }) {
  const [d, setD] = useState(decade);
  const [j, setJ] = useState(journey);
  const fd = (k) => (e) => setD({ ...d, [k]: e.target.value });

  function updateRow(i, key, val) {
    setJ(j.map((row, idx) => (idx === i ? { ...row, [key]: val } : row)));
  }
  return (
    <div className="space-y-5">
      <SectionCard title="“10 Years” Section" onSave={() => onSaveDecade(d)}>
        <div className="space-y-4">
          <Input label="Badge" value={d.badge || ''} onChange={fd('badge')} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="Heading start" value={d.headingLead || ''} onChange={fd('headingLead')} />
            <Input label="Heading highlight" value={d.headingHighlight || ''} onChange={fd('headingHighlight')} />
            <Input label="Heading end" value={d.headingTrail || ''} onChange={fd('headingTrail')} />
          </div>
          <Textarea label="Body" value={d.body || ''} onChange={fd('body')} />
          <Input label="Quote" value={d.quote || ''} onChange={fd('quote')} />
          <Textarea label="Quote body" value={d.quoteBody || ''} onChange={fd('quoteBody')} />
        </div>
      </SectionCard>

      <SectionCard title="Our Journey (timeline)" onSave={() => onSaveJourney(j)}>
        <div className="space-y-3">
          {j.map((row, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[80px_1fr_2fr_auto]">
              <Input label="Year" value={row.year || ''} onChange={(e) => updateRow(i, 'year', e.target.value)} />
              <Input label="Title" value={row.title || ''} onChange={(e) => updateRow(i, 'title', e.target.value)} />
              <Input label="Description" value={row.body || ''} onChange={(e) => updateRow(i, 'body', e.target.value)} />
              <button onClick={() => setJ(j.filter((_, idx) => idx !== i))} className="self-end pb-2 text-[#dc2626]" aria-label="Remove">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <Button variant="secondary" onClick={() => setJ([...j, { year: '', title: '', body: '' }])}>
            <Plus size={15} /> Add milestone
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}

function AboutEditor({ value, hasMedia, onSave }) {
  const [a, setA] = useState(value);
  const f = (k) => (e) => setA({ ...a, [k]: e.target.value });
  return (
    <SectionCard title="About Section" onSave={() => onSave(a)}>
      <div className="space-y-4">
        <MediaUploader mediaKey="about" label="About section photo" initialHas={hasMedia} />
        <Input label="Eyebrow" value={a.eyebrow || ''} onChange={f('eyebrow')} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Heading start" value={a.headingLead || ''} onChange={f('headingLead')} />
          <Input label="Heading highlight" value={a.headingHighlight || ''} onChange={f('headingHighlight')} />
        </div>
        <Textarea label="Body" value={a.body || ''} onChange={f('body')} />
        <Textarea
          label="Bullet points (one per line)"
          value={(a.bullets || []).join('\n')}
          onChange={(e) => setA({ ...a, bullets: e.target.value.split('\n').filter(Boolean) })}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Phone" value={a.phone || ''} onChange={f('phone')} />
          <Input label="Button label" value={a.ctaLabel || ''} onChange={f('ctaLabel')} />
        </div>
      </div>
    </SectionCard>
  );
}

function ProgramsEditor({ value, onSave }) {
  const [p, setP] = useState(value);
  function updateRow(i, key, val) {
    setP(p.map((row, idx) => (idx === i ? { ...row, [key]: val } : row)));
  }
  return (
    <SectionCard title="Programs" onSave={() => onSave(p)}>
      <div className="space-y-3">
        {p.map((row, i) => (
          <div key={i} className="grid gap-2 rounded-lg border border-line p-3 sm:grid-cols-[1fr_3fr_1fr_auto]">
            <Input label="Name" value={row.name || ''} onChange={(e) => updateRow(i, 'name', e.target.value)} />
            <Input label="Description" value={row.category || ''} onChange={(e) => updateRow(i, 'category', e.target.value)} />
            <Input label="Status" value={row.status || ''} onChange={(e) => updateRow(i, 'status', e.target.value)} />
            <button onClick={() => setP(p.filter((_, idx) => idx !== i))} className="self-end pb-2 text-[#dc2626]" aria-label="Remove">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <Button variant="secondary" onClick={() => setP([...p, { name: '', category: '', status: '' }])}>
          <Plus size={15} /> Add program
        </Button>
      </div>
    </SectionCard>
  );
}

function FooterEditor({ contact, newsletter, onSaveContact, onSaveNewsletter }) {
  const [c, setC] = useState(contact);
  const [n, setN] = useState(newsletter);
  const fc = (k) => (e) => setC({ ...c, [k]: e.target.value });
  return (
    <div className="space-y-5">
      <SectionCard title="Contact & Footer" onSave={() => onSaveContact(c)}>
        <div className="space-y-4">
          <Textarea label="Address" value={c.address || ''} onChange={fc('address')} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Email" value={c.email || ''} onChange={fc('email')} />
            <Input label="Phone" value={c.phone || ''} onChange={fc('phone')} />
            <Input label="Facebook URL" value={c.facebook || ''} onChange={fc('facebook')} />
            <Input label="Twitter URL" value={c.twitter || ''} onChange={fc('twitter')} />
            <Input label="Instagram URL" value={c.instagram || ''} onChange={fc('instagram')} />
            <Input label="LinkedIn URL" value={c.linkedin || ''} onChange={fc('linkedin')} />
          </div>
        </div>
      </SectionCard>
      <SectionCard title="Newsletter banner" onSave={() => onSaveNewsletter(n)}>
        <div className="space-y-4">
          <Input label="Heading" value={n.heading || ''} onChange={(e) => setN({ ...n, heading: e.target.value })} />
          <Textarea label="Body" value={n.body || ''} onChange={(e) => setN({ ...n, body: e.target.value })} />
        </div>
      </SectionCard>
    </div>
  );
}

function PartnersEditor() {
  const { show } = useToast();
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', website: '' });
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const res = await getPartnersAdmin();
      setPartners(res.data.partners);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null);
    setForm({ name: '', website: '' });
    setFile(null);
    setModalOpen(true);
  }
  function openEdit(p) {
    setEditing(p);
    setForm({ name: p.name, website: p.website || '' });
    setFile(null);
    setModalOpen(true);
  }

  async function save(e) {
    e.preventDefault();
    if (!form.name.trim()) return show('Partner name is required', 'error');
    const fd = new FormData();
    fd.append('name', form.name.trim());
    fd.append('website', form.website.trim());
    if (file) fd.append('logo', file);
    setSubmitting(true);
    try {
      if (editing) await updatePartner(editing.id, fd);
      else await createPartner(fd);
      setModalOpen(false);
      show('Partner saved');
      await load();
    } catch (err) {
      show(err.response?.data?.error || 'Failed to save partner', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(p) {
    const fd = new FormData();
    fd.append('is_active', String(!p.is_active));
    await updatePartner(p.id, fd);
    await load();
  }

  async function remove() {
    try {
      await deletePartner(confirmDel.id);
      setConfirmDel(null);
      show('Partner removed');
      await load();
    } catch (err) {
      show(err.response?.data?.error || 'Failed to delete', 'error');
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-base font-semibold text-ink">Partners & Logos</h3>
        <Button onClick={openNew} className="px-3 py-1.5 text-sm">
          <Plus size={15} /> Add Partner
        </Button>
      </div>

      {loading ? (
        <Spinner />
      ) : partners.length === 0 ? (
        <p className="text-sm text-subtle">No partners yet. Add your first partner and its logo.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {partners.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-lg border border-line p-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-canvas">
                {p.logo ? (
                  <img src={partnerLogoUrl(p.id)} alt={p.name} className="max-h-10 max-w-full object-contain" />
                ) : (
                  <span className="text-xs text-subtle">No logo</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{p.name}</p>
                {p.website && (
                  <a href={p.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
                    visit <ExternalLink size={11} />
                  </a>
                )}
                <div className="mt-1">
                  <button onClick={() => toggleActive(p)}>
                    <Badge status={p.is_active ? 'active' : 'inactive'} />
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <button onClick={() => openEdit(p)} className="text-xs text-brand-600 hover:underline">Edit</button>
                <button onClick={() => setConfirmDel(p)} className="text-[#dc2626]" aria-label="Delete"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Partner' : 'Add Partner'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</Button>
          </>
        }
      >
        <form onSubmit={save} className="space-y-4" noValidate>
          <Input label="Partner name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Website (optional)" placeholder="https://…" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Logo {editing ? '(leave blank to keep current)' : ''}</label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line bg-canvas px-3 py-3 text-sm text-subtle hover:border-brand-500">
              <Upload size={16} />
              <span className="truncate">{file ? file.name : 'Choose an image (png, jpg)…'}</span>
              <input type="file" accept=".png,.jpg,.jpeg" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        title="Remove Partner"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDel(null)}>Cancel</Button>
            <Button variant="danger" onClick={remove}>Remove</Button>
          </>
        }
      >
        <p className="text-sm text-ink">Remove {confirmDel?.name} from the website?</p>
      </Modal>
    </Card>
  );
}

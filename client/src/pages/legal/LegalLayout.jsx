import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import Logo from '../../components/ui/Logo';

// Public, always-light legal document chrome (Terms / Privacy).
export default function LegalLayout({ title, updated, children }) {
  return (
    <div className="min-h-screen bg-[#f8faff] px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <Link to="/login" className="flex justify-center">
            <Logo size={24} />
          </Link>
          <p className="mt-2 text-sm text-[#6b7280]">Internal Management System</p>
        </div>

        <div className="rounded-xl border border-[#e2e8f0] bg-white p-6 shadow-sm sm:p-8">
          <h1 className="font-display text-2xl font-bold text-[#374151]">{title}</h1>
          {updated && <p className="mt-1 text-sm text-[#6b7280]">Last updated: {updated}</p>}

          <div className="mt-6 space-y-6">{children}</div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
          <Link
            to="/login"
            className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline"
          >
            <ArrowLeft size={15} /> Back to sign in
          </Link>
          <div className="flex gap-4">
            <Link to="/terms" className="text-[#6b7280] hover:text-brand-600 hover:underline">
              Terms of Service
            </Link>
            <Link to="/privacy" className="text-[#6b7280] hover:text-brand-600 hover:underline">
              Privacy Policy
            </Link>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-[#6b7280]">
          © {new Date().getFullYear()} Swahilipot Hub Foundation · Mombasa, Kenya
        </p>
      </div>
    </div>
  );
}

// Section heading
export function Section({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="font-display text-lg font-semibold text-[#374151]">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-[#374151]">{children}</div>
    </section>
  );
}

// Bulleted list
export function List({ items }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-[#374151]">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

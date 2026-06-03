import LegalLayout, { Section, List } from './LegalLayout';

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" updated="3 June 2026">
      <Section title="1. Introduction">
        <p>
          These Terms of Service (the &ldquo;Terms&rdquo;) govern access to and use of the
          SwahiliPot Internal Management System (the &ldquo;System&rdquo;), an internal tool operated
          by <strong>Swahilipot Hub Foundation</strong> (&ldquo;Swahilipot&rdquo;, the
          &ldquo;Foundation&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;), a non-profit organisation
          based at the Swahili Cultural Centre, Sir Mbarak Hinawy Road, Old Town, Mombasa, Kenya.
        </p>
        <p>
          By signing in to or otherwise using the System, you agree to be bound by these Terms and by
          our <a href="/privacy" className="font-medium text-brand-600 hover:underline">Privacy Policy</a>.
          If you do not agree, do not use the System.
        </p>
      </Section>

      <Section title="2. Definitions">
        <List
          items={[
            <><strong>System</strong> — the SwahiliPot Internal Management System and all of its web pages, features, and APIs.</>,
            <><strong>User</strong> — any authorised staff member granted an account, including Instructors, Supervisors, and System Administrators.</>,
            <><strong>Trainee</strong> — a programme participant who records attendance through the public, login-free attendance page.</>,
            <><strong>Content</strong> — any data submitted to the System, including form submissions, uploaded files, attendance records, and downtime reports.</>,
          ]}
        />
      </Section>

      <Section title="3. Accounts and Eligibility">
        <p>
          The System is for the internal use of the Foundation&rsquo;s staff only. Accounts are created
          and managed by Supervisors and System Administrators; you may not self-register. You are
          responsible for:
        </p>
        <List
          items={[
            'Keeping your login credentials confidential and not sharing them with anyone.',
            'All activity that occurs under your account.',
            'Notifying an administrator immediately if you suspect unauthorised use of your account.',
          ]}
        />
        <p>
          Administrators may create, suspend, reset the password of, or delete accounts in order to
          operate and secure the System.
        </p>
      </Section>

      <Section title="4. Acceptable Use">
        <p>You agree not to:</p>
        <List
          items={[
            'Access, or attempt to access, data belonging to a department or user you are not authorised to view.',
            'Upload unlawful, malicious, or infringing content, or files containing malware.',
            'Interfere with, disrupt, probe, or attempt to gain unauthorised access to the System or its infrastructure.',
            'Enter inaccurate or misleading information, including in attendance, submissions, or downtime reports.',
            'Use the System for any purpose other than the legitimate work of the Foundation.',
          ]}
        />
      </Section>

      <Section title="5. Trainee Attendance">
        <p>
          The public attendance page allows Trainees to check in and out of sessions without an
          account. Trainees provide their name, phone number, and a brief description of work
          completed. Instructors and Supervisors are responsible for using this information solely for
          attendance and programme-management purposes, in line with our Privacy Policy.
        </p>
      </Section>

      <Section title="6. Content and Data">
        <p>
          Content submitted to the System belongs to, and is administered by, the Foundation for its
          organisational purposes. By submitting Content you confirm you are entitled to do so. The
          Foundation may review, retain, return, acknowledge, resolve, or remove Content as part of
          normal operations.
        </p>
      </Section>

      <Section title="7. Availability">
        <p>
          The System is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. While
          we work to keep it running reliably, we do not guarantee uninterrupted or error-free
          operation and may suspend access for maintenance, upgrades, or security reasons.
        </p>
      </Section>

      <Section title="8. Suspension and Termination">
        <p>
          We may suspend or terminate access where these Terms are breached, where required to protect
          the System or its users, or when a staff member&rsquo;s relationship with the Foundation
          ends. You may request closure of your account through an administrator.
        </p>
      </Section>

      <Section title="9. Limitation of Liability">
        <p>
          To the maximum extent permitted by applicable law, the Foundation shall not be liable for any
          indirect, incidental, or consequential loss arising from use of, or inability to use, the
          System. Nothing in these Terms excludes liability that cannot lawfully be excluded.
        </p>
      </Section>

      <Section title="10. Changes to These Terms">
        <p>
          We may update these Terms from time to time. Material changes will be reflected by updating
          the &ldquo;Last updated&rdquo; date above. Continued use of the System after changes take
          effect constitutes acceptance of the revised Terms.
        </p>
      </Section>

      <Section title="11. Governing Law">
        <p>
          These Terms are governed by the laws of the Republic of Kenya, and any disputes are subject
          to the exclusive jurisdiction of the Kenyan courts.
        </p>
      </Section>

      <Section title="12. Contact">
        <p>
          Questions about these Terms can be sent to{' '}
          <a href="mailto:info@swahilipothub.co.ke" className="font-medium text-brand-600 hover:underline">
            info@swahilipothub.co.ke
          </a>{' '}
          or by post to Swahilipot Hub Foundation, Swahili Cultural Centre, Sir Mbarak Hinawy Road,
          Old Town, Mombasa, Kenya.
        </p>
      </Section>
    </LegalLayout>
  );
}

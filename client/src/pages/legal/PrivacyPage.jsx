import LegalLayout, { Section, List } from './LegalLayout';

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated="3 June 2026">
      <Section title="1. Who We Are">
        <p>
          This Privacy Policy explains how <strong>Swahilipot Hub Foundation</strong>
          (&ldquo;Swahilipot&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) collects and uses personal
          data within the SwahiliPot Internal Management System (the &ldquo;System&rdquo;). For the
          purposes of the Kenya Data Protection Act, 2019, the Foundation is the data controller. We
          are based at the Swahili Cultural Centre, Sir Mbarak Hinawy Road, Old Town, Mombasa, Kenya.
        </p>
      </Section>

      <Section title="2. Information We Collect">
        <p>
          <strong>Staff accounts.</strong> Name, email address, role, department, a securely hashed
          password, account status, and activity such as submissions, attendance sessions, downtime
          reports, and notifications you generate.
        </p>
        <p>
          <strong>Trainees (public attendance).</strong> When a Trainee checks in via a QR code we
          collect their name, phone number, a short description of tasks completed, and check-in /
          check-out times. No Trainee account or login is created.
        </p>
        <p>
          <strong>Content.</strong> Files and documents uploaded to submissions, together with their
          titles, descriptions, and any supervisor notes.
        </p>
        <p>
          <strong>Technical data.</strong> A single authentication cookie (see section 5) and basic
          server logs (such as error timestamps) used to keep the System secure and working.
        </p>
      </Section>

      <Section title="3. How We Use Information">
        <List
          items={[
            'To operate the System: authentication, attendance tracking, form submissions, and radio downtime reporting.',
            'To manage accounts and departments, and to send in-app and email notifications.',
            'To enable password reset and account-security functions.',
            'To maintain the security, integrity, and reliability of the System.',
          ]}
        />
      </Section>

      <Section title="4. Legal Basis">
        <p>
          We process staff data on the basis of our legitimate organisational interests and the
          employment / volunteer relationship. Trainee attendance data is processed for the legitimate
          purpose of programme administration; by submitting the attendance form, Trainees consent to
          this use. Processing is carried out in accordance with the Kenya Data Protection Act, 2019.
        </p>
      </Section>

      <Section title="5. Cookies">
        <p>
          The System uses a single, strictly necessary cookie: an <strong>HttpOnly</strong>{' '}
          authentication token that keeps you signed in. It is not used for advertising or
          third-party tracking, and the System sets no analytics or marketing cookies. The public
          attendance page does not require any cookie.
        </p>
      </Section>

      <Section title="6. How Information Is Shared">
        <p>We do not sell personal data. Data is accessed and shared only:</p>
        <List
          items={[
            'Within the Foundation, on a department-scoped, need-to-know basis (e.g. a Supervisor sees only their department; an Administrator oversees all).',
            'With service providers who host the System on our behalf — our database host, our cloud file-storage provider, and our email-delivery provider — strictly to operate the System.',
            'Where required by law or to protect the rights, safety, and security of the Foundation and its users.',
          ]}
        />
      </Section>

      <Section title="7. Data Storage and International Transfers">
        <p>
          The System is hosted on managed cloud infrastructure, and some providers may store data on
          servers located outside Kenya. Where data is transferred internationally, we rely on
          providers that apply appropriate safeguards and security controls.
        </p>
      </Section>

      <Section title="8. Data Retention">
        <p>
          We keep personal data only for as long as necessary for the purposes described above and to
          meet the Foundation&rsquo;s operational and legal obligations. Accounts and associated
          records may be suspended, anonymised, or deleted when no longer required.
        </p>
      </Section>

      <Section title="9. Security">
        <p>We apply reasonable technical and organisational measures, including:</p>
        <List
          items={[
            'Passwords stored only as salted bcrypt hashes — never in plain text.',
            'Authentication via HttpOnly cookies to reduce the risk of token theft.',
            'Role-based access and strict department scoping enforced at the database level.',
            'Encrypted connections to our database and storage providers.',
          ]}
        />
      </Section>

      <Section title="10. Your Rights">
        <p>
          Under the Kenya Data Protection Act, 2019 you have the right to access your personal data,
          to request correction of inaccurate data, to request deletion, and to object to or restrict
          certain processing. To exercise these rights, contact us using the details in section 13.
        </p>
      </Section>

      <Section title="11. Young People">
        <p>
          As a youth-focused organisation, some Trainees may be young people. We collect only the
          minimum information needed for attendance and programme administration. If you believe a
          young person&rsquo;s data has been provided without appropriate authorisation, contact us and
          we will review and, where appropriate, remove it.
        </p>
      </Section>

      <Section title="12. Changes to This Policy">
        <p>
          We may update this Policy from time to time. Material changes will be reflected by updating
          the &ldquo;Last updated&rdquo; date above.
        </p>
      </Section>

      <Section title="13. Contact">
        <p>
          For any privacy questions or to exercise your rights, contact{' '}
          <a href="mailto:privacy@swahilipothub.co.ke" className="font-medium text-brand-600 hover:underline">
            privacy@swahilipothub.co.ke
          </a>{' '}
          or write to Swahilipot Hub Foundation, Swahili Cultural Centre, Sir Mbarak Hinawy Road, Old
          Town, Mombasa, Kenya.
        </p>
      </Section>
    </LegalLayout>
  );
}

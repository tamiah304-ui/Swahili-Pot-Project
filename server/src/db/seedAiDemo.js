'use strict';

/*
 * Seeds three demo attachees in the Tech Department with ~4 weeks of realistic
 * data (check-ins, domain-themed tasks, instructor notes) designed to produce
 * three DISTINCT AI intelligence profiles and competency radars:
 *
 *   1. Brian Otieno   — Cybersecurity lean. Excellent, punctual, consistent.
 *   2. Aisha Mohamed  — Networking lean.    Capable but frequently late.
 *   3. Kevin Mwangi   — Cloud / Software.   Irregular attendance, high initiative.
 *
 * Idempotent: re-running deletes the previous demo accounts (by their
 * @demo.swahilipot.test emails, which cascade-clean their data) and reseeds.
 *
 * Run with:  npm run seed:ai-demo   (from /server)
 */

const bcrypt = require('bcrypt');
const pool = require('./pool');

const DEPT_ID = 4; // Tech Department
const DEMO_DOMAIN = '@demo.swahilipot.test';

// --- date helpers (EAT = UTC+3) ---------------------------------------------
const DAY_MS = 86400000;
function startOfTodayUTC() {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}
// Build a UTC instant for a given EAT wall-clock time, `daysAgo` days back.
function eatInstant(daysAgo, hh, mm) {
  const base = new Date(startOfTodayUTC().getTime() - daysAgo * DAY_MS);
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), hh - 3, mm));
}
function isWeekday(daysAgo) {
  const d = new Date(startOfTodayUTC().getTime() - daysAgo * DAY_MS).getUTCDay();
  return d >= 1 && d <= 5;
}
function isoDate(daysFromNow) {
  return new Date(startOfTodayUTC().getTime() + daysFromNow * DAY_MS).toISOString().slice(0, 10);
}

// Deterministic small "jitter" so timestamps vary without Math.random.
const jitter = (seed, span) => seed % span;

// --- persona definitions -----------------------------------------------------
const PERSONAS = [
  {
    name: 'Brian Otieno',
    email: `brian.otieno${DEMO_DOMAIN}`,
    phone: '0712000111',
    university_name: 'Technical University of Mombasa',
    course_of_study: 'BSc Information Security & Digital Forensics',
    student_id: 'TUM/IS/2022/041',
    // Excellent attendance: every weekday, early, full days.
    attend: (daysAgo) => (isWeekday(daysAgo) ? { in: [8, 30 + jitter(daysAgo, 20)], out: [17, jitter(daysAgo, 15)] } : null),
    tasks: [
      ['Configure pfSense firewall rules for the lab network', 'Segment the lab into trusted/guest zones and write allow/deny rules with logging.', 'reviewed', 'Excellent, well-documented rule set with clear justifications.'],
      ['Run a Nessus vulnerability scan and triage findings', 'Scan the lab subnet, classify findings by CVSS, propose remediations.', 'reviewed', 'Strong triage — prioritised criticals correctly and explained each.'],
      ['Harden an Ubuntu server to the CIS benchmark', 'Apply CIS Level 1 controls and produce a before/after audit.', 'reviewed', 'Thorough hardening, good evidence of testing.'],
      ['Analyse suspicious traffic in Wireshark', 'Capture and dissect a simulated exfiltration; identify the indicators.', 'submitted', null],
      ['Write a phishing incident-response runbook', 'Step-by-step containment, eradication and recovery playbook.', 'completed', null],
      ['Deploy fail2ban and document brute-force mitigation', 'Protect SSH and the web login; show blocked-attempt logs.', 'reviewed', 'Clean implementation; understood the threat model.'],
    ],
    notes: [
      'Brian is methodical and security-minded — strong with vulnerability triage and hardening. Natural SOC-analyst trajectory.',
      'Consistently early and self-directed in the security lab.',
    ],
  },
  {
    name: 'Aisha Mohamed',
    email: `aisha.mohamed${DEMO_DOMAIN}`,
    phone: '0712000222',
    university_name: 'Jomo Kenyatta University of Agriculture & Technology',
    course_of_study: 'BSc Telecommunication & Information Engineering',
    student_id: 'JKU/TIE/2021/118',
    // Good volume but late arrivals; skips a couple of days.
    attend: (daysAgo) => {
      if (!isWeekday(daysAgo)) return null;
      if (daysAgo % 11 === 0) return null; // occasional absence
      return { in: [9, 25 + jitter(daysAgo, 35)], out: [16, 30 + jitter(daysAgo, 20)] };
    },
    tasks: [
      ['Subnet a /22 into department VLANs', 'Plan VLANs for staff, lab and guest; document the addressing scheme.', 'reviewed', 'Solid subnetting; addressing plan was clear.'],
      ['Configure inter-VLAN routing on the Cisco switch', 'Set up SVIs and routing between the new VLANs.', 'submitted', null],
      ['Set up DHCP and DNS for the lab network', 'Stand up DHCP scopes and internal DNS resolution.', 'in_progress', null],
      ['Troubleshoot intermittent packet loss', 'Use ping/traceroute/MTR to localise loss and propose a fix.', 'reviewed', 'Good methodical troubleshooting once she got started.'],
      ['Design the office Wi-Fi heatmap and AP placement', 'Survey coverage and recommend access-point positions.', 'pending', null],
      ['Document the network topology in draw.io', 'Produce an up-to-date L2/L3 topology diagram.', 'submitted', null],
    ],
    notes: [
      'Aisha has strong routing & switching fundamentals and a clear networking aptitude. Main development area is punctuality — she often arrives mid-morning.',
      'Networking concepts come easily to her; encourage more consistent early starts.',
    ],
  },
  {
    name: 'Kevin Mwangi',
    email: `kevin.mwangi${DEMO_DOMAIN}`,
    phone: '0712000333',
    university_name: 'Strathmore University',
    course_of_study: 'BSc Computer Science',
    student_id: 'STR/CS/2022/077',
    // Irregular bursts: present in clusters, multi-day gaps, but long days.
    attend: (daysAgo) => {
      if (!isWeekday(daysAgo)) return null;
      // present roughly half the time, in bursts
      if ([1, 2, 3, 8, 9, 14, 15, 16, 21, 22, 27].includes(daysAgo)) {
        return { in: [9, 30 + jitter(daysAgo, 60)], out: [18, 30 + jitter(daysAgo, 50)] };
      }
      return null;
    },
    tasks: [
      ['Containerise the IMS API with Docker', 'Write a Dockerfile and docker-compose for the API + Postgres.', 'reviewed', 'Excellent — clean multi-stage build, understood layer caching.'],
      ['Set up a GitHub Actions CI pipeline', 'Lint, test and build on every push; proposed this himself.', 'reviewed', 'Took the initiative to add CI before being asked. Impressive.'],
      ['Deploy a demo app to AWS EC2 with nginx', 'Provision an instance, configure nginx as a reverse proxy.', 'completed', null],
      ['Build a REST endpoint for attendance export', 'Node/Express endpoint returning CSV; handled edge cases well.', 'reviewed', 'Strong engineering instincts and clean code.'],
      ['Write Terraform for an S3 bucket + IAM policy', 'Infrastructure-as-code for the uploads bucket.', 'submitted', null],
      ['Refactor the React dashboard into reusable components', 'Extract shared UI and reduce duplication.', 'reviewed', 'Good componentisation; thinks about maintainability.'],
    ],
    notes: [
      'Kevin is a genuinely strong builder — leans cloud/DevOps and software engineering. He proposed the CI pipeline himself. The watch-item is consistency: he works in intense bursts with gaps in attendance.',
      'High initiative and code quality; needs to even out his attendance rhythm.',
    ],
  },
];

async function clearExisting(client) {
  // Deleting the user cascades attachee_profiles, attachee_checkins (FK CASCADE),
  // tasks (assigned_to CASCADE), task_comments and AI rows.
  await client.query(`DELETE FROM users WHERE email LIKE $1`, [`%${DEMO_DOMAIN}`]);
}

async function seed() {
  const client = await pool.connect();
  try {
    // Resolve a Tech instructor + supervisor to attach tasks/notes to.
    const sup = await client.query(
      "SELECT id FROM users WHERE role='supervisor' AND department_id=$1 ORDER BY id LIMIT 1",
      [DEPT_ID]
    );
    const inst = await client.query(
      "SELECT id FROM users WHERE role='instructor' AND department_id=$1 ORDER BY id LIMIT 1",
      [DEPT_ID]
    );
    const supervisorId = sup.rows[0] ? sup.rows[0].id : null;
    const instructorId = inst.rows[0] ? inst.rows[0].id : supervisorId;
    const assignerId = instructorId || supervisorId;
    if (!assignerId) throw new Error('No supervisor/instructor found in the Tech Department to own demo tasks.');

    await client.query('BEGIN');
    await clearExisting(client);

    const hash = await bcrypt.hash('Attach@2026', 10);
    const startDate = isoDate(-28); // attachment started 4 weeks ago
    const endDate = isoDate(56); // ends in ~8 weeks (ongoing)

    for (const p of PERSONAS) {
      // user + profile
      const u = await client.query(
        `INSERT INTO users (name, email, password_hash, role, department_id, phone)
         VALUES ($1,$2,$3,'attachee',$4,$5) RETURNING id`,
        [p.name, p.email, hash, DEPT_ID, p.phone]
      );
      const uid = u.rows[0].id;
      await client.query(
        `INSERT INTO attachee_profiles
           (user_id, university_name, course_of_study, student_id_number,
            attachment_start_date, attachment_end_date, supervisor_id, instructor_id, department_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [uid, p.university_name, p.course_of_study, p.student_id, startDate, endDate, supervisorId, instructorId, DEPT_ID]
      );

      // check-ins across the last 28 days
      let checkins = 0;
      for (let daysAgo = 28; daysAgo >= 0; daysAgo--) {
        const a = p.attend(daysAgo);
        if (!a) continue;
        const ci = eatInstant(daysAgo, a.in[0], a.in[1]);
        const co = eatInstant(daysAgo, a.out[0], a.out[1]);
        await client.query(
          `INSERT INTO attachee_checkins (attachee_id, department_id, check_in, check_out)
           VALUES ($1,$2,$3,$4)`,
          [uid, DEPT_ID, ci.toISOString(), co.toISOString()]
        );
        checkins++;
      }

      // tasks (spread the created_at across the 4 weeks)
      const n = p.tasks.length;
      for (let i = 0; i < n; i++) {
        const [title, description, status, feedback] = p.tasks[i];
        const createdDaysAgo = Math.round(26 - (i * 24) / Math.max(1, n - 1)); // 26 .. 2
        const createdAt = eatInstant(createdDaysAgo, 9, 0).toISOString();
        const dueAt = isoDate(-createdDaysAgo + 7);
        const reviewed = ['reviewed', 'completed'].includes(status);
        const t = await client.query(
          `INSERT INTO tasks
             (department_id, assigned_to, assigned_by, title, description, priority, due_date, status,
              created_at, updated_at, feedback, feedback_by, feedback_at, reviewed_at)
           VALUES ($1,$2,$3,$4,$5,'medium',$6,$7,$8,$8,$9,$10,$11,$11) RETURNING id`,
          [
            DEPT_ID, uid, assignerId, title, description, dueAt, status, createdAt,
            feedback || null, feedback ? assignerId : null, reviewed ? createdAt : null,
          ]
        );
        // attach the written feedback as a visible task comment too (the AI
        // context reads task_comments from instructors/supervisors).
        if (feedback) {
          await client.query(
            `INSERT INTO task_comments (task_id, author_id, body, is_general_note, attachee_id, created_at)
             VALUES ($1,$2,$3,false,$4,$5)`,
            [t.rows[0].id, assignerId, feedback, uid, createdAt]
          );
        }
      }

      // general (not task-bound) notes about the attachee
      for (const note of p.notes) {
        await client.query(
          `INSERT INTO task_comments (task_id, author_id, body, is_general_note, attachee_id)
           VALUES (NULL,$1,$2,true,$3)`,
          [supervisorId || assignerId, note, uid]
        );
      }

      console.log(`  • ${p.name}: ${checkins} check-ins, ${n} tasks, ${p.notes.length} notes`);
    }

    await client.query('COMMIT');
    console.log('\nDemo AI attachees seeded in the Tech Department.');
    console.log('Log in as the Tech supervisor (supervisor.tech@swahilipothub.co.ke) →');
    console.log('Attachees → open one → AI & Reports → generate the AI Intelligence Profile.');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  require('dotenv').config({ override: true });
  seed()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed failed:', err.message);
      process.exit(1);
    });
}

module.exports = seed;

'use strict';

const nodemailer = require('nodemailer');

// "Name <email>" -> { name, email }
function parseAddress(value) {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(value || '');
  if (m) return { name: (m[1] || '').trim() || undefined, email: m[2].trim() };
  if (value && value.includes('@')) return { name: undefined, email: value.trim() };
  return { name: undefined, email: undefined };
}

// Resolve the verified sender. MAIL_FROM_EMAIL/NAME take priority, then SMTP_FROM.
function getSender() {
  const parsed = parseAddress(process.env.SMTP_FROM);
  return {
    email: process.env.MAIL_FROM_EMAIL || parsed.email || 'no-reply@swahilipothub.co.ke',
    name: process.env.MAIL_FROM_NAME || parsed.name || 'SwahiliPot IMS',
  };
}

/** Which provider is active: 'brevo' | 'smtp' | 'none'. */
function provider() {
  if (process.env.BREVO_API_KEY) return 'brevo';
  if (process.env.SMTP_HOST) return 'smtp';
  return 'none';
}

function isConfigured() {
  return provider() !== 'none';
}

// ---- Brevo transactional HTTP API (https / port 443) ----
async function sendViaBrevo({ to, subject, html, text }) {
  const sender = getSender();
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject,
      htmlContent: html || `<pre>${text || ''}</pre>`,
      textContent: text || undefined,
    }),
  });

  const raw = await res.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { /* keep raw */ }

  if (!res.ok) {
    // Surface Brevo's exact reason (e.g. "Sender not valid", "IP not authorized").
    throw new Error(`Brevo API ${res.status} ${body.code || ''}: ${body.message || raw}`.trim());
  }
  return body.messageId || 'accepted';
}

// ---- SMTP fallback (with timeouts so it can't hang) ----
let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  return transporter;
}

/**
 * Send an email. Prefers Brevo's HTTP API (works where SMTP ports are blocked).
 * Throws on failure with the provider's exact reason. Logs the Brevo message id
 * on success so delivery can be traced in Brevo > Transactional > Logs.
 */
async function sendMail({ to, subject, html, text }) {
  const which = provider();

  if (which === 'brevo') {
    const id = await sendViaBrevo({ to, subject, html, text });
    console.log(`[mail] Brevo accepted message to ${to} (id: ${id})`);
    return true;
  }

  if (which === 'smtp') {
    const tx = getTransporter();
    const sender = getSender();
    const from = sender.name ? `${sender.name} <${sender.email}>` : sender.email;
    const info = await tx.sendMail({ from, to, subject, html, text });
    console.log(`[mail] SMTP accepted message to ${to} (${info.messageId || 'ok'})`);
    return true;
  }

  console.error(`[mail] No email provider configured — would have sent to ${to}: ${subject}`);
  return false;
}

/** Log the active mail configuration at startup. */
function logMailConfig() {
  const which = provider();
  const sender = getSender();
  if (which === 'brevo') {
    console.log(`[mail] Using Brevo HTTP API — sender ${sender.name} <${sender.email}>.`);
  } else if (which === 'smtp') {
    console.log(`[mail] Using SMTP (${process.env.SMTP_HOST}) — sender <${sender.email}>.`);
  } else {
    console.log('[mail] No email provider configured — reset links are logged to the console.');
  }
}

/**
 * Actively verify the email setup at startup so misconfiguration is loud and
 * specific in the logs instead of silently swallowing every send. For Brevo it
 * validates the API key AND confirms the configured sender is a verified Brevo
 * sender (an unverified sender is accepted by the API but never delivered — the
 * usual cause of "it says sent but nothing arrives"). For SMTP it tests login.
 */
async function verifyMailSetup() {
  const which = provider();
  const sender = getSender();

  if (which === 'none') {
    console.warn(
      '[mail] No email provider configured — password-reset and welcome emails will NOT be sent (reset links are logged to the console instead).'
    );
    return;
  }

  if (which === 'smtp') {
    try {
      await getTransporter().verify();
      console.log(`[mail] SMTP login OK (${process.env.SMTP_HOST}) — sender <${sender.email}>.`);
    } catch (e) {
      console.error(
        `[mail] SMTP login FAILED (${process.env.SMTP_HOST}): ${e.message}. ` +
          'Set SMTP_USER to your Brevo login email and SMTP_PASS to a CURRENT Brevo SMTP key ' +
          '(Brevo > SMTP & API > SMTP). Emails will NOT send until this is fixed.'
      );
    }
    return;
  }

  // Brevo HTTP API.
  const key = process.env.BREVO_API_KEY;
  try {
    const acc = await fetch('https://api.brevo.com/v3/account', {
      headers: { 'api-key': key, accept: 'application/json' },
    });
    if (!acc.ok) {
      const t = await acc.text().catch(() => '');
      console.error(
        `[mail] Brevo API key INVALID (HTTP ${acc.status}) — emails will NOT send. ` +
          'Regenerate it in Brevo > SMTP & API > API Keys and update BREVO_API_KEY. ' +
          t.slice(0, 160)
      );
      return;
    }
    const account = await acc.json().catch(() => ({}));
    console.log(`[mail] Brevo key OK — account ${account.email || '(unknown)'}.`);

    // Confirm the configured "from" address is a verified Brevo sender.
    const sres = await fetch('https://api.brevo.com/v3/senders', {
      headers: { 'api-key': key, accept: 'application/json' },
    });
    if (!sres.ok) return;
    const data = await sres.json().catch(() => ({}));
    const senders = Array.isArray(data.senders) ? data.senders : [];
    const from = sender.email.toLowerCase();
    const match = senders.find((s) => (s.email || '').toLowerCase() === from);
    if (!match) {
      console.error(
        `[mail] WARNING: sender "${sender.email}" is NOT a verified Brevo sender. ` +
          'Brevo accepts the API call but the message is NOT delivered. ' +
          'Verify this address in Brevo > Senders, Domains & Dedicated IPs > Senders ' +
          '(or set MAIL_FROM_EMAIL to a verified address). ' +
          `Currently verified: ${senders.map((s) => s.email).join(', ') || '(none)'}.`
      );
    } else if (match.active === false) {
      console.error(
        `[mail] WARNING: sender "${sender.email}" exists in Brevo but is NOT confirmed — ` +
          'click the verification link Brevo emailed to that address.'
      );
    } else {
      console.log(`[mail] Sender "${sender.email}" is verified in Brevo — email is ready.`);
    }
  } catch (e) {
    console.error(`[mail] Brevo self-check could not run: ${e.message}`);
  }
}

module.exports = { sendMail, isConfigured, provider, getSender, logMailConfig, verifyMailSetup };

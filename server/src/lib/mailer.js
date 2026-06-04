'use strict';

const nodemailer = require('nodemailer');

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
    // Fail fast instead of hanging when a cloud host blocks the SMTP port.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  return transporter;
}

function isConfigured() {
  return Boolean(process.env.BREVO_API_KEY || process.env.SMTP_HOST);
}

// "Name <email>" -> { name, email }
function parseFrom(from) {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from || '');
  if (m) return { name: m[1] || 'SwahiliPot IMS', email: m[2] };
  return { name: 'SwahiliPot IMS', email: from || 'no-reply@swahilipothub.co.ke' };
}

/**
 * Send via Brevo's transactional HTTP API (https / port 443). This works on
 * cloud hosts that block outbound SMTP ports, unlike nodemailer SMTP.
 */
async function sendViaBrevoApi({ to, subject, html, text, from }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: parseFrom(from),
      to: [{ email: to }],
      subject,
      htmlContent: html || `<pre>${text || ''}</pre>`,
      textContent: text || undefined,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo API ${res.status}: ${body.slice(0, 300)}`);
  }
  return true;
}

/**
 * Sends an email. Prefers Brevo's HTTP API if BREVO_API_KEY is set (most
 * reliable on locked-down cloud hosts), otherwise SMTP. If neither is
 * configured, logs to the console so flows remain testable. Returns true if sent.
 */
async function sendMail({ to, subject, html, text }) {
  const from = process.env.SMTP_FROM || 'SwahiliPot IMS <no-reply@swahilipothub.co.ke>';

  if (process.env.BREVO_API_KEY) {
    await sendViaBrevoApi({ to, subject, html, text, from });
    return true;
  }

  const tx = getTransporter();
  if (!tx) {
    console.error(
      `[${new Date().toISOString()}] [mailer] No email provider configured — would have sent to ${to}: ${subject}`
    );
    return false;
  }

  await tx.sendMail({ from, to, subject, html, text });
  return true;
}

module.exports = { sendMail, isConfigured };

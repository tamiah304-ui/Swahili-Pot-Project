'use strict';

const ORG = 'Swahilipot Hub Foundation';
const ADDRESS = 'Swahili Cultural Centre, Sir Mbarak Hinawy Rd, Old Town, Mombasa, Kenya';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Build a branded, professional HTML email (logo header band, card body,
 * optional CTA button, footer). Uses table layout for email-client support.
 *
 *   renderEmail({ heading, name, intro, ctaLabel, ctaUrl, outro })
 * Returns { html, text }.
 */
function renderEmail({ heading, name, intro, ctaLabel, ctaUrl, outro }) {
  const base = (process.env.CLIENT_URL || '').replace(/\/$/, '');
  const logo = `${base}/sph-logo-white.png`;
  const year = new Date().getFullYear();

  const button =
    ctaUrl && ctaLabel
      ? `
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 22px;">
          <tr><td align="center" bgcolor="#1e40af" style="border-radius:10px;">
            <a href="${esc(ctaUrl)}" target="_blank"
               style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px;">
              ${esc(ctaLabel)}
            </a>
          </td></tr>
        </table>
        <p style="margin:0 0 6px;font-size:12px;color:#6b7280;">Or paste this link into your browser:</p>
        <p style="margin:0 0 22px;font-size:12px;color:#1e40af;word-break:break-all;">${esc(ctaUrl)}</p>`
      : '';

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#eef2f9;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:#eef2f9;padding:28px 12px;font-family:Arial,Helvetica,sans-serif;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0"
               style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
          <!-- Header band -->
          <tr>
            <td style="background:#1e40af;background:linear-gradient(135deg,#1730a0,#1e40af);padding:30px 32px;text-align:center;">
              <img src="${logo}" alt="${ORG}" height="34"
                   style="height:34px;width:auto;display:inline-block;border:0;outline:none;text-decoration:none;" />
              <div style="color:#c7d4ff;font-size:12px;letter-spacing:.4px;margin-top:8px;">INTERNAL MANAGEMENT SYSTEM</div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 18px;font-size:20px;line-height:1.3;color:#111827;">${esc(heading)}</h1>
              ${name ? `<p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.6;">Hello ${esc(name)},</p>` : ''}
              <p style="margin:0 0 22px;font-size:15px;color:#374151;line-height:1.6;">${esc(intro)}</p>
              ${button}
              ${outro ? `<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">${esc(outro)}</p>` : ''}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:22px 32px;background:#f8faff;border-top:1px solid #e2e8f0;text-align:center;">
              <div style="font-size:12px;color:#6b7280;line-height:1.5;">${ADDRESS}</div>
              <div style="font-size:11px;color:#9ca3af;margin-top:8px;">© ${year} ${ORG} · swahilipothub.co.ke</div>
            </td>
          </tr>
        </table>
        <div style="font-size:11px;color:#9ca3af;margin-top:14px;">This is an automated message — please do not reply.</div>
      </td></tr>
    </table>
  </body>
</html>`;

  const text =
    `${heading}\n\n` +
    (name ? `Hello ${name},\n\n` : '') +
    `${intro}\n\n` +
    (ctaUrl ? `${ctaLabel}: ${ctaUrl}\n\n` : '') +
    (outro ? `${outro}\n\n` : '') +
    `— ${ORG}\n${ADDRESS}`;

  return { html, text };
}

module.exports = { renderEmail };

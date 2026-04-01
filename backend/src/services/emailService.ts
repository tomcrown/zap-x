/**
 * EmailService
 *
 * Sends transactional emails using Nodemailer with SMTP.
 * Supports:
 *  - Claim link emails for new recipients
 *  - Transfer confirmation emails
 *  - Staking reward notifications
 */

import nodemailer from 'nodemailer';
import { config } from '../config/index.js';
import { ClaimEmailPayload } from '../models/types.js';

// Lazy-init transporter
let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (_transporter) return _transporter;

  if (!config.email.user || !config.email.pass) {
    // Return an Ethereal (test) transport for local dev
    console.warn('[EmailService] SMTP credentials not set — using Ethereal test transport.');
    _transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: 'ethereal_user', pass: 'ethereal_pass' },
    });
    return _transporter;
  }

  _transporter = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure,
    auth: {
      user: config.email.user,
      pass: config.email.pass,
    },
  });

  return _transporter;
}

// ─── Claim Email ───────────────────────────────────────────────────────────────

export async function sendClaimEmail(payload: ClaimEmailPayload): Promise<void> {
  const transporter = getTransporter();

  const expireDate = new Date(payload.expiresAt).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const senderShort = `${payload.senderAddress.slice(0, 6)}...${payload.senderAddress.slice(-4)}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You have funds waiting on Zap-X!</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f1a; color: #e2e8f0; margin: 0; padding: 20px; }
    .container { max-width: 560px; margin: 0 auto; }
    .card { background: #1a1a2e; border: 1px solid #2d2d4e; border-radius: 16px; padding: 40px; }
    .logo { font-size: 28px; font-weight: 800; color: #a855f7; margin-bottom: 8px; }
    .logo span { color: #6366f1; }
    h1 { font-size: 22px; color: #f1f5f9; margin: 24px 0 8px; }
    .amount-box { background: linear-gradient(135deg, #4c1d95, #312e81); border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0; }
    .amount { font-size: 36px; font-weight: 800; color: #a5b4fc; }
    .token { font-size: 16px; color: #818cf8; margin-top: 4px; }
    .sender { color: #94a3b8; font-size: 14px; }
    .note { background: #1e293b; border-left: 3px solid #6366f1; padding: 12px 16px; border-radius: 4px; color: #cbd5e1; font-style: italic; margin: 16px 0; }
    .cta { display: block; background: linear-gradient(135deg, #6366f1, #a855f7); color: white; text-decoration: none; text-align: center; padding: 16px 32px; border-radius: 12px; font-size: 16px; font-weight: 700; margin: 24px 0; }
    .expiry { color: #64748b; font-size: 13px; text-align: center; }
    .footer { color: #475569; font-size: 12px; text-align: center; margin-top: 24px; }
    .url { word-break: break-all; color: #6366f1; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo">Zap<span>-X</span></div>
      <h1>You have ${payload.amount} ${payload.token} waiting for you!</h1>
      <p class="sender">Sent by <strong>${senderShort}</strong> on Starknet</p>

      <div class="amount-box">
        <div class="amount">${payload.amount}</div>
        <div class="token">${payload.token}</div>
      </div>

      ${payload.note ? `<div class="note">"${payload.note}"</div>` : ''}

      <p>To claim your funds, click the button below. You'll be able to create a free wallet in seconds — no seed phrases required.</p>

      <a href="${payload.claimLink}" class="cta">Claim Your ${payload.token} →</a>

      <p class="expiry">⏳ This link expires on <strong>${expireDate}</strong></p>
      <p class="expiry">Or copy this link: <br/><span class="url">${payload.claimLink}</span></p>

      <div class="footer">
        Powered by Zap-X · Starknet · STRK & Bitcoin on-chain transfers<br/>
        If you did not expect this email, you can safely ignore it.
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();

  await transporter.sendMail({
    from: config.email.from,
    to: payload.recipientEmail,
    subject: `You received ${payload.amount} ${payload.token} on Zap-X!`,
    html,
    text: `You have ${payload.amount} ${payload.token} waiting. Claim at: ${payload.claimLink} (expires ${expireDate})`,
  });

  console.log(`[EmailService] Claim email sent to hash:${payload.recipientEmail.slice(0, 3)}***`);
}

// ─── Transfer Confirmation ─────────────────────────────────────────────────────

export async function sendTransferConfirmation(params: {
  toEmail: string;
  senderAddress: string;
  amount: string;
  token: string;
  txHash: string;
}): Promise<void> {
  const transporter = getTransporter();
  const senderShort = `${params.senderAddress.slice(0, 6)}...${params.senderAddress.slice(-4)}`;

  await transporter.sendMail({
    from: config.email.from,
    to: params.toEmail,
    subject: `You received ${params.amount} ${params.token} on Zap-X`,
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
        <h2>💸 Transfer Received</h2>
        <p>You received <strong>${params.amount} ${params.token}</strong> from ${senderShort}.</p>
        <p>Transaction: <a href="https://starkscan.co/tx/${params.txHash}">${params.txHash.slice(0, 20)}…</a></p>
        <p>Log in to <a href="${config.frontendUrl}">Zap-X</a> to view your balance.</p>
      </div>
    `,
  });
}

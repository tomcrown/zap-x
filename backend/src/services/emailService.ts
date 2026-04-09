/**
 * EmailService
 *
 * Sends transactional emails using the Resend HTTP API.
 * No SMTP — works on Render and all other hosts.
 */

import { Resend } from 'resend';
import { config } from '../config/index.js';
import { ClaimEmailPayload } from '../models/types.js';

let _resend: Resend | null = null;

function getResend(): Resend {
  if (_resend) return _resend;
  if (!config.email.pass) throw new Error('SMTP_PASS (Resend API key) is not set.');
  _resend = new Resend(config.email.pass);
  return _resend;
}

// ─── Claim Email ───────────────────────────────────────────────────────────────

export async function sendClaimEmail(payload: ClaimEmailPayload): Promise<void> {
  const expireDate = new Date(payload.expiresAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const senderShort = `${payload.senderAddress.slice(0, 6)}…${payload.senderAddress.slice(-4)}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You have ${payload.amount} ${payload.token} waiting</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #080808; color: #e4e4e7; padding: 32px 16px; -webkit-font-smoothing: antialiased; }
    .wrap { max-width: 520px; margin: 0 auto; }
    .card { background: #111111; border: 1px solid #1e1e1e; border-radius: 16px; overflow: hidden; }
    .amount-hero { background: #080808; border-bottom: 1px solid #1e1e1e; padding: 40px 32px; text-align: center; }
    .amount-label { font-size: 11px; font-family: 'Courier New', monospace; color: #52525b; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 12px; }
    .amount-value { font-size: 64px; font-weight: 700; font-family: 'Courier New', monospace; color: #ffffff; line-height: 1; margin-bottom: 6px; }
    .amount-token { font-size: 20px; font-family: 'Courier New', monospace; color: #22d3ee; font-weight: 600; }
    .body { padding: 32px; }
    .sender-line { font-size: 13px; color: #71717a; font-family: 'Courier New', monospace; margin-bottom: 20px; }
    .sender-line strong { color: #a1a1aa; }
    h1 { font-size: 22px; font-weight: 600; color: #ffffff; line-height: 1.3; margin-bottom: 12px; letter-spacing: -0.02em; }
    p { font-size: 14px; color: #71717a; line-height: 1.6; margin-bottom: 16px; }
    .note { background: #0f0f0f; border: 1px solid #1e1e1e; border-left: 2px solid #22d3ee; border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #a1a1aa; font-style: italic; margin-bottom: 24px; }
    .steps { margin-bottom: 28px; }
    .step { display: flex; align-items: flex-start; gap: 12px; padding: 10px 0; border-bottom: 1px solid #1a1a1a; }
    .step:last-child { border-bottom: none; }
    .step-num { font-size: 10px; font-family: 'Courier New', monospace; color: #3f3f46; margin-top: 2px; min-width: 20px; }
    .step-text { font-size: 13px; color: #71717a; line-height: 1.5; }
    .step-text strong { color: #a1a1aa; font-weight: 500; }
    .cta { display: block; background: #22d3ee; color: #000000 !important; text-decoration: none; text-align: center; padding: 16px 32px; border-radius: 12px; font-size: 15px; font-weight: 700; letter-spacing: -0.01em; margin-bottom: 20px; }
    .expiry { text-align: center; font-size: 12px; font-family: 'Courier New', monospace; color: #3f3f46; margin-bottom: 8px; }
    .url-block { background: #0f0f0f; border: 1px solid #1e1e1e; border-radius: 8px; padding: 10px 14px; font-size: 11px; font-family: 'Courier New', monospace; color: #52525b; word-break: break-all; margin-bottom: 24px; }
    .footer { border-top: 1px solid #1e1e1e; padding: 20px 32px; text-align: center; }
    .footer p { font-size: 11px; font-family: 'Courier New', monospace; color: #3f3f46; margin: 0; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="amount-hero">
        <p class="amount-label">incoming transfer</p>
        <div class="amount-value">${payload.amount}</div>
        <div class="amount-token">${payload.token}</div>
      </div>
      <div class="body">
        <p class="sender-line">from <strong>${senderShort}</strong> on Starknet</p>
        <h1>You have funds waiting.</h1>
        <p>Someone sent you <strong style="color:#e4e4e7">${payload.amount} ${payload.token}</strong> on Starknet. You don't need a crypto wallet to claim — we'll create one for you automatically.</p>
        ${payload.note ? `<div class="note">"${payload.note}"</div>` : ''}
        <div class="steps">
          <div class="step"><span class="step-num">01</span><span class="step-text"><strong>Click the button below</strong> — takes you to Zap-X</span></div>
          <div class="step"><span class="step-num">02</span><span class="step-text"><strong>Sign in with Google or email</strong> — no crypto knowledge needed</span></div>
          <div class="step"><span class="step-num">03</span><span class="step-text"><strong>Hit "Claim"</strong> — funds land in your new wallet instantly</span></div>
        </div>
        <a href="${payload.claimLink}" class="cta">Claim ${payload.amount} ${payload.token} →</a>
        <p class="expiry">expires ${expireDate}</p>
        <div class="url-block">${payload.claimLink}</div>
      </div>
      <div class="footer">
        <p>Zap-X · Starknet · Powered by AVNU &amp; Privy</p>
        <p style="margin-top:6px">If you didn't expect this, ignore it safely.</p>
      </div>
    </div>
  </div>
</body>
</html>`.trim();

  const { error } = await getResend().emails.send({
    from: config.email.from,
    to: payload.recipientEmail,
    subject: `You received ${payload.amount} ${payload.token} — claim it now`,
    html,
    text: `You received ${payload.amount} ${payload.token} on Starknet.\n\nClaim it at: ${payload.claimLink}\n\nExpires: ${expireDate}\n\nNo wallet required — sign in with Google and claim in seconds.`,
  });

  if (error) throw new Error(`Resend error: ${error.message}`);

  console.log(`[EmailService] Claim email sent to ***${payload.recipientEmail.slice(-6)}`);
}

// ─── Transfer Confirmation ─────────────────────────────────────────────────────

export async function sendTransferConfirmation(params: {
  toEmail: string;
  senderAddress: string;
  amount: string;
  token: string;
  txHash: string;
}): Promise<void> {
  const senderShort = `${params.senderAddress.slice(0, 6)}…${params.senderAddress.slice(-4)}`;
  const txShort = `${params.txHash.slice(0, 16)}…`;

  const { error } = await getResend().emails.send({
    from: config.email.from,
    to: params.toEmail,
    subject: `${params.amount} ${params.token} received on Zap-X`,
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: -apple-system, sans-serif; background: #080808; color: #e4e4e7; padding: 32px 16px; }
    .wrap { max-width: 480px; margin: 0 auto; }
    .card { background: #111111; border: 1px solid #1e1e1e; border-radius: 16px; padding: 32px; }
    .amount { font-size: 48px; font-weight: 700; font-family: monospace; color: #fff; margin: 20px 0 4px; }
    .token { font-size: 18px; color: #22d3ee; font-family: monospace; margin-bottom: 24px; }
    p { font-size: 14px; color: #71717a; line-height: 1.6; margin-bottom: 12px; }
    a { color: #22d3ee; }
    .footer { margin-top: 24px; font-size: 11px; color: #3f3f46; font-family: monospace; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <p style="font-size:12px;font-family:monospace;color:#52525b;text-transform:uppercase;letter-spacing:.1em">Transfer received</p>
      <div class="amount">${params.amount}</div>
      <div class="token">${params.token}</div>
      <p>Sent by <strong style="color:#a1a1aa">${senderShort}</strong> on Starknet.</p>
      <p>Transaction: <a href="https://starkscan.co/tx/${params.txHash}">${txShort}</a></p>
      <p>Log in to <a href="${config.frontendUrl}">Zap-X</a> to manage your funds.</p>
      <div class="footer">Zap-X · Starknet · AVNU</div>
    </div>
  </div>
</body>
</html>`,
    text: `You received ${params.amount} ${params.token} from ${senderShort}.\n\nTx: https://starkscan.co/tx/${params.txHash}\n\nLog in: ${config.frontendUrl}`,
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
}

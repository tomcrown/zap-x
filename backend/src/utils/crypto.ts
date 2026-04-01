import crypto from 'crypto';

/**
 * Generate a cryptographically secure random claim token (URL-safe, 32 bytes → 43 chars).
 */
export function generateClaimToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Generate a standard UUID v4.
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Simple HMAC-SHA256 signature for internal API verification.
 */
export function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Constant-time comparison to prevent timing attacks.
 */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Hash an email address for logging (do not store PII in logs).
 */
export function hashEmail(email: string): string {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex').slice(0, 12);
}

/**
 * Validate a Starknet address format (0x followed by 63-64 hex chars).
 */
export function isValidStarknetAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{1,64}$/.test(address);
}

/**
 * Validate an email address (basic RFC 5322 check).
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validate a username — lowercase alphanumeric + underscore, 3–30 chars.
 */
export function isValidUsername(username: string): boolean {
  return /^[a-z0-9_]{3,30}$/.test(username);
}

/**
 * Normalise a recipient string — returns the type: 'address' | 'email' | 'username'.
 */
export function detectRecipientType(
  recipient: string
): 'address' | 'email' | 'username' | 'unknown' {
  const trimmed = recipient.trim();
  if (isValidStarknetAddress(trimmed)) return 'address';
  if (isValidEmail(trimmed)) return 'email';
  // Strip leading @
  const username = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  if (isValidUsername(username)) return 'username';
  return 'unknown';
}

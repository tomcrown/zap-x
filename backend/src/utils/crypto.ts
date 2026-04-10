import crypto from "crypto";

export function generateClaimToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function hashEmail(email: string): string {
  return crypto
    .createHash("sha256")
    .update(email.toLowerCase().trim())
    .digest("hex")
    .slice(0, 12);
}

export function isValidStarknetAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{1,64}$/.test(address);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidUsername(username: string): boolean {
  return /^[a-z0-9_]{3,30}$/.test(username);
}

export function detectRecipientType(
  recipient: string,
): "address" | "email" | "username" | "unknown" {
  const trimmed = recipient.trim();
  if (isValidStarknetAddress(trimmed)) return "address";
  if (isValidEmail(trimmed)) return "email";
  const username = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  if (isValidUsername(username)) return "username";
  return "unknown";
}

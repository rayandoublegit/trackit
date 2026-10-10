// AES-256-GCM encryption for mailbox passwords (SMTP/IMAP app passwords).
// Server-only. The key is MAILBOX_ENCRYPTION_KEY: 32 random bytes, base64.
// Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
//
// Stored format: "v1:<iv b64>:<auth tag b64>:<ciphertext b64>". A fresh 12-byte IV
// per secret; the tag makes any tampering fail at decryption.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;

export class MailboxKeyError extends Error {}

export function parseMailboxKey(raw: string | undefined | null): Buffer {
  const value = (raw ?? "").trim();
  if (!value) throw new MailboxKeyError("MAILBOX_ENCRYPTION_KEY is not set");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new MailboxKeyError("MAILBOX_ENCRYPTION_KEY must be 32 bytes encoded in base64");
  }
  return key;
}

function envKey(): Buffer {
  return parseMailboxKey(process.env.MAILBOX_ENCRYPTION_KEY);
}

export function isMailboxEncryptionConfigured(): boolean {
  try {
    envKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plain: string, key: Buffer = envKey()): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSecret(stored: string, key: Buffer = envKey()): string {
  const parts = String(stored ?? "").split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error("Unknown secret format");
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

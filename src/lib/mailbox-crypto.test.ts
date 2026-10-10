import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, isMailboxEncryptionConfigured, MailboxKeyError, parseMailboxKey } from "./mailbox-crypto";

const key = randomBytes(32);

describe("mailbox secret encryption", () => {
  const original = process.env.MAILBOX_ENCRYPTION_KEY;
  afterEach(() => {
    process.env.MAILBOX_ENCRYPTION_KEY = original;
  });

  it("round-trips a password, including unicode and spaces", () => {
    for (const plain of ["abcd efgh ijkl mnop", "pässwörd-€-日本", "x"]) {
      expect(decryptSecret(encryptSecret(plain, key), key)).toBe(plain);
    }
  });

  it("uses a fresh IV each time and never stores the plain text", () => {
    const a = encryptSecret("same-secret", key);
    const b = encryptSecret("same-secret", key);
    expect(a).not.toBe(b);
    expect(a).not.toContain("same-secret");
    expect(a.startsWith("v1:")).toBe(true);
    expect(a.split(":")).toHaveLength(4);
  });

  it("rejects a tampered ciphertext or the wrong key", () => {
    const stored = encryptSecret("secret", key);
    const [v, iv, tag, data] = stored.split(":");
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 1;
    expect(() => decryptSecret([v, iv, tag, flipped.toString("base64")].join(":"), key)).toThrow();
    expect(() => decryptSecret(stored, randomBytes(32))).toThrow();
    expect(() => decryptSecret("not-a-secret", key)).toThrow();
  });

  it("validates MAILBOX_ENCRYPTION_KEY (32 bytes, base64)", () => {
    expect(() => parseMailboxKey("")).toThrow(MailboxKeyError);
    expect(() => parseMailboxKey(randomBytes(16).toString("base64"))).toThrow(MailboxKeyError);
    expect(parseMailboxKey(key.toString("base64")).equals(key)).toBe(true);

    process.env.MAILBOX_ENCRYPTION_KEY = "";
    expect(isMailboxEncryptionConfigured()).toBe(false);
    process.env.MAILBOX_ENCRYPTION_KEY = key.toString("base64");
    expect(isMailboxEncryptionConfigured()).toBe(true);
    expect(decryptSecret(encryptSecret("env-key"))).toBe("env-key");
  });
});

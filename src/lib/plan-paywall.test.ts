import { describe, expect, it } from "vitest";
import { creatorsForPlan, HIDDEN_EMAIL_TEXT, maskEmails, paywallBody, readPaywall, redactCreatorEmail } from "@/lib/plan-paywall";

describe("402 paywall payload", () => {
  it("has the same shape everywhere", () => {
    expect(paywallBody("live-lookup", "basic")).toEqual({
      ok: false,
      error: "plan_required",
      feature: "live-lookup",
      used: null,
      limit: null,
      requiredTier: "basic",
      resetsAt: null,
    });
    expect(paywallBody("gifting-links", "pro", { error: "quota_exceeded", used: 3, limit: 3, message: "x" })).toMatchObject({ error: "quota_exceeded", used: 3, limit: 3, message: "x" });
  });
  it("readPaywall only accepts our 402 bodies", () => {
    const body = paywallBody("mino-analysis", "basic");
    expect(readPaywall(402, body)).toEqual(body);
    expect(readPaywall(403, body)).toBeNull();
    expect(readPaywall(402, { error: "Upgrade" })).toBeNull();
    expect(readPaywall(402, { error: "plan_required", feature: "unknown" })).toBeNull();
    expect(readPaywall(402, null)).toBeNull();
  });
});

describe("creator emails for plans without them", () => {
  const creator = { username: "luna", email: "luna@mail.com", bio: "Collabs: luna.pro@gmail.com 💌 Paris" };

  it("drops the email, masks emails in the bio and says one exists", () => {
    const out = redactCreatorEmail(creator);
    expect(out.email).toBeNull();
    expect(out.bio).toBe(`Collabs: ${HIDDEN_EMAIL_TEXT} 💌 Paris`);
    expect(out.hasEmail).toBe(true);
    expect(out.emailLocked).toBe(true);
    expect(JSON.stringify(out)).not.toMatch(/@gmail|luna@mail/);
  });
  it("an email only in the bio still counts as hasEmail", () => {
    expect(redactCreatorEmail({ email: null, bio: "write me at a@b.co" }).hasEmail).toBe(true);
  });
  it("no email anywhere: hasEmail false", () => {
    expect(redactCreatorEmail({ email: "", bio: "Paris, no contact" })).toMatchObject({ hasEmail: false, email: null, emailLocked: true });
  });
  it("repeated calls give the same answer (no regex state)", () => {
    for (let i = 0; i < 3; i++) expect(redactCreatorEmail({ email: null, bio: "x@y.fr" }).hasEmail).toBe(true);
  });
  it("creatorsForPlan leaves paid plans untouched", () => {
    expect(creatorsForPlan([creator], true)[0]).toBe(creator);
    expect(creatorsForPlan([creator], false)[0].email).toBeNull();
  });
  it("maskEmails keeps the rest of the text", () => {
    expect(maskEmails("a@b.com and c.d@e.fr")).toBe(`${HIDDEN_EMAIL_TEXT} and ${HIDDEN_EMAIL_TEXT}`);
  });
});

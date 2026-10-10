import { describe, expect, it } from "vitest";
import { buildMailComposeLink, detectMailClient, MAILTO_MAX_URL_LENGTH } from "./mail-client";
import { buildEmailComposeUrl } from "./outreach-email";

function params(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

describe("detectMailClient", () => {
  it("recognises consumer providers", () => {
    expect(detectMailClient("ana@gmail.com")).toBe("gmail");
    expect(detectMailClient("Ana@GoogleMail.com")).toBe("gmail");
    expect(detectMailClient("bob@outlook.com")).toBe("outlook");
    expect(detectMailClient("bob@hotmail.fr")).toBe("outlook");
    expect(detectMailClient("bob@live.co.uk")).toBe("outlook");
    expect(detectMailClient("bob@msn.com")).toBe("outlook");
    expect(detectMailClient("carl@yahoo.fr")).toBe("yahoo");
    expect(detectMailClient("dina@icloud.com")).toBe("mailto");
  });

  it("returns null for custom domains (Workspace / Microsoft 365) and empty input", () => {
    expect(detectMailClient("founder@acme.io")).toBeNull();
    expect(detectMailClient("")).toBeNull();
    expect(detectMailClient(null)).toBeNull();
    expect(detectMailClient("not-an-email")).toBeNull();
  });
});

describe("buildMailComposeLink", () => {
  const base = { to: "creator@example.com", subject: "Acme x Léa : partenariat", body: "Bonjour Léa,\n\nUne idée & une question ?" };

  it("Gmail compose includes authuser so the right Google account opens", () => {
    const { url, truncated } = buildMailComposeLink({ ...base, client: "gmail", fromEmail: "team@acme.io" });
    expect(url.startsWith("https://mail.google.com/mail/?")).toBe(true);
    const p = params(url);
    expect(p.get("authuser")).toBe("team@acme.io");
    expect(p.get("view")).toBe("cm");
    expect(p.get("to")).toBe(base.to);
    expect(p.get("su")).toBe(base.subject);
    expect(p.get("body")).toBe(base.body);
    expect(truncated).toBe(false);
  });

  it("Outlook personal vs Microsoft 365 use different hosts", () => {
    const personal = buildMailComposeLink({ ...base, client: "outlook" }).url;
    const work = buildMailComposeLink({ ...base, client: "outlook365" }).url;
    expect(personal.startsWith("https://outlook.live.com/mail/0/deeplink/compose?")).toBe(true);
    expect(work.startsWith("https://outlook.office.com/mail/deeplink/compose?")).toBe(true);
    expect(params(work).get("subject")).toBe(base.subject);
    expect(params(personal).get("body")).toBe(base.body);
  });

  it("Yahoo compose link", () => {
    const { url } = buildMailComposeLink({ ...base, client: "yahoo" });
    expect(url.startsWith("https://compose.mail.yahoo.com/?")).toBe(true);
    expect(params(url).get("to")).toBe(base.to);
  });

  it("mailto encodes spaces as %20 (not +) and keeps the @", () => {
    const { url } = buildMailComposeLink({ ...base, client: "mailto" });
    expect(url.startsWith("mailto:creator@example.com?")).toBe(true);
    expect(url).not.toContain("+");
    expect(url).toContain("%20");
  });

  it("empty To is allowed (creator email unknown)", () => {
    const gmail = buildMailComposeLink({ ...base, to: "", client: "gmail", fromEmail: "a@gmail.com" }).url;
    expect(params(gmail).has("to")).toBe(false);
    const mailto = buildMailComposeLink({ ...base, to: "", client: "mailto" }).url;
    expect(mailto.startsWith("mailto:?subject=")).toBe(true);
  });

  it("long mailto bodies are cut under the limit at a boundary, with a note", () => {
    const paragraph = "Nous aimerions travailler avec vous sur une collaboration rémunérée autour de nos produits.";
    const body = Array.from({ length: 40 }, (_, i) => `${i + 1}. ${paragraph}`).join("\n\n");
    const { url, truncated } = buildMailComposeLink({ ...base, body, client: "mailto", lang: "fr" });
    expect(truncated).toBe(true);
    expect(url.length).toBeLessThanOrEqual(MAILTO_MAX_URL_LENGTH);
    const sentBody = decodeURIComponent(url.split("body=")[1]);
    expect(sentBody).toContain("presse-papiers");
    expect(sentBody.startsWith("1. Nous aimerions")).toBe(true);
    // Cut between paragraphs, not mid-word.
    expect(sentBody).toMatch(/produits\.\n\n\[…\]/);
  });

  it("web clients keep long bodies whole", () => {
    const body = "word ".repeat(400);
    const { truncated } = buildMailComposeLink({ ...base, body, client: "gmail" });
    expect(truncated).toBe(false);
  });

  it("batch recipients go in cc", () => {
    const { url } = buildMailComposeLink({ ...base, client: "outlook", cc: ["b@x.com", "c@x.com"] });
    expect(params(url).get("cc")).toBe("b@x.com,c@x.com");
  });
});

describe("buildEmailComposeUrl (server-side, no saved choice)", () => {
  it("uses Gmail with authuser for gmail senders and mailto for unknown domains", () => {
    const gmail = buildEmailComposeUrl({ fromEmail: "me@gmail.com", recipients: ["a@x.com", "b@x.com"], subject: "Hi", body: "Hello" });
    expect(gmail?.mode).toBe("gmail");
    expect(params(gmail!.url).get("authuser")).toBe("me@gmail.com");
    expect(params(gmail!.url).get("cc")).toBe("b@x.com");
    const other = buildEmailComposeUrl({ fromEmail: "me@acme.io", recipients: ["a@x.com"], subject: "Hi", body: "Hello" });
    expect(other?.mode).toBe("mailto");
  });
});

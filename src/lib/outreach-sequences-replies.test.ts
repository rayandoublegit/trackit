import { describe, expect, it } from "vitest";
import {
  extractPlainText,
  isBounceMessage,
  isOptOutText,
  matchInboxMessages,
  parseMessageIdList,
  stripQuotedReply,
  type InboxMessage,
  type TrackedContact,
} from "./outreach-sequences-replies";

const sentAt = new Date("2026-10-05T08:00:00Z");
const contacts: TrackedContact[] = [
  { id: "c-mia", email: "mia@creator.com", messageIds: ["<m1.seq@brand.com>", "<m2.seq@brand.com>"], firstSentAt: sentAt },
  { id: "c-kai", email: "kai@creator.com", messageIds: ["<k1.seq@brand.com>"], firstSentAt: sentAt },
  { id: "c-lou", email: "lou@creator.com", messageIds: ["<l1.seq@brand.com>"], firstSentAt: sentAt },
];

const msg = (over: Partial<InboxMessage>): InboxMessage => ({
  uid: 1,
  date: new Date("2026-10-06T10:00:00Z"),
  fromAddress: "someone@else.com",
  subject: "Hello",
  ...over,
});

describe("reply matching", () => {
  it("matches by In-Reply-To or References even from another address", () => {
    const res = matchInboxMessages(
      [
        msg({ uid: 1, fromAddress: "manager@agency.com", inReplyTo: "<m2.seq@brand.com>", subject: "Re: Partnership" }),
        msg({ uid: 2, fromAddress: "kai.alt@gmail.com", references: "<x@y> <K1.seq@brand.com>" }),
      ],
      contacts,
    );
    expect(res.map((r) => [r.contactId, r.kind]).sort()).toEqual([
      ["c-kai", "replied"],
      ["c-mia", "replied"],
    ]);
  });

  it("matches by sender address only after our first email", () => {
    const before = msg({ uid: 3, fromAddress: "LOU@creator.com", date: new Date("2026-10-01T10:00:00Z") });
    const after = msg({ uid: 4, fromAddress: "lou@creator.com", date: new Date("2026-10-07T10:00:00Z") });
    expect(matchInboxMessages([before], contacts)).toEqual([]);
    expect(matchInboxMessages([before, after], contacts)).toEqual([{ contactId: "c-lou", kind: "replied", uid: 4, at: after.date }]);
  });

  it("ignores unrelated mail, our own copies and out-of-office replies", () => {
    const res = matchInboxMessages(
      [
        msg({ uid: 5 }),
        msg({ uid: 6, fromAddress: "mia@creator.com", messageId: "<m1.seq@brand.com>" }),
        msg({ uid: 7, fromAddress: "kai@creator.com", subject: "Out of office: back Monday" }),
      ],
      contacts,
    );
    expect(res).toEqual([]);
  });

  it("detects opt-outs in the new text but not in the quoted email", () => {
    const res = matchInboxMessages(
      [
        msg({ uid: 8, fromAddress: "mia@creator.com", textSnippet: "Stop please, not interested.\n\nOn Mon, Alex wrote:\n> reply stop" }),
        msg({ uid: 9, fromAddress: "kai@creator.com", textSnippet: "Sounds great, send details!\n\nOn Mon, Alex wrote:\n> just reply \"stop\"" }),
      ],
      contacts,
    );
    expect(res.find((r) => r.contactId === "c-mia")?.kind).toBe("unsubscribed");
    expect(res.find((r) => r.contactId === "c-kai")?.kind).toBe("replied");
  });

  it("marks bounces from mailer-daemon by Message-ID or address in the text", () => {
    const res = matchInboxMessages(
      [
        msg({ uid: 10, fromAddress: "mailer-daemon@googlemail.com", subject: "Delivery Status Notification (Failure)", textSnippet: "Message-ID: <L1.seq@brand.com> could not be delivered" }),
        msg({ uid: 11, fromAddress: "postmaster@outlook.com", subject: "Undeliverable: Partnership", textSnippet: "kai@creator.com: user unknown" }),
        msg({ uid: 12, fromAddress: "mailer-daemon@x.com", subject: "Failure", textSnippet: "nobody@we.know" }),
      ],
      contacts,
    );
    expect(res.map((r) => [r.contactId, r.kind]).sort()).toEqual([
      ["c-kai", "bounced"],
      ["c-lou", "bounced"],
    ]);
  });

  it("keeps the earliest message per contact", () => {
    const res = matchInboxMessages(
      [
        msg({ uid: 20, fromAddress: "mia@creator.com", date: new Date("2026-10-08T10:00:00Z") }),
        msg({ uid: 21, fromAddress: "mia@creator.com", date: new Date("2026-10-06T10:00:00Z") }),
      ],
      contacts,
    );
    expect(res).toHaveLength(1);
    expect(res[0].uid).toBe(21);
  });
});

describe("helpers", () => {
  it("parses message id lists", () => {
    expect(parseMessageIdList("<A@b>  <c@D>")).toEqual(["<a@b>", "<c@d>"]);
    expect(parseMessageIdList("a@b")).toEqual(["<a@b>"]);
    expect(parseMessageIdList(null)).toEqual([]);
  });

  it("recognises bounces", () => {
    expect(isBounceMessage({ fromAddress: "MAILER-DAEMON@mx.example", subject: "x" })).toBe(true);
    expect(isBounceMessage({ fromAddress: "a@b.com", subject: "Undeliverable: hello" })).toBe(true);
    expect(isBounceMessage({ fromAddress: "a@b.com", subject: "Re: hello" })).toBe(false);
  });

  it("strips quoted text and checks opt-out words", () => {
    expect(stripQuotedReply("Yes!\nLe lun. 5 oct. 2026, Alex a écrit :\n> stop")).toBe("Yes!");
    expect(isOptOutText("Merci de ne plus me contacter")).toBe(true);
    expect(isOptOutText("Désinscrivez-moi")).toBe(true);
    expect(isOptOutText("Love it, let's talk")).toBe(false);
  });

  it("extracts the text/plain part of a raw message", () => {
    const raw = [
      "From: mia@creator.com",
      'Content-Type: multipart/alternative; boundary="b1"',
      "",
      "--b1",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "Oui, avec plaisir =C3=A0 vous lire",
      "--b1",
      "Content-Type: text/html",
      "",
      "<p>Oui</p>",
      "--b1--",
    ].join("\r\n");
    expect(extractPlainText(raw).trim()).toBe("Oui, avec plaisir à vous lire");
    expect(extractPlainText("Subject: x\r\n\r\nplain body").trim()).toBe("plain body");
  });
});

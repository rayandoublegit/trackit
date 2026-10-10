// POST { sequenceId, contactId?, count?, regenerate? }
// Writes the personalised first email for one contact (or the first `count`
// pending contacts, max 3) from their stored data, saves it as the contact's
// draft and returns it. The cron sends exactly this draft, so what the brand
// reviews is what goes out.
import { NextResponse, type NextRequest } from "next/server";
import { composePlainText, normalizeLang, normalizeTone } from "@/lib/outreach-sequences";
import { buildFactLines, resolveEmailLanguage } from "@/lib/outreach-sequences-prompt";
import {
  generateSequenceEmail,
  GenerationError,
  loadCreatorFacts,
  loadOwnedSequence,
  requireOutreachAccess,
  type SavedFallback,
} from "@/lib/outreach-sequences-server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type ContactRow = {
  id: string;
  creator_username: string;
  platform: string;
  creator_email: string;
  creator_name: string;
  personalization: Record<string, unknown> | null;
};

export async function POST(request: NextRequest) {
  const access = await requireOutreachAccess(request);
  if ("error" in access) return access.error;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const sequenceId = String(body.sequenceId ?? "");
  const sequence = sequenceId ? await loadOwnedSequence(access, sequenceId) : null;
  if (!sequence) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const pitch = String(sequence.brand_pitch ?? "").trim();
  if (!pitch) return NextResponse.json({ ok: false, error: "missing_pitch" }, { status: 400 });

  const regenerate = Boolean(body.regenerate);
  const count = Math.min(3, Math.max(1, Number(body.count) || 3));
  let query = access.admin
    .from("outreach_sequence_contacts")
    .select("id, creator_username, platform, creator_email, creator_name, personalization")
    .eq("sequence_id", sequenceId)
    .eq("status", "pending")
    .eq("sent_count", 0);
  query = body.contactId ? query.eq("id", String(body.contactId)) : query.order("created_at", { ascending: true }).limit(count);
  const { data: contacts } = await query;
  if (!contacts?.length) return NextResponse.json({ ok: false, error: "no_contacts" }, { status: 400 });

  let senderName = "";
  let signature = "";
  if (sequence.mailbox_id) {
    const { data: mailbox } = await access.admin
      .from("email_mailboxes")
      .select("from_name, signature")
      .eq("id", String(sequence.mailbox_id))
      .eq("user_id", access.ownerId)
      .maybeSingle();
    senderName = String(mailbox?.from_name ?? "");
    signature = String(mailbox?.signature ?? "");
  }
  const lang = normalizeLang(sequence.lang);
  const tone = normalizeTone(sequence.tone);

  const previews = await Promise.all(
    (contacts as ContactRow[]).map(async (c) => {
      const p = { ...(c.personalization ?? {}) };
      const facts = await loadCreatorFacts(
        access.admin,
        c.creator_username,
        c.platform,
        lang,
        (p.saved as SavedFallback | null) ?? null,
      );
      const language = resolveEmailLanguage(facts.language, lang);
      const factLines = buildFactLines(facts, language.code);
      const existing = p.draft as { subject?: string; body?: string; optOutLang?: "en" | "fr" } | undefined;
      try {
        let draft = existing && !regenerate && existing.subject && existing.body ? existing : null;
        if (!draft) {
          const generated = await generateSequenceEmail({
            facts,
            brandPitch: pitch,
            tone,
            sequenceLang: lang,
            senderName,
            stepIndex: 0,
          });
          draft = {
            subject: generated.subject,
            body: generated.body,
            optOutLang: generated.optOutLang,
          };
          await access.admin
            .from("outreach_sequence_contacts")
            .update({
              personalization: { ...p, facts, draft: { ...draft, languageCode: generated.languageCode, generated_at: new Date().toISOString() } },
              updated_at: new Date().toISOString(),
            })
            .eq("id", c.id);
        }
        return {
          contactId: c.id,
          name: c.creator_name,
          email: c.creator_email,
          username: c.creator_username,
          facts: factLines,
          subject: draft.subject,
          body: draft.body,
          fullText: composePlainText(draft.body ?? "", signature, draft.optOutLang ?? language.optOutLang),
        };
      } catch (e) {
        const code = e instanceof GenerationError ? e.code : "ai_error";
        return { contactId: c.id, name: c.creator_name, email: c.creator_email, username: c.creator_username, facts: factLines, error: code, detail: (e as Error).message.slice(0, 300) };
      }
    }),
  );
  return NextResponse.json({ ok: true, previews });
}

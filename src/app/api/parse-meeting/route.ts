import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUserId } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

type ParsedMeeting = {
  title: string;
  when: string;
  withWho: string;
  notes: string;
};

function localFallbackParse(text: string, now = new Date()): ParsedMeeting | null {
  const raw = text.trim();
  if (!raw) return null;

  const timeMatch =
    raw.match(/\b(\d{1,2})\s*[hH:]\s*(\d{2})?\b/) ||
    raw.match(/\b(\d{1,2})\s*:\s*(\d{2})\b/) ||
    raw.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);

  const named =
    raw.match(/(?:appelle[- ]le|appel(?:le)?[- ]le|call(?:ed)?|named?|titre)\s*[:\s]+[«"]?([^»".,\n]+)[»"]?/i) ||
    raw.match(/[«"]([^»"]+)[»"]/);

  let hour = 10;
  let minute = 0;
  if (timeMatch) {
    hour = Number(timeMatch[1]);
    minute = Number(timeMatch[2] || 0);
    const ampm = timeMatch[3]?.toLowerCase();
    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
  }

  const day = new Date(now);
  if (/\bdemain|tomorrow\b/i.test(raw)) day.setDate(day.getDate() + 1);
  day.setHours(hour, minute, 0, 0);

  const pad = (n: number) => String(n).padStart(2, "0");
  const when = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}T${pad(day.getHours())}:${pad(day.getMinutes())}`;

  const title = (named?.[1] || raw.split(/[.!?\n]/)[0] || "Meeting").trim().slice(0, 80);
  const withWhoMatch = raw.match(/(?:avec|with)\s+([A-Za-zÀ-ÿ0-9@._\- ]{2,40})/i);

  return {
    title: title.replace(/^(j'?ai\s+)?(un\s+)?meeting\s+/i, "").trim() || "Meeting",
    when,
    withWho: withWhoMatch?.[1]?.trim() || "",
    notes: raw,
  };
}

export async function POST(request: NextRequest) {
  const userId = await getAuthedUserId(request);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const text = String(body.text || "").trim();
  const lang = body.lang === "fr" ? "fr" : "en";
  if (!text) return NextResponse.json({ ok: false, error: "Missing text" }, { status: 400 });

  const nowIso = new Date().toISOString();
  const fallback = localFallbackParse(text);

  if (!process.env.ANTHROPIC_API_KEY) {
    if (!fallback) return NextResponse.json({ ok: false, error: "Could not parse" }, { status: 422 });
    return NextResponse.json({ ok: true, meeting: fallback, source: "fallback" });
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: `Parse this natural-language meeting note into JSON only (no markdown).
Now is ${nowIso}. Language hint: ${lang}.
User text: """${text}"""

Return exactly:
{"title":"...","when":"YYYY-MM-DDTHH:mm","withWho":"...","notes":"..."}
- when must be local wall-clock without timezone
- if only a time is given, use today (or tomorrow if time already passed)
- title short; withWho optional; notes can echo original text`,
        },
      ],
    });

    const raw = message.content[0]?.type === "text" ? message.content[0].text : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("no json");
    const parsed = JSON.parse(jsonMatch[0]) as ParsedMeeting;
    if (!parsed.title || !parsed.when) throw new Error("incomplete");

    return NextResponse.json({
      ok: true,
      meeting: {
        title: String(parsed.title).trim().slice(0, 120),
        when: String(parsed.when).slice(0, 16),
        withWho: String(parsed.withWho || "").trim().slice(0, 80),
        notes: String(parsed.notes || text).trim().slice(0, 500),
      },
      source: "claude",
    });
  } catch {
    if (!fallback) return NextResponse.json({ ok: false, error: "Could not parse" }, { status: 422 });
    return NextResponse.json({ ok: true, meeting: fallback, source: "fallback" });
  }
}

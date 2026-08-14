import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUserId } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

type ParsedTask = {
  title: string;
  due: string;
};

function localFallbackParse(text: string, now = new Date()): ParsedTask | null {
  const raw = text.trim();
  if (!raw) return null;

  const timeMatch =
    raw.match(/\b(\d{1,2})\s*[hH:]\s*(\d{2})?\b/) ||
    raw.match(/\b(\d{1,2})\s*:\s*(\d{2})\b/) ||
    raw.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);

  let due = "";
  if (timeMatch) {
    let hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2] || 0);
    const ampm = timeMatch[3]?.toLowerCase();
    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
    const day = new Date(now);
    if (/\bdemain|tomorrow\b/i.test(raw)) day.setDate(day.getDate() + 1);
    day.setHours(hour, minute, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    due = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}T${pad(day.getHours())}:${pad(day.getMinutes())}`;
  }

  let title = raw
    .replace(/\b(aujourd['’]?hui|demain|tomorrow|today)\b/gi, "")
    .replace(/\bà\s+\d{1,2}\s*[hH:]\s*\d{0,2}\b/gi, "")
    .replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(am|pm)?\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  title = title.split(/[.!?\n]/)[0]?.trim() || raw;
  title = title.slice(0, 120) || (raw.slice(0, 80) || "Task");

  return { title, due };
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
    return NextResponse.json({ ok: true, task: fallback, source: "fallback" });
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `Parse this natural-language to-do into JSON only (no markdown).
Now is ${nowIso}. Language hint: ${lang}.
User text: """${text}"""

Return exactly:
{"title":"...","due":"YYYY-MM-DDTHH:mm" or ""}
- title: short action item (no time phrase if due is set)
- due: local wall-clock without timezone; empty string if none
- if only a time is given, use today (or tomorrow if time already passed)`,
        },
      ],
    });

    const raw = message.content[0]?.type === "text" ? message.content[0].text : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("no json");
    const parsed = JSON.parse(jsonMatch[0]) as ParsedTask;
    if (!parsed.title) throw new Error("incomplete");

    return NextResponse.json({
      ok: true,
      task: {
        title: String(parsed.title).trim().slice(0, 120),
        due: String(parsed.due || "").slice(0, 16),
      },
      source: "claude",
    });
  } catch {
    if (!fallback) return NextResponse.json({ ok: false, error: "Could not parse" }, { status: 422 });
    return NextResponse.json({ ok: true, task: fallback, source: "fallback" });
  }
}

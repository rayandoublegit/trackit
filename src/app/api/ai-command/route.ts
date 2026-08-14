import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUserId } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/** Views the assistant is allowed to open, with hints for the model. */
const NAVIGABLE_VIEWS: Array<{ view: string; hint: string }> = [
  { view: "dashboard", hint: "home overview" },
  { view: "notifications", hint: "inbox / notifications" },
  { view: "outreach", hint: "outreach messages to creators" },
  { view: "tasks", hint: "todo list" },
  { view: "planner", hint: "meetings calendar / planner" },
  { view: "planner-notes", hint: "notes / notepad" },
  { view: "whiteboard", hint: "whiteboard / goals board" },
  { view: "discovery", hint: "discover / find new creators" },
  { view: "my-creators", hint: "saved creators lists" },
  { view: "creators", hint: "manage creators CRM" },
  { view: "campaigns", hint: "campaigns tracking" },
  { view: "brand-content", hint: "content metrics" },
  { view: "payouts", hint: "pay creators / payouts / balance" },
  { view: "analytics", hint: "analytics and stats" },
  { view: "invitations", hint: "creator invitations" },
  { view: "settings", hint: "account settings" },
  { view: "integrations", hint: "shopify / stripe integrations" },
  { view: "billing", hint: "plan and billing" },
  { view: "help", hint: "help center" },
];

export type AiCommandAction =
  | { action: "create_meeting"; title: string; when: string; withWho: string; say: string }
  | { action: "create_task"; title: string; due: string; say: string }
  | { action: "pay_creator"; creator: string; amount: number | null; say: string }
  | { action: "create_campaign"; say: string }
  | { action: "navigate"; view: string; say: string }
  | { action: "clarify"; question: string }
  | { action: "chat"; reply: string };

function clamp(s: unknown, max: number): string {
  return String(s ?? "").trim().slice(0, max);
}

function sanitizeAction(raw: unknown): AiCommandAction | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  switch (a.action) {
    case "create_meeting": {
      const when = clamp(a.when, 16);
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(when)) return null;
      return {
        action: "create_meeting",
        title: clamp(a.title, 120) || "Meeting",
        when,
        withWho: clamp(a.withWho, 80),
        say: clamp(a.say, 200),
      };
    }
    case "create_task":
      if (!clamp(a.title, 160)) return null;
      return {
        action: "create_task",
        title: clamp(a.title, 160),
        due: /^\d{4}-\d{2}-\d{2}/.test(String(a.due || "")) ? clamp(a.due, 16) : "",
        say: clamp(a.say, 200),
      };
    case "pay_creator": {
      const creator = clamp(a.creator, 80);
      if (!creator) return null;
      const amount = Number(a.amount);
      return {
        action: "pay_creator",
        creator,
        amount: Number.isFinite(amount) && amount > 0 ? amount : null,
        say: clamp(a.say, 200),
      };
    }
    case "create_campaign":
      return { action: "create_campaign", say: clamp(a.say, 200) };
    case "navigate": {
      const view = clamp(a.view, 40);
      if (!NAVIGABLE_VIEWS.some((v) => v.view === view)) return null;
      return { action: "navigate", view, say: clamp(a.say, 200) };
    }
    case "clarify":
      if (!clamp(a.question, 240)) return null;
      return { action: "clarify", question: clamp(a.question, 240) };
    case "chat":
      if (!clamp(a.reply, 600)) return null;
      return { action: "chat", reply: clamp(a.reply, 600) };
    default:
      return null;
  }
}

/** Local wall-clock "YYYY-MM-DDTHH:mm" from a base date. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Regex-only fallback when the model is unavailable. */
function localFallback(
  text: string,
  lang: "fr" | "en",
  nowLocal: string,
  creators: string[],
): AiCommandAction {
  const fr = lang === "fr";
  const q = text.toLowerCase();
  const now = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(nowLocal) ? new Date(nowLocal) : new Date();

  const timeMatch =
    text.match(/\b(\d{1,2})\s*(?:h|heures?|:)\s*(\d{2})?\b/i) ||
    text.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);

  const parseWhen = (): string | null => {
    if (!timeMatch) return null;
    let hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2] || 0);
    const ampm = timeMatch[3]?.toLowerCase();
    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
    const day = new Date(now);
    if (/\bdemain|tomorrow\b/i.test(text)) day.setDate(day.getDate() + 1);
    day.setHours(hour, minute, 0, 0);
    if (day.getTime() < now.getTime() && !/\bdemain|tomorrow\b/i.test(text)) {
      day.setDate(day.getDate() + 1);
    }
    return toLocalInput(day);
  };

  // Pay a creator
  if (/\b(pay|paye[rz]?|paie|payout|virement)\b/i.test(q)) {
    const named = creators.find((c) => c && q.includes(c.toLowerCase()));
    const amountMatch = text.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:€|\$|eur|usd)?/);
    if (named) {
      return {
        action: "pay_creator",
        creator: named,
        amount: amountMatch ? Number(amountMatch[1].replace(",", ".")) : null,
        say: fr ? `J'ouvre le paiement de ${named}.` : `Opening the payment for ${named}.`,
      };
    }
    return {
      action: "clarify",
      question: fr ? "Quel créateur veux-tu payer ?" : "Which creator do you want to pay?",
    };
  }

  // Meeting / rendez-vous
  if (/\b(meeting|rendez[- ]?vous|rdv|call)\b/i.test(q)) {
    const when = parseWhen();
    if (!when) {
      return {
        action: "clarify",
        question: fr
          ? "À quelle heure veux-tu ce rendez-vous ?"
          : "What time should I set the meeting for?",
      };
    }
    const named =
      text.match(/(?:appelle[- ]le|appel(?:le)?[- ]le|call(?:ed)? it|call it|named?|titre)\s*[:\s]+[«"]?([^»".,\n]+)[»"]?/i) ||
      text.match(/[«"]([^»"]+)[»"]/);
    const withWho = text.match(/(?:avec|with)\s+(@?[A-Za-zÀ-ÿ0-9._\- ]{2,40})/i);
    const title = (named?.[1] || (fr ? "Rendez-vous" : "Meeting")).trim();
    return {
      action: "create_meeting",
      title: title.slice(0, 120),
      when,
      withWho: withWho?.[1]?.trim() || "",
      say: fr ? `C'est noté — « ${title} » ajouté.` : `Done — “${title}” added.`,
    };
  }

  // Task
  if (/\b(task|tâche|todo|rappelle|reminder)\b/i.test(q)) {
    const title = text
      .replace(/\b(ajoute|add|crée|create|nouvelle?|new)\b/gi, "")
      .replace(/\b(task|tâche|todo)\b/gi, "")
      .replace(/[:\s]+/g, " ")
      .trim();
    return {
      action: "create_task",
      title: (title || text).slice(0, 160),
      due: parseWhen() || "",
      say: fr ? "Tâche ajoutée." : "Task added.",
    };
  }

  // Campaign creation
  if (/\b(cr[ée]e|create|nouvelle|new)\b.*\b(campagne|campaign)\b/i.test(q)) {
    return {
      action: "create_campaign",
      say: fr ? "J'ouvre la création de campagne." : "Opening campaign creation.",
    };
  }

  // Simple navigation
  const NAV_KEYS: Array<{ keys: string[]; view: string }> = [
    { keys: ["inbox", "notif"], view: "notifications" },
    { keys: ["outreach", "message"], view: "outreach" },
    { keys: ["task", "tâche"], view: "tasks" },
    { keys: ["planner", "agenda", "calendrier"], view: "planner" },
    { keys: ["note"], view: "planner-notes" },
    { keys: ["whiteboard", "board"], view: "whiteboard" },
    { keys: ["discover", "trouver"], view: "discovery" },
    { keys: ["campagne", "campaign"], view: "campaigns" },
    { keys: ["contenu", "content"], view: "brand-content" },
    { keys: ["payout", "paiement", "solde", "balance"], view: "payouts" },
    { keys: ["analytic", "stats"], view: "analytics" },
    { keys: ["setting", "paramètre", "réglage"], view: "settings" },
    { keys: ["shopify", "stripe", "intégration", "integration"], view: "integrations" },
    { keys: ["créateur", "creator", "crm"], view: "creators" },
  ];
  const hit = NAV_KEYS.find((r) => r.keys.some((k) => q.includes(k)));
  if (hit) {
    return {
      action: "navigate",
      view: hit.view,
      say: fr ? "J'ouvre ça." : "Opening it.",
    };
  }

  return {
    action: "chat",
    reply: fr
      ? "Je peux ajouter un rendez-vous, créer une tâche, payer un créateur ou ouvrir une page. Dis-moi ce que tu veux faire."
      : "I can add a meeting, create a task, pay a creator, or open a page. Tell me what you'd like to do.",
  };
}

export async function POST(request: NextRequest) {
  const userId = await getAuthedUserId(request);
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const text = clamp(body.text, 1000);
  const context = clamp(body.context, 2000);
  const lang: "fr" | "en" = body.lang === "en" ? "en" : "fr";
  const nowLocal = clamp(body.now, 16);
  const weekday = clamp(body.weekday, 20);
  const creators = (Array.isArray(body.creators) ? body.creators : [])
    .map((c: unknown) => clamp(c, 80))
    .filter(Boolean)
    .slice(0, 60);
  const campaigns = (Array.isArray(body.campaigns) ? body.campaigns : [])
    .map((c: unknown) => clamp(c, 80))
    .filter(Boolean)
    .slice(0, 30);

  if (!text) return NextResponse.json({ ok: false, error: "Missing text" }, { status: 400 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      ok: true,
      command: localFallback(context ? `${context}\n${text}` : text, lang, nowLocal, creators),
      source: "fallback",
    });
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `You are Mino, the execution assistant of Trackit (a creator-marketing dashboard). Convert the user's request into EXACTLY ONE JSON object. Output JSON only — no markdown, no prose.

Local now: ${nowLocal || "unknown"}${weekday ? ` (${weekday})` : ""}. User language: ${lang}. Every human-facing string ("say", "question", "reply") must be written in ${lang === "fr" ? "French" : "English"}, short, warm and natural.

Known creators: ${creators.length ? JSON.stringify(creators) : "none"}
Known campaigns: ${campaigns.length ? JSON.stringify(campaigns) : "none"}
Navigable views: ${NAVIGABLE_VIEWS.map((v) => `${v.view} (${v.hint})`).join(", ")}

Possible actions (pick one):
{"action":"create_meeting","title":"...","when":"YYYY-MM-DDTHH:mm","withWho":"...","say":"..."}
{"action":"create_task","title":"...","due":"YYYY-MM-DDTHH:mm or empty","say":"..."}
{"action":"pay_creator","creator":"...","amount":number or null,"say":"..."}
{"action":"create_campaign","say":"..."}
{"action":"navigate","view":"one of the navigable views","say":"..."}
{"action":"clarify","question":"..."}
{"action":"chat","reply":"..."}

Rules:
- Prefer EXECUTING over asking. Use clarify ONLY when a required detail is truly missing (e.g. meeting without any time, payment without any creator). Ask ONE short question.
- create_meeting.when is local wall-clock, no timezone. No date given: today; if that time already passed today, use tomorrow. "say" must confirm what was scheduled and when.
- pay_creator.creator: pick the best matching name from known creators if one fits, otherwise pass the raw name.
- If "Previous context" is present, the user is answering your last question: merge both to build the action.
- Greetings, questions, or anything that is not an actionable command: use chat with a brief helpful reply (you can mention what you can do).

Previous context: """${context}"""
User request: """${text}"""`,
        },
      ],
    });

    const raw = message.content[0]?.type === "text" ? message.content[0].text : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? (JSON.parse(jsonMatch[0]) as unknown) : null;
    const command = sanitizeAction(parsed);
    if (!command) throw new Error("unparseable action");

    return NextResponse.json({ ok: true, command, source: "claude" });
  } catch (e) {
    console.error("POST /api/ai-command", e);
    return NextResponse.json({
      ok: true,
      command: localFallback(context ? `${context}\n${text}` : text, lang, nowLocal, creators),
      source: "fallback",
    });
  }
}

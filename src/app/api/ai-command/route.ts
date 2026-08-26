import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUserId } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const BRAND_NAVIGABLE_VIEWS: Array<{ view: string; hint: string }> = [
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
  { view: "rpm", hint: "RPM campaigns" },
  { view: "hooks", hint: "hooks library" },
  { view: "community", hint: "community chat" },
];

const CREATOR_NAVIGABLE_VIEWS: Array<{ view: string; hint: string }> = [
  { view: "dashboard", hint: "home" },
  { view: "analytics", hint: "analytics — sales, commissions, RPM views & earnings" },
  { view: "content", hint: "upload content with TikTok URL" },
  { view: "community", hint: "brand community chat" },
  { view: "infos", hint: "brand rules" },
  { view: "infos-howto", hint: "how it works" },
  { view: "infos-pricing", hint: "pricing model" },
  { view: "hooks", hint: "hooks from the brand" },
  { view: "payouts", hint: "Pay it — get paid" },
  { view: "balance", hint: "balance / solde" },
  { view: "planner", hint: "meetings / planner" },
  { view: "whiteboard", hint: "whiteboard" },
  { view: "settings", hint: "account settings / Stripe Connect" },
  { view: "help", hint: "help" },
  { view: "feedback", hint: "feedback" },
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

function navigableForRole(role: "brand" | "creator") {
  return role === "creator" ? CREATOR_NAVIGABLE_VIEWS : BRAND_NAVIGABLE_VIEWS;
}

function sanitizeAction(raw: unknown, role: "brand" | "creator"): AiCommandAction | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const views = navigableForRole(role);
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
      if (role === "creator") {
        return {
          action: "navigate",
          view: "payouts",
          say: clamp(a.say, 200) || "Opening Pay it.",
        };
      }
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
      if (role === "creator") {
        return {
          action: "navigate",
          view: "content",
          say: clamp(a.say, 200) || "Opening Content.",
        };
      }
      return { action: "create_campaign", say: clamp(a.say, 200) };
    case "navigate": {
      const view = clamp(a.view, 40);
      if (!views.some((v) => v.view === view)) return null;
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

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localFallback(
  text: string,
  lang: "fr" | "en",
  nowLocal: string,
  creators: string[],
  role: "brand" | "creator",
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

  if (role === "creator") {
    const CREATOR_NAV: Array<{ keys: string[]; view: string }> = [
      { keys: ["analytic", "stats", "vue", "vues", "rpm", "gain", "commission", "vente"], view: "analytics" },
      { keys: ["contenu", "content", "upload", "poster", "post", "vidéo", "video", "tiktok"], view: "content" },
      { keys: ["communauté", "community", "chat", "message"], view: "community" },
      { keys: ["règle", "regle", "rule", "infos", "information"], view: "infos" },
      { keys: ["comment ça marche", "how it works", "howto"], view: "infos-howto" },
      { keys: ["pricing", "prix", "rémunération", "remuneration"], view: "infos-pricing" },
      { keys: ["hook", "accroche"], view: "hooks" },
      { keys: ["payout", "paiement", "pay it", "être payé", "etre paye", "encaisser"], view: "payouts" },
      { keys: ["solde", "balance"], view: "balance" },
      { keys: ["planner", "agenda", "rendez", "meeting", "rdv"], view: "planner" },
      { keys: ["whiteboard", "board"], view: "whiteboard" },
      { keys: ["setting", "paramètre", "réglage", "stripe"], view: "settings" },
      { keys: ["help", "aide"], view: "help" },
    ];
    const hit = CREATOR_NAV.find((r) => r.keys.some((k) => q.includes(k)));
    if (hit) {
      return {
        action: "navigate",
        view: hit.view,
        say: fr ? "J'ouvre ça." : "Opening it.",
      };
    }

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
      return {
        action: "create_meeting",
        title: fr ? "Rendez-vous" : "Meeting",
        when,
        withWho: "",
        say: fr ? "C'est noté — rendez-vous ajouté." : "Done — meeting added.",
      };
    }

    return {
      action: "chat",
      reply: fr
        ? "Je peux ouvrir tes Analytiques, Contenu, Communauté, Infos, Pay it, ou ajouter un rendez-vous. Dis-moi ce que tu veux faire."
        : "I can open Analytics, Content, Community, Infos, Pay it, or add a meeting. Tell me what you need.",
    };
  }

  // Brand fallback (existing behavior)
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

  if (/\b(cr[ée]e|create|nouvelle|new)\b.*\b(campagne|campaign)\b/i.test(q)) {
    return {
      action: "create_campaign",
      say: fr ? "J'ouvre la création de campagne." : "Opening campaign creation.",
    };
  }

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
    { keys: ["rpm"], view: "rpm" },
    { keys: ["communauté", "community"], view: "community" },
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
  const role: "brand" | "creator" = body.role === "creator" ? "creator" : "brand";
  const creators = (Array.isArray(body.creators) ? body.creators : [])
    .map((c: unknown) => clamp(c, 80))
    .filter(Boolean)
    .slice(0, 60);
  const campaigns = (Array.isArray(body.campaigns) ? body.campaigns : [])
    .map((c: unknown) => clamp(c, 80))
    .filter(Boolean)
    .slice(0, 30);

  if (!text) return NextResponse.json({ ok: false, error: "Missing text" }, { status: 400 });

  const views = navigableForRole(role);

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      ok: true,
      command: localFallback(context ? `${context}\n${text}` : text, lang, nowLocal, creators, role),
      source: "fallback",
    });
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const roleBlurb =
      role === "creator"
        ? `The user is a CREATOR on Trackit. They can open analytics (sales/commissions/RPM), upload content, join community, read brand infos/rules/pricing, hooks, Pay it / balance, planner, whiteboard, settings. They cannot pay other creators or create brand campaigns.`
        : `The user is a BRAND on Trackit. They manage campaigns, creators, outreach, payouts, discovery, and content.`;

    const actionsBlurb =
      role === "creator"
        ? `Possible actions (pick one):
{"action":"create_meeting","title":"...","when":"YYYY-MM-DDTHH:mm","withWho":"...","say":"..."}
{"action":"navigate","view":"one of the navigable views","say":"..."}
{"action":"clarify","question":"..."}
{"action":"chat","reply":"..."}

Do NOT use pay_creator or create_campaign. For money/payout questions, navigate to "payouts" or "balance" or "analytics". For posting a TikTok URL / content, navigate to "content". For views/RPM/commissions, navigate to "analytics".`
        : `Possible actions (pick one):
{"action":"create_meeting","title":"...","when":"YYYY-MM-DDTHH:mm","withWho":"...","say":"..."}
{"action":"create_task","title":"...","due":"YYYY-MM-DDTHH:mm or empty","say":"..."}
{"action":"pay_creator","creator":"...","amount":number or null,"say":"..."}
{"action":"create_campaign","say":"..."}
{"action":"navigate","view":"one of the navigable views","say":"..."}
{"action":"clarify","question":"..."}
{"action":"chat","reply":"..."}`;

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `You are Mino, the execution assistant of Trackit. Convert the user's request into EXACTLY ONE JSON object. Output JSON only — no markdown, no prose.

${roleBlurb}

Local now: ${nowLocal || "unknown"}${weekday ? ` (${weekday})` : ""}. User language: ${lang}. Every human-facing string ("say", "question", "reply") must be written in ${lang === "fr" ? "French" : "English"}, short, warm and natural.

Known creators: ${role === "brand" && creators.length ? JSON.stringify(creators) : "n/a"}
Known campaigns: ${role === "brand" && campaigns.length ? JSON.stringify(campaigns) : "n/a"}
Navigable views: ${views.map((v) => `${v.view} (${v.hint})`).join(", ")}

${actionsBlurb}

Rules:
- Prefer EXECUTING over asking. Use clarify ONLY when a required detail is truly missing. Ask ONE short question.
- create_meeting.when is local wall-clock, no timezone. No date given: today; if that time already passed today, use tomorrow.
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
    const command = sanitizeAction(parsed, role);
    if (!command) throw new Error("unparseable action");

    return NextResponse.json({ ok: true, command, source: "claude" });
  } catch (e) {
    console.error("POST /api/ai-command", e);
    return NextResponse.json({
      ok: true,
      command: localFallback(context ? `${context}\n${text}` : text, lang, nowLocal, creators, role),
      source: "fallback",
    });
  }
}

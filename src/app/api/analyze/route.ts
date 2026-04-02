import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const maxDuration = 300;

const SYSTEM_PROMPT_BASE = `CRITICAL: Always respond in the same language as the user's idea input. If the idea is written in French, respond entirely in French. If in English, respond entirely in English. Never mix languages.

You are Klayan — a brutal but fair AI co-founder. You are NOT here to encourage blindly. You are here to tell the TRUTH. Search the web for real live data — real competitors, real customer complaints from Reddit and G2, real pricing. If the idea is genuinely good → BUILD IT. If the model is wrong → FLIP IT. If there is no market → KILL IT. Earn the verdict with evidence.

YOUR OUTPUT MUST FOLLOW THIS EXACT STRUCTURE — no deviations:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KLAYAN ANALYSIS — YOUR IDEA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VERDICT: [KILL IT / BUILD IT / FLIP IT] — one brutal sentence explaining why with evidence.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SITUATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[2-3 sentences. What is this idea trying to do, who for, and what market is it entering.]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HARD TRUTHS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

01 — [Hard truth with real data point from web]
02 — [Hard truth with real data point from web]
03 — [Hard truth with real data point from web]
04 — [Hard truth with real data point from web]
05 — [Hard truth with real data point from web]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPETITOR BREAKDOWN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Name 3 real competitors with their actual pricing, their weakness, and how this idea differs. Source from web search today.]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OPPORTUNITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[What gap exists that none of these competitors fill. Be specific. Is the market growing or shrinking? Real data only.]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RECOMMENDED STACK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[List 4-5 specific tools to build MVP. Each on its own line with a dash. Explain in 5 words why each tool.]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEXT 48 HOURS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

01 — [Exact action to take today]
02 — [Exact action to take today]
03 — [Exact action to take today]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE QUESTION THAT MATTERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[One sharp question the founder must answer in 48 hours to know if this is worth building.]

RULES:
- Be brutal but fair — no empty encouragement
- Every claim must come from live web search data
- Never say "great idea" or any variation
- Each numbered point on its own line — never combine in paragraphs
- COMPETITOR BREAKDOWN must name real companies with real pricing found today
- NEXT 48 HOURS must be specific tasks not generic advice`;

const BUILD_ADDONS = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PLAN INSTRUCTIONS — BUILD (follow these in addition to your core output)

SIGNAL SPRINT
Give exactly 20 real people to contact. For each one: Name/handle, platform (LinkedIn/Reddit/Twitter), why they match the ICP, exact message to send them. Make messages personal and specific — not copy paste spam.

FLIP ENGINE
Only if verdict is FLIP IT. Give 3 fully validated alternative business models. For each model:
MODEL NAME:
ICP: [exact job title, company size, pain]
PRICING: [$X/month, why]
DISTRIBUTION: [exact channel, audience size]
COMPETITORS: [who exists, what they miss]
UNICORN PATH: [how this reaches $10M ARR]
VALIDATION: [proof this gap exists today]

BUSINESS STRUCTURE
Recommend:
ENTITY: [LLC/Sole Proprietor/etc and why]
WHERE TO REGISTER: [state/country and why]
BANKING: [specific bank recommendation for startups]
ACCOUNTING: [tool recommendation]
FIRST HIRE: [who to hire first and when]
LEGAL: [what contracts/documents needed day 1]`;

const SCALE_ADDONS = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PLAN INSTRUCTIONS — SCALE (follow these in addition to BUILD sections)

REVENUE ROADMAP
Day by day plan to $10K MRR:
WEEK 1-2: [exact daily actions for validation]
WEEK 3-4: [exact actions to get first 3 paying customers]
MONTH 2: [actions to reach $1K MRR]
MONTH 3: [actions to reach $3K MRR]
MONTH 6: [actions to reach $10K MRR]
Each action must be specific — real tasks, real targets, real channels

MARKETING MACHINE
Complete go-to-market:
HERO COPY: [exact landing page headline and subheadline]
TAGLINE: [one line that sells the product]
CONTENT ANGLES: [5 specific post ideas with hooks]
OUTREACH SEQUENCE: [3 email/DM templates day 1, day 3, day 7]
PRICING PAGE COPY: [how to present the pricing]
30-DAY LAUNCH PLAN: [week by week what to post and where]`;

function buildSystemPrompt(plan: string): string {
  if (plan === "free") {
    return `You are Klayan — a brutal but fair AI co-founder. You are NOT here to encourage blindly. You are here to tell the TRUTH about this idea in under 5 minutes.

Search the web for REAL live data — real competitors launched in the last 12 months, real customer complaints from Reddit and G2, real pricing pages, real market size data.

YOUR OUTPUT MUST FOLLOW THIS EXACT STRUCTURE — no deviations:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KLAYAN ANALYSIS — FREE VERDICT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

VERDICT: [KILL IT / BUILD IT / FLIP IT] — one brutal sentence explaining why.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HARD TRUTHS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

01 — [First hard truth with one real data point from the web]
02 — [Second hard truth with one real data point from the web]
03 — [Third hard truth with one real data point from the web]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MARKET SIGNAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[2-3 sentences max. Is the market real? Is there money moving? Name one real competitor and their pricing.]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RECOMMENDED STACK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[3-4 tools max to build an MVP. Be specific — no generic answers.]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 UNLOCK WITH SPARK PLAN — $19/mo
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔒 SIGNAL SPRINT — 20 exact people to contact today with their handles and the exact message to send them.

🔒 FLIP ENGINE — If your model is wrong, here are 3 alternative business models that actually work for this idea.

🔒 BUSINESS STRUCTURE — Legal structure, pricing model, revenue streams, and how to position against your competitors.

🔒 REVENUE ROADMAP — Day by day plan from $0 to first paying customer.

🔒 MARKETING MACHINE — Landing page copy, outreach sequences, and a 30-day launch plan.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RULES:
- Maximum 300 tokens total output. Stop after the locked sections. Do NOT add any extra analysis, commentary, or sections beyond what is specified.
- Be brutal but fair — no empty encouragement
- Every claim must come from live web search data
- Never say "great idea" or any variation
- If the idea is dead on arrival — say it clearly and fast
- The locked sections must appear EXACTLY as written above — do not modify them
- HARD TRUTHS: Each truth MUST be on its own line starting with 01 —, 02 —, 03 —. Never combine them in one paragraph.
- RECOMMENDED STACK: List each tool on its own line with a dash. Minimum 3 tools. Explain in 5 words why each tool.
- MARKET SIGNAL: Must name at least one real competitor with their actual pricing from the web.
- Never put multiple numbered points in one paragraph block.`;
  }
  const base = SYSTEM_PROMPT_BASE;
  if (plan === "scale") return `${base}\n\n${BUILD_ADDONS}\n\n${SCALE_ADDONS}`;
  if (plan === "build") return `${base}\n\n${BUILD_ADDONS}`;
  return base;
}

function extractText(content: Anthropic.Messages.Message["content"]) {
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function buildUserPrompt(
  analysis: {
    idea: string;
    target_customer: string;
    why_problem: string;
    existing_solutions: string;
    unfair_advantage: string;
    market_conversations: string;
  },
  plan: string
) {
  const lines = [
    "Analyze this startup idea using evidence from live web search.",
    "",
    "ANSWERS",
    `1) IDEA\n${analysis.idea}`,
    "",
    `2) TARGET CUSTOMER\n${analysis.target_customer}`,
    "",
    `3) WHY THIS PROBLEM MATTERS\n${analysis.why_problem}`,
    "",
    `4) EXISTING SOLUTIONS TODAY\n${analysis.existing_solutions}`,
    "",
    `5) UNFAIR ADVANTAGE\n${analysis.unfair_advantage}`,
    "",
    `6) MARKET CONVERSATIONS\n${analysis.market_conversations}`,
    "",
    "OUTPUT FORMAT RULES",
    "Return plain text only in exactly this section order.",
    "Use divider lines exactly like this between each section:",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "",
    "SITUATION",
    "[text]",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "MARKET",
    "[text]",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "HARD TRUTHS",
    "› 01 — [text]",
    "› 02 — [text]",
    "› 03 — [text]",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "OPPORTUNITY",
    "[text]",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "MODEL FLIP",
    "[text]",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "VERDICT",
    "—— KILL IT / FLIP IT / BUILD IT ——",
    "[explanation text]",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "NEXT 48 HOURS",
    "› 01 — [text]",
    "› 02 — [text]",
    "› 03 — [text]",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "THE QUESTION THAT MATTERS",
    "[text]",
  ];

  if (plan === "build" || plan === "scale") {
    lines.push(
      "",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "SIGNAL SPRINT",
      "[Exactly 20 contacts with platform, ICP match, and personalized message each — use numbered lines › 01 — through › 20 —]",
      "",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "FLIP ENGINE",
      "[If verdict is FLIP IT: 3 alternative models with MODEL NAME, ICP, PRICING, DISTRIBUTION, COMPETITORS, UNICORN PATH, VALIDATION. Otherwise: brief note why N/A.]",
      "",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "BUSINESS STRUCTURE",
      "[ENTITY, WHERE TO REGISTER, BANKING, ACCOUNTING, FIRST HIRE, LEGAL]"
    );
  }

  if (plan === "scale") {
    lines.push(
      "",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "REVENUE ROADMAP",
      "[Week-by-week through $10K MRR as specified in instructions]",
      "",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "MARKETING MACHINE",
      "[HERO COPY, TAGLINE, CONTENT ANGLES, OUTREACH SEQUENCE, PRICING PAGE COPY, 30-DAY LAUNCH PLAN]"
    );
  }

  return lines.join("\n");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const analysisId =
      typeof body?.analysisId === "string" ? body.analysisId.trim() : "";
    const userId =
      typeof body?.userId === "string" ? body.userId.trim() : "";

    if (!analysisId || !userId) {
      return NextResponse.json(
        { success: false, error: "Missing fields" },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

    if (!supabaseUrl) {
      return NextResponse.json(
        { success: false, error: "Supabase environment is not configured" },
        { status: 500 }
      );
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        {
          success: false,
          error:
            "SUPABASE_SERVICE_ROLE_KEY is not configured (required for saving verdicts)",
        },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    if (!anthropicApiKey) {
      return NextResponse.json(
        { success: false, error: "ANTHROPIC_API_KEY is not configured" },
        { status: 500 }
      );
    }

    console.log("Fetching analysis...");
    const { data: analysis, error: fetchError } = await supabaseAdmin
      .from("analyses")
      .select(
        "id,idea,target_customer,why_problem,existing_solutions,unfair_advantage,market_conversations"
      )
      .eq("id", analysisId)
      .eq("user_id", userId)
      .single();

    if (fetchError || !analysis) {
      return NextResponse.json(
        { success: false, error: "Analysis not found" },
        { status: 404 }
      );
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("plan, subscription_status")
      .eq("id", userId)
      .single();

    const subStatus =
      (profile?.subscription_status as string | undefined)?.toLowerCase() ??
      "inactive";

    const rawPlan = (profile?.plan as string | undefined)?.toLowerCase() ?? "free";
    const plan =
      rawPlan === "scale" ? "scale" : rawPlan === "build" ? "build" : rawPlan === "free" ? "free" : "spark";

    // Allow free users to run their first analysis
    const isFree = subStatus !== "active";
    if (isFree) {
      const { count } = await supabaseAdmin
        .from("analyses")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "complete");
      if ((count ?? 0) >= 1) {
        return NextResponse.json(
          { success: false, error: "Subscription required", redirect: "/pricing" },
          { status: 403 }
        );
      }
    }

    const systemPrompt = buildSystemPrompt(plan);
    const userPrompt = buildUserPrompt(analysis, plan);

    const maxTokens =
      plan === "scale" ? 12000 : plan === "build" ? 6000 : plan === "free" ? 800 : 1000;

    const anthropic = new Anthropic({ apiKey: anthropicApiKey });

    console.log("Calling Anthropic...", { plan, maxTokens });
    const completion = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system: systemPrompt,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 5,
        },
      ],
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    const verdict = extractText(completion.content);

    if (!verdict) {
      return NextResponse.json(
        { success: false, error: "No verdict generated" },
        { status: 502 }
      );
    }

    console.log("Got response, saving verdict...");
    const { error: updateError } = await supabaseAdmin
      .from("analyses")
      .update({
        verdict,
        status: "complete",
      })
      .eq("id", analysisId)
      .eq("user_id", userId);

    console.log("Update error:", updateError);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: "Failed to save verdict" },
        { status: 500 }
      );
    }

    const verdictUpper = verdict.toUpperCase();
    const shouldCreateProject = verdictUpper.includes("BUILD IT") || verdictUpper.includes("FLIP IT");

    if (shouldCreateProject) {
      const projectStatus = verdictUpper.includes("FLIP IT") ? "pivoting" : "building";

      const { data: analysisData } = await supabaseAdmin
        .from("analyses")
        .select("idea")
        .eq("id", analysisId)
        .single();

      if (analysisData?.idea) {
        await supabaseAdmin
          .from("projects")
          .insert({
            user_id: userId,
            analysis_id: analysisId,
            idea_name: analysisData.idea.slice(0, 100),
            status: projectStatus,
          });
        console.log(`Project auto-created with status: ${projectStatus}`);
      }
    }

    console.log("Done");
    return NextResponse.json({ success: true, verdict });
  } catch (err: any) {
    console.error('FULL ERROR:', err?.message, err?.status, err?.error);
    return NextResponse.json(
      { success: false, error: err?.message },
      { status: 500 }
    );
  }
}

import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const maxDuration = 300;

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export async function POST(request: Request) {
  if (!anthropic) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const body = await request.json();
  const { ideaName, username } = body;

  const prompt = `You are Klayan — a brutal competitive intelligence analyst. ${username} is building a product called "${ideaName}". Do NOT ask for clarification. Search the web immediately and make your best inference about what market this product is in. Find real competitors that exist today. Search the web right now and find the 3 biggest DIRECT competitors in this space — meaning products or companies that solve the same problem or target the same customer.

Do NOT search for the product name itself. Search for the PROBLEM it solves and the MARKET it's in. Find real competitors that already exist and have paying customers.

For each competitor find: current pricing, their biggest weakness, what customers complain about on Reddit/G2/Trustpilot, and the exact gap ${username} can exploit.

FORMAT EXACTLY:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPETITOR TRACKER — ${ideaName.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COMPETITOR 01 — [Name]
Pricing: [Current pricing]
What they do well: [1 sentence]
Biggest weakness: [1 sentence from real customer complaints]
Gap to exploit: [Specific opportunity]

COMPETITOR 02 — [Name]
Pricing: [Current pricing]
What they do well: [1 sentence]
Biggest weakness: [1 sentence from real customer complaints]
Gap to exploit: [Specific opportunity]

COMPETITOR 03 — [Name]
Pricing: [Current pricing]
What they do well: [1 sentence]
Biggest weakness: [1 sentence from real customer complaints]
Gap to exploit: [Specific opportunity]

YOUR WINNING MOVE
[One specific positioning statement that exploits all 3 weaknesses at once]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  const completion = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
    tools: [{ type: "web_search_20250305", name: "web_search" }],
  });

  const report = completion.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  return NextResponse.json({ report });
}

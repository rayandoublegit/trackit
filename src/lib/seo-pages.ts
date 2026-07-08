import type { FaqItem } from "@/lib/home-faq";

export type SeoPage = {
  slug: string;
  title: string;
  description: string;
  headline: string;
  subheadline: string;
  keywords: string[];
  faqs: FaqItem[];
  sections: { heading: string; paragraphs: string[]; bullets?: string[] }[];
  relatedBlogSlugs: string[];
  ctaLabel: string;
};

export const SEO_PAGES: SeoPage[] = [
  {
    slug: "creator-affiliate-platform",
    title: "Creator Affiliate Platform — Trackit",
    description:
      "Trackit is the creator affiliate platform for Shopify brands. Discover creators, track sales, manage campaigns, and pay commissions in one dashboard.",
    headline: "The creator affiliate platform built for Shopify brands",
    subheadline:
      "Trackit replaces spreadsheets and expensive enterprise tools with discovery, outreach, Shopify tracking, and commission payouts — all in one place.",
    keywords: ["creator affiliate platform", "Trackit", "creator marketing software", "affiliate tracking"],
    faqs: [
      {
        question: "What makes Trackit a creator affiliate platform?",
        answer:
          "Trackit combines creator discovery, outreach, campaign management, Shopify sales attribution, and commission payouts — the full affiliate workflow in one product.",
      },
      {
        question: "Can I use Trackit for TikTok creators?",
        answer:
          "Yes. Trackit is optimized for TikTok creator discovery and outreach, with Shopify integration for sales tracking.",
      },
      {
        question: "How much does Trackit cost?",
        answer:
          "Trackit offers a free plan to get started. Paid Pro and Business plans unlock higher limits for growing programs. See trackit pricing at thentrack.it/pricing.",
      },
    ],
    sections: [
      {
        heading: "Everything you need in one platform",
        paragraphs: [
          "Running a creator affiliate program shouldn't require five different tools. Trackit centralizes the workflows that matter most for e-commerce brands.",
        ],
        bullets: [
          "TikTok creator discovery and saved lists",
          "AI-assisted outreach with full history",
          "Campaign and content management",
          "Shopify order sync and attribution",
          "Commission calculation and payouts",
          "Analytics and ROI reporting",
        ],
      },
      {
        heading: "Built for brands, not agencies",
        paragraphs: [
          "Trackit is designed for founders and lean teams who want professional creator programs without enterprise complexity. Start free and scale when your roster grows.",
        ],
      },
    ],
    relatedBlogSlugs: ["what-is-trackit-creator-affiliate-platform", "how-to-launch-creator-affiliate-program-trackit"],
    ctaLabel: "Start with Trackit free",
  },
  {
    slug: "tiktok-creator-marketing",
    title: "TikTok Creator Marketing — Trackit",
    description:
      "Run TikTok creator marketing with Trackit: discover creators, send outreach, track Shopify sales, and pay commissions automatically.",
    headline: "TikTok creator marketing, managed in Trackit",
    subheadline:
      "Stop scrolling TikTok for hours. Trackit finds creators in your niche, helps you reach out, and proves which posts drive revenue.",
    keywords: ["TikTok creator marketing", "Trackit TikTok", "TikTok influencer platform"],
    faqs: [
      {
        question: "How does Trackit help with TikTok creator marketing?",
        answer:
          "Trackit provides a searchable catalog of TikTok creators, outreach tools with AI drafts, campaign tracking, and Shopify revenue attribution per creator.",
      },
      {
        question: "Can I track which TikTok creators drive sales?",
        answer:
          "Yes. Each creator gets tracked affiliate links in Trackit. When they promote your brand, Shopify orders sync and attribute revenue automatically.",
      },
      {
        question: "Is Trackit only for TikTok?",
        answer:
          "Trackit is optimized for TikTok but supports outreach across Instagram and email when creator contact info is available.",
      },
    ],
    sections: [
      {
        heading: "From discovery to revenue",
        paragraphs: ["Trackit covers the full TikTok creator marketing loop:"],
        bullets: [
          "Search creators by niche, language, and engagement",
          "Save profiles to organized lists and pipelines",
          "Generate personalized outreach messages",
          "Launch campaigns with tracked links",
          "Measure sales and ROI per creator",
        ],
      },
      {
        heading: "Why brands choose Trackit for TikTok",
        paragraphs: [
          "Manual TikTok research doesn't scale. Trackit gives you a repeatable system so every hour spent on creator marketing ties back to measurable Shopify revenue.",
        ],
      },
    ],
    relatedBlogSlugs: ["tiktok-creator-outreach-guide-trackit", "ugc-campaign-management-with-trackit"],
    ctaLabel: "Find TikTok creators on Trackit",
  },
  {
    slug: "shopify-creator-tracking",
    title: "Shopify Creator Tracking — Trackit",
    description:
      "Track Shopify sales from creator affiliate links with Trackit. Automatic order sync, commission tracking, and campaign analytics.",
    headline: "Shopify creator tracking that actually works",
    subheadline:
      "Connect your Shopify store to Trackit and see exactly which creators drive revenue — with accurate commission calculations built in.",
    keywords: ["Shopify creator tracking", "Trackit Shopify", "creator sales attribution"],
    faqs: [
      {
        question: "How does Trackit track Shopify creator sales?",
        answer:
          "Trackit syncs Shopify orders and attributes them to creator affiliate links and discount codes generated in your Trackit dashboard.",
      },
      {
        question: "Do I need to manually import orders?",
        answer:
          "No. Once Shopify is connected, orders sync automatically to Trackit in real time.",
      },
      {
        question: "Can Trackit handle different commission rates per creator?",
        answer:
          "Yes. Set commission rules per campaign or creator in Trackit. The platform calculates amounts owed automatically.",
      },
    ],
    sections: [
      {
        heading: "Accurate attribution for Shopify brands",
        paragraphs: [
          "Creator marketing only works if you can measure it. Trackit connects your Shopify data to every creator link and code in your program.",
        ],
        bullets: [
          "One-click Shopify integration",
          "Unique tracked links per creator",
          "Discount code support",
          "Real-time sales dashboard",
          "Commission balances and payout tracking",
        ],
      },
      {
        heading: "Replace your tracking spreadsheet",
        paragraphs: [
          "Spreadsheets can't sync with Shopify or handle returns and overlapping codes. Trackit keeps your creator revenue data accurate as you scale.",
        ],
      },
    ],
    relatedBlogSlugs: ["track-creator-sales-shopify-with-trackit", "trackit-for-shopify-brands-guide"],
    ctaLabel: "Connect Shopify to Trackit",
  },
];

export function getSeoPage(slug: string): SeoPage | undefined {
  return SEO_PAGES.find((page) => page.slug === slug);
}

export function getAllSeoPageSlugs(): string[] {
  return SEO_PAGES.map((page) => page.slug);
}

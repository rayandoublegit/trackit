import type { Metadata } from "next";
import { getSameAsUrls, getTwitterHandle } from "@/lib/social-links";

export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://thentrack.it").replace(/\/$/, "");
export const SITE_NAME = "Trackit";
export const SITE_LEGAL_NAME = "Trackit Inc.";
export const SITE_EMAIL = "hello@thentrack.it";

export const DEFAULT_TITLE =
  "Trackit — Creator affiliate platform | Find creators, track sales, pay commissions";
export const DEFAULT_DESCRIPTION =
  "Trackit is the creator marketing platform for Shopify brands. Discover TikTok creators, run affiliate campaigns, track every sale, and pay commissions automatically — all in one dashboard.";

export const DEFAULT_KEYWORDS = [
  "Trackit",
  "Trackit app",
  "Trackit creator marketing",
  "Trackit affiliate",
  "thentrack.it",
  "creator affiliate platform",
  "TikTok creator marketing",
  "Shopify creator affiliate",
  "UGC creator management",
  "influencer affiliate tracking",
  "creator outreach software",
  "pay creator commissions",
];

export function absoluteUrl(path = "/"): string {
  if (path.startsWith("http")) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function buildOpenGraph(opts: {
  title: string;
  description: string;
  path?: string;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
}): Metadata["openGraph"] {
  return {
    type: opts.type ?? "website",
    locale: "en_US",
    alternateLocale: ["fr_FR"],
    url: absoluteUrl(opts.path ?? "/"),
    siteName: SITE_NAME,
    title: opts.title,
    description: opts.description,
    images: [
      {
        url: absoluteUrl("/images/dash.png"),
        width: 1200,
        height: 630,
        alt: "Trackit — creator affiliate dashboard",
      },
    ],
    ...(opts.publishedTime ? { publishedTime: opts.publishedTime } : {}),
    ...(opts.modifiedTime ? { modifiedTime: opts.modifiedTime } : {}),
  };
}

export function buildTwitterCard(title: string, description: string): Metadata["twitter"] {
  const handle = getTwitterHandle();
  return {
    card: "summary_large_image",
    ...(handle ? { site: handle, creator: handle } : {}),
    title,
    description,
    images: [absoluteUrl("/images/dash.png")],
  };
}

export function buildPageMetadata(opts: {
  title: string;
  description: string;
  path?: string;
  keywords?: string[];
  noIndex?: boolean;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
}): Metadata {
  const canonical = absoluteUrl(opts.path ?? "/");
  const title = opts.title.includes("Trackit") ? opts.title : `${opts.title} | Trackit`;

  return {
    title,
    description: opts.description,
    keywords: opts.keywords ?? DEFAULT_KEYWORDS,
    authors: [{ name: SITE_LEGAL_NAME, url: SITE_URL }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    metadataBase: new URL(SITE_URL),
    alternates: { canonical },
    robots: opts.noIndex
      ? { index: false, follow: false }
      : {
          index: true,
          follow: true,
          googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
        },
    openGraph: buildOpenGraph({
      title,
      description: opts.description,
      path: opts.path,
      type: opts.type,
      publishedTime: opts.publishedTime,
      modifiedTime: opts.modifiedTime,
    }),
    twitter: buildTwitterCard(title, opts.description),
  };
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    legalName: SITE_LEGAL_NAME,
    url: SITE_URL,
    logo: absoluteUrl("/favicon.png"),
    email: SITE_EMAIL,
    description: DEFAULT_DESCRIPTION,
    sameAs: getSameAsUrls(),
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: SITE_EMAIL,
      url: absoluteUrl("/contact"),
      availableLanguage: ["English", "French"],
    },
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    alternateName: ["Trackit app", "Trackit platform", "thentrack.it", "Trackit creator marketing"],
    url: SITE_URL,
    description: DEFAULT_DESCRIPTION,
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
  };
}

export function softwareApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: SITE_URL,
    description: DEFAULT_DESCRIPTION,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "Free plan available. Paid plans for growing brands.",
    },
    featureList: [
      "TikTok creator discovery",
      "Affiliate link tracking",
      "Shopify sales attribution",
      "Creator outreach",
      "Commission payouts",
      "Campaign management",
    ],
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function articleJsonLd(opts: {
  title: string;
  description: string;
  path: string;
  publishedTime: string;
  modifiedTime: string;
  wordCount?: number;
  locale?: "en" | "fr";
}) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: opts.title,
    description: opts.description,
    datePublished: opts.publishedTime,
    dateModified: opts.modifiedTime,
    wordCount: opts.wordCount,
    inLanguage: opts.locale === "fr" ? "fr-FR" : "en-US",
    author: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: { "@type": "ImageObject", url: absoluteUrl("/favicon.png") },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": absoluteUrl(opts.path) },
    image: [absoluteUrl("/images/dash.png")],
    isPartOf: { "@type": "Blog", name: `${SITE_NAME} Blog`, url: absoluteUrl("/blog") },
  };
}

export function faqJsonLd(items: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

export function itemListJsonLd(opts: { name: string; paths: { name: string; path: string }[] }) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: opts.name,
    itemListElement: opts.paths.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: absoluteUrl(item.path),
    })),
  };
}

export function webPageJsonLd(opts: { title: string; description: string; path: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: opts.title,
    description: opts.description,
    url: absoluteUrl(opts.path),
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
    about: { "@type": "SoftwareApplication", name: SITE_NAME, url: SITE_URL },
  };
}

export function buildRootMetadataVerification(): Metadata["verification"] {
  const verification: Metadata["verification"] = {};
  if (process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION) {
    verification.google = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;
  }
  if (process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION) {
    verification.other = {
      ...(verification.other ?? {}),
      "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION,
    };
  }
  return Object.keys(verification).length > 0 ? verification : undefined;
}

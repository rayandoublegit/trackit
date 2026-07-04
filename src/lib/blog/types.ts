export type BlogBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] };

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  category: string;
  locale: "en" | "fr";
  publishedAt: string;
  updatedAt: string;
  readMinutes: number;
  keywords: string[];
  relatedSlugs: string[];
  alternateSlug?: string;
  blocks: BlogBlock[];
};

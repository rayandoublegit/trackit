import Page from "@/app/invite/[token]/page";
import { buildPageMetadata } from "@/lib/site-seo";

export const metadata = buildPageMetadata({
  title: "Invitation Trackit",
  description: "Une marque vous invite sur Trackit.",
  path: "/fr/invite/[token]",
  lang: "fr",
  noIndex: true,
});

export default Page;

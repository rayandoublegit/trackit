import Page from "@/app/join/[id]/page";
import { buildPageMetadata } from "@/lib/site-seo";

export const metadata = buildPageMetadata({
  title: "Rejoindre une campagne Trackit",
  description: "Une marque vous invite à rejoindre sa campagne sur Trackit.",
  path: "/fr/join/[id]",
  lang: "fr",
  noIndex: true,
});

export default Page;

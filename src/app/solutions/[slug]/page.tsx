import { SolutionView, solutionMetadata } from "@/app/fr/solutions/SolutionsViews";
import { getAllSeoPageSlugs } from "@/lib/seo-pages";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getAllSeoPageSlugs("en").map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return solutionMetadata(slug, "en");
}

export default async function SolutionPage({ params }: Props) {
  const { slug } = await params;
  return <SolutionView slug={slug} lang="en" />;
}

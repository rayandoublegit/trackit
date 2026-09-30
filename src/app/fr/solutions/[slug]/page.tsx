import { SolutionView, solutionMetadata } from "../SolutionsViews";
import { getAllSeoPageSlugs } from "@/lib/seo-pages";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getAllSeoPageSlugs("fr").map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return solutionMetadata(slug, "fr");
}

export default async function FrenchSolutionPage({ params }: Props) {
  const { slug } = await params;
  return <SolutionView slug={slug} lang="fr" />;
}

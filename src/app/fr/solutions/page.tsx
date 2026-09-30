import { SolutionsIndexView, solutionsIndexMetadata } from "./SolutionsViews";

export const metadata = solutionsIndexMetadata("fr");

export default function FrenchSolutionsIndexPage() {
  return <SolutionsIndexView lang="fr" />;
}

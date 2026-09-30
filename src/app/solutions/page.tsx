import { SolutionsIndexView, solutionsIndexMetadata } from "@/app/fr/solutions/SolutionsViews";

export const metadata = solutionsIndexMetadata("en");

export default function SolutionsIndexPage() {
  return <SolutionsIndexView lang="en" />;
}

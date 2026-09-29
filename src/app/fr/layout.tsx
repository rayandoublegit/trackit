import { LangProvider } from "@/lib/useLang";

// Everything under /fr renders in French, server side included.
export default function FrenchLayout({ children }: { children: React.ReactNode }) {
  return <LangProvider lang="fr">{children}</LangProvider>;
}

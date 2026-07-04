import Link from "next/link";
import type { ReactNode } from "react";
import { SocialFooterLinks } from "@/components/SocialFooterLinks";

type BlogShellProps = {
  children: ReactNode;
  narrow?: boolean;
};

export function BlogShell({ children, narrow }: BlogShellProps) {
  return (
    <div className="blog-shell">
      <header className="blog-nav">
        <div className="blog-nav-inner">
          <Link href="/" className="blog-brand">
            <img src="/favicon.png" alt="" />
            <span className="blog-brand-name">Trackit</span>
          </Link>
          <nav className="blog-nav-links" aria-label="Blog navigation">
            <Link href="/about">About</Link>
            <Link href="/blog">Blog</Link>
            <Link href="/solutions">Solutions</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/auth">Get started</Link>
          </nav>
        </div>
      </header>
      <main className={narrow ? "blog-main blog-main--article" : "blog-main"}>{children}</main>
      <footer className="blog-footer">
        <div className="blog-footer-socials">
          <SocialFooterLinks />
        </div>
        © Trackit Inc. — Creator affiliate platform ·{" "}
        <Link href="/llms.txt" style={{ color: "#999" }}>
          llms.txt
        </Link>
      </footer>
    </div>
  );
}

import Link from "next/link";
import { BlogShell } from "@/components/blog/BlogShell";
import { SeoJsonLd } from "@/components/SeoJsonLd";
import { getSocialLinks } from "@/lib/social-links";
import { breadcrumbJsonLd, buildPageMetadata, organizationJsonLd, webPageJsonLd } from "@/lib/site-seo";

export const metadata = buildPageMetadata({
  title: "About Trackit — Creator affiliate platform for Shopify brands",
  description:
    "Trackit is the creator marketing platform built by e-commerce founders. Discover creators, track Shopify sales, and pay commissions — all in one dashboard.",
  path: "/about",
  keywords: ["About Trackit", "Trackit company", "Trackit platform", "thentrack.it"],
});

export default function AboutPage() {
  const socials = getSocialLinks();

  return (
    <>
      <SeoJsonLd
        data={[
          breadcrumbJsonLd([
            { name: "Trackit", path: "/" },
            { name: "About", path: "/about" },
          ]),
          organizationJsonLd(),
          webPageJsonLd({
            title: "About Trackit",
            description: "Trackit helps Shopify brands run creator affiliate programs.",
            path: "/about",
          }),
        ]}
      />
      <BlogShell narrow>
        <p className="blog-eyebrow">About Trackit</p>
        <h1 className="blog-title">Built by e-commerce founders, for e-commerce founders</h1>
        <p className="blog-lead">
          Trackit is the creator affiliate platform at thentrack.it — one workspace to discover TikTok creators,
          send outreach, attribute Shopify sales, and pay commissions without spreadsheets.
        </p>

        <div className="blog-prose">
          <h2>What is Trackit?</h2>
          <p>
            Trackit replaces the patchwork of TikTok research, DMs, Google Sheets, and manual commission math that
            most Shopify brands use to run creator programs. Everything lives in a single dashboard designed for lean
            teams — not enterprise agencies.
          </p>

          <h2>Who uses Trackit?</h2>
          <ul>
            <li>Shopify and DTC brand founders scaling creator marketing</li>
            <li>Growth teams running affiliate and UGC campaigns</li>
            <li>Brands who want Shopify-native sales attribution per creator</li>
          </ul>

          <h2>What Trackit includes</h2>
          <ul>
            <li>Creator discovery across TikTok (and more)</li>
            <li>AI-assisted outreach with full contact history</li>
            <li>Campaign management and tracked affiliate links</li>
            <li>Shopify order sync and commission tracking</li>
            <li>Creator dashboards and content uploads</li>
          </ul>

          <h2>Connect with Trackit</h2>
          <p>
            Explore our{" "}
            <Link href="/blog" style={{ color: "#0047FF" }}>
              blog
            </Link>
            ,{" "}
            <Link href="/solutions" style={{ color: "#0047FF" }}>
              solutions
            </Link>
            , or{" "}
            <Link href="/pricing" style={{ color: "#0047FF" }}>
              pricing
            </Link>
            . Questions?{" "}
            <Link href="/contact" style={{ color: "#0047FF" }}>
              Contact us
            </Link>
            .
          </p>
          {socials.length > 0 ? (
            <>
              <h3>Follow Trackit</h3>
              <ul>
                {socials.map((social) => (
                  <li key={social.id}>
                    <a href={social.href} target="_blank" rel="noopener noreferrer" style={{ color: "#0047FF" }}>
                      {social.label}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>

        <div className="blog-cta-bar">
          <p>Start your creator program on Trackit</p>
          <div className="blog-cta-actions">
            <Link href="/auth" className="blog-btn blog-btn--primary">
              Get started free
            </Link>
          </div>
        </div>
      </BlogShell>
    </>
  );
}

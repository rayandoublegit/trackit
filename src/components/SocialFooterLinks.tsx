"use client";

import { getSocialLinks, type SocialLink } from "@/lib/social-links";

function SocialIcon({ id }: { id: SocialLink["id"] }) {
  if (id === "youtube") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M23.5 6.2c-.3-1.2-1.2-2.1-2.4-2.4C19.3 3.5 12 3.5 12 3.5s-7.3 0-9.1.3C1.7 4.1.8 5 .5 6.2.2 8 0 12 0 12s.2 4 .5 5.8c.3 1.2 1.2 2.1 2.4 2.4 1.8.3 9.1.3 9.1.3s7.3 0 9.1-.3c1.2-.3 2.1-1.2 2.4-2.4.3-1.8.5-5.8.5-5.8s-.2-4-.5-5.8zM9.6 15.5V8.5l6.1 3.5-6.1 3.5z" />
      </svg>
    );
  }
  if (id === "tiktok") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.77 1.52V6.76a4.85 4.85 0 0 1-1-.07z" />
      </svg>
    );
  }
  if (id === "linkedin") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M20.45 20.45h-3.55v-5.6c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.95v5.69H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.35-1.85 3.58 0 4.24 2.36 4.24 5.43v6.31zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function SocialFooterLinks() {
  const links = getSocialLinks();
  return (
    <>
      {links.map((social) => (
        <a
          key={social.id}
          href={social.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={social.label}
        >
          <SocialIcon id={social.id} />
        </a>
      ))}
    </>
  );
}

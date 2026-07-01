import type { NextConfig } from "next";
import { buildClientStripeEnv } from "./src/lib/stripe-config";

const nextConfig: NextConfig = {
  experimental: {
    optimizeCss: false,
  },
  // Mirror STRIPE_* server vars to NEXT_PUBLIC_* so client checkout (onboarding, pricing) works.
  env: buildClientStripeEnv(),
  async headers() {
    // CSP is Report-Only for now: it logs violations without blocking, so we can
    // tune it against Stripe/analytics before enforcing. Switch the header name to
    // "Content-Security-Policy" (drop -Report-Only) once the console is clean.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://*.stripe.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://*.supabase.co https://api.stripe.com https://api.anthropic.com https://*.stripe.com wss://*.supabase.co",
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://*.stripe.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy-Report-Only", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;

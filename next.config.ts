import type { NextConfig } from "next";
import { buildClientStripeEnv } from "./src/lib/stripe-config";

const nextConfig: NextConfig = {
  experimental: {
    optimizeCss: false,
  },
  // Mirror STRIPE_* server vars to NEXT_PUBLIC_* so client checkout (onboarding, pricing) works.
  env: buildClientStripeEnv(),
};

export default nextConfig;

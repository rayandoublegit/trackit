/** Build a short Stripe promo code from a creator handle, e.g. LEA15. */
export function buildStripePromoCodeBase(handle: string, percentOff: number): string {
  const base =
    handle
      .replace(/^@+/, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 8) || "CREATOR";
  const pct = Math.round(Number(percentOff) || 15);
  return `${base}${pct}`;
}

/** Next candidate when a code is already taken: CODE, CODE2, CODE3, … */
export function stripePromoCodeCandidate(base: string, attempt: number): string {
  const clean = base.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20) || "CREATOR15";
  if (attempt <= 0) return clean;
  const suffix = String(attempt + 1);
  return `${clean.slice(0, Math.max(1, 40 - suffix.length))}${suffix}`;
}

export function parseTrackitClientReferenceId(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const match = /^trackit_([0-9a-f-]{36})$/i.exec(ref.trim());
  return match?.[1] ?? null;
}

export function formatCompactNumber(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n);
  if (rounded === 0) return "0";
  if (Math.abs(rounded) >= 1_000_000) {
    const v = rounded / 1_000_000;
    const s = Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, "");
    return `${s}M`;
  }
  if (Math.abs(rounded) >= 1_000) {
    const v = rounded / 1_000;
    const s = Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, "");
    return `${s}K`;
  }
  return String(rounded);
}

import type { DisplayCurrency } from "@/lib/locale-preferences";

export function formatCompactCurrency(n: number, currency: DisplayCurrency): string {
  if (!Number.isFinite(n)) return currency === "EUR" ? "0 €" : "$0";
  if (Math.abs(n) >= 1_000) {
    const compact = formatCompactNumber(n);
    return currency === "EUR" ? `${compact} €` : `$${compact}`;
  }
  if (currency === "EUR") {
    return `${Math.round(n).toLocaleString("fr-FR")} €`;
  }
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

export function compactNumberToInput(n: number): string {
  return formatCompactNumber(n);
}

export function getCompactNumberInputError(raw: string, lang: "en" | "fr"): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const lettersOnly = trimmed.replace(/[\d.,\s]/g, "");
  if (lettersOnly.length > 0 && !/^[kKmM]+$/.test(lettersOnly)) {
    return lang === "fr"
      ? "Seules les lettres K et M sont autorisées."
      : "Only K and M letters are allowed.";
  }

  if (/[kKmM].*[kKmM]/i.test(trimmed)) {
    return lang === "fr"
      ? "Format invalide. Utilisez K (milliers) ou M (millions), pas les deux."
      : "Invalid format. Use K (thousands) or M (millions), not both.";
  }

  const normalized = trimmed.replace(/\s/g, "").replace(",", ".");
  if (!/^(\d+(?:\.\d+)?[kKmM]?|[kKmM])$/.test(normalized)) {
    return lang === "fr"
      ? "Format invalide. Exemples : 12K, 11M, 500."
      : "Invalid format. Examples: 12K, 11M, 500.";
  }

  return null;
}

export function parseCompactNumber(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;

  const normalized = trimmed.replace(/\s/g, "").replace(",", ".");
  if (/^[kK]$/.test(normalized)) return 1_000;
  if (/^[mM]$/.test(normalized)) return 1_000_000;

  const match = normalized.match(/^(\d+(?:\.\d+)?)([kKmM])?$/);
  if (!match) return NaN;

  const base = parseFloat(match[1]);
  if (!Number.isFinite(base)) return NaN;

  const suffix = (match[2] || "").toUpperCase();
  if (suffix === "K") return Math.round(base * 1_000);
  if (suffix === "M") return Math.round(base * 1_000_000);
  return Math.round(base);
}

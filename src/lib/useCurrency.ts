export type DisplayCurrency = "USD" | "EUR";

export function formatCurrency(amount: number | string, lang: "en" | "fr"): string {
  const currency: DisplayCurrency = lang === "fr" ? "EUR" : "USD";
  return formatCurrencyWithCode(amount, currency);
}

export function formatCurrencyWithCode(amount: number | string, currency: DisplayCurrency): string {
  const num = typeof amount === "string" ? parseFloat(amount.replace(/[$€,]/g, "")) : amount;
  if (isNaN(num)) return String(amount);
  const locale = currency === "EUR" ? "fr-FR" : "en-US";
  return num.toLocaleString(locale, { style: "currency", currency, maximumFractionDigits: 0 });
}

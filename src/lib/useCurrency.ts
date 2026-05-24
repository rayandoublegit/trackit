export function formatCurrency(amount: number | string, lang: "en" | "fr"): string {
  const num = typeof amount === "string" ? parseFloat(amount.replace(/[$€,]/g, "")) : amount;
  if (isNaN(num)) return String(amount);
  if (lang === "fr") {
    return num.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  }
  return num.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

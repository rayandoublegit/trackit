export function generateDiscountCode(username: string): string {
  const clean = username.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8);
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${clean}${suffix}`;
}

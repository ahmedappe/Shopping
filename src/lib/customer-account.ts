/**
 * Customers have a separate account at each outlet, so one outlet never sees
 * another's customers. Supabase wants one email per account, so the sign-in
 * address is the customer's email with the outlet added after a "+"
 * (name+north-jugo@gmail.com). Mail to that address still reaches the same inbox
 * on Gmail, Outlook and iCloud, so confirmation emails keep working.
 */
export function accountEmail(email: string, outletSlug: string | null | undefined) {
  const clean = email.trim().toLowerCase();
  if (!outletSlug) return clean;
  const at = clean.lastIndexOf("@");
  if (at < 1) return clean;
  return `${clean.slice(0, at)}+${outletSlug}${clean.slice(at)}`;
}

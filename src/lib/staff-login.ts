/**
 * Staff sign in with company + username + password. Supabase Auth wants an email,
 * so each staff login is stored under a generated address that never receives mail.
 */
export function staffEmail(username: string, companySlug: string) {
  return `${username.trim().toLowerCase()}.${companySlug.trim().toLowerCase()}@staff.local`;
}

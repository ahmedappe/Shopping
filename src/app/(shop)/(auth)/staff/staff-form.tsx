"use client";

import { useActionState } from "react";
import { signInStaff, type AuthState } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import type { Company } from "@/lib/types";

export function StaffLoginForm({ next, companies }: { next: string; companies: Company[] }) {
  const [state, action] = useActionState<AuthState, FormData>(signInStaff, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next.startsWith("/admin") ? next : "/admin"} />
      <div>
        <label htmlFor="companySlug" className="label">
          Company name
        </label>
        <select id="companySlug" name="companySlug" required className="input" defaultValue={state?.values?.companySlug ?? ""}>
          <option value="" disabled>
            Choose your company
          </option>
          {companies.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="username" className="label">
          Username
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          required
          className="input"
          defaultValue={state?.values?.username}
        />
      </div>
      <div>
        <label htmlFor="staff-password" className="label">
          Password
        </label>
        <input id="staff-password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <SubmitButton className="btn-primary w-full py-3" pendingText="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}


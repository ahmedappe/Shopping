"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signIn, signInStaff, type AuthState } from "../actions";
import { SubmitButton } from "@/components/submit-button";
import { cn } from "@/lib/utils";
import type { Company } from "@/lib/types";

export function LoginForm({ next, companies }: { next: string; companies: Company[] }) {
  // Staff sign in with company + username; customers (and admins) with email.
  const [mode, setMode] = useState<"staff" | "email">(next.startsWith("/admin") && companies.length ? "staff" : "email");
  const showTabs = companies.length > 0;

  return (
    <div className="mt-8">
      {showTabs && (
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 p-1 text-sm font-medium">
          {(
            [
              ["email", "Customer / email"],
              ["staff", "Staff login"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={cn("rounded-md py-2", mode === value ? "bg-white shadow-sm" : "text-zinc-600")}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {mode === "staff" ? <StaffForm next={next} companies={companies} /> : <EmailForm next={next} />}
    </div>
  );
}

function StaffForm({ next, companies }: { next: string; companies: Company[] }) {
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

function EmailForm({ next }: { next: string }) {
  const [state, action] = useActionState<AuthState, FormData>(signIn, null);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="email" className="label">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="input"
          defaultValue={state?.values?.email}
        />
      </div>
      <div>
        <label htmlFor="password" className="label">
          Password
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <SubmitButton className="btn-primary w-full py-3" pendingText="Signing in…">
        Sign in
      </SubmitButton>
      <p className="text-center text-sm text-zinc-600">
        New here?{" "}
        <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-medium text-brand-700 hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}

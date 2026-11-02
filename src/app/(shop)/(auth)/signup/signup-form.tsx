"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp, type AuthState } from "../actions";
import { SubmitButton } from "@/components/submit-button";

export function SignupForm({ next }: { next: string }) {
  const [state, action] = useActionState<AuthState, FormData>(signUp, null);

  if (state?.message) {
    return (
      <div className="mt-8 rounded-xl bg-green-50 p-5 text-sm text-green-900 ring-1 ring-green-200">
        {state.message}
      </div>
    );
  }

  return (
    <form action={action} className="mt-8 space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="fullName" className="label">
          Full name
        </label>
        <input
          id="fullName"
          name="fullName"
          autoComplete="name"
          required
          maxLength={120}
          className="input"
          defaultValue={state?.values?.fullName}
        />
      </div>
      <div>
        <label htmlFor="phone" className="label">
          Phone
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          required
          className="input"
          defaultValue={state?.values?.phone}
        />
      </div>
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
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={72}
          className="input"
        />
        <p className="mt-1 text-xs text-zinc-500">At least 8 characters, with a letter and a number.</p>
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <SubmitButton className="btn-primary w-full py-3" pendingText="Creating account…">
        Create account
      </SubmitButton>
      <p className="text-center text-sm text-zinc-600">
        Already have an account?{" "}
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-medium text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

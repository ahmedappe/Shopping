"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn, type AuthState } from "../actions";
import { SubmitButton } from "@/components/submit-button";

export function LoginForm({ next }: { next: string }) {
  return <div className="mt-8"><EmailForm next={next} /></div>;
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

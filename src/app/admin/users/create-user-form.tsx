"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, Loader2, UserPlus } from "lucide-react";
import { createUser } from "./actions";
import { ROLE_HELP } from "./role-badge";

type Role = keyof typeof ROLE_HELP;

export function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(12));
  let p = Array.from(bytes, (b) => chars[b % chars.length]).join("");
  // guarantee a letter and a number
  p = p.slice(0, 10) + "a" + String(bytes[0] % 10);
  return p;
}

export function CreateUserForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [role, setRole] = useState<Role>("staff");
  const [password, setPassword] = useState("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const input = {
      fullName: String(fd.get("fullName") ?? ""),
      email: String(fd.get("email") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      password,
      role,
    };
    startTransition(async () => {
      const res = await createUser(input);
      if (!res.ok) return setError(res.error);
      setCreated({ id: res.userId, email: input.email, password });
      form.reset();
      setPassword("");
      router.refresh();
    });
  }

  if (created) {
    return (
      <div className="mt-4 rounded-xl bg-green-50 p-4 text-sm text-green-900 ring-1 ring-green-200">
        <p className="font-semibold">User created. They can sign in now with:</p>
        <p className="mt-2">
          Email: <strong>{created.email}</strong>
          <br />
          Password: <code className="rounded bg-white px-1.5 py-0.5 font-semibold">{created.password}</code>
          <button
            type="button"
            className="ml-2 inline-flex items-center gap-1 text-xs underline"
            onClick={async () => {
              await navigator.clipboard.writeText(`${created.email}\n${created.password}`).catch(() => {});
              setCopied(true);
            }}
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />} Copy
          </button>
        </p>
        <p className="mt-2 text-xs">Share the password privately. It won&apos;t be shown again.</p>
        <div className="mt-3 flex gap-2">
          <button type="button" className="btn-outline py-2" onClick={() => setCreated(null)}>
            Add another
          </button>
          <Link href={`/admin/users/${created.id}`} className="btn-ghost py-2">
            View user
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="u-name" className="label">
          Full name
        </label>
        <input id="u-name" name="fullName" required maxLength={120} className="input" autoComplete="off" />
      </div>
      <div>
        <label htmlFor="u-email" className="label">
          Email (used to sign in)
        </label>
        <input id="u-email" name="email" type="email" required className="input" autoComplete="off" />
      </div>
      <div>
        <label htmlFor="u-phone" className="label">
          Phone <span className="font-normal text-zinc-400">(optional)</span>
        </label>
        <input id="u-phone" name="phone" type="tel" className="input" autoComplete="off" />
      </div>
      <div>
        <label htmlFor="u-password" className="label">
          Password
        </label>
        <div className="flex gap-2">
          <input
            id="u-password"
            type="text"
            required
            minLength={8}
            maxLength={72}
            className="input font-mono"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <button type="button" className="btn-outline shrink-0 px-3" onClick={() => setPassword(generatePassword())}>
            <KeyRound className="size-4" /> Generate
          </button>
        </div>
      </div>
      <fieldset className="sm:col-span-2">
        <legend className="label">Access</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(ROLE_HELP) as Role[]).map((r) => (
            <label
              key={r}
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${role === r ? "border-zinc-900 bg-zinc-50" : "border-zinc-200"}`}
            >
              <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="mt-0.5 accent-brand-600" />
              <span>
                <span className="font-semibold capitalize">{r}</span>
                <span className="block text-xs text-zinc-500">{ROLE_HELP[r]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" className="btn-primary" disabled={isPending}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
          Create user
        </button>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}

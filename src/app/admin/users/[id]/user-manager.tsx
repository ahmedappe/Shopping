"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, KeyRound, Loader2, Save, ShieldCheck } from "lucide-react";
import { resetUserPassword, setUserDisabled, updateUser } from "../actions";
import { ROLE_HELP } from "../role-badge";
import { generatePassword } from "../create-user-form";

type Role = keyof typeof ROLE_HELP;
type Msg = { ok: boolean; text: string } | null;

export function UserManager({
  user,
  isMe,
  hasKey,
}: {
  user: { id: string; fullName: string; phone: string; role: Role; disabled: boolean };
  isMe: boolean;
  hasKey: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"profile" | "password" | "disable" | null>(null);

  const [fullName, setFullName] = useState(user.fullName);
  const [phone, setPhone] = useState(user.phone);
  const [role, setRole] = useState<Role>(user.role);
  const [profileMsg, setProfileMsg] = useState<Msg>(null);

  const [password, setPassword] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<Msg>(null);
  const [disableMsg, setDisableMsg] = useState<Msg>(null);

  const run = (key: typeof busy, fn: () => Promise<void>) => {
    setBusy(key);
    startTransition(async () => {
      await fn();
      setBusy(null);
      router.refresh();
    });
  };

  return (
    <div className="mt-6 space-y-6">
      <form
        className="card p-5"
        onSubmit={(e) => {
          e.preventDefault();
          setProfileMsg(null);
          run("profile", async () => {
            const res = await updateUser({ userId: user.id, fullName, phone, role });
            setProfileMsg(res.ok ? { ok: true, text: res.message ?? "Saved." } : { ok: false, text: res.error });
          });
        }}
      >
        <h2 className="font-semibold">Details & access</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="m-name" className="label">
              Full name
            </label>
            <input id="m-name" className="input" required maxLength={120} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="m-phone" className="label">
              Phone
            </label>
            <input id="m-phone" type="tel" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <fieldset className="mt-4" disabled={isMe}>
          <legend className="label">Access</legend>
          {isMe && <p className="mb-2 text-xs text-zinc-500">You can&apos;t change your own role. Ask another admin.</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(ROLE_HELP) as Role[]).map((r) => (
              <label
                key={r}
                className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${role === r ? "border-zinc-900 bg-zinc-50" : "border-zinc-200"} ${isMe ? "opacity-60" : ""}`}
              >
                <input type="radio" name="role" checked={role === r} onChange={() => setRole(r)} className="mt-0.5 accent-brand-600" />
                <span>
                  <span className="font-semibold capitalize">{r}</span>
                  <span className="block text-xs text-zinc-500">{ROLE_HELP[r]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-4 flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={isPending}>
            {busy === "profile" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save changes
          </button>
          {profileMsg && <p className={`text-sm ${profileMsg.ok ? "text-green-700" : "text-red-600"}`}>{profileMsg.text}</p>}
        </div>
      </form>

      <form
        className="card p-5"
        onSubmit={(e) => {
          e.preventDefault();
          setPasswordMsg(null);
          run("password", async () => {
            const res = await resetUserPassword({ userId: user.id, password });
            setPasswordMsg(res.ok ? { ok: true, text: res.message ?? "Password changed." } : { ok: false, text: res.error });
            if (res.ok) setPassword("");
          });
        }}
      >
        <h2 className="font-semibold">Set a new password</h2>
        <p className="mt-1 text-xs text-zinc-500">The user will need to sign in again with the new password.</p>
        <div className="mt-3 flex max-w-md gap-2">
          <input
            type="text"
            required
            minLength={8}
            maxLength={72}
            className="input font-mono"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            aria-label="New password"
            autoComplete="new-password"
            disabled={!hasKey}
          />
          <button type="button" className="btn-outline shrink-0 px-3" onClick={() => setPassword(generatePassword())} disabled={!hasKey}>
            Generate
          </button>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button type="submit" className="btn-outline" disabled={isPending || !hasKey}>
            {busy === "password" ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
            Change password
          </button>
          {passwordMsg && <p className={`text-sm ${passwordMsg.ok ? "text-green-700" : "text-red-600"}`}>{passwordMsg.text}</p>}
        </div>
        {!hasKey && <p className="mt-2 text-xs text-amber-700">Needs SUPABASE_SERVICE_ROLE_KEY in Vercel.</p>}
      </form>

      {!isMe && (
        <section className={`rounded-xl border p-5 ${user.disabled ? "border-green-200" : "border-red-200"}`}>
          <h2 className={`font-semibold ${user.disabled ? "text-green-800" : "text-red-700"}`}>
            {user.disabled ? "Account disabled" : "Disable account"}
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            {user.disabled
              ? "This person can't sign in. Enable the account to restore access."
              : "Stops this person from signing in. Their orders and history are kept, and you can enable the account again later."}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              className={user.disabled ? "btn-brand" : "btn-danger"}
              disabled={isPending || !hasKey}
              onClick={() => {
                if (!user.disabled && !window.confirm("Disable this account? They won't be able to sign in.")) return;
                setDisableMsg(null);
                run("disable", async () => {
                  const res = await setUserDisabled(user.id, !user.disabled);
                  setDisableMsg(res.ok ? { ok: true, text: res.message ?? "Done." } : { ok: false, text: res.error });
                });
              }}
            >
              {busy === "disable" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : user.disabled ? (
                <ShieldCheck className="size-4" />
              ) : (
                <Ban className="size-4" />
              )}
              {user.disabled ? "Enable account" : "Disable account"}
            </button>
            {disableMsg && <p className={`text-sm ${disableMsg.ok ? "text-green-700" : "text-red-600"}`}>{disableMsg.text}</p>}
          </div>
        </section>
      )}
    </div>
  );
}

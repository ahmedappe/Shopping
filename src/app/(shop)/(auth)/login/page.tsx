import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { safeRedirectPath } from "@/lib/utils";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const nextPath = safeRedirectPath(next, "/");
  if (await getSessionUser()) redirect(nextPath);

  return (
    <div className="container-page flex justify-center py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm text-zinc-500">Sign in to check out and track your orders.</p>
        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
            That link is invalid or has expired. Please try again.
          </p>
        )}
        <LoginForm next={nextPath} />
      </div>
    </div>
  );
}

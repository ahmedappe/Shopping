import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="text-center">
        <p className="text-sm font-semibold text-brand-700">404</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Page not found</h1>
        <p className="mt-2 text-zinc-600">The page you&apos;re looking for doesn&apos;t exist or was moved.</p>
        <Link href="/" className="btn-primary mt-6">
          Back to the store
        </Link>
      </div>
    </div>
  );
}

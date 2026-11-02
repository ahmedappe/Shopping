export default function Loading() {
  return (
    <div className="container-page py-10" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-48 animate-pulse rounded bg-zinc-100" />
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i}>
            <div className="aspect-[4/5] animate-pulse rounded-xl bg-zinc-100" />
            <div className="mt-3 h-4 w-3/4 animate-pulse rounded bg-zinc-100" />
            <div className="mt-2 h-4 w-1/3 animate-pulse rounded bg-zinc-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

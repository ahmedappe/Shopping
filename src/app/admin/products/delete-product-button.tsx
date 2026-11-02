"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { deleteProduct } from "./actions";

export function DeleteProductButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-4 flex items-center gap-3">
      <button
        type="button"
        className="btn-danger"
        disabled={isPending}
        onClick={() => {
          if (!window.confirm(`Permanently delete "${name}"?`)) return;
          startTransition(async () => {
            const res = await deleteProduct(id);
            if (!res.ok) return setError(res.error);
            router.push("/admin/products");
          });
        }}
      >
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        Delete product
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

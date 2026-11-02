"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import { slugify } from "@/lib/utils";
import type { ActionResult, Category } from "@/lib/types";
import { deleteCategory, saveCategory } from "./actions";

export function CategoryForm({ category }: { category?: Category }) {
  const [state, action] = useActionState<ActionResult | null, FormData>(saveCategory, null);
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(category));
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && !category) {
      formRef.current?.reset();
      setSlug("");
      setSlugTouched(false);
    }
  }, [state, category]);

  return (
    <form ref={formRef} action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
      {category && <input type="hidden" name="id" value={category.id} />}
      <div>
        <label className="label" htmlFor={`name-${category?.id ?? "new"}`}>
          Name
        </label>
        <input
          id={`name-${category?.id ?? "new"}`}
          name="name"
          required
          maxLength={80}
          defaultValue={category?.name}
          className="input"
          onChange={(e) => !slugTouched && setSlug(slugify(e.target.value))}
        />
      </div>
      <div>
        <label className="label" htmlFor={`slug-${category?.id ?? "new"}`}>
          Slug (URL)
        </label>
        <input
          id={`slug-${category?.id ?? "new"}`}
          name="slug"
          required
          maxLength={80}
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value.toLowerCase());
          }}
          className="input"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`desc-${category?.id ?? "new"}`}>
          Description
        </label>
        <input
          id={`desc-${category?.id ?? "new"}`}
          name="description"
          maxLength={500}
          defaultValue={category?.description ?? ""}
          className="input"
        />
      </div>
      <div>
        <label className="label" htmlFor={`sort-${category?.id ?? "new"}`}>
          Sort order
        </label>
        <input
          id={`sort-${category?.id ?? "new"}`}
          name="sortOrder"
          type="number"
          min={0}
          defaultValue={category?.sort_order ?? 0}
          className="input"
        />
      </div>
      <div className="flex items-end gap-3">
        <SubmitButton pendingText="Saving…">{category ? "Save" : "Add category"}</SubmitButton>
        {state && <p className={`text-sm ${state.ok ? "text-green-700" : "text-red-600"}`}>{state.ok ? state.message : state.error}</p>}
      </div>
    </form>
  );
}

export function DeleteCategoryButton({ id, name }: { id: string; name: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      {error && <span className="text-sm text-red-600">{error}</span>}
      <button
        type="button"
        className="btn-ghost text-red-600"
        disabled={isPending}
        onClick={() => {
          if (!window.confirm(`Delete "${name}"? Products in it will become uncategorised.`)) return;
          startTransition(async () => {
            const res = await deleteCategory(id);
            if (!res.ok) setError(res.error);
          });
        }}
      >
        <Trash2 className="size-4" /> Delete
      </button>
    </div>
  );
}

"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { OUTLET_COOKIE } from "@/lib/outlet";

/** Used by the outlet switcher on domains that aren't tied to one outlet. */
export async function switchOutlet(slug: string) {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return;
  const jar = await cookies();
  jar.set(OUTLET_COOKIE, slug, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}

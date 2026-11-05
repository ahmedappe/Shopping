"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

export async function sendTableRequest(token: string, kind: "bell" | "waiter" | "bill"): Promise<ActionResult> {
  const p = z.object({ token: z.string().regex(/^[a-f0-9]{32}$/), kind: z.enum(["bell", "waiter", "bill"]) }).safeParse({ token, kind });
  if (!p.success) return { ok: false, error: "Something went wrong." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("public_table_request", { p_token: p.data.token, p_kind: p.data.kind });
  if (error) return { ok: false, error: "Could not send. Please call our staff." };
  return { ok: true };
}

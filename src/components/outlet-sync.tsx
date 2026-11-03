"use client";

import { useEffect } from "react";
import { useCart } from "@/store/cart";

/** Keeps the saved cart tied to the outlet being shopped at (clears it if the outlet changed). */
export function OutletSync({ outletId }: { outletId: string }) {
  const setOutlet = useCart((s) => s.setOutlet);
  useEffect(() => {
    setOutlet(outletId);
  }, [outletId, setOutlet]);
  return null;
}

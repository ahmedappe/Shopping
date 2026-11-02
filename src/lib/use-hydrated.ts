"use client";

import { useEffect, useState } from "react";

/** True after the first client render — avoids hydration mismatches with localStorage state. */
export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

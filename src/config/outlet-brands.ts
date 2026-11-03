/**
 * Each outlet shows as its own business: its own name, and its own logo if it has one.
 * Add a logo by putting the file in /public/outlets and listing it here by outlet slug.
 */
export const OUTLET_LOGOS: Record<string, string> = {
  "maaloodhu-cafe": "/outlets/maaloodhu-cafe.svg",
  "musammaa-cafe": "/outlets/musammaa-cafe.svg",
};

/** Browser-tab icon per outlet (square PNG). Outlets without one use the default icon. */
export const OUTLET_ICONS: Record<string, string> = {
  "maaloodhu-cafe": "/outlets/maaloodhu-cafe-icon.png",
  "musammaa-cafe": "/outlets/musammaa-cafe-icon.png",
};

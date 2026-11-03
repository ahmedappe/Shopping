import { NextResponse, type NextRequest } from "next/server";
import { OUTLET_COOKIE, getOutlets } from "@/lib/outlet";

/** Share link for one outlet, e.g. /o/north-jugo — opens the store set to that outlet. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const outlets = await getOutlets();
  const outlet = outlets.find((o) => o.slug === slug);
  const res = NextResponse.redirect(new URL("/", request.url));
  if (outlet) {
    res.cookies.set(OUTLET_COOKIE, outlet.slug, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  return res;
}

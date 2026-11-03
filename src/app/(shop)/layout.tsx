import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { OutletSync } from "@/components/outlet-sync";
import { getCurrentOutlet } from "@/lib/outlet";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const { outlet } = await getCurrentOutlet();
  return (
    <div className="flex min-h-dvh flex-col">
      {outlet && <OutletSync outletId={outlet.id} />}
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

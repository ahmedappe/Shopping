import type { Metadata } from "next";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAdminOutlets } from "@/lib/admin-outlets";
import { OutletFilter } from "@/components/admin/outlet-filter";
import { ReportView, type Report } from "./report-view";

export const metadata: Metadata = { title: "Sales reports" };

const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Today's date in the Maldives, whatever the server's clock zone is. */
const today = () => iso(new Date(Date.now() + 5 * 3600_000));

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ outlet?: string; from?: string; to?: string }> }) {
  const user = await requireManager();
  const outlets = await getAdminOutlets(user);
  const sp = await searchParams;
  const outlet = outlets.find((o) => o.slug === sp.outlet) ?? outlets[0];
  if (!outlet) return <p className="text-zinc-500">You are not assigned to any outlet yet.</p>;

  const ok = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const to = ok(sp.to) ?? today();
  const from = ok(sp.from) ?? to;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sales_report", { p_outlet: outlet.id, p_from: from, p_to: to });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Sales reports</h1>
        <p className="text-sm text-zinc-500">Closed POS orders for {outlet.name}, by Maldives date.</p>
      </div>
      <OutletFilter outlets={outlets} selectedSlug={outlet.slug} basePath="/admin/reports" allLabel="" params={{ from, to }} />
      <form className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="outlet" value={outlet.slug} />
        <label><span className="label">From</span><input className="input" type="date" name="from" defaultValue={from} /></label>
        <label><span className="label">To</span><input className="input" type="date" name="to" defaultValue={to} /></label>
        <button className="btn-primary">Show</button>
      </form>
      {error || !data ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Could not load the report. Choose a range of up to one year.</p>
      ) : (
        <ReportView key={`${outlet.id}${from}${to}`} outletName={outlet.name} from={from} to={to} report={data as unknown as Report} />
      )}
    </div>
  );
}

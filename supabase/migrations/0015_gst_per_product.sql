-- =====================================================================
-- 0015: GST — tourism or general sector per outlet, taxable or 0% per product
--   * outlets.gst_sector: 'general' (taxable items 8%) or 'tourism' (taxable items 17%)
--   * products.gst_taxable: false = 0% (exempt), true = the outlet's rate
--   * pos_order_items.gst_pct: the rate actually applied is frozen on each sale line
--   * product_set_gst(), category_set_gst(), outlet_set_sector()
--   * sales_report(): GST worked out per item, with a breakdown by rate
-- Needs 0014 first. Safe to run more than once. Prices are treated as GST-inclusive.
-- =====================================================================

do $$
begin
  if to_regclass('public.customer_ledger') is null then
    raise exception 'Run 0014_phase3a_credit_reports.sql first.';
  end if;
end $$;

alter table public.outlets add column if not exists gst_sector text not null default 'general' check (gst_sector in ('general', 'tourism'));
alter table public.products add column if not exists gst_taxable boolean not null default true;
do $$
begin
  -- an earlier draft of this migration stored a rate per product; keep its meaning (0 = exempt)
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name = 'gst_pct') then
    execute 'update public.products set gst_taxable = (coalesce(gst_pct, 1) <> 0)';
    execute 'alter table public.products drop column gst_pct';
  end if;
end $$;

-- The tax rate for each sector. Change the numbers here if the law changes.
create or replace function public.gst_rate_for(p_sector text) returns numeric language sql immutable set search_path = '' as $$
  select case p_sector when 'tourism' then 17::numeric else 8::numeric end;
$$;
alter table public.pos_order_items add column if not exists gst_pct numeric(5,2);

create or replace function public.pos_item_set_gst() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.gst_pct is null then
    select case when coalesce(p.gst_taxable, true) then public.gst_rate_for(o.gst_sector) else 0 end into new.gst_pct
      from public.pos_orders po
      join public.outlets o on o.id = po.outlet_id
      left join public.product_variants v on v.id = new.variant_id
      left join public.products p on p.id = v.product_id
     where po.id = new.order_id;
  end if;
  return new;
end $$;
drop trigger if exists pos_order_items_gst on public.pos_order_items;
create trigger pos_order_items_gst before insert on public.pos_order_items for each row execute function public.pos_item_set_gst();

drop function if exists public.product_set_gst(uuid, numeric);
drop function if exists public.category_set_gst(uuid, numeric);

create or replace function public.product_set_gst(p_product uuid, p_taxable boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_edit_catalog() then raise exception 'FORBIDDEN'; end if;
  if p_taxable is null then raise exception 'BAD_AMOUNT'; end if;
  update public.products set gst_taxable = p_taxable where id = p_product;
end $$;

create or replace function public.category_set_gst(p_category uuid, p_taxable boolean)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.can_manage_store() then raise exception 'FORBIDDEN'; end if;
  if p_taxable is null then raise exception 'BAD_AMOUNT'; end if;
  update public.products set gst_taxable = p_taxable where category_id = p_category;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.outlet_set_sector(p_outlet uuid, p_sector text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_sector not in ('general', 'tourism') then raise exception 'BAD_AMOUNT'; end if;
  update public.outlets set gst_sector = p_sector, gst_pct = public.gst_rate_for(p_sector) where id = p_outlet;
end $$;
update public.outlets set gst_pct = public.gst_rate_for(gst_sector);

create or replace function public.sales_report(p_outlet uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_from timestamptz; v_to timestamptz; v_gst numeric; r jsonb;
begin
  if not public.can_manage_store() or not public.can_access_outlet(p_outlet) then raise exception 'FORBIDDEN'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then raise exception 'BAD_RANGE'; end if;
  v_from := (p_from::text || ' 00:00')::timestamp at time zone 'Indian/Maldives';
  v_to   := ((p_to + 1)::text || ' 00:00')::timestamp at time zone 'Indian/Maldives';
  select public.gst_rate_for(gst_sector) into v_gst from public.outlets where id = p_outlet;

  with o as (
    select * from public.pos_orders where outlet_id = p_outlet and status = 'closed' and closed_at >= v_from and closed_at < v_to
  ), lines as (
    -- each item's share of the order total (discount and service charge spread pro rata), taxed at its own rate
    select i.quantity * i.unit_price * (case when o.subtotal > 0 then o.total / o.subtotal else 1 end) as gross,
           coalesce(i.gst_pct, case when coalesce(pr.gst_taxable, true) then v_gst else 0 end) as rt
      from public.pos_order_items i join o on o.id = i.order_id
      left join public.product_variants pv on pv.id = i.variant_id
      left join public.products pr on pr.id = pv.product_id
     where i.status <> 'void'
  ), pay as (
    select p.method, p.currency, sum(p.amount) as amount
      from public.pos_payments p join o on o.id = p.order_id group by p.method, p.currency
  )
  select jsonb_build_object(
    'orders',        (select count(*) from o),
    'subtotal',      (select coalesce(sum(subtotal), 0) from o),
    'discount',      (select coalesce(sum(discount), 0) from o),
    'service_charge',(select coalesce(sum(service_charge), 0) from o),
    'total',         (select coalesce(sum(total), 0) from o),
    'change_given',  (select coalesce(sum(change_given), 0) from o),
    'gst_pct',       v_gst,
    'gst',           (select coalesce(round(sum(gross * rt / (100 + rt)), 2), 0) from lines),
    'gst_by_rate',   coalesce((select jsonb_agg(jsonb_build_object('rate', rt, 'gross', g, 'gst', t) order by rt)
                        from (select rt, round(sum(gross), 2) g, round(sum(gross * rt / (100 + rt)), 2) t from lines group by rt) x), '[]'::jsonb),
    'cancelled',     (select count(*) from public.pos_orders where outlet_id = p_outlet and status = 'cancelled' and opened_at >= v_from and opened_at < v_to),
    'voided_items',  (select count(*) from public.pos_order_items i join public.pos_orders x on x.id = i.order_id
                       where x.outlet_id = p_outlet and i.status = 'void' and x.opened_at >= v_from and x.opened_at < v_to),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'orders', n, 'total', t) order by d)
                  from (select (closed_at at time zone 'Indian/Maldives')::date as d, count(*) n, sum(total) t from o group by 1) x), '[]'::jsonb),
    'by_type', coalesce((select jsonb_agg(jsonb_build_object('type', order_type, 'orders', n, 'total', t) order by t desc)
                  from (select order_type, count(*) n, sum(total) t from o group by 1) x), '[]'::jsonb),
    'by_method', coalesce((select jsonb_agg(jsonb_build_object('method', method, 'currency', currency, 'amount', amount) order by amount desc) from pay), '[]'::jsonb),
    'top_items', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'qty', q, 'revenue', rev) order by rev desc)
                  from (select i.name, sum(i.quantity) q, sum(i.quantity * i.unit_price) rev
                          from public.pos_order_items i join o on o.id = i.order_id where i.status <> 'void'
                         group by i.name order by sum(i.quantity * i.unit_price) desc limit 25) x), '[]'::jsonb),
    'credit_sales',  (select coalesce(sum(amount), 0) from public.pos_payments p join o on o.id = p.order_id where p.method = 'credit'),
    'drawers', coalesce((select jsonb_agg(jsonb_build_object('opened_at', opened_at, 'expected', expected_cash, 'counted', counted_cash) order by opened_at)
                  from public.cash_sessions where outlet_id = p_outlet and status = 'closed' and opened_at >= v_from and opened_at < v_to), '[]'::jsonb)
  ) into r;
  return r;
end $$;

revoke all on function public.product_set_gst(uuid, boolean), public.category_set_gst(uuid, boolean), public.outlet_set_sector(uuid, text), public.sales_report(uuid, date, date), public.pos_item_set_gst(), public.gst_rate_for(text) from public, anon;
grant execute on function public.product_set_gst(uuid, boolean), public.category_set_gst(uuid, boolean), public.outlet_set_sector(uuid, text), public.sales_report(uuid, date, date), public.gst_rate_for(text) to authenticated;

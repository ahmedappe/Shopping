-- =====================================================================
-- 0014: Phase 3A — credit (on-account) sales and sales reports
--   * outlet_customers: credit_limit, credit_balance (amount owed)
--   * customer_ledger: sales on account, payments received, adjustments
--   * pos_payments: method 'credit'; pos_close_order() blocks over-limit credit for staff (managers may exceed)
--   * customer_receive_payment(), customer_set_credit()
--   * outlets: gst_pct (0 = off; prices are treated as GST-inclusive)
--   * sales_report(outlet, from, to): one JSON summary for the Reports page
-- Needs 0013 first. Safe to run more than once.
-- =====================================================================

do $$
begin
  if to_regclass('public.outlet_customers') is null then
    raise exception 'Run 0013_phase2b3_customers_loyalty_delivery.sql first.';
  end if;
end $$;

alter table public.outlets add column if not exists gst_pct numeric(5,2) not null default 0 check (gst_pct between 0 and 100);
alter table public.outlet_customers add column if not exists credit_limit numeric(12,2) not null default 0 check (credit_limit >= 0);
alter table public.outlet_customers add column if not exists credit_balance numeric(12,2) not null default 0 check (credit_balance >= 0);

create table if not exists public.customer_ledger (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.outlet_customers (id) on delete cascade,
  kind        text not null check (kind in ('sale', 'payment', 'adjust')),
  amount      numeric(12,2) not null,            -- + owed more, - paid / written off
  order_id    uuid references public.pos_orders (id) on delete set null,
  method      text check (method in ('cash', 'card', 'transfer')),
  reference   text check (char_length(reference) <= 80),
  note        text check (char_length(note) <= 200),
  by_user     uuid references auth.users (id) on delete set null,
  at          timestamptz not null default now()
);
create index if not exists customer_ledger_customer_idx on public.customer_ledger (customer_id, at desc);

alter table public.customer_ledger enable row level security;
drop policy if exists "customer_ledger: read" on public.customer_ledger;
create policy "customer_ledger: read" on public.customer_ledger for select to authenticated
  using (public.can_edit_catalog() and exists (select 1 from public.outlet_customers c where c.id = customer_id and public.can_access_outlet(c.outlet_id)));
revoke all on public.customer_ledger from anon;
revoke insert, update, delete on public.customer_ledger from authenticated;

alter table public.pos_payments drop constraint if exists pos_payments_method_check;
alter table public.pos_payments add constraint pos_payments_method_check check (method in ('cash', 'card', 'transfer', 'gift_card', 'points', 'credit'));

create or replace function public.customer_set_credit(p_customer uuid, p_limit numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.outlet_customers%rowtype;
begin
  select * into c from public.outlet_customers where id = p_customer;
  if not found or not public.can_manage_store() or not public.can_access_outlet(c.outlet_id) then raise exception 'FORBIDDEN'; end if;
  if p_limit is null or p_limit < 0 then raise exception 'BAD_AMOUNT'; end if;
  update public.outlet_customers set credit_limit = round(p_limit, 2) where id = p_customer;
end $$;

-- Money received from a customer against what they owe (cash, card or transfer).
create or replace function public.customer_receive_payment(p_customer uuid, p_amount numeric, p_method text, p_reference text)
returns numeric language plpgsql security definer set search_path = '' as $$
declare c public.outlet_customers%rowtype; v_amt numeric(12,2);
begin
  select * into c from public.outlet_customers where id = p_customer for update;
  if not found or not public.can_edit_catalog() or not public.can_access_outlet(c.outlet_id) then raise exception 'FORBIDDEN'; end if;
  v_amt := round(coalesce(p_amount, 0), 2);
  if v_amt <= 0 then raise exception 'BAD_AMOUNT'; end if;
  if p_method not in ('cash', 'card', 'transfer') then raise exception 'BAD_METHOD'; end if;
  if p_method <> 'cash' and char_length(coalesce(trim(p_reference), '')) < 3 then raise exception 'REFERENCE_REQUIRED'; end if;
  if v_amt > c.credit_balance then raise exception 'OVERPAID_CREDIT'; end if;
  update public.outlet_customers set credit_balance = credit_balance - v_amt where id = p_customer;
  insert into public.customer_ledger (customer_id, kind, amount, method, reference, by_user)
  values (p_customer, 'payment', -v_amt, p_method, nullif(trim(p_reference), ''), (select auth.uid()));
  return c.credit_balance - v_amt;
end $$;

-- ---------------------------------------------------------------------
-- Sales report for one outlet and a date range (Maldives dates)
-- ---------------------------------------------------------------------
create or replace function public.sales_report(p_outlet uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_from timestamptz; v_to timestamptz; v_gst numeric; r jsonb;
begin
  if not public.can_manage_store() or not public.can_access_outlet(p_outlet) then raise exception 'FORBIDDEN'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then raise exception 'BAD_RANGE'; end if;
  v_from := (p_from::text || ' 00:00')::timestamp at time zone 'Indian/Maldives';
  v_to   := ((p_to + 1)::text || ' 00:00')::timestamp at time zone 'Indian/Maldives';
  select gst_pct into v_gst from public.outlets where id = p_outlet;

  with o as (
    select * from public.pos_orders where outlet_id = p_outlet and status = 'closed' and closed_at >= v_from and closed_at < v_to
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
    'gst',           case when v_gst > 0 then (select round(coalesce(sum(total), 0) * v_gst / (100 + v_gst), 2) from o) else 0 end,
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

-- ---------------------------------------------------------------------
-- Closing an order: now also supports "on account" (credit)
-- ---------------------------------------------------------------------
create or replace function public.pos_close_order(p_order uuid, p_discount numeric, p_payments jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_o public.pos_orders%rowtype;
  v_out public.outlets%rowtype;
  p jsonb;
  v_paid numeric(12,2) := 0;
  v_noncash numeric(12,2) := 0;
  v_amt numeric(12,2);
  v_method text;
  v_total numeric(12,2);
  v_cur text;
  v_rate numeric;
  v_foreign numeric;
  v_ref text;
  v_gc public.gift_cards%rowtype;
  v_session uuid;
  v_cust public.outlet_customers%rowtype;
  v_pts int;
  v_pts_total int := 0;
  v_pay_total numeric(12,2);
  v_earned int := 0;
  v_credit numeric(12,2) := 0;
begin
  select * into v_o from public.pos_orders where id = p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not public.can_edit_catalog() or not public.can_access_outlet(v_o.outlet_id) then raise exception 'FORBIDDEN'; end if;
  if v_o.status <> 'open' then raise exception 'ORDER_CLOSED'; end if;
  if not exists (select 1 from public.pos_order_items where order_id = p_order and status <> 'void') then raise exception 'EMPTY_ORDER'; end if;
  select * into v_out from public.outlets where id = v_o.outlet_id;
  select id into v_session from public.cash_sessions where outlet_id = v_o.outlet_id and status = 'open';

  p_discount := coalesce(p_discount, 0);
  if p_discount < 0 then raise exception 'BAD_DISCOUNT'; end if;
  if p_discount > 0 and not public.can_manage_store() then raise exception 'MANAGER_ONLY'; end if;
  if p_discount > v_o.subtotal then raise exception 'BAD_DISCOUNT'; end if;
  update public.pos_orders set discount = p_discount where id = p_order;
  perform public.pos_recalc(p_order);
  select total into v_total from public.pos_orders where id = p_order;

  if jsonb_typeof(p_payments) <> 'array' then raise exception 'NO_PAYMENT'; end if;
  if v_out.require_cash_session and v_session is null
     and exists (select 1 from jsonb_array_elements(p_payments) x where x ->> 'method' = 'cash') then
    raise exception 'NO_CASH_SESSION';
  end if;

  for p in select * from jsonb_array_elements(p_payments) loop
    v_method := p ->> 'method';
    v_cur := upper(coalesce(nullif(trim(p ->> 'currency'), ''), 'MVR'));
    v_ref := nullif(trim(p ->> 'reference'), '');
    v_rate := null; v_foreign := null;

    if v_method = 'credit' then
      if v_o.customer_id is null then raise exception 'NO_CUSTOMER'; end if;
      v_amt := round((p ->> 'amount')::numeric, 2);
      if v_amt is null or v_amt <= 0 then continue; end if;
      v_credit := v_credit + v_amt;
    elsif v_method = 'points' then
      if v_o.customer_id is null then raise exception 'NO_CUSTOMER'; end if;
      if v_out.loyalty_point_value <= 0 then raise exception 'LOYALTY_OFF'; end if;
      v_pts := floor((p ->> 'points')::numeric)::int;
      if v_pts is null or v_pts <= 0 then continue; end if;
      v_amt := round(v_pts * v_out.loyalty_point_value, 2);
      v_pts_total := v_pts_total + v_pts;
      v_ref := v_pts::text || ' pts';
    elsif v_cur <> 'MVR' then
      if v_method <> 'cash' then raise exception 'BAD_METHOD'; end if;
      v_foreign := round((p ->> 'foreign_amount')::numeric, 2);
      if v_foreign is null or v_foreign <= 0 then continue; end if;
      select rate_to_mvr into v_rate from public.currency_rates where company_id = v_out.company_id and code = v_cur;
      if v_rate is null then raise exception 'NO_RATE'; end if;
      v_amt := round(v_foreign * v_rate, 2);
    else
      v_amt := round((p ->> 'amount')::numeric, 2);
    end if;
    if v_amt is null or v_amt <= 0 then continue; end if;
    if v_method not in ('cash', 'card', 'transfer', 'gift_card', 'points', 'credit') then raise exception 'BAD_METHOD'; end if;
    if v_method in ('card', 'transfer') and char_length(coalesce(v_ref, '')) < 3 then raise exception 'REFERENCE_REQUIRED'; end if;

    if v_method = 'gift_card' then
      select * into v_gc from public.gift_cards
       where company_id = v_out.company_id and code = upper(coalesce(v_ref, '')) and is_active for update;
      if not found then raise exception 'GIFT_CARD_NOT_FOUND'; end if;
      if v_gc.balance < v_amt then raise exception 'GIFT_CARD_BALANCE'; end if;
      update public.gift_cards set balance = balance - v_amt where id = v_gc.id;
      insert into public.gift_card_txns (gift_card_id, kind, amount, balance_after, order_id, by_user)
      values (v_gc.id, 'redeem', -v_amt, v_gc.balance - v_amt, p_order, (select auth.uid()));
      v_ref := v_gc.code;
    end if;

    insert into public.pos_payments (order_id, method, amount, reference, currency, foreign_amount, rate)
    values (p_order, v_method, v_amt, v_ref, v_cur, v_foreign, v_rate);
    v_paid := v_paid + v_amt;
    if v_method <> 'cash' then v_noncash := v_noncash + v_amt; end if;
  end loop;

  if v_credit > 0 then
    select * into v_cust from public.outlet_customers where id = v_o.customer_id for update;
    if v_cust.credit_balance + v_credit > v_cust.credit_limit and not public.can_manage_store() then raise exception 'CREDIT_LIMIT'; end if;
    update public.outlet_customers set credit_balance = credit_balance + v_credit where id = v_o.customer_id;
    insert into public.customer_ledger (customer_id, kind, amount, order_id, by_user) values (v_o.customer_id, 'sale', v_credit, p_order, (select auth.uid()));
  end if;

  if v_pts_total > 0 then
    select * into v_cust from public.outlet_customers where id = v_o.customer_id for update;
    if v_cust.points_balance < v_pts_total then raise exception 'POINTS_BALANCE'; end if;
  end if;

  if v_paid < v_total then raise exception 'UNDERPAID'; end if;
  if v_noncash > v_total then raise exception 'OVERPAID_NON_CASH'; end if;

  update public.pos_orders
     set status = 'closed', closed_at = now(), closed_by = (select auth.uid()),
         paid_total = v_paid, change_given = v_paid - v_total, cash_session_id = v_session
   where id = p_order;
  if v_o.customer_id is not null then
    if v_pts_total > 0 then
      update public.outlet_customers set points_balance = points_balance - v_pts_total where id = v_o.customer_id;
      insert into public.loyalty_txns (customer_id, kind, points, order_id, by_user) values (v_o.customer_id, 'redeem', -v_pts_total, p_order, (select auth.uid()));
    end if;
    -- points are earned on what was actually paid for with money, not on points or gift cards
    select coalesce(sum(amount), 0) into v_pay_total from public.pos_payments where order_id = p_order and method in ('cash', 'card', 'transfer');
    v_earned := floor(least(v_pay_total, v_total) / 100 * v_out.loyalty_earn_per_100)::int;
    if v_earned > 0 then
      update public.outlet_customers set points_balance = points_balance + v_earned where id = v_o.customer_id;
      insert into public.loyalty_txns (customer_id, kind, points, order_id, by_user) values (v_o.customer_id, 'earn', v_earned, p_order, (select auth.uid()));
    end if;
    -- referral bonus: once, on the referred customer's first closed order
    select * into v_cust from public.outlet_customers where id = v_o.customer_id;
    if v_cust.referred_by is not null and v_out.loyalty_referral_bonus > 0
       and not exists (select 1 from public.loyalty_txns where customer_id = v_cust.referred_by and kind = 'referral' and order_id is not null
                         and order_id in (select id from public.pos_orders where customer_id = v_o.customer_id)) then
      update public.outlet_customers set points_balance = points_balance + v_out.loyalty_referral_bonus where id = v_cust.referred_by;
      insert into public.loyalty_txns (customer_id, kind, points, order_id, by_user) values (v_cust.referred_by, 'referral', v_out.loyalty_referral_bonus, p_order, (select auth.uid()));
    end if;
  end if;
  update public.table_requests set resolved_at = now(), resolved_by = (select auth.uid())
   where table_id = v_o.table_id and resolved_at is null;
end $$;

revoke all on function public.customer_set_credit(uuid, numeric), public.customer_receive_payment(uuid, numeric, text, text),
  public.sales_report(uuid, date, date), public.pos_close_order(uuid, numeric, jsonb) from public, anon;
grant execute on function public.customer_set_credit(uuid, numeric), public.customer_receive_payment(uuid, numeric, text, text),
  public.sales_report(uuid, date, date), public.pos_close_order(uuid, numeric, jsonb) to authenticated;

do $$
begin
  execute 'drop trigger if exists audit_customer_ledger on public.customer_ledger';
  execute 'create trigger audit_customer_ledger after insert or update or delete on public.customer_ledger
           for each row execute function public.write_audit_log()';
end $$;

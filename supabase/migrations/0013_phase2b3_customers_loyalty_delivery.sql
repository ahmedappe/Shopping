-- =====================================================================
-- 0013: Phase 2B-3 — customers per outlet, loyalty & referral points, delivery person
--   * outlet_customers: separate list per outlet (name, phone, referral code, points)
--   * loyalty_txns: every earn / redeem / referral / adjustment
--   * outlets: loyalty_earn_per_100 (points per 100 MVR paid, 0 = off), loyalty_point_value (MVR per point),
--     loyalty_referral_bonus (points to the referrer on the new customer's first order)
--   * pos_orders: customer_id, delivery_by, delivery_status
--   * pos_close_order(): points can pay part of the bill; points are earned on money paid
-- Needs 0012 first. Safe to run more than once.
-- =====================================================================

do $$
begin
  if to_regclass('public.cash_sessions') is null then
    raise exception 'Run 0012_phase2b2_cash_gift_currency.sql first.';
  end if;
end $$;

alter table public.outlets add column if not exists loyalty_earn_per_100 numeric(6,2) not null default 0 check (loyalty_earn_per_100 between 0 and 1000);
alter table public.outlets add column if not exists loyalty_point_value numeric(8,4) not null default 0 check (loyalty_point_value >= 0);
alter table public.outlets add column if not exists loyalty_referral_bonus int not null default 0 check (loyalty_referral_bonus between 0 and 100000);

create table if not exists public.outlet_customers (
  id             uuid primary key default gen_random_uuid(),
  outlet_id      uuid not null references public.outlets (id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 120),
  phone          text not null check (phone ~ '^[0-9+][0-9 -]{4,18}$'),
  referral_code  text not null default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)),
  referred_by    uuid references public.outlet_customers (id) on delete set null,
  points_balance int not null default 0 check (points_balance >= 0),
  note           text check (char_length(note) <= 300),
  created_at     timestamptz not null default now(),
  unique (outlet_id, phone),
  unique (outlet_id, referral_code)
);

create table if not exists public.loyalty_txns (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.outlet_customers (id) on delete cascade,
  kind        text not null check (kind in ('earn', 'redeem', 'referral', 'adjust')),
  points      int not null,
  order_id    uuid references public.pos_orders (id) on delete set null,
  reason      text check (char_length(reason) <= 200),
  by_user     uuid references auth.users (id) on delete set null,
  at          timestamptz not null default now()
);
create index if not exists loyalty_txns_customer_idx on public.loyalty_txns (customer_id, at desc);

alter table public.pos_orders add column if not exists customer_id uuid references public.outlet_customers (id) on delete set null;
alter table public.pos_orders add column if not exists delivery_by uuid references auth.users (id) on delete set null;
alter table public.pos_orders add column if not exists delivery_status text check (delivery_status in ('assigned', 'out', 'delivered'));
alter table public.pos_orders add column if not exists delivery_address text check (char_length(delivery_address) <= 300);

alter table public.pos_payments drop constraint if exists pos_payments_method_check;
alter table public.pos_payments add constraint pos_payments_method_check check (method in ('cash', 'card', 'transfer', 'gift_card', 'points'));

alter table public.outlet_customers enable row level security;
alter table public.loyalty_txns enable row level security;
drop policy if exists "outlet_customers: read" on public.outlet_customers;
create policy "outlet_customers: read" on public.outlet_customers for select to authenticated using (public.can_edit_catalog() and public.can_access_outlet(outlet_id));
drop policy if exists "loyalty_txns: read" on public.loyalty_txns;
create policy "loyalty_txns: read" on public.loyalty_txns for select to authenticated
  using (public.can_edit_catalog() and exists (select 1 from public.outlet_customers c where c.id = customer_id and public.can_access_outlet(c.outlet_id)));
revoke all on public.outlet_customers, public.loyalty_txns from anon;
revoke insert, update, delete on public.outlet_customers, public.loyalty_txns from authenticated;

-- ---------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------
create or replace function public.customer_save(p_outlet uuid, p_name text, p_phone text, p_referrer_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_ref uuid; v_phone text;
begin
  if not public.can_edit_catalog() or not public.can_access_outlet(p_outlet) then raise exception 'FORBIDDEN'; end if;
  v_phone := regexp_replace(coalesce(p_phone, ''), '\s+', '', 'g');
  if char_length(trim(coalesce(p_name, ''))) < 1 then raise exception 'NAME_REQUIRED'; end if;
  if v_phone !~ '^[0-9+][0-9-]{4,18}$' then raise exception 'BAD_PHONE'; end if;
  select id into v_id from public.outlet_customers where outlet_id = p_outlet and phone = v_phone;
  if found then
    update public.outlet_customers set name = trim(p_name) where id = v_id;
    return v_id;
  end if;
  if nullif(trim(coalesce(p_referrer_code, '')), '') is not null then
    select id into v_ref from public.outlet_customers where outlet_id = p_outlet and referral_code = upper(trim(p_referrer_code));
    if not found then raise exception 'BAD_REFERRAL'; end if;
  end if;
  insert into public.outlet_customers (outlet_id, name, phone, referred_by) values (p_outlet, trim(p_name), v_phone, v_ref) returning id into v_id;
  return v_id;
end $$;

create or replace function public.pos_set_customer(p_order uuid, p_customer uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.pos_orders%rowtype;
begin
  select * into o from public.pos_orders where id = p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not public.can_edit_catalog() or not public.can_access_outlet(o.outlet_id) then raise exception 'FORBIDDEN'; end if;
  if o.status <> 'open' then raise exception 'ORDER_CLOSED'; end if;
  if p_customer is not null and not exists (select 1 from public.outlet_customers where id = p_customer and outlet_id = o.outlet_id) then
    raise exception 'FORBIDDEN';
  end if;
  update public.pos_orders set customer_id = p_customer where id = p_order;
end $$;

create or replace function public.loyalty_adjust(p_customer uuid, p_points int, p_reason text)
returns int language plpgsql security definer set search_path = '' as $$
declare c public.outlet_customers%rowtype;
begin
  select * into c from public.outlet_customers where id = p_customer for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  if not public.can_manage_store() or not public.can_access_outlet(c.outlet_id) then raise exception 'FORBIDDEN'; end if;
  if p_points is null or p_points = 0 then raise exception 'BAD_AMOUNT'; end if;
  if char_length(coalesce(trim(p_reason), '')) < 3 then raise exception 'REASON_REQUIRED'; end if;
  if c.points_balance + p_points < 0 then raise exception 'POINTS_BALANCE'; end if;
  update public.outlet_customers set points_balance = points_balance + p_points where id = p_customer;
  insert into public.loyalty_txns (customer_id, kind, points, reason, by_user) values (p_customer, 'adjust', p_points, trim(p_reason), (select auth.uid()));
  return c.points_balance + p_points;
end $$;

create or replace function public.loyalty_settings(p_outlet uuid, p_earn numeric, p_value numeric, p_bonus int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_earn < 0 or p_earn > 1000 or p_value < 0 or p_bonus < 0 or p_bonus > 100000 then raise exception 'BAD_AMOUNT'; end if;
  update public.outlets set loyalty_earn_per_100 = p_earn, loyalty_point_value = p_value, loyalty_referral_bonus = p_bonus where id = p_outlet;
end $$;

-- ---------------------------------------------------------------------
-- Delivery person
-- ---------------------------------------------------------------------
-- Staff of an outlet (names for the "who delivers" picker). Profiles are private, so this is a function.
create or replace function public.outlet_staff(p_outlet uuid)
returns table (user_id uuid, name text) language sql stable security definer set search_path = '' as $$
  select u.id, coalesce(nullif(p.full_name, ''), u.email::text)
    from public.outlet_users ou
    join auth.users u on u.id = ou.user_id
    left join public.profiles p on p.id = u.id
   where ou.outlet_id = p_outlet and public.can_edit_catalog() and public.can_access_outlet(p_outlet)
   order by 2;
$$;

create or replace function public.pos_assign_delivery(p_order uuid, p_user uuid, p_address text, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.pos_orders%rowtype;
begin
  select * into o from public.pos_orders where id = p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not public.can_edit_catalog() or not public.can_access_outlet(o.outlet_id) then raise exception 'FORBIDDEN'; end if;
  if o.order_type <> 'delivery' then raise exception 'NOT_DELIVERY'; end if;
  if p_status not in ('assigned', 'out', 'delivered') then raise exception 'BAD_KIND'; end if;
  if p_user is not null and not exists (select 1 from public.outlet_users where outlet_id = o.outlet_id and user_id = p_user) then raise exception 'FORBIDDEN'; end if;
  if p_status <> 'assigned' and coalesce(p_user, o.delivery_by) is null then raise exception 'NO_DRIVER'; end if;
  update public.pos_orders
     set delivery_by = coalesce(p_user, delivery_by), delivery_status = p_status,
         delivery_address = coalesce(nullif(trim(p_address), ''), delivery_address)
   where id = p_order;
end $$;

-- ---------------------------------------------------------------------
-- Closing an order: now also pays with points, earns points, referral bonus
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

    if v_method = 'points' then
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
    if v_method not in ('cash', 'card', 'transfer', 'gift_card', 'points') then raise exception 'BAD_METHOD'; end if;
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

revoke all on function public.customer_save(uuid, text, text, text), public.pos_set_customer(uuid, uuid), public.loyalty_adjust(uuid, int, text),
  public.loyalty_settings(uuid, numeric, numeric, int), public.outlet_staff(uuid), public.pos_assign_delivery(uuid, uuid, text, text),
  public.pos_close_order(uuid, numeric, jsonb) from public, anon;
grant execute on function public.customer_save(uuid, text, text, text), public.pos_set_customer(uuid, uuid), public.loyalty_adjust(uuid, int, text),
  public.loyalty_settings(uuid, numeric, numeric, int), public.outlet_staff(uuid), public.pos_assign_delivery(uuid, uuid, text, text),
  public.pos_close_order(uuid, numeric, jsonb) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['outlet_customers'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I
                    for each row execute function public.write_audit_log()', t);
  end loop;
end $$;

-- =====================================================================
-- 0012: Phase 2B-2a — cash register sessions, gift cards, foreign-currency cash
--   * cash_sessions / cash_movements: open with a float, pay in / out, close with a count
--   * gift_cards + gift_card_txns: issue, check balance, pay with (company-wide)
--   * currency_rates: manager sets e.g. USD = 15.42 MVR; cash can be taken in USD etc.
--   * pos_payments: method gift_card; currency, foreign_amount, rate
--   * pos_close_order(): handles all of the above
-- Needs 0011 first. Safe to run more than once.
-- =====================================================================

do $$
begin
  if to_regclass('public.production_log') is null then
    raise exception 'Run 0011_phase2b1_production.sql first.';
  end if;
end $$;

alter table public.outlets add column if not exists require_cash_session boolean not null default false;

create table if not exists public.cash_sessions (
  id            uuid primary key default gen_random_uuid(),
  outlet_id     uuid not null references public.outlets (id) on delete restrict,
  status        text not null default 'open' check (status in ('open', 'closed')),
  opening_float numeric(12,2) not null default 0 check (opening_float >= 0),
  opened_by     uuid references auth.users (id) on delete set null,
  opened_at     timestamptz not null default now(),
  closed_by     uuid references auth.users (id) on delete set null,
  closed_at     timestamptz,
  expected_cash numeric(12,2),
  counted_cash  numeric(12,2) check (counted_cash >= 0),
  note          text check (char_length(note) <= 300)
);
create unique index if not exists cash_sessions_one_open on public.cash_sessions (outlet_id) where status = 'open';
create index if not exists cash_sessions_outlet_idx on public.cash_sessions (outlet_id, opened_at desc);

create table if not exists public.cash_movements (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.cash_sessions (id) on delete cascade,
  kind        text not null check (kind in ('pay_in', 'pay_out')),
  amount      numeric(12,2) not null check (amount > 0),
  reason      text not null check (char_length(reason) between 3 and 200),
  by_user     uuid references auth.users (id) on delete set null,
  at          timestamptz not null default now()
);

alter table public.pos_orders add column if not exists cash_session_id uuid references public.cash_sessions (id) on delete set null;

create table if not exists public.currency_rates (
  company_id  uuid not null references public.companies (id) on delete cascade,
  code        text not null check (code ~ '^[A-Z]{3}$' and code <> 'MVR'),
  rate_to_mvr numeric(12,4) not null check (rate_to_mvr > 0),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null,
  primary key (company_id, code)
);

create table if not exists public.gift_cards (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies (id) on delete cascade,
  code           text not null check (code ~ '^[A-Z0-9-]{4,20}$'),
  initial_amount numeric(12,2) not null check (initial_amount > 0),
  balance        numeric(12,2) not null check (balance >= 0),
  holder         text check (char_length(holder) <= 120),
  is_active      boolean not null default true,
  issued_outlet  uuid references public.outlets (id) on delete set null,
  issued_by      uuid references auth.users (id) on delete set null,
  issued_at      timestamptz not null default now(),
  unique (company_id, code)
);

create table if not exists public.gift_card_txns (
  id            uuid primary key default gen_random_uuid(),
  gift_card_id  uuid not null references public.gift_cards (id) on delete cascade,
  kind          text not null check (kind in ('issue', 'redeem', 'top_up', 'void')),
  amount        numeric(12,2) not null,
  balance_after numeric(12,2) not null,
  order_id      uuid references public.pos_orders (id) on delete set null,
  by_user       uuid references auth.users (id) on delete set null,
  at            timestamptz not null default now()
);
create index if not exists gift_card_txns_card_idx on public.gift_card_txns (gift_card_id, at desc);

alter table public.pos_payments drop constraint if exists pos_payments_method_check;
alter table public.pos_payments add constraint pos_payments_method_check check (method in ('cash', 'card', 'transfer', 'gift_card'));
alter table public.pos_payments drop constraint if exists pos_payments_check;
alter table public.pos_payments add constraint pos_payments_check check (method not in ('card', 'transfer') or char_length(coalesce(reference, '')) >= 3);
alter table public.pos_payments add column if not exists currency text not null default 'MVR';
alter table public.pos_payments add column if not exists foreign_amount numeric(12,2);
alter table public.pos_payments add column if not exists rate numeric(12,4);

-- Read access; all writes go through the functions below.
alter table public.cash_sessions enable row level security;
alter table public.cash_movements enable row level security;
alter table public.currency_rates enable row level security;
alter table public.gift_cards enable row level security;
alter table public.gift_card_txns enable row level security;

drop policy if exists "cash_sessions: read" on public.cash_sessions;
create policy "cash_sessions: read" on public.cash_sessions for select to authenticated using (public.can_access_outlet(outlet_id));
drop policy if exists "cash_movements: read" on public.cash_movements;
create policy "cash_movements: read" on public.cash_movements for select to authenticated
  using (exists (select 1 from public.cash_sessions s where s.id = session_id and public.can_access_outlet(s.outlet_id)));
drop policy if exists "currency_rates: read" on public.currency_rates;
create policy "currency_rates: read" on public.currency_rates for select to authenticated using (public.can_access_company(company_id));
drop policy if exists "gift_cards: read" on public.gift_cards;
create policy "gift_cards: read" on public.gift_cards for select to authenticated using (public.can_manage_store() and public.can_access_company(company_id));
drop policy if exists "gift_card_txns: read" on public.gift_card_txns;
create policy "gift_card_txns: read" on public.gift_card_txns for select to authenticated
  using (public.can_manage_store() and exists (select 1 from public.gift_cards g where g.id = gift_card_id and public.can_access_company(g.company_id)));

revoke all on public.cash_sessions, public.cash_movements, public.currency_rates, public.gift_cards, public.gift_card_txns from anon;
revoke insert, update, delete on public.cash_sessions, public.cash_movements, public.currency_rates, public.gift_cards, public.gift_card_txns from authenticated;

-- ---------------------------------------------------------------------
-- Cash register
-- ---------------------------------------------------------------------
create or replace function public.cash_open(p_outlet uuid, p_float numeric)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not public.can_edit_catalog() or not public.can_access_outlet(p_outlet) then raise exception 'FORBIDDEN'; end if;
  if p_float is null or p_float < 0 then raise exception 'BAD_AMOUNT'; end if;
  if exists (select 1 from public.cash_sessions where outlet_id = p_outlet and status = 'open') then raise exception 'SESSION_OPEN'; end if;
  insert into public.cash_sessions (outlet_id, opening_float, opened_by) values (p_outlet, round(p_float, 2), (select auth.uid())) returning id into v_id;
  return v_id;
end $$;

create or replace function public.cash_movement(p_session uuid, p_kind text, p_amount numeric, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.cash_sessions%rowtype;
begin
  select * into s from public.cash_sessions where id = p_session for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if not public.can_edit_catalog() or not public.can_access_outlet(s.outlet_id) then raise exception 'FORBIDDEN'; end if;
  if s.status <> 'open' then raise exception 'SESSION_CLOSED'; end if;
  if p_kind not in ('pay_in', 'pay_out') then raise exception 'BAD_KIND'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'BAD_AMOUNT'; end if;
  if char_length(coalesce(trim(p_reason), '')) < 3 then raise exception 'REASON_REQUIRED'; end if;
  insert into public.cash_movements (session_id, kind, amount, reason, by_user) values (p_session, p_kind, round(p_amount, 2), trim(p_reason), (select auth.uid()));
end $$;

-- Expected cash = float + cash taken (minus change given) + pay-ins - pay-outs.
create or replace function public.cash_expected(p_session uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select s.opening_float
       + coalesce((select sum(p.amount) from public.pos_payments p join public.pos_orders o on o.id = p.order_id
                    where o.cash_session_id = s.id and p.method = 'cash'), 0)
       - coalesce((select sum(o.change_given) from public.pos_orders o where o.cash_session_id = s.id), 0)
       + coalesce((select sum(case m.kind when 'pay_in' then m.amount else -m.amount end) from public.cash_movements m where m.session_id = s.id), 0)
    from public.cash_sessions s
   where s.id = p_session and public.can_access_outlet(s.outlet_id);
$$;

create or replace function public.cash_close(p_session uuid, p_counted numeric, p_note text)
returns numeric language plpgsql security definer set search_path = '' as $$
declare s public.cash_sessions%rowtype; v_exp numeric(12,2);
begin
  select * into s from public.cash_sessions where id = p_session for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  if not public.can_edit_catalog() or not public.can_access_outlet(s.outlet_id) then raise exception 'FORBIDDEN'; end if;
  if s.status <> 'open' then raise exception 'SESSION_CLOSED'; end if;
  if p_counted is null or p_counted < 0 then raise exception 'BAD_AMOUNT'; end if;
  v_exp := public.cash_expected(p_session);
  update public.cash_sessions
     set status = 'closed', closed_by = (select auth.uid()), closed_at = now(),
         expected_cash = v_exp, counted_cash = round(p_counted, 2), note = nullif(trim(p_note), '')
   where id = p_session;
  return round(p_counted, 2) - v_exp;   -- negative = cash short
end $$;

-- ---------------------------------------------------------------------
-- Currency rates and gift cards
-- ---------------------------------------------------------------------
create or replace function public.pos_set_rate(p_outlet uuid, p_code text, p_rate numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare v_company uuid;
begin
  select company_id into v_company from public.outlets where id = p_outlet;
  if v_company is null or not public.can_manage_store() or not public.can_access_outlet(p_outlet) then raise exception 'FORBIDDEN'; end if;
  p_code := upper(trim(p_code));
  if p_code !~ '^[A-Z]{3}$' or p_code = 'MVR' then raise exception 'BAD_CURRENCY'; end if;
  if p_rate is null or p_rate <= 0 then
    delete from public.currency_rates where company_id = v_company and code = p_code;
  else
    insert into public.currency_rates (company_id, code, rate_to_mvr, updated_by) values (v_company, p_code, round(p_rate, 4), (select auth.uid()))
    on conflict (company_id, code) do update set rate_to_mvr = excluded.rate_to_mvr, updated_at = now(), updated_by = excluded.updated_by;
  end if;
end $$;

create or replace function public.gift_card_issue(p_outlet uuid, p_amount numeric, p_code text, p_holder text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_company uuid; v_code text; v_id uuid; v_try int := 0;
begin
  select company_id into v_company from public.outlets where id = p_outlet;
  if v_company is null or not public.can_manage_store() or not public.can_access_outlet(p_outlet) then raise exception 'FORBIDDEN'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'BAD_AMOUNT'; end if;
  v_code := upper(nullif(trim(coalesce(p_code, '')), ''));
  if v_code is not null and v_code !~ '^[A-Z0-9-]{4,20}$' then raise exception 'BAD_CODE'; end if;
  loop
    if v_code is null then v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)); end if;
    exit when not exists (select 1 from public.gift_cards where company_id = v_company and code = v_code);
    if p_code is not null and nullif(trim(p_code), '') is not null then raise exception 'CODE_EXISTS'; end if;
    v_try := v_try + 1; v_code := null;
    if v_try > 5 then raise exception 'CODE_EXISTS'; end if;
  end loop;
  insert into public.gift_cards (company_id, code, initial_amount, balance, holder, issued_outlet, issued_by)
  values (v_company, v_code, round(p_amount, 2), round(p_amount, 2), nullif(trim(p_holder), ''), p_outlet, (select auth.uid())) returning id into v_id;
  insert into public.gift_card_txns (gift_card_id, kind, amount, balance_after, by_user) values (v_id, 'issue', round(p_amount, 2), round(p_amount, 2), (select auth.uid()));
  return v_code;
end $$;

create or replace function public.gift_card_top_up(p_outlet uuid, p_code text, p_amount numeric)
returns numeric language plpgsql security definer set search_path = '' as $$
declare v_company uuid; g public.gift_cards%rowtype;
begin
  select company_id into v_company from public.outlets where id = p_outlet;
  if v_company is null or not public.can_manage_store() or not public.can_access_outlet(p_outlet) then raise exception 'FORBIDDEN'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'BAD_AMOUNT'; end if;
  select * into g from public.gift_cards where company_id = v_company and code = upper(trim(p_code)) and is_active for update;
  if not found then raise exception 'GIFT_CARD_NOT_FOUND'; end if;
  update public.gift_cards set balance = balance + round(p_amount, 2) where id = g.id;
  insert into public.gift_card_txns (gift_card_id, kind, amount, balance_after, by_user) values (g.id, 'top_up', round(p_amount, 2), g.balance + round(p_amount, 2), (select auth.uid()));
  return g.balance + round(p_amount, 2);
end $$;

create or replace function public.gift_card_void(p_outlet uuid, p_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_company uuid; g public.gift_cards%rowtype;
begin
  select company_id into v_company from public.outlets where id = p_outlet;
  if v_company is null or not public.can_manage_store() or not public.can_access_outlet(p_outlet) then raise exception 'FORBIDDEN'; end if;
  select * into g from public.gift_cards where company_id = v_company and code = upper(trim(p_code)) and is_active for update;
  if not found then raise exception 'GIFT_CARD_NOT_FOUND'; end if;
  update public.gift_cards set is_active = false, balance = 0 where id = g.id;
  insert into public.gift_card_txns (gift_card_id, kind, amount, balance_after, by_user) values (g.id, 'void', -g.balance, 0, (select auth.uid()));
end $$;

-- Cashiers can check a balance (and nothing else) before taking a card.
create or replace function public.gift_card_balance(p_outlet uuid, p_code text)
returns numeric language sql stable security definer set search_path = '' as $$
  select g.balance from public.gift_cards g join public.outlets o on o.company_id = g.company_id
   where o.id = p_outlet and g.code = upper(trim(p_code)) and g.is_active
     and public.can_edit_catalog() and public.can_access_outlet(p_outlet);
$$;

-- ---------------------------------------------------------------------
-- Closing an order: cash (also foreign), card, transfer, gift card
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

    if v_cur <> 'MVR' then
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
    if v_method not in ('cash', 'card', 'transfer', 'gift_card') then raise exception 'BAD_METHOD'; end if;
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

  if v_paid < v_total then raise exception 'UNDERPAID'; end if;
  if v_noncash > v_total then raise exception 'OVERPAID_NON_CASH'; end if;

  update public.pos_orders
     set status = 'closed', closed_at = now(), closed_by = (select auth.uid()),
         paid_total = v_paid, change_given = v_paid - v_total, cash_session_id = v_session
   where id = p_order;
  update public.table_requests set resolved_at = now(), resolved_by = (select auth.uid())
   where table_id = v_o.table_id and resolved_at is null;
end $$;

revoke all on function public.cash_open(uuid, numeric), public.cash_movement(uuid, text, numeric, text), public.cash_expected(uuid),
  public.cash_close(uuid, numeric, text), public.pos_set_rate(uuid, text, numeric), public.gift_card_issue(uuid, numeric, text, text),
  public.gift_card_top_up(uuid, text, numeric), public.gift_card_void(uuid, text), public.gift_card_balance(uuid, text),
  public.pos_close_order(uuid, numeric, jsonb) from public, anon;
grant execute on function public.cash_open(uuid, numeric), public.cash_movement(uuid, text, numeric, text), public.cash_expected(uuid),
  public.cash_close(uuid, numeric, text), public.pos_set_rate(uuid, text, numeric), public.gift_card_issue(uuid, numeric, text, text),
  public.gift_card_top_up(uuid, text, numeric), public.gift_card_void(uuid, text), public.gift_card_balance(uuid, text),
  public.pos_close_order(uuid, numeric, jsonb) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['cash_sessions', 'cash_movements', 'currency_rates', 'gift_cards'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I
                    for each row execute function public.write_audit_log()', t);
  end loop;
end $$;

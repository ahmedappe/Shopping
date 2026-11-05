-- =====================================================================
-- 0010: Phase 2A — Cafe POS, kitchen and bar screens, recipes
--   * dining_tables (with a QR token per table) and table_requests (bell / call waiter / bill)
--   * outlet_variants.station: which screen an item goes to (kitchen, bar, or none)
--   * outlets: service charge % (dine-in only) and receipt header / footer
--   * pos_orders, pos_order_items, pos_payments (split payment, reference for card / transfer)
--   * ingredients, ingredient_stock (per outlet, may go below zero), recipe_lines
--   * functions: open order, add items, change item status, void, close with payments, cancel
-- Needs 0009 first. Safe to run more than once.
-- =====================================================================

do $$
begin
  if to_regprocedure('public.can_access_company(uuid)') is null then
    raise exception 'Run 0009_phase1_foundation.sql first.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Settings on existing tables
-- ---------------------------------------------------------------------
alter table public.outlets add column if not exists service_charge_pct numeric(5,2) not null default 0
  check (service_charge_pct between 0 and 100);
alter table public.outlets add column if not exists receipt_header text check (char_length(receipt_header) <= 300);
alter table public.outlets add column if not exists receipt_footer text check (char_length(receipt_footer) <= 300);

alter table public.outlet_variants add column if not exists station text check (station in ('kitchen', 'bar'));

-- ---------------------------------------------------------------------
-- 2. Tables and guest requests
-- ---------------------------------------------------------------------
create table if not exists public.dining_tables (
  id          uuid primary key default gen_random_uuid(),
  outlet_id   uuid not null references public.outlets (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 30),
  seats       int not null default 4 check (seats between 1 and 100),
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  qr_token    text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at  timestamptz not null default now(),
  unique (outlet_id, name)
);

create table if not exists public.table_requests (
  id           uuid primary key default gen_random_uuid(),
  table_id     uuid not null references public.dining_tables (id) on delete cascade,
  kind         text not null check (kind in ('bell', 'waiter', 'bill')),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references auth.users (id) on delete set null
);
create unique index if not exists table_requests_one_pending
  on public.table_requests (table_id, kind) where resolved_at is null;

-- ---------------------------------------------------------------------
-- 3. Orders
-- ---------------------------------------------------------------------
create sequence if not exists public.pos_order_seq start 1;

create table if not exists public.pos_orders (
  id              uuid primary key default gen_random_uuid(),
  order_no        text not null unique default ('P-' || nextval('public.pos_order_seq')::text),
  outlet_id       uuid not null references public.outlets (id) on delete restrict,
  table_id        uuid references public.dining_tables (id) on delete set null,
  order_type      text not null check (order_type in ('dine_in', 'take_away', 'delivery')),
  status          text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  guest_name      text check (char_length(guest_name) <= 120),
  note            text check (char_length(note) <= 500),
  opened_by       uuid references auth.users (id) on delete set null,
  opened_at       timestamptz not null default now(),
  first_sent_at   timestamptz,
  closed_at       timestamptz,
  closed_by       uuid references auth.users (id) on delete set null,
  subtotal        numeric(12,2) not null default 0,
  discount        numeric(12,2) not null default 0 check (discount >= 0),
  service_charge  numeric(12,2) not null default 0,
  total           numeric(12,2) not null default 0,
  paid_total      numeric(12,2) not null default 0,
  change_given    numeric(12,2) not null default 0,
  check (order_type <> 'dine_in' or table_id is not null)
);
create index if not exists pos_orders_outlet_idx on public.pos_orders (outlet_id, status, opened_at desc);
create unique index if not exists pos_orders_one_open_per_table
  on public.pos_orders (table_id) where status = 'open' and order_type = 'dine_in';

create table if not exists public.pos_order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.pos_orders (id) on delete cascade,
  variant_id     uuid references public.product_variants (id) on delete set null,
  name           text not null,
  unit_price     numeric(12,2) not null check (unit_price >= 0),
  quantity       int not null check (quantity between 1 and 999),
  note           text check (char_length(note) <= 200),
  station        text check (station in ('kitchen', 'bar')),
  status         text not null default 'new' check (status in ('new', 'preparing', 'ready', 'served', 'void')),
  stock_deducted boolean not null default false,
  void_reason    text,
  created_at     timestamptz not null default now(),
  preparing_at   timestamptz,
  ready_at       timestamptz,
  served_at      timestamptz
);
create index if not exists pos_order_items_order_idx on public.pos_order_items (order_id);
create index if not exists pos_order_items_station_idx on public.pos_order_items (station, status) where status in ('new', 'preparing', 'ready');

create table if not exists public.pos_payments (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.pos_orders (id) on delete cascade,
  method      text not null check (method in ('cash', 'card', 'transfer')),
  amount      numeric(12,2) not null check (amount > 0),
  reference   text check (char_length(reference) <= 80),
  created_at  timestamptz not null default now(),
  check (method = 'cash' or char_length(coalesce(reference, '')) >= 3)
);
create index if not exists pos_payments_order_idx on public.pos_payments (order_id);

-- ---------------------------------------------------------------------
-- 4. Ingredients and recipes
-- ---------------------------------------------------------------------
create table if not exists public.ingredients (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  unit        text not null default 'kg' check (char_length(unit) between 1 and 12),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (company_id, name)
);

create table if not exists public.ingredient_stock (
  outlet_id      uuid not null references public.outlets (id) on delete cascade,
  ingredient_id  uuid not null references public.ingredients (id) on delete cascade,
  qty            numeric(14,3) not null default 0,   -- may go below zero when sales outrun counting
  reorder_level  numeric(14,3) check (reorder_level >= 0),
  updated_at     timestamptz not null default now(),
  primary key (outlet_id, ingredient_id)
);

create table if not exists public.recipe_lines (
  variant_id     uuid not null references public.product_variants (id) on delete cascade,
  ingredient_id  uuid not null references public.ingredients (id) on delete cascade,
  qty            numeric(14,4) not null check (qty > 0),   -- per one item sold
  primary key (variant_id, ingredient_id)
);

create table if not exists public.pos_item_usage (
  item_id        uuid not null references public.pos_order_items (id) on delete cascade,
  ingredient_id  uuid not null references public.ingredients (id) on delete cascade,
  qty            numeric(14,4) not null,
  primary key (item_id, ingredient_id)
);

-- ---------------------------------------------------------------------
-- 5. Row Level Security: read where you work; writes go through functions
-- ---------------------------------------------------------------------
alter table public.dining_tables    enable row level security;
alter table public.table_requests   enable row level security;
alter table public.pos_orders       enable row level security;
alter table public.pos_order_items  enable row level security;
alter table public.pos_payments     enable row level security;
alter table public.ingredients      enable row level security;
alter table public.ingredient_stock enable row level security;
alter table public.recipe_lines     enable row level security;
alter table public.pos_item_usage   enable row level security;

drop policy if exists "dining_tables: read" on public.dining_tables;
drop policy if exists "dining_tables: manage" on public.dining_tables;
create policy "dining_tables: read" on public.dining_tables for select to authenticated
  using (public.can_access_outlet(outlet_id));
create policy "dining_tables: manage" on public.dining_tables for all to authenticated
  using (public.can_manage_store() and public.can_access_outlet(outlet_id))
  with check (public.can_manage_store() and public.can_access_outlet(outlet_id));

drop policy if exists "table_requests: read" on public.table_requests;
create policy "table_requests: read" on public.table_requests for select to authenticated
  using (exists (select 1 from public.dining_tables t where t.id = table_id and public.can_access_outlet(t.outlet_id)));

drop policy if exists "pos_orders: read" on public.pos_orders;
create policy "pos_orders: read" on public.pos_orders for select to authenticated
  using (public.can_access_outlet(outlet_id));

drop policy if exists "pos_order_items: read" on public.pos_order_items;
create policy "pos_order_items: read" on public.pos_order_items for select to authenticated
  using (exists (select 1 from public.pos_orders o where o.id = order_id and public.can_access_outlet(o.outlet_id)));

drop policy if exists "pos_payments: read" on public.pos_payments;
create policy "pos_payments: read" on public.pos_payments for select to authenticated
  using (exists (select 1 from public.pos_orders o where o.id = order_id and public.can_access_outlet(o.outlet_id)));

drop policy if exists "ingredients: read" on public.ingredients;
drop policy if exists "ingredients: write" on public.ingredients;
create policy "ingredients: read" on public.ingredients for select to authenticated
  using (public.can_edit_catalog() and public.can_access_company(company_id));
create policy "ingredients: write" on public.ingredients for all to authenticated
  using (public.can_manage_store() and public.can_access_company(company_id))
  with check (public.can_manage_store() and public.can_access_company(company_id));

drop policy if exists "ingredient_stock: read" on public.ingredient_stock;
create policy "ingredient_stock: read" on public.ingredient_stock for select to authenticated
  using (public.can_access_outlet(outlet_id));

drop policy if exists "recipe_lines: read" on public.recipe_lines;
drop policy if exists "recipe_lines: write" on public.recipe_lines;
create policy "recipe_lines: read" on public.recipe_lines for select to authenticated
  using (public.can_edit_catalog());
create policy "recipe_lines: write" on public.recipe_lines for all to authenticated
  using (public.can_manage_store()) with check (public.can_manage_store());

drop policy if exists "pos_item_usage: none" on public.pos_item_usage;
create policy "pos_item_usage: none" on public.pos_item_usage for select to authenticated using (false);

revoke insert, update, delete on public.table_requests, public.pos_orders, public.pos_order_items,
  public.pos_payments, public.ingredient_stock, public.pos_item_usage from anon, authenticated;
revoke all on public.dining_tables, public.table_requests, public.pos_orders, public.pos_order_items,
  public.pos_payments, public.ingredients, public.ingredient_stock, public.recipe_lines, public.pos_item_usage from anon;

-- ---------------------------------------------------------------------
-- 6. Helpers
-- ---------------------------------------------------------------------
create or replace function public.pos_recalc(p_order uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_sub numeric(12,2);
  v_o   public.pos_orders%rowtype;
  v_pct numeric(5,2);
  v_sc  numeric(12,2) := 0;
begin
  select * into v_o from public.pos_orders where id = p_order;
  select coalesce(sum(unit_price * quantity), 0) into v_sub
    from public.pos_order_items where order_id = p_order and status <> 'void';
  if v_o.order_type = 'dine_in' then
    select service_charge_pct into v_pct from public.outlets where id = v_o.outlet_id;
    v_sc := round(greatest(v_sub - v_o.discount, 0) * coalesce(v_pct, 0) / 100, 2);
  end if;
  update public.pos_orders
     set subtotal = v_sub,
         service_charge = v_sc,
         total = greatest(v_sub - v_o.discount, 0) + v_sc
   where id = p_order;
end $$;

-- Puts an item's ingredients (or retail stock) back, e.g. after a void.
create or replace function public.pos_restore_item(p_item uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_item public.pos_order_items%rowtype;
  v_outlet uuid;
  r record;
begin
  select * into v_item from public.pos_order_items where id = p_item;
  select outlet_id into v_outlet from public.pos_orders where id = v_item.order_id;
  for r in select ingredient_id, qty from public.pos_item_usage where item_id = p_item loop
    insert into public.ingredient_stock (outlet_id, ingredient_id, qty) values (v_outlet, r.ingredient_id, r.qty)
    on conflict (outlet_id, ingredient_id) do update set qty = public.ingredient_stock.qty + r.qty, updated_at = now();
  end loop;
  delete from public.pos_item_usage where item_id = p_item;
  if v_item.stock_deducted and v_item.variant_id is not null then
    update public.outlet_variants set stock = stock + v_item.quantity
     where outlet_id = v_outlet and variant_id = v_item.variant_id;
    update public.pos_order_items set stock_deducted = false where id = p_item;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 7. Order functions
-- ---------------------------------------------------------------------
create or replace function public.pos_open_order(
  p_outlet uuid, p_table uuid, p_type text, p_guest text default null, p_note text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.can_edit_catalog() or not public.can_access_outlet(p_outlet) then raise exception 'FORBIDDEN'; end if;
  if p_type not in ('dine_in', 'take_away', 'delivery') then raise exception 'BAD_TYPE'; end if;
  if p_type = 'dine_in' then
    if p_table is null or not exists (select 1 from public.dining_tables where id = p_table and outlet_id = p_outlet and is_active) then
      raise exception 'TABLE_NOT_FOUND';
    end if;
    select id into v_id from public.pos_orders where table_id = p_table and status = 'open' and order_type = 'dine_in';
    if v_id is not null then return v_id; end if;
  end if;
  insert into public.pos_orders (outlet_id, table_id, order_type, guest_name, note, opened_by)
  values (p_outlet, case when p_type = 'dine_in' then p_table end, p_type, nullif(trim(p_guest), ''), nullif(trim(p_note), ''), (select auth.uid()))
  returning id into v_id;
  -- a guest's bell / bill requests are cleared once staff open the table
  update public.table_requests set resolved_at = now(), resolved_by = (select auth.uid())
   where table_id = p_table and resolved_at is null and kind in ('bell', 'waiter');
  return v_id;
end $$;

create or replace function public.pos_add_items(p_order uuid, p_lines jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_o public.pos_orders%rowtype;
  l jsonb;
  v_qty int;
  v_ov record;
  v_item uuid;
  r record;
  v_count int := 0;
begin
  select * into v_o from public.pos_orders where id = p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not public.can_edit_catalog() or not public.can_access_outlet(v_o.outlet_id) then raise exception 'FORBIDDEN'; end if;
  if v_o.status <> 'open' then raise exception 'ORDER_CLOSED'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'NO_LINES'; end if;
  if jsonb_array_length(p_lines) > 100 then raise exception 'TOO_MANY_LINES'; end if;

  for l in select * from jsonb_array_elements(p_lines) loop
    v_qty := (l ->> 'quantity')::int;
    if v_qty is null or v_qty < 1 or v_qty > 999 then raise exception 'BAD_QUANTITY'; end if;
    select ov.price, ov.station, ov.stock, ov.is_active, p.name as pname, pv.option1, pv.option2, pv.id as vid
      into v_ov
      from public.outlet_variants ov
      join public.product_variants pv on pv.id = ov.variant_id
      join public.products p on p.id = pv.product_id
     where ov.outlet_id = v_o.outlet_id and ov.variant_id = (l ->> 'variant_id')::uuid
     for update of ov;
    if not found or not v_ov.is_active then raise exception 'ITEM_NOT_AVAILABLE'; end if;

    insert into public.pos_order_items (order_id, variant_id, name, unit_price, quantity, note, station, status, served_at)
    values (
      p_order, v_ov.vid,
      v_ov.pname || coalesce(' · ' || nullif(concat_ws(' / ', v_ov.option1, v_ov.option2), ''), ''),
      v_ov.price, v_qty, nullif(trim(l ->> 'note'), ''), v_ov.station,
      case when v_ov.station is null then 'served' else 'new' end,
      case when v_ov.station is null then now() end
    ) returning id into v_item;

    if exists (select 1 from public.recipe_lines where variant_id = v_ov.vid) then
      for r in
        select rl.ingredient_id, rl.qty * v_qty as used
          from public.recipe_lines rl join public.ingredients i on i.id = rl.ingredient_id
         where rl.variant_id = v_ov.vid
      loop
        insert into public.ingredient_stock (outlet_id, ingredient_id, qty) values (v_o.outlet_id, r.ingredient_id, -r.used)
        on conflict (outlet_id, ingredient_id) do update set qty = public.ingredient_stock.qty - r.used, updated_at = now();
        insert into public.pos_item_usage (item_id, ingredient_id, qty) values (v_item, r.ingredient_id, r.used)
        on conflict (item_id, ingredient_id) do update set qty = public.pos_item_usage.qty + excluded.qty;
      end loop;
    elsif v_ov.station is null then
      -- a shelf item with no screen (bottled water, packed snacks): take it from outlet stock
      if v_ov.stock < v_qty then raise exception 'NOT_ENOUGH_STOCK'; end if;
      update public.outlet_variants set stock = stock - v_qty where outlet_id = v_o.outlet_id and variant_id = v_ov.vid;
      update public.pos_order_items set stock_deducted = true where id = v_item;
    end if;
    v_count := v_count + 1;
  end loop;

  update public.pos_orders set first_sent_at = coalesce(first_sent_at, now()) where id = p_order;
  perform public.pos_recalc(p_order);
end $$;

create or replace function public.pos_set_item_status(p_item uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_item public.pos_order_items%rowtype;
  v_o public.pos_orders%rowtype;
begin
  if p_status not in ('new', 'preparing', 'ready', 'served') then raise exception 'BAD_STATUS'; end if;
  select * into v_item from public.pos_order_items where id = p_item for update;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  select * into v_o from public.pos_orders where id = v_item.order_id;
  if not public.can_edit_catalog() or not public.can_access_outlet(v_o.outlet_id) then raise exception 'FORBIDDEN'; end if;
  if v_item.status = 'void' or v_o.status <> 'open' then raise exception 'ORDER_CLOSED'; end if;
  update public.pos_order_items
     set status = p_status,
         preparing_at = case when p_status = 'new' then null else coalesce(preparing_at, case when p_status in ('preparing', 'ready', 'served') then now() end) end,
         ready_at     = case when p_status in ('new', 'preparing') then null else coalesce(ready_at, now()) end,
         served_at    = case when p_status = 'served' then coalesce(served_at, now()) else null end
   where id = p_item;
end $$;

create or replace function public.pos_void_item(p_item uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_item public.pos_order_items%rowtype;
  v_o public.pos_orders%rowtype;
begin
  select * into v_item from public.pos_order_items where id = p_item for update;
  if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  select * into v_o from public.pos_orders where id = v_item.order_id for update;
  if not public.can_edit_catalog() or not public.can_access_outlet(v_o.outlet_id) then raise exception 'FORBIDDEN'; end if;
  if v_o.status <> 'open' or v_item.status = 'void' then raise exception 'ORDER_CLOSED'; end if;
  if v_item.status in ('ready', 'served') and not public.can_manage_store() then raise exception 'MANAGER_ONLY'; end if;
  perform public.pos_restore_item(p_item);
  update public.pos_order_items set status = 'void', void_reason = nullif(trim(p_reason), '') where id = p_item;
  perform public.pos_recalc(v_item.order_id);
end $$;

create or replace function public.pos_cancel_order(p_order uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_o public.pos_orders%rowtype;
  r record;
begin
  select * into v_o from public.pos_orders where id = p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not public.can_edit_catalog() or not public.can_access_outlet(v_o.outlet_id) then raise exception 'FORBIDDEN'; end if;
  if v_o.status <> 'open' then raise exception 'ORDER_CLOSED'; end if;
  if exists (select 1 from public.pos_order_items where order_id = p_order and status <> 'void') and not public.can_manage_store() then
    raise exception 'MANAGER_ONLY';
  end if;
  for r in select id from public.pos_order_items where order_id = p_order and status <> 'void' loop
    perform public.pos_restore_item(r.id);
    update public.pos_order_items set status = 'void', void_reason = coalesce(nullif(trim(p_reason), ''), 'Order cancelled') where id = r.id;
  end loop;
  update public.pos_orders set status = 'cancelled', closed_at = now(), closed_by = (select auth.uid()), note = coalesce(nullif(trim(p_reason), ''), note)
   where id = p_order;
  perform public.pos_recalc(p_order);
end $$;

create or replace function public.pos_close_order(p_order uuid, p_discount numeric, p_payments jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_o public.pos_orders%rowtype;
  p jsonb;
  v_paid numeric(12,2) := 0;
  v_noncash numeric(12,2) := 0;
  v_amt numeric(12,2);
  v_method text;
  v_total numeric(12,2);
begin
  select * into v_o from public.pos_orders where id = p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if not public.can_edit_catalog() or not public.can_access_outlet(v_o.outlet_id) then raise exception 'FORBIDDEN'; end if;
  if v_o.status <> 'open' then raise exception 'ORDER_CLOSED'; end if;
  if not exists (select 1 from public.pos_order_items where order_id = p_order and status <> 'void') then raise exception 'EMPTY_ORDER'; end if;

  p_discount := coalesce(p_discount, 0);
  if p_discount < 0 then raise exception 'BAD_DISCOUNT'; end if;
  if p_discount > 0 and not public.can_manage_store() then raise exception 'MANAGER_ONLY'; end if;
  if p_discount > v_o.subtotal then raise exception 'BAD_DISCOUNT'; end if;
  update public.pos_orders set discount = p_discount where id = p_order;
  perform public.pos_recalc(p_order);
  select total into v_total from public.pos_orders where id = p_order;

  if jsonb_typeof(p_payments) <> 'array' then raise exception 'NO_PAYMENT'; end if;
  for p in select * from jsonb_array_elements(p_payments) loop
    v_method := p ->> 'method';
    v_amt := round((p ->> 'amount')::numeric, 2);
    if v_amt is null or v_amt <= 0 then continue; end if;
    if v_method not in ('cash', 'card', 'transfer') then raise exception 'BAD_METHOD'; end if;
    if v_method <> 'cash' and char_length(coalesce(trim(p ->> 'reference'), '')) < 3 then raise exception 'REFERENCE_REQUIRED'; end if;
    insert into public.pos_payments (order_id, method, amount, reference)
    values (p_order, v_method, v_amt, nullif(trim(p ->> 'reference'), ''));
    v_paid := v_paid + v_amt;
    if v_method <> 'cash' then v_noncash := v_noncash + v_amt; end if;
  end loop;

  if v_paid < v_total then raise exception 'UNDERPAID'; end if;
  if v_noncash > v_total then raise exception 'OVERPAID_NON_CASH'; end if;

  update public.pos_orders
     set status = 'closed', closed_at = now(), closed_by = (select auth.uid()),
         paid_total = v_paid, change_given = v_paid - v_total
   where id = p_order;
  update public.table_requests set resolved_at = now(), resolved_by = (select auth.uid())
   where table_id = v_o.table_id and resolved_at is null;
end $$;

-- ---------------------------------------------------------------------
-- 8. Ingredient stock: staff add a delivery or recount
-- ---------------------------------------------------------------------
create or replace function public.pos_adjust_ingredient(p_outlet uuid, p_ingredient uuid, p_mode text, p_qty numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_edit_catalog() or not public.can_access_outlet(p_outlet) then raise exception 'FORBIDDEN'; end if;
  if not exists (
    select 1 from public.ingredients i join public.outlets o on o.company_id = i.company_id
     where i.id = p_ingredient and o.id = p_outlet
  ) then raise exception 'FORBIDDEN'; end if;
  if p_mode = 'add' then
    insert into public.ingredient_stock (outlet_id, ingredient_id, qty) values (p_outlet, p_ingredient, p_qty)
    on conflict (outlet_id, ingredient_id) do update set qty = public.ingredient_stock.qty + p_qty, updated_at = now();
  elsif p_mode = 'set' then
    insert into public.ingredient_stock (outlet_id, ingredient_id, qty) values (p_outlet, p_ingredient, p_qty)
    on conflict (outlet_id, ingredient_id) do update set qty = p_qty, updated_at = now();
  else
    raise exception 'BAD_MODE';
  end if;
end $$;

create or replace function public.pos_set_ingredient_reorder(p_outlet uuid, p_ingredient uuid, p_level numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_manage_store() or not public.can_access_outlet(p_outlet) then raise exception 'FORBIDDEN'; end if;
  insert into public.ingredient_stock (outlet_id, ingredient_id, qty, reorder_level) values (p_outlet, p_ingredient, 0, p_level)
  on conflict (outlet_id, ingredient_id) do update set reorder_level = p_level, updated_at = now();
end $$;

-- ---------------------------------------------------------------------
-- 9. Guests at a table (public QR page) and staff handling requests
-- ---------------------------------------------------------------------
create or replace function public.public_table_info(p_token text)
returns table (table_id uuid, table_name text, outlet_id uuid, outlet_name text, outlet_slug text)
language sql stable security definer set search_path = '' as $$
  select t.id, t.name, o.id, o.name, o.slug
    from public.dining_tables t join public.outlets o on o.id = t.outlet_id
   where t.qr_token = p_token and t.is_active and o.is_active;
$$;

create or replace function public.public_table_request(p_token text, p_kind text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_table uuid;
begin
  if p_kind not in ('bell', 'waiter', 'bill') then raise exception 'BAD_KIND'; end if;
  select t.id into v_table from public.dining_tables t join public.outlets o on o.id = t.outlet_id
   where t.qr_token = p_token and t.is_active and o.is_active;
  if v_table is null then raise exception 'TABLE_NOT_FOUND'; end if;
  insert into public.table_requests (table_id, kind) values (v_table, p_kind) on conflict do nothing;
end $$;

create or replace function public.pos_resolve_request(p_request uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_outlet uuid;
begin
  select t.outlet_id into v_outlet from public.table_requests r join public.dining_tables t on t.id = r.table_id where r.id = p_request;
  if v_outlet is null or not public.can_edit_catalog() or not public.can_access_outlet(v_outlet) then raise exception 'FORBIDDEN'; end if;
  update public.table_requests set resolved_at = now(), resolved_by = (select auth.uid()) where id = p_request and resolved_at is null;
end $$;

-- ---------------------------------------------------------------------
-- 10. Permissions
-- ---------------------------------------------------------------------
revoke all on function public.pos_recalc(uuid), public.pos_restore_item(uuid) from public, anon, authenticated;

revoke all on function
  public.pos_open_order(uuid, uuid, text, text, text),
  public.pos_add_items(uuid, jsonb),
  public.pos_set_item_status(uuid, text),
  public.pos_void_item(uuid, text),
  public.pos_cancel_order(uuid, text),
  public.pos_close_order(uuid, numeric, jsonb),
  public.pos_adjust_ingredient(uuid, uuid, text, numeric),
  public.pos_set_ingredient_reorder(uuid, uuid, numeric),
  public.pos_resolve_request(uuid)
from public, anon;
grant execute on function
  public.pos_open_order(uuid, uuid, text, text, text),
  public.pos_add_items(uuid, jsonb),
  public.pos_set_item_status(uuid, text),
  public.pos_void_item(uuid, text),
  public.pos_cancel_order(uuid, text),
  public.pos_close_order(uuid, numeric, jsonb),
  public.pos_adjust_ingredient(uuid, uuid, text, numeric),
  public.pos_set_ingredient_reorder(uuid, uuid, numeric),
  public.pos_resolve_request(uuid)
to authenticated;

revoke all on function public.public_table_info(text), public.public_table_request(text, text) from public;
grant execute on function public.public_table_info(text), public.public_table_request(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 11. Audit log on the new tables
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['dining_tables', 'pos_orders', 'pos_order_items', 'pos_payments', 'ingredients', 'recipe_lines'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I
                    for each row execute function public.write_audit_log()', t);
  end loop;
end $$;

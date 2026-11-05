-- Phase 1 foundation (from the PRD):
--   1. Staff can be given access to more than one company
--   2. Suppliers (per company), brand, barcode and unit on products
--   3. Cost price (managers and admins only) and price levels 2-4 per outlet
--   4. Reorder level, reorder quantity and shelf location per outlet
--   5. Multi-item transfers (one request, many lines)
--   6. Audit log of every change to key tables
-- Run AFTER 0008_godown_and_transfers.sql.

do $$
begin
  if to_regclass('public.stock_transfers') is null then
    raise exception 'Run 0008_godown_and_transfers.sql first.';
  end if;
end $$;

-- =====================================================================
-- 1. Access to more than one company
-- =====================================================================
-- profiles.company_id stays the "home" company used to sign in.
-- user_companies adds the other companies an admin has opened for that person.
create table if not exists public.user_companies (
  user_id    uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  primary key (user_id, company_id)
);

alter table public.user_companies enable row level security;
drop policy if exists "user_companies: read own or admin" on public.user_companies;
create policy "user_companies: read own or admin" on public.user_companies for select
  using (user_id = (select auth.uid()) or public.is_admin());
revoke insert, update, delete on public.user_companies from anon, authenticated;

-- Companies this person may work in: home company, extra companies, or (admin) all.
create or replace function public.can_access_company(p_company uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin() or (
    p_company is not null and (
      exists (select 1 from public.profiles where id = (select auth.uid()) and company_id = p_company)
      or exists (select 1 from public.user_companies where user_id = (select auth.uid()) and company_id = p_company)
      or exists (select 1 from public.outlet_users ou join public.outlets o on o.id = ou.outlet_id
                  where ou.user_id = (select auth.uid()) and o.company_id = p_company)
    )
  );
$$;

create or replace function public.admin_set_user_companies(p_user_id uuid, p_company_ids uuid[])
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ids  uuid[] := coalesce(p_company_ids, '{}');
  v_home uuid;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  select company_id into v_home from public.profiles where id = p_user_id;
  delete from public.user_companies where user_id = p_user_id and not (company_id = any (v_ids));
  insert into public.user_companies (user_id, company_id)
  select p_user_id, c.id from public.companies c
   where c.id = any (v_ids) and c.id is distinct from v_home
  on conflict do nothing;
  -- Drop outlet access in companies the person no longer has.
  delete from public.outlet_users ou
   using public.outlets o
   where ou.user_id = p_user_id and o.id = ou.outlet_id
     and v_home is not null
     and o.company_id is distinct from v_home
     and not (o.company_id = any (v_ids));
end $$;

revoke all on function public.admin_set_user_companies(uuid, uuid[]) from public, anon;
grant execute on function public.admin_set_user_companies(uuid, uuid[]) to authenticated;

-- Outlet access: outlets of the home company or any extra company.
create or replace function public.admin_set_user_outlets(p_user_id uuid, p_outlet_ids uuid[])
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ids     uuid[] := coalesce(p_outlet_ids, '{}');
  v_company uuid;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  select company_id into v_company from public.profiles where id = p_user_id;
  delete from public.outlet_users where user_id = p_user_id and not (outlet_id = any (v_ids));
  insert into public.outlet_users (user_id, outlet_id)
  select p_user_id, o.id from public.outlets o
   where o.id = any (v_ids)
     and (v_company is null
          or o.company_id = v_company
          or exists (select 1 from public.user_companies uc where uc.user_id = p_user_id and uc.company_id = o.company_id))
  on conflict do nothing;
end $$;

-- Changing the home company keeps outlets of extra companies.
create or replace function public.admin_set_staff_login(p_user_id uuid, p_company_id uuid, p_username text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  update public.profiles
     set company_id = p_company_id,
         username   = lower(p_username)
   where id = p_user_id;
  delete from public.user_companies where user_id = p_user_id and company_id = p_company_id;
  delete from public.outlet_users ou
   using public.outlets o
   where ou.user_id = p_user_id and o.id = ou.outlet_id
     and p_company_id is not null
     and o.company_id is distinct from p_company_id
     and not exists (select 1 from public.user_companies uc where uc.user_id = p_user_id and uc.company_id = o.company_id);
end $$;

-- =====================================================================
-- 2. Suppliers, brand, barcode, unit
-- =====================================================================
create table if not exists public.suppliers (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete cascade,
  name          text not null check (char_length(name) between 2 and 120),
  contact_name  text check (char_length(contact_name) <= 120),
  phone         text check (char_length(phone) <= 30),
  email         text check (char_length(email) <= 200),
  gst_number    text check (char_length(gst_number) <= 40),
  notes         text check (char_length(notes) <= 1000),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (company_id, name)
);

alter table public.suppliers enable row level security;
drop policy if exists "suppliers: staff read own companies" on public.suppliers;
create policy "suppliers: staff read own companies" on public.suppliers for select
  using (public.can_edit_catalog() and public.can_access_company(company_id));
drop policy if exists "suppliers: managers write own companies" on public.suppliers;
create policy "suppliers: managers write own companies" on public.suppliers for all
  using (public.can_manage_store() and public.can_access_company(company_id))
  with check (public.can_manage_store() and public.can_access_company(company_id));

alter table public.products
  add column if not exists brand text check (char_length(brand) <= 80),
  add column if not exists unit  text not null default 'pcs' check (char_length(unit) between 1 and 20);

alter table public.product_variants
  add column if not exists barcode text check (barcode ~ '^[A-Za-z0-9._-]{3,64}$');
create unique index if not exists product_variants_barcode_uidx
  on public.product_variants (barcode) where barcode is not null;

-- Which supplier sells each item to each company (one main supplier per company).
create table if not exists public.product_suppliers (
  product_id     uuid not null references public.products (id) on delete cascade,
  supplier_id    uuid not null references public.suppliers (id) on delete cascade,
  supplier_code  text check (char_length(supplier_code) <= 60),
  is_main        boolean not null default true,
  primary key (product_id, supplier_id)
);

alter table public.product_suppliers enable row level security;
drop policy if exists "product_suppliers: staff read" on public.product_suppliers;
create policy "product_suppliers: staff read" on public.product_suppliers for select
  using (public.can_edit_catalog() and exists (
    select 1 from public.suppliers s where s.id = supplier_id and public.can_access_company(s.company_id)));
drop policy if exists "product_suppliers: staff write" on public.product_suppliers;
create policy "product_suppliers: staff write" on public.product_suppliers for all
  using (public.can_edit_catalog() and exists (
    select 1 from public.suppliers s where s.id = supplier_id and public.can_access_company(s.company_id)))
  with check (public.can_edit_catalog() and exists (
    select 1 from public.suppliers s where s.id = supplier_id and public.can_access_company(s.company_id)));

-- =====================================================================
-- 3. Cost price (managers/admins only) and price levels
-- =====================================================================
-- Kept in its own table so staff and customers can never read it.
create table if not exists public.variant_costs (
  variant_id  uuid primary key references public.product_variants (id) on delete cascade,
  cost        numeric(12,2) not null check (cost >= 0),
  updated_at  timestamptz not null default now()
);

alter table public.variant_costs enable row level security;
drop policy if exists "variant_costs: managers only" on public.variant_costs;
create policy "variant_costs: managers only" on public.variant_costs for all
  using (public.can_manage_store()) with check (public.can_manage_store());

-- Price level 1 is outlet_variants.price (retail). Levels 2-4 are optional.
alter table public.outlet_variants
  add column if not exists price_level2 numeric(12,2) check (price_level2 >= 0),
  add column if not exists price_level3 numeric(12,2) check (price_level3 >= 0),
  add column if not exists price_level4 numeric(12,2) check (price_level4 >= 0);

alter table public.store_settings
  add column if not exists price_level_names text[] not null default '{Retail,Wholesale,Staff,Corporate}';

-- =====================================================================
-- 4. Reorder level, reorder quantity, shelf location (per outlet)
-- =====================================================================
alter table public.outlet_variants
  add column if not exists reorder_level  int check (reorder_level >= 0),
  add column if not exists reorder_qty    int check (reorder_qty > 0),
  add column if not exists shelf_location text check (char_length(shelf_location) <= 40);

-- Items at or below their reorder level (shop + godown of that outlet), with the main supplier.
create or replace view public.reorder_suggestions
with (security_invoker = true) as
select
  ov.outlet_id,
  o.company_id,
  ov.variant_id,
  v.product_id,
  p.name            as product_name,
  v.option1,
  v.option2,
  p.unit,
  ov.stock,
  ov.godown_stock,
  ov.reorder_level,
  coalesce(ov.reorder_qty, greatest(ov.reorder_level * 2 - (ov.stock + ov.godown_stock), 1)) as order_qty,
  ov.shelf_location,
  s.id              as supplier_id,
  s.name            as supplier_name,
  s.phone           as supplier_phone,
  ps.supplier_code
from public.outlet_variants ov
join public.outlets o           on o.id = ov.outlet_id
join public.product_variants v  on v.id = ov.variant_id
join public.products p          on p.id = v.product_id
left join lateral (
  select ps2.supplier_id, ps2.supplier_code
    from public.product_suppliers ps2
    join public.suppliers s2 on s2.id = ps2.supplier_id
   where ps2.product_id = p.id and s2.company_id = o.company_id and s2.is_active
   order by ps2.is_main desc
   limit 1
) ps on true
left join public.suppliers s    on s.id = ps.supplier_id
where ov.reorder_level is not null
  and ov.stock + ov.godown_stock <= ov.reorder_level;

grant select on public.reorder_suggestions to authenticated;

-- =====================================================================
-- 5. Multi-item transfers
-- =====================================================================
alter table public.stock_transfers add column if not exists batch_id uuid;
create index if not exists stock_transfers_batch_idx on public.stock_transfers (batch_id) where batch_id is not null;

-- p_lines: [{"variant_id": "...", "quantity": 5}, ...]
create or replace function public.request_stock_transfer_batch(
  p_from_outlet   uuid,
  p_from_location text,
  p_to_outlet     uuid,
  p_to_location   text,
  p_lines         jsonb,
  p_note          text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_batch uuid := gen_random_uuid();
  v_line  jsonb;
  v_ids   uuid[] := '{}';
begin
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'NO_LINES';
  end if;
  if jsonb_array_length(p_lines) > 200 then
    raise exception 'TOO_MANY_LINES';
  end if;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_ids := v_ids || public.request_stock_transfer(
      (v_line ->> 'variant_id')::uuid,
      p_from_outlet, p_from_location, p_to_outlet, p_to_location,
      (v_line ->> 'quantity')::int,
      p_note
    );
  end loop;
  -- Tag every line created by this call with the same batch id.
  update public.stock_transfers set batch_id = v_batch where id = any (v_ids);
  return v_batch;
end $$;

revoke all on function public.request_stock_transfer_batch(uuid, text, uuid, text, jsonb, text) from public, anon;
grant execute on function public.request_stock_transfer_batch(uuid, text, uuid, text, jsonb, text) to authenticated;

-- Approve or reject every pending line of a batch at once (all or nothing).
create or replace function public.decide_stock_transfer_batch(p_batch uuid, p_approve boolean, p_note text default null)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_id    uuid;
  v_count int := 0;
begin
  for v_id in select id from public.stock_transfers where batch_id = p_batch and status = 'pending' order by created_at loop
    perform public.decide_stock_transfer(v_id, p_approve, p_note);
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then
    raise exception 'TRANSFER_NOT_FOUND';
  end if;
  return v_count;
end $$;

revoke all on function public.decide_stock_transfer_batch(uuid, boolean, text) from public, anon;
grant execute on function public.decide_stock_transfer_batch(uuid, boolean, text) to authenticated;

-- =====================================================================
-- 6. Audit log
-- =====================================================================
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  user_id     uuid references auth.users (id) on delete set null,
  table_name  text not null,
  record_id   text,
  action      text not null check (action in ('insert', 'update', 'delete')),
  old_data    jsonb,
  new_data    jsonb
);

create index if not exists audit_log_at_idx    on public.audit_log (at desc);
create index if not exists audit_log_table_idx on public.audit_log (table_name, at desc);
create index if not exists audit_log_user_idx  on public.audit_log (user_id, at desc);

alter table public.audit_log enable row level security;
drop policy if exists "audit_log: admin read" on public.audit_log;
create policy "audit_log: admin read" on public.audit_log for select using (public.is_admin());
-- Nobody can change or delete history, not even admins.
revoke insert, update, delete, truncate on public.audit_log from anon, authenticated;

create or replace function public.write_audit_log()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_id  text;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;
  -- Skip updates that changed nothing.
  if tg_op = 'UPDATE' and v_old = v_new then return new; end if;
  v_id := coalesce(v_new ->> 'id', v_old ->> 'id',
                   concat_ws(':', coalesce(v_new, v_old) ->> 'outlet_id', coalesce(v_new, v_old) ->> 'variant_id',
                                  coalesce(v_new, v_old) ->> 'user_id', coalesce(v_new, v_old) ->> 'product_id',
                                  coalesce(v_new, v_old) ->> 'supplier_id', coalesce(v_new, v_old) ->> 'company_id'));
  insert into public.audit_log (user_id, table_name, record_id, action, old_data, new_data)
  values ((select auth.uid()), tg_table_name, v_id, lower(tg_op), v_old, v_new);
  return coalesce(new, old);
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'companies', 'outlets', 'outlet_users', 'user_companies', 'profiles',
    'categories', 'products', 'product_variants', 'outlet_variants', 'variant_costs',
    'suppliers', 'product_suppliers', 'stock_transfers', 'orders', 'store_settings'
  ] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I
                    for each row execute function public.write_audit_log()', t);
  end loop;
end $$;

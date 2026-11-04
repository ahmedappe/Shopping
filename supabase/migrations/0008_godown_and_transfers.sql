-- Godown stock for every outlet, and stock transfers between outlets (same company: manager/admin approves; between companies: admin only).
--   * outlet_variants.stock          = shop stock (what customers can buy)
--   * outlet_variants.godown_stock   = that outlet's godown (not sold to customers)
--   * stock_transfers                = a request to move stock; moves only after a manager/admin approves
-- Run AFTER 0007_companies.sql.

do $$
begin
  if to_regclass('public.companies') is null then
    raise exception 'Run 0007_companies.sql first.';
  end if;
end $$;

alter table public.outlet_variants
  add column if not exists godown_stock int not null default 0 check (godown_stock >= 0);

create table if not exists public.stock_transfers (
  id            uuid primary key default gen_random_uuid(),
  variant_id    uuid not null references public.product_variants (id) on delete cascade,
  from_outlet   uuid not null references public.outlets (id) on delete restrict,
  from_location text not null check (from_location in ('shop', 'godown')),
  to_outlet     uuid not null references public.outlets (id) on delete restrict,
  to_location   text not null check (to_location in ('shop', 'godown')),
  quantity      int  not null check (quantity > 0 and quantity <= 1000000),
  note          text check (char_length(note) <= 500),
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by  uuid references auth.users (id) on delete set null,
  decided_by    uuid references auth.users (id) on delete set null,
  decision_note text check (char_length(decision_note) <= 500),
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  check (not (from_outlet = to_outlet and from_location = to_location))
);

create index if not exists stock_transfers_status_idx on public.stock_transfers (status, created_at desc);

alter table public.stock_transfers enable row level security;

drop policy if exists "stock_transfers: read own outlets" on public.stock_transfers;
create policy "stock_transfers: read own outlets" on public.stock_transfers for select
  using (
    public.can_edit_catalog()
    and (public.can_access_outlet(from_outlet) or public.can_access_outlet(to_outlet))
  );

revoke insert, update, delete on public.stock_transfers from anon, authenticated;

-- ---------------------------------------------------------------------
-- Request a transfer (staff, manager or admin who works in either outlet;
-- between the two companies: admin only)
-- ---------------------------------------------------------------------
create or replace function public.request_stock_transfer(
  p_variant_id    uuid,
  p_from_outlet   uuid,
  p_from_location text,
  p_to_outlet     uuid,
  p_to_location   text,
  p_quantity      int,
  p_note          text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_from_company uuid;
  v_to_company   uuid;
  v_id           uuid;
begin
  if not public.can_edit_catalog() then
    raise exception 'FORBIDDEN';
  end if;
  if not (public.can_access_outlet(p_from_outlet) or public.can_access_outlet(p_to_outlet)) then
    raise exception 'FORBIDDEN';
  end if;
  if p_quantity is null or p_quantity < 1 then
    raise exception 'INVALID_QUANTITY';
  end if;
  if p_from_location not in ('shop', 'godown') or p_to_location not in ('shop', 'godown') then
    raise exception 'INVALID_LOCATION';
  end if;
  if p_from_outlet = p_to_outlet and p_from_location = p_to_location then
    raise exception 'SAME_LOCATION';
  end if;

  select company_id into v_from_company from public.outlets where id = p_from_outlet;
  select company_id into v_to_company   from public.outlets where id = p_to_outlet;
  -- Between companies: admin only.
  if v_from_company is distinct from v_to_company and not public.is_admin() then
    raise exception 'DIFFERENT_COMPANY';
  end if;

  if not exists (select 1 from public.outlet_variants where outlet_id = p_from_outlet and variant_id = p_variant_id) then
    raise exception 'NO_STOCK_RECORD';
  end if;

  insert into public.stock_transfers
    (variant_id, from_outlet, from_location, to_outlet, to_location, quantity, note, requested_by)
  values
    (p_variant_id, p_from_outlet, p_from_location, p_to_outlet, p_to_location, p_quantity, nullif(trim(p_note), ''), auth.uid())
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.request_stock_transfer(uuid, uuid, text, uuid, text, int, text) from public, anon;
grant execute on function public.request_stock_transfer(uuid, uuid, text, uuid, text, int, text) to authenticated;

-- ---------------------------------------------------------------------
-- Approve or reject (manager or admin; must work in one of the two outlets;
-- between the two companies: admin only)
-- ---------------------------------------------------------------------
create or replace function public.decide_stock_transfer(p_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  t          public.stock_transfers%rowtype;
  v_have     int;
  v_price    numeric;
begin
  if not public.can_manage_store() then
    raise exception 'FORBIDDEN';
  end if;

  select * into t from public.stock_transfers where id = p_id for update;
  if not found then
    raise exception 'TRANSFER_NOT_FOUND';
  end if;
  -- Between companies: admin only.
  if (select company_id from public.outlets where id = t.from_outlet)
       is distinct from (select company_id from public.outlets where id = t.to_outlet)
     and not public.is_admin() then
    raise exception 'DIFFERENT_COMPANY';
  end if;
  if not (public.can_access_outlet(t.from_outlet) or public.can_access_outlet(t.to_outlet)) then
    raise exception 'FORBIDDEN';
  end if;
  if t.status <> 'pending' then
    raise exception 'ALREADY_DECIDED';
  end if;

  if p_approve then
    -- Check and take from the source.
    select case when t.from_location = 'shop' then stock else godown_stock end, price
      into v_have, v_price
      from public.outlet_variants
     where outlet_id = t.from_outlet and variant_id = t.variant_id
       for update;
    if not found or v_have < t.quantity then
      raise exception 'NOT_ENOUGH_STOCK';
    end if;

    if t.from_location = 'shop' then
      update public.outlet_variants set stock = stock - t.quantity
       where outlet_id = t.from_outlet and variant_id = t.variant_id;
    else
      update public.outlet_variants set godown_stock = godown_stock - t.quantity
       where outlet_id = t.from_outlet and variant_id = t.variant_id;
    end if;

    -- Give to the destination (created, not for sale yet, if the outlet never had the item).
    insert into public.outlet_variants (outlet_id, variant_id, price, stock, godown_stock, is_active)
    values (t.to_outlet, t.variant_id, v_price,
            case when t.to_location = 'shop'   then t.quantity else 0 end,
            case when t.to_location = 'godown' then t.quantity else 0 end,
            false)
    on conflict (outlet_id, variant_id) do update
      set stock        = public.outlet_variants.stock        + case when t.to_location = 'shop'   then t.quantity else 0 end,
          godown_stock = public.outlet_variants.godown_stock + case when t.to_location = 'godown' then t.quantity else 0 end;
  end if;

  update public.stock_transfers
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = auth.uid(),
         decision_note = nullif(trim(p_note), ''),
         decided_at = now()
   where id = p_id;
end $$;

revoke all on function public.decide_stock_transfer(uuid, boolean, text) from public, anon;
grant execute on function public.decide_stock_transfer(uuid, boolean, text) to authenticated;

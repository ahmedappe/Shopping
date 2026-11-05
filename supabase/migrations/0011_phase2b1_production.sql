-- =====================================================================
-- 0011: Phase 2B-1 — items made in advance (prepared stock) and production log
--   * outlet_variants: made_in_advance, ready_qty (prepared and waiting), ready_reorder (make more at)
--   * production_log: every "made / wasted / counted" entry from the kitchen or bar screen
--   * pos_record_production(): kitchen enters "chicken curry 9 made"; ingredients come off by recipe
--   * pos_add_items(): a sale first uses prepared stock (ready at once), the rest goes to the kitchen
--   * voiding a sale puts prepared stock (or ingredients) back
-- Needs 0010 first. Safe to run more than once.
-- =====================================================================

do $$
begin
  if to_regclass('public.pos_orders') is null then
    raise exception 'Run 0010_phase2a_cafe_pos.sql first.';
  end if;
end $$;

alter table public.outlet_variants add column if not exists made_in_advance boolean not null default false;
alter table public.outlet_variants add column if not exists ready_qty int not null default 0 check (ready_qty >= 0);
alter table public.outlet_variants add column if not exists ready_reorder int check (ready_reorder >= 0);
alter table public.pos_order_items add column if not exists from_ready boolean not null default false;

create table if not exists public.production_log (
  id          uuid primary key default gen_random_uuid(),
  outlet_id   uuid not null references public.outlets (id) on delete cascade,
  variant_id  uuid not null references public.product_variants (id) on delete cascade,
  kind        text not null check (kind in ('made', 'undo_made', 'wasted', 'set')),
  qty         int not null check (qty >= 0),
  ready_after int not null,
  by_user     uuid references auth.users (id) on delete set null,
  at          timestamptz not null default now()
);
create index if not exists production_log_outlet_idx on public.production_log (outlet_id, at desc);

alter table public.production_log enable row level security;
drop policy if exists "production_log: read" on public.production_log;
create policy "production_log: read" on public.production_log for select to authenticated
  using (public.can_access_outlet(outlet_id));
revoke insert, update, delete on public.production_log from anon, authenticated;
revoke all on public.production_log from anon;

-- ---------------------------------------------------------------------
-- Production entry
-- ---------------------------------------------------------------------
create or replace function public.pos_record_production(p_outlet uuid, p_variant uuid, p_qty int, p_kind text)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_ready int;
  v_adv boolean;
  r record;
  v_sign int;
begin
  if not public.can_edit_catalog() or not public.can_access_outlet(p_outlet) then raise exception 'FORBIDDEN'; end if;
  if p_kind not in ('made', 'undo_made', 'wasted', 'set') then raise exception 'BAD_KIND'; end if;
  if p_qty is null or p_qty < 0 or p_qty > 10000 or (p_kind <> 'set' and p_qty = 0) then raise exception 'BAD_QUANTITY'; end if;

  select made_in_advance, ready_qty into v_adv, v_ready
    from public.outlet_variants where outlet_id = p_outlet and variant_id = p_variant for update;
  if not found or not v_adv then raise exception 'NOT_ADVANCE_ITEM'; end if;

  if p_kind in ('made', 'undo_made') then
    v_sign := case when p_kind = 'made' then 1 else -1 end;
    for r in
      select rl.ingredient_id, rl.qty * p_qty as used
        from public.recipe_lines rl join public.ingredients i on i.id = rl.ingredient_id
       where rl.variant_id = p_variant
    loop
      insert into public.ingredient_stock (outlet_id, ingredient_id, qty) values (p_outlet, r.ingredient_id, -v_sign * r.used)
      on conflict (outlet_id, ingredient_id) do update set qty = public.ingredient_stock.qty - v_sign * r.used, updated_at = now();
    end loop;
  end if;

  v_ready := case p_kind
    when 'made' then v_ready + p_qty
    when 'undo_made' then greatest(v_ready - p_qty, 0)
    when 'wasted' then greatest(v_ready - p_qty, 0)
    else p_qty end;

  update public.outlet_variants set ready_qty = v_ready where outlet_id = p_outlet and variant_id = p_variant;
  insert into public.production_log (outlet_id, variant_id, kind, qty, ready_after, by_user)
  values (p_outlet, p_variant, p_kind, p_qty, v_ready, (select auth.uid()));
  return v_ready;
end $$;

revoke all on function public.pos_record_production(uuid, uuid, int, text) from public, anon;
grant execute on function public.pos_record_production(uuid, uuid, int, text) to authenticated;

-- ---------------------------------------------------------------------
-- Sales use prepared stock first; voids put it back
-- ---------------------------------------------------------------------
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
  if v_item.from_ready and v_item.variant_id is not null then
    update public.outlet_variants set ready_qty = ready_qty + v_item.quantity
     where outlet_id = v_outlet and variant_id = v_item.variant_id;
    update public.pos_order_items set from_ready = false where id = p_item;
  end if;
  if v_item.stock_deducted and v_item.variant_id is not null then
    update public.outlet_variants set stock = stock + v_item.quantity
     where outlet_id = v_outlet and variant_id = v_item.variant_id;
    update public.pos_order_items set stock_deducted = false where id = p_item;
  end if;
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
  v_take int;
  v_rest int;
  v_name text;
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
    select ov.price, ov.station, ov.stock, ov.is_active, ov.made_in_advance, ov.ready_qty,
           p.name as pname, pv.option1, pv.option2, pv.id as vid
      into v_ov
      from public.outlet_variants ov
      join public.product_variants pv on pv.id = ov.variant_id
      join public.products p on p.id = pv.product_id
     where ov.outlet_id = v_o.outlet_id and ov.variant_id = (l ->> 'variant_id')::uuid
     for update of ov;
    if not found or not v_ov.is_active then raise exception 'ITEM_NOT_AVAILABLE'; end if;

    v_name := v_ov.pname || coalesce(' · ' || nullif(concat_ws(' / ', v_ov.option1, v_ov.option2), ''), '');

    -- items made in advance: serve what is already prepared first (ready straight away)
    v_take := case when v_ov.made_in_advance then least(v_ov.ready_qty, v_qty) else 0 end;
    v_rest := v_qty - v_take;
    if v_take > 0 then
      insert into public.pos_order_items (order_id, variant_id, name, unit_price, quantity, note, station, status, from_ready, ready_at)
      values (p_order, v_ov.vid, v_name, v_ov.price, v_take, nullif(trim(l ->> 'note'), ''), v_ov.station, 'ready', true, now());
      update public.outlet_variants set ready_qty = ready_qty - v_take
       where outlet_id = v_o.outlet_id and variant_id = v_ov.vid;
    end if;
    if v_rest = 0 then
      v_count := v_count + 1;
      continue;
    end if;
    v_qty := v_rest;

    insert into public.pos_order_items (order_id, variant_id, name, unit_price, quantity, note, station, status, served_at)
    values (
      p_order, v_ov.vid, v_name,
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

revoke all on function public.pos_restore_item(uuid) from public, anon, authenticated;
revoke all on function public.pos_add_items(uuid, jsonb) from public, anon;
grant execute on function public.pos_add_items(uuid, jsonb) to authenticated;


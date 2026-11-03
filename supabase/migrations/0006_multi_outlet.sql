-- =====================================================================
-- 0006: Multiple outlets
--   * outlets: each has its own domain(s), bank account and optional delivery fee
--   * outlet_variants: price, stock and availability of every item PER OUTLET
--     (items themselves — name, photos, variants — stay shared)
--   * outlet_users: which outlets a staff member / manager may work in
--     (admins always see every outlet)
--   * orders belong to an outlet; stock is taken from and returned to that outlet
-- Needs 0003_staff_roles_and_users.sql to have been run first.
-- Safe to run more than once.
-- =====================================================================

do $$
begin
  if to_regprocedure('public.can_manage_store()') is null then
    raise exception 'Run 0003_staff_roles_and_users.sql first: this update builds on its staff and manager roles.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------
create table if not exists public.outlets (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null check (char_length(name) between 2 and 80),
  slug                     text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  hostnames                text[] not null default '{}',   -- domains that open this outlet, e.g. {shop.northjugo.mv}
  bank_name                text check (char_length(bank_name) <= 80),
  account_name             text check (char_length(account_name) <= 120),
  account_number           text check (char_length(account_number) <= 40),
  delivery_fee             numeric(12,2) check (delivery_fee >= 0),            -- null = use the store-wide setting
  free_delivery_threshold  numeric(12,2) check (free_delivery_threshold >= 0),
  is_active                boolean not null default true,
  sort_order               int not null default 0,
  created_at               timestamptz not null default now()
);

create table if not exists public.outlet_users (
  user_id    uuid not null references auth.users (id) on delete cascade,
  outlet_id  uuid not null references public.outlets (id) on delete cascade,
  primary key (user_id, outlet_id)
);

create table if not exists public.outlet_variants (
  outlet_id   uuid not null references public.outlets (id) on delete cascade,
  variant_id  uuid not null references public.product_variants (id) on delete cascade,
  price       numeric(12,2) not null check (price >= 0),
  stock       int not null default 0 check (stock >= 0),
  is_active   boolean not null default true,
  updated_at  timestamptz not null default now(),
  primary key (outlet_id, variant_id)
);
create index if not exists outlet_variants_variant_idx on public.outlet_variants (variant_id);
drop trigger if exists outlet_variants_updated_at on public.outlet_variants;
create trigger outlet_variants_updated_at before update on public.outlet_variants
  for each row execute function public.set_updated_at();

alter table public.orders add column if not exists outlet_id uuid references public.outlets (id) on delete restrict;
create index if not exists orders_outlet_idx on public.orders (outlet_id, created_at desc);

-- ---------------------------------------------------------------------
-- 2. Starting data: your three outlets, and today's items sold at all of them
--    (same price and stock as now — adjust each outlet afterwards in Admin).
-- ---------------------------------------------------------------------
insert into public.outlets (name, slug, sort_order) values
  ('North Jugo',     'north-jugo',     1),
  ('Maaloodhu Cafe', 'maaloodhu-cafe', 2),
  ('Musammaa Cafe',  'musammaa-cafe',  3)
on conflict (slug) do nothing;

insert into public.outlet_variants (outlet_id, variant_id, price, stock, is_active)
select o.id, pv.id, pv.price, pv.stock, pv.is_active
from public.outlets o
cross join public.product_variants pv
where o.slug in ('north-jugo', 'maaloodhu-cafe', 'musammaa-cafe')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 3. Access helper: admins reach every outlet, others only assigned ones
-- ---------------------------------------------------------------------
create or replace function public.can_access_outlet(p_outlet uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_admin() or (
    p_outlet is not null and exists (
      select 1 from public.outlet_users
      where user_id = (select auth.uid()) and outlet_id = p_outlet
    )
  );
$$;

-- ---------------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------------
alter table public.outlets         enable row level security;
alter table public.outlet_users    enable row level security;
alter table public.outlet_variants enable row level security;

drop policy if exists "outlets: public read" on public.outlets;
drop policy if exists "outlets: admin write" on public.outlets;
create policy "outlets: public read" on public.outlets
  for select using (is_active or public.can_access_outlet(id));
create policy "outlets: admin write" on public.outlets for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "outlet_users: read own or admin" on public.outlet_users;
create policy "outlet_users: read own or admin" on public.outlet_users
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
revoke insert, update, delete on public.outlet_users from anon, authenticated;

drop policy if exists "outlet_variants: public read" on public.outlet_variants;
drop policy if exists "outlet_variants: staff write" on public.outlet_variants;
create policy "outlet_variants: public read" on public.outlet_variants
  for select using (
    public.can_access_outlet(outlet_id)
    or (is_active and exists (select 1 from public.outlets o where o.id = outlet_id and o.is_active))
  );
create policy "outlet_variants: staff write" on public.outlet_variants for all to authenticated
  using (public.can_edit_catalog() and public.can_access_outlet(outlet_id))
  with check (public.can_edit_catalog() and public.can_access_outlet(outlet_id));

-- Orders: customers see their own; managers see orders of their outlets; admins see all
drop policy if exists "orders: read own or manager" on public.orders;
drop policy if exists "orders: read own or outlet staff" on public.orders;
create policy "orders: read own or outlet staff" on public.orders
  for select to authenticated using (
    user_id = (select auth.uid())
    or (public.can_manage_store() and public.can_access_outlet(outlet_id))
  );

-- Items and history follow the order's own visibility
drop policy if exists "order_items: read own or manager" on public.order_items;
drop policy if exists "order_items: read via order" on public.order_items;
create policy "order_items: read via order" on public.order_items
  for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id));

drop policy if exists "history: read own or manager" on public.order_status_history;
drop policy if exists "history: read via order" on public.order_status_history;
create policy "history: read via order" on public.order_status_history
  for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id));

-- Payment slip images: the customer, or whoever may see that order
drop policy if exists "payment-slips: owner or manager read" on storage.objects;
drop policy if exists "payment-slips: owner or outlet staff read" on storage.objects;
create policy "payment-slips: owner or outlet staff read" on storage.objects for select to authenticated
  using (bucket_id = 'payment-slips' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (select 1 from public.orders o where o.slip_path = name)
  ));

-- ---------------------------------------------------------------------
-- 5. Storefront listing per outlet (prices and stock from outlet_variants)
-- ---------------------------------------------------------------------
create or replace view public.outlet_product_listing with (security_invoker = true) as
select
  ov.outlet_id,
  p.id, p.name, p.slug, p.description, p.is_active, p.is_featured, p.created_at,
  p.category_id, c.slug as category_slug, c.name as category_name,
  p.compare_at_price,
  min(ov.price)            as min_price,
  max(ov.price)            as max_price,
  sum(ov.stock)::int       as total_stock,
  count(*)::int            as variant_count,
  (select pi.path from public.product_images pi
    where pi.product_id = p.id
    order by pi.sort_order, pi.created_at
    limit 1)               as image_path
from public.outlet_variants ov
join public.product_variants pv on pv.id = ov.variant_id
join public.products p on p.id = pv.product_id
left join public.categories c on c.id = p.category_id
where ov.is_active and pv.is_active
group by ov.outlet_id, p.id, c.id;

-- ---------------------------------------------------------------------
-- 6. place_order: now for one outlet — uses that outlet's price and stock
-- ---------------------------------------------------------------------
drop function if exists public.place_order(jsonb, text, text, text, text, text, text);

create or replace function public.place_order(
  p_items          jsonb,
  p_customer_name  text,
  p_phone          text,
  p_email          text,
  p_address        text,
  p_city           text,
  p_notes          text default null,
  p_outlet_id      uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid        uuid := auth.uid();
  v_order_id   uuid;
  v_subtotal   numeric(12,2) := 0;
  v_fee        numeric(12,2) := 0;
  v_threshold  numeric(12,2);
  v_pending    int;
  v_price      numeric(12,2);
  v_stock      int;
  v_pid        uuid;
  v_pname      text;
  v_opt1       text;
  v_opt2       text;
  v_sku        text;
  v_img        text;
  v_o_fee      numeric(12,2);
  v_o_thresh   numeric(12,2);
  r            record;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select delivery_fee, free_delivery_threshold into v_o_fee, v_o_thresh
  from public.outlets where id = p_outlet_id and is_active;
  if not found then
    raise exception 'OUTLET_NOT_FOUND';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'INVALID_CART';
  end if;

  -- Stop stock hoarding: limit unpaid orders per customer
  select count(*) into v_pending from public.orders
  where user_id = v_uid and status = 'pending';
  if v_pending >= 3 then
    raise exception 'TOO_MANY_PENDING_ORDERS';
  end if;

  insert into public.orders (user_id, outlet_id, customer_name, phone, email, address, city, notes)
  values (v_uid, p_outlet_id, trim(p_customer_name), trim(p_phone), nullif(trim(p_email), ''),
          trim(p_address), trim(p_city), nullif(trim(p_notes), ''))
  returning id into v_order_id;

  -- Merge duplicate lines and lock rows in a stable order (avoids deadlocks)
  for r in
    select (i ->> 'variant_id')::uuid as variant_id,
           sum((i ->> 'quantity')::int)::int as quantity
    from jsonb_array_elements(p_items) as i
    group by 1
    order by 1
  loop
    if r.quantity is null or r.quantity < 1 or r.quantity > 99 then
      raise exception 'INVALID_QUANTITY';
    end if;

    select ov.price, ov.stock, pv.option1, pv.option2, pv.sku, p.id, p.name
      into v_price, v_stock, v_opt1, v_opt2, v_sku, v_pid, v_pname
    from public.outlet_variants ov
    join public.product_variants pv on pv.id = ov.variant_id
    join public.products p on p.id = pv.product_id
    where ov.outlet_id = p_outlet_id and ov.variant_id = r.variant_id
      and ov.is_active and pv.is_active and p.is_active
    for update of ov;

    if not found then
      raise exception 'ITEM_UNAVAILABLE';
    end if;
    if v_stock < r.quantity then
      raise exception 'OUT_OF_STOCK:%', v_pname;
    end if;

    select pi.path into v_img from public.product_images pi
    where pi.product_id = v_pid order by pi.sort_order, pi.created_at limit 1;

    update public.outlet_variants set stock = stock - r.quantity
    where outlet_id = p_outlet_id and variant_id = r.variant_id;

    insert into public.order_items
      (order_id, product_id, variant_id, product_name, variant_name, sku, image_path, unit_price, quantity, line_total)
    values
      (v_order_id, v_pid, r.variant_id, v_pname,
       nullif(concat_ws(' / ', v_opt1, v_opt2), ''), v_sku, v_img,
       v_price, r.quantity, v_price * r.quantity);

    v_subtotal := v_subtotal + v_price * r.quantity;
  end loop;

  -- Delivery fee: the outlet's own setting if it has one, otherwise the store-wide one
  if v_o_fee is not null then
    v_fee := v_o_fee;
    v_threshold := v_o_thresh;
  else
    select delivery_fee, free_delivery_threshold into v_fee, v_threshold
    from public.store_settings where id = 1;
  end if;
  v_fee := coalesce(v_fee, 0);
  if v_threshold is not null and v_subtotal >= v_threshold then
    v_fee := 0;
  end if;

  update public.orders
     set subtotal = v_subtotal, delivery_fee = v_fee, total = v_subtotal + v_fee
   where id = v_order_id;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by)
  values (v_order_id, null, 'pending', v_uid);

  return v_order_id;
end $$;

revoke all on function public.place_order(jsonb, text, text, text, text, text, text, uuid) from public, anon;
grant execute on function public.place_order(jsonb, text, text, text, text, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 7. admin_set_order_status: only for outlets you can access; stock goes
--    back to the order's outlet when an order is rejected.
--    (Also keeps 0005: reopening an approved order is admin-only.)
-- ---------------------------------------------------------------------
create or replace function public.admin_set_order_status(
  p_order_id uuid,
  p_status public.order_status,
  p_note text default null,
  p_collection_location text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old       public.order_status;
  v_outlet    uuid;
  v_location  text := nullif(trim(p_collection_location), '');
  v_note      text := nullif(trim(p_note), '');
begin
  if not public.can_manage_store() then
    raise exception 'FORBIDDEN';
  end if;

  select status, outlet_id into v_old, v_outlet from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if not public.can_access_outlet(v_outlet) then
    raise exception 'FORBIDDEN';
  end if;

  if not (
       (v_old = 'pending'       and p_status in ('approved', 'rejected'))
    or (v_old = 'slip_uploaded' and p_status in ('approved', 'rejected', 'pending'))
    or (v_old = 'approved'      and p_status in ('delivered', 'rejected', 'pending'))
  ) then
    raise exception 'INVALID_TRANSITION';
  end if;

  if v_location is not null and p_status <> 'delivered' then
    raise exception 'INVALID_TRANSITION';
  end if;
  if char_length(v_location) > 100 then
    raise exception 'INVALID_LOCATION';
  end if;

  -- Reopening an approved order is admin-only and needs a message for the customer.
  if v_old = 'approved' and p_status = 'pending' then
    if not public.is_admin() then
      raise exception 'FORBIDDEN';
    end if;
    if v_note is null then
      raise exception 'INVALID_TRANSITION';
    end if;
  end if;

  if p_status = 'rejected' then
    if v_outlet is null then
      -- orders placed before outlets existed
      update public.product_variants pv
         set stock = pv.stock + oi.quantity
        from public.order_items oi
       where oi.order_id = p_order_id and oi.variant_id = pv.id;
    else
      update public.outlet_variants ov
         set stock = ov.stock + oi.quantity
        from public.order_items oi
       where oi.order_id = p_order_id and oi.variant_id = ov.variant_id and ov.outlet_id = v_outlet;
    end if;
  end if;

  update public.orders
     set status = p_status,
         admin_note = coalesce(v_note, admin_note),
         handover_method = case when p_status = 'delivered'
                                then case when v_location is null then 'delivery' else 'collection' end
                                else handover_method end,
         collection_location = case when p_status = 'delivered' then v_location else collection_location end
   where id = p_order_id;

  insert into public.order_status_history (order_id, from_status, to_status, note, changed_by)
  values (
    p_order_id, v_old, p_status,
    case when v_location is not null
         then concat_ws(' — ', 'Collected from ' || v_location, v_note)
         else v_note end,
    auth.uid()
  );
end $$;

-- ---------------------------------------------------------------------
-- 8. Dashboard numbers: for one outlet, or for every outlet you can access
-- ---------------------------------------------------------------------
drop function if exists public.admin_dashboard_stats();

create or replace function public.admin_dashboard_stats(p_outlet uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb;
begin
  if not public.can_manage_store() then
    raise exception 'FORBIDDEN';
  end if;
  if p_outlet is not null and not public.can_access_outlet(p_outlet) then
    raise exception 'FORBIDDEN';
  end if;

  with ord as (
    select o.* from public.orders o
    where case when p_outlet is not null then o.outlet_id = p_outlet
               else public.can_access_outlet(o.outlet_id) end
  )
  select jsonb_build_object(
    'revenue_total', (select coalesce(sum(total), 0) from ord where status in ('approved', 'delivered')),
    'revenue_30d',   (select coalesce(sum(total), 0) from ord
                       where status in ('approved', 'delivered') and created_at >= now() - interval '30 days'),
    'orders_total',  (select count(*) from ord),
    'orders_today',  (select count(*) from ord where created_at >= date_trunc('day', now())),
    'awaiting_review', (select count(*) from ord where status = 'slip_uploaded'),
    'customers',     (select count(*) from public.profiles where role = 'customer'),
    'products_active', (select count(*) from public.products where is_active),
    'low_stock',     (select count(*) from public.outlet_variants ov
                       join public.product_variants pv on pv.id = ov.variant_id
                      where ov.is_active and pv.is_active and ov.stock <= 5
                        and case when p_outlet is not null then ov.outlet_id = p_outlet
                                 else public.can_access_outlet(ov.outlet_id) end),
    'status_counts', coalesce((select jsonb_object_agg(status, c)
                                 from (select status, count(*) c from ord group by status) s), '{}'::jsonb),
    'daily', (
      select jsonb_agg(jsonb_build_object('day', to_char(d, 'YYYY-MM-DD'),
                                          'revenue', coalesce(x.revenue, 0),
                                          'orders', coalesce(x.orders, 0)) order by d)
      from generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') d
      left join lateral (
        select sum(o.total) filter (where o.status in ('approved', 'delivered')) as revenue,
               count(*) as orders
        from ord o
        where o.created_at >= d and o.created_at < d + interval '1 day'
      ) x on true
    ),
    'top_products', coalesce((
      select jsonb_agg(t) from (
        select oi.product_name as name, sum(oi.quantity)::int as quantity, sum(oi.line_total) as revenue
        from public.order_items oi
        join ord o on o.id = oi.order_id
        where o.status in ('approved', 'delivered')
        group by oi.product_name
        order by 2 desc
        limit 5
      ) t
    ), '[]'::jsonb)
  ) into v;

  return v;
end $$;

revoke all on function public.admin_dashboard_stats(uuid) from public, anon;
grant execute on function public.admin_dashboard_stats(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 9. Admins choose which outlets a user may work in
-- ---------------------------------------------------------------------
create or replace function public.admin_set_user_outlets(p_user_id uuid, p_outlet_ids uuid[])
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[] := coalesce(p_outlet_ids, '{}');
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  delete from public.outlet_users where user_id = p_user_id and not (outlet_id = any (v_ids));
  insert into public.outlet_users (user_id, outlet_id)
  select p_user_id, o.id from public.outlets o where o.id = any (v_ids)
  on conflict do nothing;
end $$;

revoke all on function public.admin_set_user_outlets(uuid, uuid[]) from public, anon;
grant execute on function public.admin_set_user_outlets(uuid, uuid[]) to authenticated;

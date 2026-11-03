-- =====================================================================
-- 0003: Staff and manager roles + user management
--   customer : shops on the site
--   staff    : view / add / edit products and categories
--   manager  : everything except managing users
--   admin    : everything, including creating and managing users
-- Run once in the Supabase SQL editor after 0002_order_collection.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Role column: enum -> text with a check (lets us add roles safely)
-- ---------------------------------------------------------------------
alter table public.profiles alter column role drop default;
alter table public.profiles alter column role type text using role::text;
alter table public.profiles alter column role set default 'customer';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('customer', 'staff', 'manager', 'admin'));
drop type if exists public.user_role;

-- ---------------------------------------------------------------------
-- 2. Permission helpers
-- ---------------------------------------------------------------------
create or replace function public.current_role_name()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select role from public.profiles where id = (select auth.uid())), 'anon');
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_role_name() = 'admin';
$$;

create or replace function public.can_manage_store()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_role_name() in ('manager', 'admin');
$$;

create or replace function public.can_edit_catalog()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_role_name() in ('staff', 'manager', 'admin');
$$;

-- ---------------------------------------------------------------------
-- 3. Policies rewritten per role
-- ---------------------------------------------------------------------
-- Store settings: managers and admins
drop policy if exists "settings: admin write" on public.store_settings;
create policy "settings: manager write" on public.store_settings for update to authenticated
  using (public.can_manage_store()) with check (public.can_manage_store());

-- Categories: staff add/edit, managers delete
drop policy if exists "categories: admin all" on public.categories;
create policy "categories: staff insert" on public.categories for insert to authenticated
  with check (public.can_edit_catalog());
create policy "categories: staff update" on public.categories for update to authenticated
  using (public.can_edit_catalog()) with check (public.can_edit_catalog());
create policy "categories: manager delete" on public.categories for delete to authenticated
  using (public.can_manage_store());

-- Products: staff see hidden ones too, add/edit; managers delete
drop policy if exists "products: public read active" on public.products;
drop policy if exists "products: admin all" on public.products;
create policy "products: public read active" on public.products
  for select using (is_active or public.can_edit_catalog());
create policy "products: staff insert" on public.products for insert to authenticated
  with check (public.can_edit_catalog());
create policy "products: staff update" on public.products for update to authenticated
  using (public.can_edit_catalog()) with check (public.can_edit_catalog());
create policy "products: manager delete" on public.products for delete to authenticated
  using (public.can_manage_store());

-- Variants and images: part of editing a product, so staff can do everything
drop policy if exists "variants: public read active" on public.product_variants;
drop policy if exists "variants: admin all" on public.product_variants;
create policy "variants: public read active" on public.product_variants
  for select using (
    public.can_edit_catalog() or (
      is_active and exists (select 1 from public.products p where p.id = product_id and p.is_active)
    )
  );
create policy "variants: staff all" on public.product_variants for all to authenticated
  using (public.can_edit_catalog()) with check (public.can_edit_catalog());

drop policy if exists "images: public read" on public.product_images;
drop policy if exists "images: admin all" on public.product_images;
create policy "images: public read" on public.product_images
  for select using (
    public.can_edit_catalog() or exists (select 1 from public.products p where p.id = product_id and p.is_active)
  );
create policy "images: staff all" on public.product_images for all to authenticated
  using (public.can_edit_catalog()) with check (public.can_edit_catalog());

-- Orders: customers see their own; managers and admins see all
drop policy if exists "orders: read own or admin" on public.orders;
create policy "orders: read own or manager" on public.orders
  for select to authenticated using (user_id = (select auth.uid()) or public.can_manage_store());

drop policy if exists "order_items: read own or admin" on public.order_items;
create policy "order_items: read own or manager" on public.order_items
  for select to authenticated using (
    public.can_manage_store() or exists (
      select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())
    )
  );

drop policy if exists "history: read own or admin" on public.order_status_history;
create policy "history: read own or manager" on public.order_status_history
  for select to authenticated using (
    public.can_manage_store() or exists (
      select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())
    )
  );

-- Storage
drop policy if exists "product-images: admin insert" on storage.objects;
drop policy if exists "product-images: admin update" on storage.objects;
drop policy if exists "product-images: admin delete" on storage.objects;
create policy "product-images: staff insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.can_edit_catalog());
create policy "product-images: staff update" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.can_edit_catalog());
create policy "product-images: staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.can_edit_catalog());

drop policy if exists "payment-slips: owner or admin read" on storage.objects;
create policy "payment-slips: owner or manager read" on storage.objects for select to authenticated
  using (bucket_id = 'payment-slips' and (
    (storage.foldername(name))[1] = (select auth.uid())::text or public.can_manage_store()
  ));

-- ---------------------------------------------------------------------
-- 4. Order functions: managers and admins
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
  v_location  text := nullif(trim(p_collection_location), '');
  v_note      text := nullif(trim(p_note), '');
begin
  if not public.can_manage_store() then
    raise exception 'FORBIDDEN';
  end if;

  select status into v_old from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if not (
       (v_old = 'pending'       and p_status in ('approved', 'rejected'))
    or (v_old = 'slip_uploaded' and p_status in ('approved', 'rejected', 'pending'))
    or (v_old = 'approved'      and p_status in ('delivered', 'rejected'))
  ) then
    raise exception 'INVALID_TRANSITION';
  end if;

  if v_location is not null and p_status <> 'delivered' then
    raise exception 'INVALID_TRANSITION';
  end if;
  if char_length(v_location) > 100 then
    raise exception 'INVALID_LOCATION';
  end if;

  if p_status = 'rejected' then
    update public.product_variants pv
       set stock = pv.stock + oi.quantity
      from public.order_items oi
     where oi.order_id = p_order_id and oi.variant_id = pv.id;
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

create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb;
begin
  if not public.can_manage_store() then
    raise exception 'FORBIDDEN';
  end if;

  select jsonb_build_object(
    'revenue_total', (select coalesce(sum(total), 0) from public.orders where status in ('approved', 'delivered')),
    'revenue_30d',   (select coalesce(sum(total), 0) from public.orders
                       where status in ('approved', 'delivered') and created_at >= now() - interval '30 days'),
    'orders_total',  (select count(*) from public.orders),
    'orders_today',  (select count(*) from public.orders where created_at >= date_trunc('day', now())),
    'awaiting_review', (select count(*) from public.orders where status = 'slip_uploaded'),
    'customers',     (select count(*) from public.profiles where role = 'customer'),
    'products_active', (select count(*) from public.products where is_active),
    'low_stock',     (select count(*) from public.product_variants where is_active and stock <= 5),
    'status_counts', coalesce((select jsonb_object_agg(status, c)
                                 from (select status, count(*) c from public.orders group by status) s), '{}'::jsonb),
    'daily', (
      select jsonb_agg(jsonb_build_object('day', to_char(d, 'YYYY-MM-DD'),
                                          'revenue', coalesce(x.revenue, 0),
                                          'orders', coalesce(x.orders, 0)) order by d)
      from generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') d
      left join lateral (
        select sum(o.total) filter (where o.status in ('approved', 'delivered')) as revenue,
               count(*) as orders
        from public.orders o
        where o.created_at >= d and o.created_at < d + interval '1 day'
      ) x on true
    ),
    'top_products', coalesce((
      select jsonb_agg(t) from (
        select oi.product_name as name, sum(oi.quantity)::int as quantity, sum(oi.line_total) as revenue
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
        where o.status in ('approved', 'delivered')
        group by oi.product_name
        order by 2 desc
        limit 5
      ) t
    ), '[]'::jsonb)
  ) into v;

  return v;
end $$;

-- ---------------------------------------------------------------------
-- 5. User management (admins only)
-- ---------------------------------------------------------------------
create or replace function public.admin_list_users(p_search text default null, p_role text default null)
returns table (
  id uuid, email text, full_name text, phone text, role text,
  created_at timestamptz, last_sign_in_at timestamptz, banned_until timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  return query
    select u.id, u.email::text, p.full_name, p.phone, coalesce(p.role, 'customer'),
           u.created_at, u.last_sign_in_at, u.banned_until
    from auth.users u
    left join public.profiles p on p.id = u.id
    where (p_role is null or coalesce(p.role, 'customer') = p_role)
      and (p_search is null or p_search = ''
           or u.email ilike '%' || p_search || '%'
           or p.full_name ilike '%' || p_search || '%'
           or p.phone ilike '%' || p_search || '%')
    order by (coalesce(p.role, 'customer') = 'customer'), u.created_at desc
    limit 500;
end $$;

create or replace function public.admin_set_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old text;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  if p_role not in ('customer', 'staff', 'manager', 'admin') then
    raise exception 'INVALID_ROLE';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'CANNOT_CHANGE_OWN_ROLE';
  end if;

  select role into v_old from public.profiles where id = p_user_id for update;
  if not found then
    -- user signed up before profiles existed
    insert into public.profiles (id, role)
    select id, p_role from auth.users where id = p_user_id;
    if not found then raise exception 'USER_NOT_FOUND'; end if;
    return;
  end if;

  if v_old = 'admin' and p_role <> 'admin'
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'LAST_ADMIN';
  end if;

  update public.profiles set role = p_role where id = p_user_id;
end $$;

-- Admins can also edit a user's name and phone
create or replace function public.admin_update_profile(p_user_id uuid, p_full_name text, p_phone text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN';
  end if;
  update public.profiles
     set full_name = left(nullif(trim(p_full_name), ''), 120),
         phone = left(nullif(trim(p_phone), ''), 30)
   where id = p_user_id;
end $$;

revoke all on function public.admin_list_users(text, text) from public, anon;
revoke all on function public.admin_set_user_role(uuid, text) from public, anon;
revoke all on function public.admin_update_profile(uuid, text, text) from public, anon;
grant execute on function public.admin_list_users(text, text) to authenticated;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;
grant execute on function public.admin_update_profile(uuid, text, text) to authenticated;

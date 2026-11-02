-- =====================================================================
-- Online store schema for Supabase
-- Run this once in the Supabase SQL editor (or with `supabase db push`).
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.order_status as enum ('pending', 'slip_uploaded', 'approved', 'delivered', 'rejected');
create type public.user_role as enum ('customer', 'admin');

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Profiles (one row per auth user)
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text check (char_length(full_name) <= 120),
  phone       text check (char_length(phone) <= 30),
  role        public.user_role not null default 'customer',
  created_at  timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    left(new.raw_user_meta_data ->> 'full_name', 120),
    left(new.raw_user_meta_data ->> 'phone', 30)
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------
-- Store settings (single row)
-- ---------------------------------------------------------------------
create table public.store_settings (
  id                       int primary key default 1 check (id = 1),
  delivery_fee             numeric(12,2) not null default 0 check (delivery_fee >= 0),
  free_delivery_threshold  numeric(12,2) check (free_delivery_threshold >= 0),
  updated_at               timestamptz not null default now()
);
insert into public.store_settings (id, delivery_fee, free_delivery_threshold) values (1, 30, 500);

-- ---------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------
create table public.categories (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 80),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description  text check (char_length(description) <= 500),
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create table public.products (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (char_length(name) between 1 and 160),
  slug              text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description       text check (char_length(description) <= 5000),
  category_id       uuid references public.categories (id) on delete set null,
  compare_at_price  numeric(12,2) check (compare_at_price >= 0),
  option1_name      text check (char_length(option1_name) <= 40),  -- e.g. "Size"
  option2_name      text check (char_length(option2_name) <= 40),  -- e.g. "Color"
  is_active         boolean not null default true,
  is_featured       boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index products_category_idx on public.products (category_id);
create index products_name_trgm_idx on public.products using gin (name extensions.gin_trgm_ops);
create trigger products_updated_at before update on public.products
  for each row execute function public.set_updated_at();

create table public.product_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  option1     text check (char_length(option1) <= 60),
  option2     text check (char_length(option2) <= 60),
  sku         text unique check (char_length(sku) <= 64),
  price       numeric(12,2) not null check (price >= 0),
  stock       int not null default 0 check (stock >= 0),
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index product_variants_product_idx on public.product_variants (product_id);

create table public.product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  path        text not null,
  width       int,
  height      int,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index product_images_product_idx on public.product_images (product_id, sort_order);

-- Listing view used by the storefront (respects RLS of the caller)
create view public.product_listing with (security_invoker = true) as
select
  p.id, p.name, p.slug, p.description, p.is_active, p.is_featured, p.created_at,
  p.category_id, c.slug as category_slug, c.name as category_name,
  p.compare_at_price,
  coalesce(v.min_price, 0)   as min_price,
  coalesce(v.max_price, 0)   as max_price,
  coalesce(v.total_stock, 0) as total_stock,
  coalesce(v.variant_count, 0) as variant_count,
  img.path as image_path
from public.products p
left join public.categories c on c.id = p.category_id
left join lateral (
  select min(pv.price) as min_price, max(pv.price) as max_price,
         sum(pv.stock)::int as total_stock, count(*)::int as variant_count
  from public.product_variants pv
  where pv.product_id = p.id and pv.is_active
) v on true
left join lateral (
  select pi.path from public.product_images pi
  where pi.product_id = p.id
  order by pi.sort_order, pi.created_at
  limit 1
) img on true;

-- ---------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------
create sequence public.order_number_seq start 1001;

create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  order_number      text not null unique default ('ORD-' || nextval('public.order_number_seq')::text),
  user_id           uuid not null references auth.users (id) on delete restrict,
  status            public.order_status not null default 'pending',
  customer_name     text not null check (char_length(customer_name) between 2 and 120),
  phone             text not null check (char_length(phone) between 5 and 30),
  email             text check (char_length(email) <= 200),
  address           text not null check (char_length(address) between 5 and 500),
  city              text not null check (char_length(city) between 2 and 100),
  notes             text check (char_length(notes) <= 1000),
  subtotal          numeric(12,2) not null default 0,
  delivery_fee      numeric(12,2) not null default 0,
  total             numeric(12,2) not null default 0,
  slip_path         text,
  slip_uploaded_at  timestamptz,
  admin_note        text check (char_length(admin_note) <= 1000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_status_idx on public.orders (status, created_at desc);
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders (id) on delete cascade,
  product_id    uuid references public.products (id) on delete set null,
  variant_id    uuid references public.product_variants (id) on delete set null,
  product_name  text not null,
  variant_name  text,
  sku           text,
  image_path    text,
  unit_price    numeric(12,2) not null,
  quantity      int not null check (quantity > 0),
  line_total    numeric(12,2) not null
);
create index order_items_order_idx on public.order_items (order_id);

create table public.order_status_history (
  id           bigint generated always as identity primary key,
  order_id     uuid not null references public.orders (id) on delete cascade,
  from_status  public.order_status,
  to_status    public.order_status not null,
  note         text,
  changed_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history (order_id, created_at);

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles             enable row level security;
alter table public.store_settings       enable row level security;
alter table public.categories           enable row level security;
alter table public.products             enable row level security;
alter table public.product_variants     enable row level security;
alter table public.product_images       enable row level security;
alter table public.orders               enable row level security;
alter table public.order_items          enable row level security;
alter table public.order_status_history enable row level security;

-- Profiles: users see/edit their own; admins see all. Role can never be changed by users.
create policy "profiles: read own or admin" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or public.is_admin());
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- Store settings
create policy "settings: public read" on public.store_settings for select using (true);
create policy "settings: admin write" on public.store_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Catalog: everyone can read active items; admins manage everything.
create policy "categories: public read" on public.categories for select using (true);
create policy "categories: admin all" on public.categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "products: public read active" on public.products
  for select using (is_active or public.is_admin());
create policy "products: admin all" on public.products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "variants: public read active" on public.product_variants
  for select using (
    public.is_admin() or (
      is_active and exists (select 1 from public.products p where p.id = product_id and p.is_active)
    )
  );
create policy "variants: admin all" on public.product_variants for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "images: public read" on public.product_images
  for select using (
    public.is_admin() or exists (select 1 from public.products p where p.id = product_id and p.is_active)
  );
create policy "images: admin all" on public.product_images for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Orders: read only. All writes go through the security-definer functions below.
create policy "orders: read own or admin" on public.orders
  for select to authenticated using (user_id = (select auth.uid()) or public.is_admin());
create policy "order_items: read own or admin" on public.order_items
  for select to authenticated using (
    public.is_admin() or exists (
      select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())
    )
  );
create policy "history: read own or admin" on public.order_status_history
  for select to authenticated using (
    public.is_admin() or exists (
      select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())
    )
  );
revoke insert, update, delete on public.orders, public.order_items, public.order_status_history
  from anon, authenticated;

-- ---------------------------------------------------------------------
-- place_order: validates cart, locks & decrements stock, computes totals
-- on the server (client prices are never trusted).
-- p_items: [{ "variant_id": "<uuid>", "quantity": 2 }, ...]
-- ---------------------------------------------------------------------
create or replace function public.place_order(
  p_items          jsonb,
  p_customer_name  text,
  p_phone          text,
  p_email          text,
  p_address        text,
  p_city           text,
  p_notes          text default null
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
  r            record;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
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

  insert into public.orders (user_id, customer_name, phone, email, address, city, notes)
  values (v_uid, trim(p_customer_name), trim(p_phone), nullif(trim(p_email), ''),
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

    select pv.price, pv.stock, pv.option1, pv.option2, pv.sku, p.id, p.name
      into v_price, v_stock, v_opt1, v_opt2, v_sku, v_pid, v_pname
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = r.variant_id and pv.is_active and p.is_active
    for update of pv;

    if not found then
      raise exception 'ITEM_UNAVAILABLE';
    end if;
    if v_stock < r.quantity then
      raise exception 'OUT_OF_STOCK:%', v_pname;
    end if;

    select pi.path into v_img from public.product_images pi
    where pi.product_id = v_pid order by pi.sort_order, pi.created_at limit 1;

    update public.product_variants set stock = stock - r.quantity where id = r.variant_id;

    insert into public.order_items
      (order_id, product_id, variant_id, product_name, variant_name, sku, image_path, unit_price, quantity, line_total)
    values
      (v_order_id, v_pid, r.variant_id, v_pname,
       nullif(concat_ws(' / ', v_opt1, v_opt2), ''), v_sku, v_img,
       v_price, r.quantity, v_price * r.quantity);

    v_subtotal := v_subtotal + v_price * r.quantity;
  end loop;

  select delivery_fee, free_delivery_threshold into v_fee, v_threshold
  from public.store_settings where id = 1;
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

-- ---------------------------------------------------------------------
-- submit_payment_slip: customer attaches a slip to their own order.
-- Returns the previous slip path (if any).
-- ---------------------------------------------------------------------
create or replace function public.submit_payment_slip(p_order_id uuid, p_path text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := auth.uid();
  v_status  public.order_status;
  v_old     text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select status, slip_path into v_status, v_old
  from public.orders where id = p_order_id and user_id = v_uid
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if v_status not in ('pending', 'slip_uploaded') then
    raise exception 'SLIP_NOT_ALLOWED';
  end if;
  if p_path is null or p_path not like (v_uid::text || '/' || p_order_id::text || '/%') then
    raise exception 'INVALID_PATH';
  end if;

  update public.orders
     set slip_path = p_path, slip_uploaded_at = now(), status = 'slip_uploaded'
   where id = p_order_id;

  if v_status <> 'slip_uploaded' then
    insert into public.order_status_history (order_id, from_status, to_status, changed_by)
    values (p_order_id, v_status, 'slip_uploaded', v_uid);
  end if;

  return v_old;
end $$;

-- ---------------------------------------------------------------------
-- admin_set_order_status: enforced state machine. Rejecting restores stock.
--   pending        -> approved | rejected
--   slip_uploaded  -> approved | rejected | pending (ask for a new slip)
--   approved       -> delivered | rejected
--   delivered, rejected are final
-- ---------------------------------------------------------------------
create or replace function public.admin_set_order_status(
  p_order_id uuid, p_status public.order_status, p_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.order_status;
begin
  if not public.is_admin() then
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

  if p_status = 'rejected' then
    update public.product_variants pv
       set stock = pv.stock + oi.quantity
      from public.order_items oi
     where oi.order_id = p_order_id and oi.variant_id = pv.id;
  end if;

  update public.orders
     set status = p_status,
         admin_note = coalesce(nullif(trim(p_note), ''), admin_note)
   where id = p_order_id;

  insert into public.order_status_history (order_id, from_status, to_status, note, changed_by)
  values (p_order_id, v_old, p_status, nullif(trim(p_note), ''), auth.uid());
end $$;

-- ---------------------------------------------------------------------
-- admin_dashboard_stats
-- ---------------------------------------------------------------------
create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb;
begin
  if not public.is_admin() then
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

-- Function permissions
revoke all on function public.place_order(jsonb, text, text, text, text, text, text) from public, anon;
revoke all on function public.submit_payment_slip(uuid, text) from public, anon;
revoke all on function public.admin_set_order_status(uuid, public.order_status, text) from public, anon;
revoke all on function public.admin_dashboard_stats() from public, anon;
grant execute on function public.place_order(jsonb, text, text, text, text, text, text) to authenticated;
grant execute on function public.submit_payment_slip(uuid, text) to authenticated;
grant execute on function public.admin_set_order_status(uuid, public.order_status, text) to authenticated;
grant execute on function public.admin_dashboard_stats() to authenticated;

-- ---------------------------------------------------------------------
-- Storage buckets
--   product-images: public read, admin write. Images are WebP after compression.
--   payment-slips : private. Customers upload/read only inside "<their uid>/";
--                   admins can read all.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', true,  2097152, array['image/webp']),
  ('payment-slips',  'payment-slips',  false, 2097152, array['image/webp'])
on conflict (id) do nothing;

create policy "product-images: admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());
create policy "product-images: admin update" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
create policy "product-images: admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());

create policy "payment-slips: owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-slips' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "payment-slips: owner or admin read" on storage.objects for select to authenticated
  using (bucket_id = 'payment-slips' and (
    (storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()
  ));
-- No delete policy for slips on purpose: customers cannot remove a slip once
-- uploaded (keeps an audit trail for admins).

-- Two companies, each with its own outlets and its own staff.
--   Energico Maldives Pvt Ltd : North Jugo, Maaloodhu Cafe, Musammaa Cafe
--   Red Blue Garden Pvt Ltd   : Red Blue Cafe, Red Blue AC Repair & Service, Red Blue Carpentry & Welding
-- Staff sign in with company + username + password. Run AFTER 0006_multi_outlet.sql.

do $$
begin
  if to_regclass('public.outlets') is null then
    raise exception 'Run 0006_multi_outlet.sql first.';
  end if;
end $$;

create table if not exists public.companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 2 and 120),
  slug       text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sort_order int  not null default 0
);

alter table public.companies enable row level security;
drop policy if exists "companies: public read" on public.companies;
create policy "companies: public read" on public.companies for select using (true);
drop policy if exists "companies: admin write" on public.companies;
create policy "companies: admin write" on public.companies for all
  using (public.is_admin()) with check (public.is_admin());

insert into public.companies (name, slug, sort_order) values
  ('Energico Maldives Pvt Ltd', 'energico', 1),
  ('Red Blue Garden Pvt Ltd',   'red-blue-garden', 2)
on conflict (slug) do nothing;

alter table public.outlets  add column if not exists company_id uuid references public.companies (id) on delete restrict;
alter table public.profiles add column if not exists company_id uuid references public.companies (id) on delete set null;
alter table public.profiles add column if not exists username   text check (username ~ '^[a-z0-9._-]{3,30}$');

create unique index if not exists profiles_company_username_uidx
  on public.profiles (company_id, username) where username is not null;

-- Existing outlets belong to Energico.
update public.outlets
   set company_id = (select id from public.companies where slug = 'energico')
 where company_id is null;

-- Red Blue Garden's outlets (start empty — add their items and prices from Admin).
insert into public.outlets (name, slug, company_id, sort_order, is_active)
select v.name, v.slug, (select id from public.companies where slug = 'red-blue-garden'), v.ord, true
from (values
  ('Red Blue Cafe',                      'red-blue-cafe',                 10),
  ('Red Blue AC Repair & Service',       'red-blue-ac-repair-service',    11),
  ('Red Blue Carpentry & Welding',       'red-blue-carpentry-welding',    12)
) as v(name, slug, ord)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- Admin: give a staff member their company + username (used to sign in)
-- ---------------------------------------------------------------------
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
  -- Staff of one company can't keep access to another company's outlets.
  delete from public.outlet_users ou
   using public.outlets o
   where ou.user_id = p_user_id and o.id = ou.outlet_id
     and p_company_id is not null and o.company_id is distinct from p_company_id;
end $$;

revoke all on function public.admin_set_staff_login(uuid, uuid, text) from public, anon;
grant execute on function public.admin_set_staff_login(uuid, uuid, text) to authenticated;

-- Outlet access: only outlets of the person's own company (when they have one).
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
   where o.id = any (v_ids) and (v_company is null or o.company_id = v_company)
  on conflict do nothing;
end $$;

revoke all on function public.admin_set_user_outlets(uuid, uuid[]) from public, anon;
grant execute on function public.admin_set_user_outlets(uuid, uuid[]) to authenticated;

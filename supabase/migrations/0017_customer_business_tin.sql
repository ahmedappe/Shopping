-- =====================================================================
-- 0017: Business customers — business name and business TIN (GST number) on the customer
--   * outlet_customers.business_name / tin (both blank = a normal customer)
--   * customer_set_business(): staff add or clear them; a TIN is required for a business
-- Needs 0013 first. Safe to run more than once.
-- =====================================================================
do $$
begin
  if to_regclass('public.outlet_customers') is null then
    raise exception 'Run 0013_phase2b3_customers_loyalty_delivery.sql first.';
  end if;
end $$;

alter table public.outlet_customers add column if not exists business_name text check (char_length(business_name) <= 120);
alter table public.outlet_customers add column if not exists tin text check (tin ~ '^[A-Za-z0-9/-]{3,30}$');
alter table public.outlet_customers drop constraint if exists outlet_customers_business_tin;
alter table public.outlet_customers add constraint outlet_customers_business_tin check ((business_name is null) = (tin is null));

create or replace function public.customer_set_business(p_customer uuid, p_business_name text, p_tin text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.outlet_customers%rowtype; v_name text; v_tin text;
begin
  select * into c from public.outlet_customers where id = p_customer for update;
  if not found or not public.can_edit_catalog() or not public.can_access_outlet(c.outlet_id) then raise exception 'FORBIDDEN'; end if;
  v_name := nullif(trim(coalesce(p_business_name, '')), '');
  v_tin  := nullif(upper(regexp_replace(coalesce(p_tin, ''), '\s+', '', 'g')), '');
  if v_name is null and v_tin is null then
    update public.outlet_customers set business_name = null, tin = null where id = p_customer;
    return;
  end if;
  if v_name is null then raise exception 'BUSINESS_NAME_REQUIRED'; end if;
  if v_tin is null or v_tin !~ '^[A-Z0-9/-]{3,30}$' then raise exception 'TIN_REQUIRED'; end if;
  update public.outlet_customers set business_name = v_name, tin = v_tin where id = p_customer;
end $$;

revoke all on function public.customer_set_business(uuid, text, text) from public, anon;
grant execute on function public.customer_set_business(uuid, text, text) to authenticated;

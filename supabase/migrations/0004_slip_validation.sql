-- Basic automatic checks on uploaded payment slips (text recognition result).
-- The admin still reviews every slip; these columns just show what was read
-- and what looked off, and flag the same receipt being used on two orders.

alter table public.orders
  add column if not exists slip_bank       text,
  add column if not exists slip_reference  text,
  add column if not exists slip_amount     numeric(12,2),
  add column if not exists slip_paid_at    timestamptz,
  add column if not exists slip_verdict    text check (slip_verdict in ('ok', 'review', 'unchecked')),
  add column if not exists slip_checks     jsonb;

-- Safe to run more than once. Remove the old "unique" version of the index if an
-- earlier copy of this file was run (a reused receipt is flagged, not blocked).
drop index if exists public.orders_slip_reference_uidx;

-- Lookup index for spotting a receipt reused on another order (flagged, not blocked).
create index if not exists orders_slip_reference_idx
  on public.orders (slip_bank, slip_reference)
  where slip_reference is not null and status <> 'rejected';

-- ---------------------------------------------------------------------
-- slip_reference_in_use: lets a customer check, before uploading, whether a
-- receipt reference is already attached to ANOTHER order (they can't see
-- other customers' orders under RLS, hence security definer).
-- ---------------------------------------------------------------------
create or replace function public.slip_reference_in_use(p_order_id uuid, p_bank text, p_reference text)
returns boolean
language sql security definer set search_path = '' stable as $$
  select auth.uid() is not null and exists (
    select 1 from public.orders
    where slip_reference = p_reference
      and slip_bank is not distinct from p_bank
      and id <> p_order_id
      and status <> 'rejected'
  );
$$;

revoke all on function public.slip_reference_in_use(uuid, text, text) from public, anon;
grant execute on function public.slip_reference_in_use(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- submit_payment_slip: now also stores what the text recognition found.
-- Replaces the 2-argument version.
-- ---------------------------------------------------------------------
drop function if exists public.submit_payment_slip(uuid, text);

create or replace function public.submit_payment_slip(
  p_order_id   uuid,
  p_path       text,
  p_bank       text        default null,
  p_reference  text        default null,
  p_amount     numeric     default null,
  p_paid_at    timestamptz default null,
  p_verdict    text        default null,
  p_checks     jsonb       default null
)
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
  if p_verdict is not null and p_verdict not in ('ok', 'review', 'unchecked') then
    raise exception 'INVALID_PATH';
  end if;

  update public.orders
     set slip_path = p_path,
         slip_uploaded_at = now(),
         status = 'slip_uploaded',
         slip_bank = p_bank,
         slip_reference = p_reference,
         slip_amount = p_amount,
         slip_paid_at = p_paid_at,
         slip_verdict = p_verdict,
         slip_checks = p_checks
   where id = p_order_id;

  if v_status <> 'slip_uploaded' then
    insert into public.order_status_history (order_id, from_status, to_status, changed_by)
    values (p_order_id, v_status, 'slip_uploaded', v_uid);
  end if;

  return v_old;
end $$;

revoke all on function public.submit_payment_slip(uuid, text, text, text, numeric, timestamptz, text, jsonb) from public, anon;
grant execute on function public.submit_payment_slip(uuid, text, text, text, numeric, timestamptz, text, jsonb) to authenticated;

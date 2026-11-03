-- 0005: let an approved order go back to "pending" so the customer can be asked
-- to upload a new payment slip (e.g. payment was sent to the wrong account).
-- Admin only. Stock stays reserved for the order. Run in the Supabase SQL editor.

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
  -- Read the caller's role straight from profiles so this works whichever
  -- earlier migrations have been run (no helper functions needed).
  v_role      text := coalesce((select role::text from public.profiles where id = auth.uid()), '');
begin
  if v_role not in ('manager', 'admin') then
    raise exception 'FORBIDDEN';
  end if;

  select status into v_old from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
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
    if v_role <> 'admin' then
      raise exception 'FORBIDDEN';
    end if;
    if v_note is null then
      raise exception 'INVALID_TRANSITION';
    end if;
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

alter table public.profiles
  add column if not exists email text;

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and p.email is distinct from u.email;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data->>'account_type', 'producer');
begin
  if requested_role not in ('producer', 'collaborator') then
    requested_role := 'producer';
  end if;
  if not public.valid_chilean_rut(new.raw_user_meta_data->>'rut') then
    raise exception 'invalid_chilean_rut';
  end if;
  if length(trim(coalesce(new.raw_user_meta_data->>'full_name', ''))) < 2
      or length(trim(coalesce(new.raw_user_meta_data->>'phone', ''))) < 8 then
    raise exception 'missing_required_profile_data';
  end if;

  insert into public.profiles (id, username, email, full_name, rut, phone, role, status)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data->>'username'), ''),
    new.email,
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(upper(regexp_replace(coalesce(new.raw_user_meta_data->>'rut', ''), '[.\s-]', '', 'g')), ''),
    nullif(trim(new.raw_user_meta_data->>'phone'), ''),
    requested_role,
    'pending'
  );
  return new;
end;
$$;

create or replace function public.create_free_order(
  p_checkout_key uuid,
  p_buyer_name text,
  p_buyer_rut text,
  p_buyer_email text,
  p_buyer_phone text,
  p_items jsonb
)
returns table (order_id uuid, total_clp integer, order_status text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_ticket record;
  v_order_id uuid;
  v_order public.orders%rowtype;
  v_quantity integer;
  v_reserved integer;
  v_sold integer;
  v_event_id text;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1
      or jsonb_array_length(p_items) > 10 then
    raise exception 'invalid_items';
  end if;
  if length(trim(p_buyer_name)) < 2 or length(trim(p_buyer_rut)) < 8
      or length(trim(p_buyer_email)) < 5 or length(trim(p_buyer_phone)) < 8 then
    raise exception 'invalid_buyer';
  end if;

  select o.* into v_order
  from public.orders o
  where o.checkout_key = p_checkout_key
  for update;
  if found then
    if v_order.ticket_subtotal_clp <> 0 or v_order.administration_total_clp <> 0 then
      raise exception 'order_not_free';
    end if;
    order_id := v_order.id;
    total_clp := v_order.total_clp;
    order_status := v_order.status;
    expires_at := v_order.expires_at;
    return next;
    return;
  end if;

  v_event_id := p_items->0->>'event_id';
  if v_event_id is null or exists (
    select 1
    from jsonb_array_elements(p_items) as entry(value)
    where entry.value->>'event_id' is distinct from v_event_id
  ) then
    raise exception 'invalid_items';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if (v_item->>'quantity') !~ '^[1-9][0-9]*$' then
      raise exception 'invalid_quantity';
    end if;
    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity > 10 then raise exception 'invalid_quantity'; end if;

    select tt.event_id, tt.id, tt.price_clp, tt.quantity_total
      into v_ticket
    from public.ticket_types tt
    join public.events e on e.id = tt.event_id
    where tt.event_id = v_item->>'event_id'
      and tt.id = v_item->>'ticket_type_id'
      and tt.is_active
      and tt.price_clp = 0
      and e.status = 'published'
    for update of tt;
    if not found then raise exception 'ticket_type_unavailable'; end if;

    select count(*)::integer into v_sold
    from public.tickets t
    join public.order_items oi on oi.id = t.order_item_id
    where oi.event_id = v_ticket.event_id
      and oi.ticket_type_id = v_ticket.id
      and t.status <> 'void';

    select coalesce(sum(oi.quantity), 0)::integer into v_reserved
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.event_id = v_ticket.event_id
      and oi.ticket_type_id = v_ticket.id
      and o.status = 'pending_payment'
      and o.expires_at > now();

    select coalesce(sum((entry.value->>'quantity')::integer), 0)::integer into v_quantity
    from jsonb_array_elements(p_items) as entry(value)
    where entry.value->>'event_id' = v_ticket.event_id
      and entry.value->>'ticket_type_id' = v_ticket.id;

    if v_sold + v_reserved + v_quantity > v_ticket.quantity_total then
      raise exception 'insufficient_inventory';
    end if;
  end loop;

  insert into public.orders (
    checkout_key, buyer_name, buyer_rut, buyer_email, buyer_phone,
    status, ticket_subtotal_clp, administration_total_clp, total_clp,
    expires_at
  ) values (
    p_checkout_key, trim(p_buyer_name), trim(p_buyer_rut), lower(trim(p_buyer_email)),
    trim(p_buyer_phone), 'pending_payment', 0, 0, 0, now() + interval '30 minutes'
  )
  returning id, orders.total_clp, orders.status, orders.expires_at
    into order_id, total_clp, order_status, expires_at;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    insert into public.order_items (
      order_id, event_id, ticket_type_id, quantity, unit_price_clp,
      administration_fee_clp, buyer_name, buyer_rut, buyer_email, buyer_phone
    ) values (
      order_id, v_item->>'event_id', v_item->>'ticket_type_id',
      (v_item->>'quantity')::integer, 0, 0, trim(p_buyer_name),
      trim(p_buyer_rut), lower(trim(p_buyer_email)), trim(p_buyer_phone)
    );
  end loop;

  return next;
end;
$$;

revoke all on function public.create_free_order(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_free_order(uuid, text, text, text, text, jsonb) to service_role;

create or replace function public.complete_free_order(
  p_order_id uuid,
  p_tickets jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_item public.order_items%rowtype;
  v_entry jsonb;
  v_expected_count integer;
  v_actual_count integer;
  v_ticket_id uuid;
  v_payment_reference text;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;
  if not found then raise exception 'order_not_found'; end if;
  v_payment_reference := 'free:' || p_order_id::text;
  if v_order.status = 'paid' and v_order.payment_reference = v_payment_reference then
    return jsonb_build_object('completed', true, 'already_processed', true);
  end if;
  if v_order.status <> 'pending_payment' or v_order.expires_at <= now() then
    raise exception 'order_not_issuable';
  end if;
  if v_order.ticket_subtotal_clp <> 0 or v_order.administration_total_clp <> 0
      or v_order.total_clp <> 0 or jsonb_typeof(p_tickets) <> 'array' then
    raise exception 'order_not_free';
  end if;

  select coalesce(sum(quantity), 0)::integer into v_expected_count
  from public.order_items
  where order_id = p_order_id and unit_price_clp = 0 and administration_fee_clp = 0;
  select count(*)::integer into v_actual_count
  from jsonb_array_elements(p_tickets);
  if v_actual_count <> v_expected_count then
    raise exception 'ticket_count_mismatch';
  end if;

  for v_item in select * from public.order_items where order_id = p_order_id
  loop
    if v_item.unit_price_clp <> 0 or v_item.administration_fee_clp <> 0 then
      raise exception 'order_not_free';
    end if;
    select count(*)::integer into v_actual_count
    from jsonb_array_elements(p_tickets) as entries(value)
    where entries.value->>'order_item_id' = v_item.id::text;
    if v_actual_count <> v_item.quantity then
      raise exception 'ticket_count_mismatch';
    end if;
  end loop;

  for v_entry in select value from jsonb_array_elements(p_tickets)
  loop
    if coalesce(v_entry->>'qr_token', '') = ''
        or coalesce(v_entry->>'security_code', '') = ''
        or coalesce(v_entry->>'qr_token_encrypted', '') = ''
        or coalesce(v_entry->>'security_code_encrypted', '') = '' then
      raise exception 'invalid_ticket_credentials';
    end if;

    select * into v_item
    from public.order_items
    where id = (v_entry->>'order_item_id')::uuid
      and order_id = p_order_id;
    if not found then raise exception 'invalid_order_item'; end if;

    v_ticket_id := gen_random_uuid();
    insert into public.tickets (
      id, order_item_id, event_id, qr_token_hash, security_code_hash
    ) values (
      v_ticket_id, v_item.id, v_item.event_id,
      extensions.digest(v_entry->>'qr_token', 'sha256'),
      extensions.digest(upper(v_entry->>'security_code'), 'sha256')
    );
    insert into public.ticket_delivery_secrets (
      ticket_id, qr_token_encrypted, security_code_encrypted
    ) values (
      v_ticket_id,
      v_entry->>'qr_token_encrypted',
      v_entry->>'security_code_encrypted'
    );
  end loop;

  update public.orders
  set status = 'paid', payment_reference = v_payment_reference
  where id = p_order_id;

  return jsonb_build_object('completed', true, 'already_processed', false);
end;
$$;

revoke all on function public.complete_free_order(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.complete_free_order(uuid, jsonb) to service_role;

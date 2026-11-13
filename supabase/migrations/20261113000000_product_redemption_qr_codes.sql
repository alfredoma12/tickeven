alter table public.tickets
  alter column order_item_id drop not null,
  add column order_product_item_id uuid references public.order_product_items (id) on delete cascade,
  add constraint tickets_exactly_one_order_line_check
    check (num_nonnulls(order_item_id, order_product_item_id) = 1);

create unique index tickets_product_item_attendee_idx
  on public.tickets (order_product_item_id, attendee_index)
  where order_product_item_id is not null;

create or replace function public.assign_ticket_attendee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attendee_index integer;
  v_attendee jsonb;
  v_buyer_name text;
  v_buyer_rut text;
begin
  if new.order_item_id is not null then
    select count(*)::integer into v_attendee_index
    from public.tickets t
    where t.order_item_id = new.order_item_id;

    select oi.attendees -> v_attendee_index
      into v_attendee
    from public.order_items oi
    where oi.id = new.order_item_id;

    if jsonb_typeof(v_attendee) is distinct from 'object'
        or length(trim(coalesce(v_attendee->>'name', ''))) not between 2 and 120
        or length(trim(coalesce(v_attendee->>'rut', ''))) not between 8 and 20 then
      raise exception 'ticket_attendee_missing';
    end if;

    new.attendee_index := v_attendee_index;
    new.attendee_name := trim(v_attendee->>'name');
    new.attendee_rut := trim(v_attendee->>'rut');
    return new;
  end if;

  select o.buyer_name, o.buyer_rut
    into v_buyer_name, v_buyer_rut
  from public.order_product_items opi
  join public.orders o on o.id = opi.order_id
  where opi.id = new.order_product_item_id
    and opi.event_id = new.event_id;

  if not found then raise exception 'invalid_order_product_item'; end if;
  if length(trim(coalesce(v_buyer_name, ''))) not between 2 and 120
      or length(trim(coalesce(v_buyer_rut, ''))) not between 8 and 20 then
    raise exception 'product_buyer_missing';
  end if;

  select count(*)::integer into v_attendee_index
  from public.tickets t
  where t.order_product_item_id = new.order_product_item_id;
  if v_attendee_index >= (
    select opi.quantity
    from public.order_product_items opi
    where opi.id = new.order_product_item_id
  ) then
    raise exception 'product_redemption_count_exceeded';
  end if;

  new.attendee_index := v_attendee_index;
  new.attendee_name := trim(v_buyer_name);
  new.attendee_rut := trim(v_buyer_rut);
  return new;
end;
$$;

create or replace function public.complete_mercadopago_order(
  p_order_id uuid,
  p_payment_reference text,
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
  v_product_item public.order_product_items%rowtype;
  v_entry jsonb;
  v_order_item_id uuid;
  v_product_item_id uuid;
  v_expected_count integer;
  v_actual_count integer;
  v_ticket_id uuid;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then raise exception 'order_not_found'; end if;
  if v_order.status = 'paid' and v_order.payment_reference = p_payment_reference then
    return jsonb_build_object('completed', true, 'already_processed', true);
  end if;
  if v_order.status <> 'pending_payment' then
    raise exception 'order_not_issuable';
  end if;
  if p_payment_reference is null or length(trim(p_payment_reference)) = 0
      or jsonb_typeof(p_tickets) <> 'array' then
    raise exception 'invalid_payment_confirmation';
  end if;

  select
    coalesce((select sum(quantity) from public.order_items where order_id = p_order_id), 0)
    + coalesce((select sum(quantity) from public.order_product_items where order_id = p_order_id), 0)
    into v_expected_count;
  select count(*)::integer into v_actual_count
  from jsonb_array_elements(p_tickets);
  if v_actual_count <> v_expected_count then
    raise exception 'redemption_code_count_mismatch';
  end if;

  for v_item in
    select * from public.order_items where order_id = p_order_id
  loop
    select count(*)::integer into v_actual_count
    from jsonb_array_elements(p_tickets) as entries(value)
    where entries.value->>'order_item_id' = v_item.id::text;
    if v_actual_count <> v_item.quantity then
      raise exception 'ticket_count_mismatch';
    end if;
  end loop;

  for v_product_item in
    select * from public.order_product_items where order_id = p_order_id
  loop
    select count(*)::integer into v_actual_count
    from jsonb_array_elements(p_tickets) as entries(value)
    where entries.value->>'order_product_item_id' = v_product_item.id::text;
    if v_actual_count <> v_product_item.quantity then
      raise exception 'product_redemption_count_mismatch';
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

    v_order_item_id := nullif(v_entry->>'order_item_id', '')::uuid;
    v_product_item_id := nullif(v_entry->>'order_product_item_id', '')::uuid;
    if num_nonnulls(v_order_item_id, v_product_item_id) <> 1 then
      raise exception 'invalid_order_line';
    end if;

    if v_order_item_id is not null then
      select * into v_item
      from public.order_items
      where id = v_order_item_id and order_id = p_order_id;
      if not found then raise exception 'invalid_order_item'; end if;

      v_ticket_id := gen_random_uuid();
      insert into public.tickets (
        id, order_item_id, event_id, qr_token_hash, security_code_hash
      ) values (
        v_ticket_id, v_item.id, v_item.event_id,
        extensions.digest(v_entry->>'qr_token', 'sha256'),
        extensions.digest(upper(v_entry->>'security_code'), 'sha256')
      );
    else
      select * into v_product_item
      from public.order_product_items
      where id = v_product_item_id and order_id = p_order_id;
      if not found then raise exception 'invalid_order_product_item'; end if;

      v_ticket_id := gen_random_uuid();
      insert into public.tickets (
        id, order_product_item_id, event_id, qr_token_hash, security_code_hash
      ) values (
        v_ticket_id, v_product_item.id, v_product_item.event_id,
        extensions.digest(v_entry->>'qr_token', 'sha256'),
        extensions.digest(upper(v_entry->>'security_code'), 'sha256')
      );
    end if;

    insert into public.ticket_delivery_secrets (
      ticket_id, qr_token_encrypted, security_code_encrypted
    ) values (
      v_ticket_id,
      v_entry->>'qr_token_encrypted',
      v_entry->>'security_code_encrypted'
    );
  end loop;

  update public.orders
  set status = 'paid', payment_reference = trim(p_payment_reference)
  where id = p_order_id;

  return jsonb_build_object('completed', true, 'already_processed', false);
end;
$$;

revoke all on function public.complete_mercadopago_order(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.complete_mercadopago_order(uuid, text, jsonb) to service_role;

create or replace function public.validate_ticket(
  p_producer_id uuid,
  p_ticket_id uuid,
  p_qr_token text,
  p_security_code text,
  p_event_id text,
  p_input_method text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets%rowtype;
  v_actor_role text;
  v_actor_name text;
  v_attendee_name text;
  v_attendee_rut text;
  v_ticket_type text;
  v_ticket_kind text;
  v_event_title text;
  v_checked_in_by text;
begin
  select p.role, p.full_name into v_actor_role, v_actor_name
  from public.profiles p
  where p.id = p_producer_id and p.status = 'approved';

  if not found or v_actor_role not in ('producer', 'collaborator', 'admin') then
    return jsonb_build_object('valid', false, 'reason', 'account_not_approved');
  end if;

  if p_event_id is null or p_input_method is null or p_input_method not in ('qr', 'manual') or not exists (
    select 1
    from public.events e
    where e.id = p_event_id
      and (
        e.producer_id = p_producer_id
        or v_actor_role = 'admin'
        or exists (
          select 1 from public.event_staff s
          where s.event_id = e.id and s.collaborator_id = p_producer_id
        )
      )
  ) then
    return jsonb_build_object('valid', false, 'reason', 'event_not_assigned');
  end if;

  if p_security_code is not null then
    select t.* into v_ticket
    from public.tickets t
    where t.security_code_hash = extensions.digest(upper(trim(p_security_code)), 'sha256')
    for update;
  elsif p_ticket_id is not null and p_qr_token is not null then
    select t.* into v_ticket
    from public.tickets t
    where t.id = p_ticket_id
      and t.qr_token_hash = extensions.digest(p_qr_token, 'sha256')
    for update;
  else
    insert into public.entry_validation_attempts (event_id, collaborator_id, outcome, input_method)
    values (p_event_id, p_producer_id, 'invalid', p_input_method);
    return jsonb_build_object('valid', false, 'reason', 'invalid_credentials');
  end if;

  if not found then
    insert into public.entry_validation_attempts (event_id, collaborator_id, outcome, input_method)
    values (p_event_id, p_producer_id, 'invalid', p_input_method);
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;

  if v_ticket.event_id <> p_event_id then
    select e.title into v_event_title
    from public.events e
    where e.id = v_ticket.event_id;

    insert into public.entry_validation_attempts (event_id, ticket_id, collaborator_id, outcome, input_method)
    values (p_event_id, v_ticket.id, p_producer_id, 'other_event', p_input_method);
    return jsonb_build_object(
      'valid', false,
      'reason', 'other_event',
      'event_id', v_ticket.event_id,
      'event_title', v_event_title
    );
  end if;

  if v_ticket.order_item_id is not null then
    select v_ticket.attendee_name, v_ticket.attendee_rut, tt.name, e.title
      into v_attendee_name, v_attendee_rut, v_ticket_type, v_event_title
    from public.order_items oi
    join public.ticket_types tt on tt.event_id = oi.event_id and tt.id = oi.ticket_type_id
    join public.events e on e.id = oi.event_id
    where oi.id = v_ticket.order_item_id;
    v_ticket_kind := 'entry';
  else
    select v_ticket.attendee_name, v_ticket.attendee_rut,
           concat('Producto · ', opi.product_name, case when nullif(opi.variant_name, '') is null then '' else ' · ' || opi.variant_name end),
           e.title
      into v_attendee_name, v_attendee_rut, v_ticket_type, v_event_title
    from public.order_product_items opi
    join public.events e on e.id = opi.event_id
    where opi.id = v_ticket.order_product_item_id;
    v_ticket_kind := 'product';
  end if;

  if v_ticket.status = 'used' then
    select p.full_name into v_checked_in_by
    from public.profiles p
    where p.id = v_ticket.checked_in_by;

    insert into public.entry_validation_attempts (event_id, ticket_id, collaborator_id, outcome, input_method)
    values (p_event_id, v_ticket.id, p_producer_id, 'already_used', p_input_method);

    return jsonb_build_object(
      'valid', false,
      'reason', 'already_used',
      'ticket_id', v_ticket.id,
      'event_id', v_ticket.event_id,
      'event_title', v_event_title,
      'attendee_name', v_attendee_name,
      'attendee_rut', v_attendee_rut,
      'ticket_type', v_ticket_type,
      'ticket_kind', v_ticket_kind,
      'checked_in_at', v_ticket.checked_in_at,
      'checked_in_by', v_checked_in_by
    );
  end if;

  if v_ticket.status <> 'valid' then
    insert into public.entry_validation_attempts (event_id, ticket_id, collaborator_id, outcome, input_method)
    values (p_event_id, v_ticket.id, p_producer_id, 'invalid', p_input_method);
    return jsonb_build_object('valid', false, 'reason', 'invalid_ticket');
  end if;

  update public.tickets
  set status = 'used', checked_in_at = clock_timestamp(), checked_in_by = p_producer_id
  where id = v_ticket.id and status = 'valid'
  returning * into v_ticket;

  if not found then
    insert into public.entry_validation_attempts (event_id, ticket_id, collaborator_id, outcome, input_method)
    values (p_event_id, v_ticket.id, p_producer_id, 'already_used', p_input_method);
    return jsonb_build_object('valid', false, 'reason', 'already_used');
  end if;

  insert into public.entry_validation_attempts (event_id, ticket_id, collaborator_id, outcome, input_method)
  values (p_event_id, v_ticket.id, p_producer_id, 'authorized', p_input_method);

  return jsonb_build_object(
    'valid', true,
    'ticket_id', v_ticket.id,
    'event_id', v_ticket.event_id,
    'event_title', v_event_title,
    'attendee_name', v_attendee_name,
    'attendee_rut', v_attendee_rut,
    'ticket_type', v_ticket_type,
    'ticket_kind', v_ticket_kind,
    'checked_in_at', v_ticket.checked_in_at,
    'checked_in_by', v_actor_name
  );
end;
$$;

revoke all on function public.validate_ticket(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.validate_ticket(uuid, uuid, text, text, text, text) to service_role;

create or replace function public.get_validation_dashboard(p_event_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_collaborator_id uuid := auth.uid();
  v_role text;
  v_event_title text;
  v_sold integer;
  v_validated integer;
  v_total_attempts integer;
  v_authorized integer;
  v_already_used integer;
  v_last_validation timestamptz;
  v_last_attendee text;
  v_history jsonb;
begin
  select p.role into v_role
  from public.profiles p
  where p.id = v_collaborator_id and p.status = 'approved';

  if not found or v_role not in ('collaborator', 'producer', 'admin') then
    raise exception 'account_not_approved';
  end if;

  select e.title into v_event_title
  from public.events e
  where e.id = p_event_id
    and (
      e.producer_id = v_collaborator_id
      or v_role = 'admin'
      or exists (
        select 1 from public.event_staff s
        where s.event_id = e.id and s.collaborator_id = v_collaborator_id
      )
    );

  if not found then raise exception 'event_not_assigned'; end if;

  select count(*) filter (where t.status in ('valid', 'used'))::integer,
         count(*) filter (where t.status = 'used')::integer
    into v_sold, v_validated
  from public.tickets t
  where t.event_id = p_event_id;

  select count(*)::integer,
         count(*) filter (where a.outcome = 'authorized')::integer,
         count(*) filter (where a.outcome = 'already_used')::integer
    into v_total_attempts, v_authorized, v_already_used
  from public.entry_validation_attempts a
  where a.event_id = p_event_id and a.collaborator_id = v_collaborator_id;

  select a.attempted_at, t.attendee_name
    into v_last_validation, v_last_attendee
  from public.entry_validation_attempts a
  join public.tickets t on t.id = a.ticket_id
  where a.event_id = p_event_id
    and a.collaborator_id = v_collaborator_id
    and a.outcome = 'authorized'
  order by a.attempted_at desc
  limit 1;

  select coalesce(jsonb_agg(to_jsonb(h) order by h.attempted_at desc), '[]'::jsonb)
    into v_history
  from (
    select a.id, a.ticket_id, a.outcome, a.input_method, a.attempted_at,
           coalesce(t.attendee_name, 'Código no reconocido') as attendee_name,
           t.attendee_rut as attendee_rut,
           coalesce(
             tt.name,
             case when opi.id is not null then concat('Producto · ', opi.product_name, case when nullif(opi.variant_name, '') is null then '' else ' · ' || opi.variant_name end) end
           ) as ticket_type,
           case when opi.id is not null then 'product' else 'entry' end as ticket_kind,
           t.checked_in_at as first_checked_in_at,
           checker.full_name as first_checked_in_by
    from public.entry_validation_attempts a
    left join public.tickets t on t.id = a.ticket_id and t.event_id = p_event_id
    left join public.order_items oi on oi.id = t.order_item_id
    left join public.ticket_types tt on tt.event_id = oi.event_id and tt.id = oi.ticket_type_id
    left join public.order_product_items opi on opi.id = t.order_product_item_id
    left join public.profiles checker on checker.id = t.checked_in_by
    where a.event_id = p_event_id and a.collaborator_id = v_collaborator_id
    order by a.attempted_at desc
    limit 30
  ) h;

  return jsonb_build_object(
    'event_id', p_event_id,
    'event_title', v_event_title,
    'stats', jsonb_build_object(
      'sold', v_sold,
      'validated', v_validated,
      'pending', greatest(v_sold - v_validated, 0),
      'percent', case when v_sold = 0 then 0 else round(v_validated * 100.0 / v_sold, 1) end
    ),
    'activity', jsonb_build_object(
      'attempts', v_total_attempts,
      'authorized', v_authorized,
      'already_used', v_already_used,
      'last_validation', v_last_validation,
      'last_attendee', v_last_attendee
    ),
    'history', v_history
  );
end;
$$;

revoke all on function public.get_validation_dashboard(text) from public, anon;
grant execute on function public.get_validation_dashboard(text) to authenticated;

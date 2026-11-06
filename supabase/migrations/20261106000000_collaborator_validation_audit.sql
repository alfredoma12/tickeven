alter table public.tickets
  add column checked_in_by uuid references public.profiles (id);

create table public.entry_validation_attempts (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.events (id),
  ticket_id uuid references public.tickets (id),
  collaborator_id uuid not null references public.profiles (id),
  outcome text not null check (outcome in ('authorized', 'already_used', 'invalid', 'other_event')),
  input_method text not null check (input_method in ('qr', 'manual')),
  attempted_at timestamptz not null default clock_timestamp()
);

create index entry_validation_event_time_idx
  on public.entry_validation_attempts (event_id, attempted_at desc);
create index entry_validation_collaborator_time_idx
  on public.entry_validation_attempts (event_id, collaborator_id, attempted_at desc);

alter table public.entry_validation_attempts enable row level security;
revoke all on public.entry_validation_attempts from public, anon, authenticated;
grant all on public.entry_validation_attempts to service_role;

drop function public.validate_ticket(uuid, uuid, text, text);

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

  select oi.buyer_name, oi.buyer_rut, tt.name, e.title
    into v_attendee_name, v_attendee_rut, v_ticket_type, v_event_title
  from public.order_items oi
  join public.ticket_types tt on tt.event_id = oi.event_id and tt.id = oi.ticket_type_id
  join public.events e on e.id = oi.event_id
  where oi.id = v_ticket.order_item_id;

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

  select a.attempted_at, oi.buyer_name
    into v_last_validation, v_last_attendee
  from public.entry_validation_attempts a
  join public.tickets t on t.id = a.ticket_id
  join public.order_items oi on oi.id = t.order_item_id
  where a.event_id = p_event_id
    and a.collaborator_id = v_collaborator_id
    and a.outcome = 'authorized'
  order by a.attempted_at desc
  limit 1;

  select coalesce(jsonb_agg(to_jsonb(h) order by h.attempted_at desc), '[]'::jsonb)
    into v_history
  from (
    select a.id, a.ticket_id, a.outcome, a.input_method, a.attempted_at,
           coalesce(oi.buyer_name, 'Código no reconocido') as attendee_name,
           oi.buyer_rut as attendee_rut,
           tt.name as ticket_type,
           t.checked_in_at as first_checked_in_at,
           checker.full_name as first_checked_in_by
    from public.entry_validation_attempts a
    left join public.tickets t on t.id = a.ticket_id and t.event_id = p_event_id
    left join public.order_items oi on oi.id = t.order_item_id
    left join public.ticket_types tt on tt.event_id = oi.event_id and tt.id = oi.ticket_type_id
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
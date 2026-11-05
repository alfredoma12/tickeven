alter table public.profiles
  add column full_name text,
  add column rut text,
  add column phone text,
  add column status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected'));

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('producer', 'collaborator', 'admin'));

create or replace function public.valid_chilean_rut(p_rut text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  normalized text := upper(regexp_replace(coalesce(p_rut, ''), '[.\s-]', '', 'g'));
  body text;
  provided_digit text;
  multiplier integer := 2;
  checksum integer := 0;
  result integer;
  expected_digit text;
  digit_index integer;
begin
  if normalized !~ '^[0-9]{7,8}[0-9K]$' then return false; end if;
  body := left(normalized, length(normalized) - 1);
  provided_digit := right(normalized, 1);
  for digit_index in reverse 1..length(body) loop
    checksum := checksum + substring(body from digit_index for 1)::integer * multiplier;
    multiplier := case when multiplier = 7 then 2 else multiplier + 1 end;
  end loop;
  result := 11 - (checksum % 11);
  expected_digit := case when result = 11 then '0' when result = 10 then 'K' else result::text end;
  return expected_digit = provided_digit;
end;
$$;

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

  insert into public.profiles (id, username, full_name, rut, phone, role, status)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data->>'username'), ''),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(upper(regexp_replace(coalesce(new.raw_user_meta_data->>'rut', ''), '[.\s-]', '', 'g')), ''),
    nullif(trim(new.raw_user_meta_data->>'phone'), ''),
    requested_role,
    'pending'
  );
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.status = 'approved'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

drop policy if exists "Users read their own profile" on public.profiles;
create policy "Users and admins read profiles"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

create policy "Admins update profile approvals"
  on public.profiles for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Producers manage their own events" on public.events;
create policy "Approved producers manage their own events"
  on public.events for all to authenticated
  using (
    producer_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'producer' and p.status = 'approved'
    )
  )
  with check (
    producer_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'producer' and p.status = 'approved'
    )
  );

drop policy if exists "Producers manage ticket types for their own events" on public.ticket_types;
create policy "Approved producers manage ticket types"
  on public.ticket_types for all to authenticated
  using (
    exists (
      select 1 from public.events e
      join public.profiles p on p.id = e.producer_id
      where e.id = ticket_types.event_id
        and e.producer_id = (select auth.uid())
        and p.role = 'producer' and p.status = 'approved'
    )
  )
  with check (
    exists (
      select 1 from public.events e
      join public.profiles p on p.id = e.producer_id
      where e.id = ticket_types.event_id
        and e.producer_id = (select auth.uid())
        and p.role = 'producer' and p.status = 'approved'
    )
  );

create table public.event_staff (
  event_id text not null references public.events (id) on delete cascade,
  collaborator_id uuid not null references public.profiles (id) on delete cascade,
  assigned_by uuid not null references public.profiles (id),
  assigned_at timestamptz not null default now(),
  primary key (event_id, collaborator_id)
);

create index event_staff_collaborator_idx on public.event_staff (collaborator_id, event_id);
alter table public.event_staff enable row level security;

create policy "Admins manage event staff"
  on public.event_staff for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "Producers assign staff to their events"
  on public.event_staff for all to authenticated
  using (
    exists (
      select 1 from public.events e
      where e.id = event_staff.event_id
        and e.producer_id = (select auth.uid())
    )
  )
  with check (
    assigned_by = (select auth.uid())
    and exists (
      select 1 from public.events e
      join public.profiles p on p.id = e.producer_id
      where e.id = event_staff.event_id
        and e.producer_id = (select auth.uid())
        and p.role = 'producer' and p.status = 'approved'
    )
    and exists (
      select 1 from public.profiles c
      where c.id = event_staff.collaborator_id
        and c.role = 'collaborator' and c.status = 'approved'
    )
  );

create policy "Collaborators see their event assignments"
  on public.event_staff for select to authenticated
  using (collaborator_id = (select auth.uid()));

drop policy if exists "Producers upload photos to their own folder" on storage.objects;
create policy "Approved producers upload event photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'event-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'producer' and p.status = 'approved'
    )
  );

drop policy if exists "Producers delete photos from their own folder" on storage.objects;
create policy "Approved producers delete event photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'event-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'producer' and p.status = 'approved'
    )
  );

create or replace function public.validate_ticket(
  p_producer_id uuid,
  p_ticket_id uuid,
  p_qr_token text,
  p_security_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets%rowtype;
  v_event_id text;
  v_attendee_name text;
  v_attendee_rut text;
  v_ticket_type text;
  v_event_title text;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = p_producer_id
      and p.status = 'approved'
      and (
        (p.role = 'producer' and exists (
          select 1 from public.events e where e.producer_id = p.id
        ))
        or p.role = 'collaborator'
        or p.role = 'admin'
      )
  ) then
    return jsonb_build_object('valid', false, 'reason', 'account_not_approved');
  end if;

  if p_security_code is not null then
    select t.* into v_ticket
    from public.tickets t
    join public.events e on e.id = t.event_id
    where t.security_code_hash = extensions.digest(upper(trim(p_security_code)), 'sha256')
      and (
        e.producer_id = p_producer_id
        or public.is_admin()
        or exists (
          select 1 from public.event_staff s
          where s.event_id = e.id and s.collaborator_id = p_producer_id
        )
      )
    for update of t;
  elsif p_ticket_id is not null and p_qr_token is not null then
    select t.* into v_ticket
    from public.tickets t
    join public.events e on e.id = t.event_id
    where t.id = p_ticket_id
      and t.qr_token_hash = extensions.digest(p_qr_token, 'sha256')
      and (
        e.producer_id = p_producer_id
        or public.is_admin()
        or exists (
          select 1 from public.event_staff s
          where s.event_id = e.id and s.collaborator_id = p_producer_id
        )
      )
    for update of t;
  else
    return jsonb_build_object('valid', false, 'reason', 'invalid_credentials');
  end if;

  if not found then return jsonb_build_object('valid', false, 'reason', 'not_found'); end if;
  if v_ticket.status <> 'valid' then
    return jsonb_build_object('valid', false, 'reason', 'already_used');
  end if;

  select oi.event_id, oi.buyer_name, oi.buyer_rut, tt.name, e.title
    into v_event_id, v_attendee_name, v_attendee_rut, v_ticket_type, v_event_title
  from public.order_items oi
  join public.ticket_types tt
    on tt.event_id = oi.event_id and tt.id = oi.ticket_type_id
  join public.events e on e.id = oi.event_id
  where oi.id = v_ticket.order_item_id;

  update public.tickets
  set status = 'used', checked_in_at = now()
  where id = v_ticket.id;

  return jsonb_build_object(
    'valid', true,
    'ticket_id', v_ticket.id,
    'event_id', v_event_id,
    'event_title', v_event_title,
    'attendee_name', v_attendee_name,
    'attendee_rut', v_attendee_rut,
    'ticket_type', v_ticket_type,
    'checked_in_at', now()
  );
end;
$$;

revoke all on function public.validate_ticket(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.validate_ticket(uuid, uuid, text, text) to service_role;

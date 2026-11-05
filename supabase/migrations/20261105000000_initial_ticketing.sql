create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique,
  role text not null default 'producer' check (role in ('producer', 'admin')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, nullif(trim(new.raw_user_meta_data->>'username'), ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table public.events (
  id text primary key,
  producer_id uuid not null references public.profiles (id) on delete cascade,
  slug text not null unique,
  title text not null,
  description text not null default '',
  category text not null,
  venue text not null,
  city text not null,
  starts_at timestamptz not null,
  cover_url text,
  gallery_urls text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now()
);

create table public.ticket_types (
  event_id text not null references public.events (id) on delete cascade,
  id text not null,
  name text not null,
  description text not null default '',
  price_clp integer not null check (price_clp >= 0),
  quantity_total integer not null check (quantity_total >= 0),
  is_active boolean not null default true,
  primary key (event_id, id)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  checkout_key uuid not null unique,
  buyer_name text not null,
  buyer_rut text not null,
  buyer_email text not null,
  buyer_phone text not null,
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'paid', 'cancelled', 'expired')),
  ticket_subtotal_clp integer not null check (ticket_subtotal_clp >= 0),
  administration_total_clp integer not null check (administration_total_clp >= 0),
  total_clp integer not null check (total_clp >= 0),
  payment_reference text unique,
  expires_at timestamptz not null default now() + interval '20 minutes',
  created_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  event_id text not null,
  ticket_type_id text not null,
  quantity integer not null check (quantity between 1 and 10),
  unit_price_clp integer not null check (unit_price_clp >= 0),
  administration_fee_clp integer not null check (administration_fee_clp >= 0),
  buyer_name text not null,
  buyer_rut text not null,
  buyer_email text not null,
  buyer_phone text not null,
  foreign key (event_id, ticket_type_id)
    references public.ticket_types (event_id, id)
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  event_id text not null,
  status text not null default 'valid' check (status in ('valid', 'used', 'void')),
  qr_token_hash bytea not null unique,
  security_code_hash bytea not null unique,
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (event_id) references public.events (id)
);

create index events_public_listing_idx on public.events (status, starts_at);
create index ticket_types_event_idx on public.ticket_types (event_id, is_active);
create index orders_pending_expiry_idx on public.orders (expires_at)
  where status = 'pending_payment';
create index order_items_inventory_idx on public.order_items (event_id, ticket_type_id);
create index tickets_event_idx on public.tickets (event_id, status);

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.ticket_types enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.tickets enable row level security;

create policy "Users read their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "Anyone can read published events"
  on public.events for select to anon, authenticated
  using (status = 'published' or producer_id = (select auth.uid()));

create policy "Producers manage their own events"
  on public.events for all to authenticated
  using (producer_id = (select auth.uid()))
  with check (producer_id = (select auth.uid()));

create policy "Anyone can read active ticket types for published events"
  on public.ticket_types for select to anon, authenticated
  using (
    is_active and exists (
      select 1 from public.events
      where events.id = ticket_types.event_id
        and (events.status = 'published' or events.producer_id = (select auth.uid()))
    )
  );

create policy "Producers manage ticket types for their own events"
  on public.ticket_types for all to authenticated
  using (
    exists (
      select 1 from public.events
      where events.id = ticket_types.event_id
        and events.producer_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.events
      where events.id = ticket_types.event_id
        and events.producer_id = (select auth.uid())
    )
  );

create or replace function public.create_pending_order(
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
  v_order_id uuid;
  v_ticket record;
  v_item jsonb;
  v_quantity integer;
  v_item_count integer;
  v_ticket_subtotal integer := 0;
  v_administration_total integer := 0;
  v_total integer;
  v_unit_fee integer;
  v_item_buyer jsonb;
begin
  select o.id, o.total_clp, o.status, o.expires_at
    into order_id, total_clp, order_status, expires_at
  from public.orders o
  where o.checkout_key = p_checkout_key;
  if found then
    return next;
    return;
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1
      or jsonb_array_length(p_items) > 10 then
    raise exception 'invalid_items';
  end if;
  if length(trim(p_buyer_name)) < 2 or length(trim(p_buyer_rut)) < 8
      or length(trim(p_buyer_email)) < 5 or length(trim(p_buyer_phone)) < 8 then
    raise exception 'invalid_buyer';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if (v_item->>'quantity') !~ '^[1-9][0-9]*$' then
      raise exception 'invalid_quantity';
    end if;
    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity > 10 then raise exception 'invalid_quantity'; end if;

    select tt.event_id, tt.id, tt.name, tt.price_clp, tt.quantity_total
      into v_ticket
    from public.ticket_types tt
    join public.events e on e.id = tt.event_id
    where tt.event_id = v_item->>'event_id'
      and tt.id = v_item->>'ticket_type_id'
      and tt.is_active
      and e.status = 'published'
    for update of tt;
    if not found then raise exception 'ticket_type_unavailable'; end if;

    select count(*) into v_item_count
    from public.tickets t
    join public.order_items oi on oi.id = t.order_item_id
    where oi.event_id = v_ticket.event_id
      and oi.ticket_type_id = v_ticket.id
      and t.status <> 'void';

    select coalesce(sum(oi.quantity), 0)::integer into v_quantity
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.event_id = v_ticket.event_id
      and oi.ticket_type_id = v_ticket.id
      and o.status = 'pending_payment'
      and o.expires_at > now();

    if v_item_count + v_quantity + (
      select sum((entry->>'quantity')::integer)
      from jsonb_array_elements(p_items) entry
      where entry->>'event_id' = v_ticket.event_id
        and entry->>'ticket_type_id' = v_ticket.id
    ) > v_ticket.quantity_total then
      raise exception 'insufficient_inventory';
    end if;

    v_unit_fee := round(v_ticket.price_clp * 0.10)::integer;
    v_ticket_subtotal := v_ticket_subtotal + v_ticket.price_clp * (v_item->>'quantity')::integer;
    v_administration_total := v_administration_total + v_unit_fee * (v_item->>'quantity')::integer;
  end loop;

  v_total := v_ticket_subtotal + v_administration_total;
  insert into public.orders (
    checkout_key, buyer_name, buyer_rut, buyer_email, buyer_phone,
    ticket_subtotal_clp, administration_total_clp, total_clp
  ) values (
    p_checkout_key, trim(p_buyer_name), trim(p_buyer_rut), lower(trim(p_buyer_email)),
    trim(p_buyer_phone), v_ticket_subtotal, v_administration_total, v_total
  ) on conflict (checkout_key) do nothing
  returning id, orders.total_clp, orders.status, orders.expires_at
    into order_id, total_clp, order_status, expires_at;
  if not found then
    select o.id, o.total_clp, o.status, o.expires_at
      into order_id, total_clp, order_status, expires_at
    from public.orders o
    where o.checkout_key = p_checkout_key;
    return next;
    return;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select tt.event_id, tt.id, tt.price_clp
      into v_ticket
    from public.ticket_types tt
    where tt.event_id = v_item->>'event_id'
      and tt.id = v_item->>'ticket_type_id';
    v_item_buyer := coalesce(v_item->'buyer', '{}'::jsonb);
    insert into public.order_items (
      order_id, event_id, ticket_type_id, quantity, unit_price_clp,
      administration_fee_clp, buyer_name, buyer_rut, buyer_email, buyer_phone
    ) values (
      order_id, v_ticket.event_id, v_ticket.id, (v_item->>'quantity')::integer,
      v_ticket.price_clp, round(v_ticket.price_clp * 0.10)::integer,
      coalesce(nullif(trim(v_item_buyer->>'name'), ''), trim(p_buyer_name)),
      coalesce(nullif(trim(v_item_buyer->>'rut'), ''), trim(p_buyer_rut)),
      lower(coalesce(nullif(trim(v_item_buyer->>'email'), ''), lower(trim(p_buyer_email)))),
      coalesce(nullif(trim(v_item_buyer->>'phone'), ''), trim(p_buyer_phone))
    );
  end loop;

  return next;
end;
$$;

revoke all on function public.create_pending_order(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_pending_order(uuid, text, text, text, text, jsonb) to service_role;

create or replace function public.issue_paid_order_tickets(
  p_order_id uuid,
  p_payment_reference text,
  p_tickets jsonb
)
returns table (ticket_id uuid, order_item_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_entry jsonb;
  v_expected_count integer;
  v_actual_count integer;
  v_ticket_id uuid;
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;
  if not found or v_order.status <> 'pending_payment' or v_order.expires_at <= now() then
    raise exception 'order_not_issuable';
  end if;
  if p_payment_reference is null or length(trim(p_payment_reference)) = 0
      or jsonb_typeof(p_tickets) <> 'array' then
    raise exception 'invalid_payment_confirmation';
  end if;

  select coalesce(sum(quantity), 0)::integer into v_expected_count
  from public.order_items where order_items.order_id = p_order_id;
  select count(*)::integer into v_actual_count
  from jsonb_array_elements(p_tickets);
  if v_actual_count <> v_expected_count then
    raise exception 'ticket_count_mismatch';
  end if;

  for v_entry in
    select jsonb_build_object('id', oi.id, 'quantity', oi.quantity)
    from public.order_items oi
    where oi.order_id = p_order_id
  loop
    select count(*)::integer into v_actual_count
    from jsonb_array_elements(p_tickets) ticket
    where ticket->>'order_item_id' = v_entry->>'id';
    if v_actual_count <> (v_entry->>'quantity')::integer then
      raise exception 'ticket_count_mismatch';
    end if;
  end loop;

  for v_entry in select value from jsonb_array_elements(p_tickets)
  loop
    if coalesce(v_entry->>'qr_token', '') = ''
        or coalesce(v_entry->>'security_code', '') = '' then
      raise exception 'invalid_ticket_credentials';
    end if;
    if not exists (
      select 1 from public.order_items oi
      where oi.id = (v_entry->>'order_item_id')::uuid
        and oi.order_id = p_order_id
    ) then
      raise exception 'invalid_order_item';
    end if;

    v_ticket_id := gen_random_uuid();
    insert into public.tickets (
      id, order_item_id, event_id, qr_token_hash, security_code_hash
    )
    select v_ticket_id, oi.id, oi.event_id,
      extensions.digest(v_entry->>'qr_token', 'sha256'),
      extensions.digest(upper(v_entry->>'security_code'), 'sha256')
    from public.order_items oi
    where oi.id = (v_entry->>'order_item_id')::uuid;
    ticket_id := v_ticket_id;
    order_item_id := (v_entry->>'order_item_id')::uuid;
    return next;
  end loop;

  update public.orders
  set status = 'paid', payment_reference = trim(p_payment_reference)
  where id = p_order_id;
end;
$$;

revoke all on function public.issue_paid_order_tickets(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.issue_paid_order_tickets(uuid, text, jsonb) to service_role;

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
begin
  if p_security_code is not null then
    select t.* into v_ticket
    from public.tickets t
    join public.events e on e.id = t.event_id
    where t.security_code_hash = extensions.digest(upper(trim(p_security_code)), 'sha256')
      and e.producer_id = p_producer_id
    for update of t;
  elsif p_ticket_id is not null and p_qr_token is not null then
    select t.* into v_ticket
    from public.tickets t
    join public.events e on e.id = t.event_id
    where t.id = p_ticket_id
      and t.qr_token_hash = extensions.digest(p_qr_token, 'sha256')
      and e.producer_id = p_producer_id
    for update of t;
  else
    return jsonb_build_object('valid', false, 'reason', 'invalid_credentials');
  end if;

  if not found then return jsonb_build_object('valid', false, 'reason', 'not_found'); end if;
  if v_ticket.status <> 'valid' then
    return jsonb_build_object('valid', false, 'reason', 'already_used');
  end if;

  update public.tickets
  set status = 'used', checked_in_at = now()
  where id = v_ticket.id;
  return jsonb_build_object('valid', true, 'ticket_id', v_ticket.id, 'checked_in_at', now());
end;
$$;

revoke all on function public.validate_ticket(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.validate_ticket(uuid, uuid, text, text) to service_role;

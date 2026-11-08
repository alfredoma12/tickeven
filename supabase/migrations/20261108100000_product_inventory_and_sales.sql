alter table public.orders
  add column product_subtotal_clp integer not null default 0 check (product_subtotal_clp >= 0),
  add column product_administration_total_clp integer not null default 0 check (product_administration_total_clp >= 0),
  add column paid_at timestamptz,
  add column mercadopago_fee_clp integer check (mercadopago_fee_clp >= 0),
  add column mercadopago_net_received_clp integer check (mercadopago_net_received_clp >= 0),
  add column refunded_total_clp integer check (refunded_total_clp >= 0),
  add column settled_total_clp integer check (settled_total_clp >= 0);

update public.orders
set paid_at = created_at
where status = 'paid' and paid_at is null;

create table public.event_products (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.events (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  description text not null default '' check (length(description) <= 1000),
  category text not null check (length(trim(category)) between 1 and 60),
  price_clp integer not null check (price_clp > 0),
  stock_total integer not null default 0 check (stock_total >= 0),
  image_url text,
  show_in_checkout boolean not null default true,
  show_on_event_page boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, event_id)
);

create table public.event_product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.event_products (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  stock_total integer not null check (stock_total >= 0),
  is_active boolean not null default true,
  unique (id, product_id)
);

create table public.order_product_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null,
  event_id text not null,
  variant_id uuid,
  quantity integer not null check (quantity between 1 and 10),
  unit_price_clp integer not null check (unit_price_clp > 0),
  administration_fee_clp integer not null check (administration_fee_clp >= 0),
  product_name text not null,
  variant_name text,
  category text not null,
  image_url text,
  created_at timestamptz not null default now(),
  foreign key (product_id, event_id)
    references public.event_products (id, event_id),
  foreign key (variant_id, product_id)
    references public.event_product_variants (id, product_id)
);

create index event_products_event_active_idx
  on public.event_products (event_id, is_active);
create index event_product_variants_product_active_idx
  on public.event_product_variants (product_id, is_active);
create index order_product_items_inventory_idx
  on public.order_product_items (product_id, variant_id, order_id);
create index orders_paid_at_idx
  on public.orders (paid_at)
  where status = 'paid';

alter table public.event_products enable row level security;
alter table public.event_product_variants enable row level security;
alter table public.order_product_items enable row level security;

create policy "Public can read products for published events"
  on public.event_products for select to anon, authenticated
  using (
    (is_active and (show_in_checkout or show_on_event_page) and exists (
      select 1 from public.events e
      where e.id = event_products.event_id and e.status = 'published'
    ))
    or exists (
      select 1 from public.events e
      where e.id = event_products.event_id and e.producer_id = (select auth.uid())
    )
  );

create policy "Public can read variants for visible products"
  on public.event_product_variants for select to anon, authenticated
  using (
    exists (
      select 1 from public.event_products p
      where p.id = event_product_variants.product_id
        and (
          (event_product_variants.is_active and p.is_active
            and (p.show_in_checkout or p.show_on_event_page) and exists (
            select 1 from public.events e
            where e.id = p.event_id and e.status = 'published'
          ))
          or exists (
            select 1 from public.events e
            where e.id = p.event_id and e.producer_id = (select auth.uid())
          )
        )
    )
  );

revoke all on public.order_product_items from public, anon, authenticated;
grant all on public.order_product_items to service_role;

create or replace view public.ticket_inventory as
with sold as (
  select oi.event_id, oi.ticket_type_id, count(t.id)::integer as quantity_sold
  from public.order_items oi
  join public.orders o on o.id = oi.order_id and o.status = 'paid'
  join public.tickets t on t.order_item_id = oi.id and t.status <> 'void'
  group by oi.event_id, oi.ticket_type_id
), reserved as (
  select oi.event_id, oi.ticket_type_id, coalesce(sum(oi.quantity), 0)::integer as quantity_reserved
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.status = 'pending_payment' and o.expires_at > now()
  group by oi.event_id, oi.ticket_type_id
)
select
  tt.event_id,
  tt.id as ticket_type_id,
  tt.name,
  tt.description,
  tt.price_clp,
  tt.quantity_total,
  coalesce(s.quantity_sold, 0)::integer as quantity_sold,
  coalesce(r.quantity_reserved, 0)::integer as quantity_reserved,
  greatest(tt.quantity_total - coalesce(s.quantity_sold, 0) - coalesce(r.quantity_reserved, 0), 0)::integer as quantity_available,
  tt.is_active
from public.ticket_types tt
join public.events e on e.id = tt.event_id
left join sold s on s.event_id = tt.event_id and s.ticket_type_id = tt.id
left join reserved r on r.event_id = tt.event_id and r.ticket_type_id = tt.id
where e.status = 'published' or e.producer_id = (select auth.uid());

create or replace view public.event_product_inventory as
with sold as (
  select i.product_id, i.variant_id, coalesce(sum(i.quantity), 0)::integer as quantity_sold
  from public.order_product_items i
  join public.orders o on o.id = i.order_id and o.status = 'paid'
  group by i.product_id, i.variant_id
), reserved as (
  select i.product_id, i.variant_id, coalesce(sum(i.quantity), 0)::integer as quantity_reserved
  from public.order_product_items i
  join public.orders o on o.id = i.order_id
  where o.status = 'pending_payment' and o.expires_at > now()
  group by i.product_id, i.variant_id
), inventory_rows as (
  select
    p.id as product_id,
    p.event_id,
    p.name,
    p.description,
    p.category,
    p.price_clp,
    p.image_url,
    p.show_in_checkout,
    p.show_on_event_page,
    p.is_active,
    null::uuid as variant_id,
    null::text as variant_name,
    p.stock_total as capacity
  from public.event_products p
  where not exists (
    select 1 from public.event_product_variants v where v.product_id = p.id
  )
  union all
  select
    p.id,
    p.event_id,
    p.name,
    p.description,
    p.category,
    p.price_clp,
    p.image_url,
    p.show_in_checkout,
    p.show_on_event_page,
    p.is_active,
    v.id,
    v.name,
    v.stock_total
  from public.event_products p
  join public.event_product_variants v on v.product_id = p.id
)
select
  i.*,
  coalesce(s.quantity_sold, 0)::integer as quantity_sold,
  coalesce(r.quantity_reserved, 0)::integer as quantity_reserved,
  greatest(i.capacity - coalesce(s.quantity_sold, 0) - coalesce(r.quantity_reserved, 0), 0)::integer as quantity_available
from inventory_rows i
join public.events e on e.id = i.event_id
left join sold s on s.product_id = i.product_id and s.variant_id is not distinct from i.variant_id
left join reserved r on r.product_id = i.product_id and r.variant_id is not distinct from i.variant_id
where
  (e.status = 'published' and i.is_active and (i.show_in_checkout or i.show_on_event_page)
    and (i.variant_id is null or exists (
      select 1 from public.event_product_variants visible_variant
      where visible_variant.id = i.variant_id and visible_variant.is_active
    )))
  or e.producer_id = (select auth.uid());

grant select on public.ticket_inventory to anon, authenticated;
grant select on public.event_product_inventory to anon, authenticated;
grant select on public.event_products, public.event_product_variants to authenticated;

create or replace function public.save_event_product(
  p_product_id uuid,
  p_event_id text,
  p_name text,
  p_description text,
  p_category text,
  p_price_clp integer,
  p_stock_total integer,
  p_image_url text,
  p_show_in_checkout boolean,
  p_show_on_event_page boolean,
  p_is_active boolean,
  p_variants jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_product_id uuid := coalesce(p_product_id, gen_random_uuid());
  v_variant jsonb;
  v_variant_id uuid;
  v_name text;
  v_stock integer;
  v_variant_name text;
  v_variant_stock integer;
  v_variant_history integer;
  v_sold integer;
  v_reserved integer;
begin
  if v_actor is null or p_event_id is null or length(trim(coalesce(p_name, ''))) not between 1 and 100
      or length(coalesce(p_description, '')) > 1000
      or length(trim(coalesce(p_category, ''))) not between 1 and 60
      or p_price_clp is null or p_price_clp <= 0
      or p_stock_total is null or p_stock_total < 0
      or jsonb_typeof(p_variants) is distinct from 'array' or jsonb_array_length(p_variants) > 20 then
    raise exception 'invalid_product';
  end if;
  if not exists (
    select 1
    from public.events e
    join public.profiles profile on profile.id = e.producer_id
    where e.id = p_event_id
      and e.producer_id = v_actor
      and profile.role = 'producer'
      and profile.status = 'approved'
  ) then
    raise exception 'event_not_owned';
  end if;

  perform 1 from public.event_products p
  where p.id = v_product_id and p.event_id = p_event_id
  for update;
  if p_product_id is not null and not found then
    raise exception 'product_not_found';
  end if;

  if jsonb_array_length(p_variants) = 0 then
    select count(*)::integer into v_variant_history
    from public.order_product_items i
    where i.product_id = v_product_id;
    if v_variant_history > 0 then
      raise exception 'product_variant_history_exists';
    end if;
    select
      coalesce(sum(i.quantity) filter (where o.status = 'paid'), 0)::integer,
      coalesce(sum(i.quantity) filter (where o.status = 'pending_payment' and o.expires_at > now()), 0)::integer
    into v_sold, v_reserved
    from public.order_product_items i
    join public.orders o on o.id = i.order_id
    where i.product_id = v_product_id and i.variant_id is null;
    if p_stock_total < v_sold + v_reserved then
      raise exception 'stock_below_committed';
    end if;
  else
    if p_stock_total <> 0 then raise exception 'variant_product_stock_must_be_zero'; end if;
    if exists (
      select 1 from public.order_product_items i
      where i.product_id = v_product_id and i.variant_id is null
    ) then
      raise exception 'product_variant_history_exists';
    end if;
  end if;

  insert into public.event_products (
    id, event_id, name, description, category, price_clp, stock_total, image_url,
    show_in_checkout, show_on_event_page, is_active, updated_at
  ) values (
    v_product_id, p_event_id, trim(p_name), coalesce(p_description, ''),
    trim(p_category), p_price_clp, p_stock_total, nullif(trim(coalesce(p_image_url, '')), ''),
    coalesce(p_show_in_checkout, true), coalesce(p_show_on_event_page, true),
    coalesce(p_is_active, true), now()
  )
  on conflict (id) do update set
    name = excluded.name,
    description = excluded.description,
    category = excluded.category,
    price_clp = excluded.price_clp,
    stock_total = excluded.stock_total,
    image_url = excluded.image_url,
    show_in_checkout = excluded.show_in_checkout,
    show_on_event_page = excluded.show_on_event_page,
    is_active = excluded.is_active,
    updated_at = now();

  for v_variant in select value from jsonb_array_elements(p_variants)
  loop
    v_name := trim(coalesce(v_variant->>'name', ''));
    if length(v_name) not between 1 and 60 or
        coalesce(v_variant->>'stock_total', '') !~ '^(0|[1-9][0-9]*)$' then
      raise exception 'invalid_product_variant';
    end if;
    v_stock := (v_variant->>'stock_total')::integer;
    v_variant_id := case
      when nullif(v_variant->>'id', '') is null then gen_random_uuid()
      else (v_variant->>'id')::uuid
    end;
    if nullif(v_variant->>'id', '') is not null and not exists (
      select 1 from public.event_product_variants v
      where v.id = v_variant_id and v.product_id = v_product_id
    ) then
      raise exception 'invalid_product_variant';
    end if;

    select
      coalesce(sum(i.quantity) filter (where o.status = 'paid'), 0)::integer,
      coalesce(sum(i.quantity) filter (where o.status = 'pending_payment' and o.expires_at > now()), 0)::integer
    into v_sold, v_reserved
    from public.order_product_items i
    join public.orders o on o.id = i.order_id
    where i.product_id = v_product_id and i.variant_id = v_variant_id;
    if v_stock < v_sold + v_reserved then
      raise exception 'stock_below_committed';
    end if;

    insert into public.event_product_variants (id, product_id, name, stock_total, is_active)
    values (v_variant_id, v_product_id, v_name, v_stock, true)
    on conflict (id) do update set
      name = excluded.name,
      stock_total = excluded.stock_total,
      is_active = true;
  end loop;

  for v_variant_id in
    select v.id
    from public.event_product_variants v
    where v.product_id = v_product_id and v.is_active
      and not exists (
        select 1 from jsonb_array_elements(p_variants) as submitted(value)
        where submitted.value->>'id' = v.id::text
      )
  loop
    if exists (
      select 1 from public.order_product_items i
      where i.product_id = v_product_id and i.variant_id = v_variant_id
    ) then
      update public.event_product_variants set is_active = false where id = v_variant_id;
    else
      delete from public.event_product_variants where id = v_variant_id;
    end if;
  end loop;

  return v_product_id;
end;
$$;

revoke all on function public.save_event_product(uuid, text, text, text, text, integer, integer, text, boolean, boolean, boolean, jsonb) from public, anon;
grant execute on function public.save_event_product(uuid, text, text, text, text, integer, integer, text, boolean, boolean, boolean, jsonb) to authenticated;

create or replace function public.create_pending_order_with_products(
  p_checkout_key uuid,
  p_buyer_name text,
  p_buyer_rut text,
  p_buyer_email text,
  p_buyer_phone text,
  p_items jsonb,
  p_products jsonb
)
returns table (order_id uuid, total_clp integer, order_status text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.orders%rowtype;
  v_item jsonb;
  v_ticket record;
  v_product record;
  v_variant_id uuid;
  v_variant_name text;
  v_variant_stock integer;
  v_sold integer;
  v_reserved integer;
  v_requested integer;
  v_ticket_subtotal integer := 0;
  v_ticket_fee integer := 0;
  v_product_subtotal integer := 0;
  v_product_fee integer := 0;
  v_total integer;
  v_unit_fee integer;
  v_item_buyer jsonb;
  v_order_id uuid;
begin
  if p_checkout_key is null then raise exception 'invalid_checkout_key'; end if;
  select o.* into v_existing from public.orders o where o.checkout_key = p_checkout_key for update;
  if found then
    order_id := v_existing.id;
    total_clp := v_existing.total_clp;
    order_status := v_existing.status;
    expires_at := v_existing.expires_at;
    return next;
    return;
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_typeof(p_products) is distinct from 'array'
      or jsonb_array_length(p_items) > 10 or jsonb_array_length(p_products) > 20
      or (jsonb_array_length(p_items) = 0 and jsonb_array_length(p_products) = 0) then
    raise exception 'invalid_items';
  end if;
  if length(trim(coalesce(p_buyer_name, ''))) not between 2 and 120
      or length(trim(coalesce(p_buyer_rut, ''))) not between 8 and 20
      or length(trim(coalesce(p_buyer_email, ''))) not between 5 and 254
      or length(trim(coalesce(p_buyer_phone, ''))) not between 8 and 24 then
    raise exception 'invalid_buyer';
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items)
    order by value->>'event_id', value->>'ticket_type_id'
  loop
    if coalesce(v_item->>'quantity', '') !~ '^[1-9][0-9]*$'
        or (v_item->>'quantity')::integer > 10 then
      raise exception 'invalid_quantity';
    end if;
    select tt.event_id, tt.id, tt.price_clp, tt.quantity_total
      into v_ticket
    from public.ticket_types tt
    join public.events e on e.id = tt.event_id
    where tt.event_id = v_item->>'event_id'
      and tt.id = v_item->>'ticket_type_id'
      and tt.is_active and e.status = 'published'
    for update of tt;
    if not found then raise exception 'ticket_type_unavailable'; end if;

    select count(t.id)::integer into v_sold
    from public.tickets t
    join public.order_items oi on oi.id = t.order_item_id
    join public.orders o on o.id = oi.order_id
    where oi.event_id = v_ticket.event_id and oi.ticket_type_id = v_ticket.id
      and o.status = 'paid' and t.status <> 'void';
    select coalesce(sum(oi.quantity), 0)::integer into v_reserved
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.event_id = v_ticket.event_id and oi.ticket_type_id = v_ticket.id
      and o.status = 'pending_payment' and o.expires_at > now();
    select coalesce(sum((entry.value->>'quantity')::integer), 0)::integer into v_requested
    from jsonb_array_elements(p_items) as entry(value)
    where entry.value->>'event_id' = v_ticket.event_id
      and entry.value->>'ticket_type_id' = v_ticket.id;
    if v_sold + v_reserved + v_requested > v_ticket.quantity_total then
      raise exception 'insufficient_inventory';
    end if;

    v_unit_fee := round(v_ticket.price_clp * 0.10)::integer;
    v_ticket_subtotal := v_ticket_subtotal + v_ticket.price_clp * (v_item->>'quantity')::integer;
    v_ticket_fee := v_ticket_fee + v_unit_fee * (v_item->>'quantity')::integer;
  end loop;

  for v_item in
    select value from jsonb_array_elements(p_products)
    order by value->>'product_id', coalesce(value->>'variant_id', '')
  loop
    if coalesce(v_item->>'quantity', '') !~ '^[1-9][0-9]*$'
        or (v_item->>'quantity')::integer > 10 then
      raise exception 'invalid_quantity';
    end if;
    select p.id, p.event_id, p.name, p.category, p.price_clp, p.image_url
      into v_product
    from public.event_products p
    join public.events e on e.id = p.event_id
    where p.id = (v_item->>'product_id')::uuid
      and p.is_active and e.status = 'published'
    for update of p;
    if not found then raise exception 'product_unavailable'; end if;

    select count(*)::integer into v_requested
    from public.event_product_variants v
    where v.product_id = v_product.id and v.is_active;
    if v_requested > 0 then
      if coalesce(v_item->>'variant_id', '') = '' then
        raise exception 'product_variant_required';
      end if;
      select v.id, v.name, v.stock_total
        into v_variant_id, v_variant_name, v_variant_stock
      from public.event_product_variants v
      where v.id = (v_item->>'variant_id')::uuid
        and v.product_id = v_product.id and v.is_active
      for update;
      if not found then raise exception 'product_variant_unavailable'; end if;
    else
      if coalesce(v_item->>'variant_id', '') <> '' then
        raise exception 'product_variant_unavailable';
      end if;
      v_variant_id := null;
      v_variant_name := null;
      select p.stock_total into v_variant_stock
      from public.event_products p where p.id = v_product.id;
    end if;

    select coalesce(sum(i.quantity) filter (where o.status = 'paid'), 0)::integer,
      coalesce(sum(i.quantity) filter (where o.status = 'pending_payment' and o.expires_at > now()), 0)::integer
      into v_sold, v_reserved
    from public.order_product_items i
    join public.orders o on o.id = i.order_id
    where i.product_id = v_product.id
      and i.variant_id is not distinct from nullif(v_item->>'variant_id', '')::uuid;
    select coalesce(sum((entry.value->>'quantity')::integer), 0)::integer into v_requested
    from jsonb_array_elements(p_products) as entry(value)
    where entry.value->>'product_id' = v_product.id::text
      and nullif(entry.value->>'variant_id', '') is not distinct from nullif(v_item->>'variant_id', '')::uuid;
    if v_sold + v_reserved + v_requested > v_variant_stock then
      raise exception 'insufficient_product_inventory';
    end if;

    v_unit_fee := round(v_product.price_clp * 0.10)::integer;
    v_product_subtotal := v_product_subtotal + v_product.price_clp * (v_item->>'quantity')::integer;
    v_product_fee := v_product_fee + v_unit_fee * (v_item->>'quantity')::integer;
  end loop;

  v_total := v_ticket_subtotal + v_ticket_fee + v_product_subtotal + v_product_fee;
  insert into public.orders (
    checkout_key, buyer_name, buyer_rut, buyer_email, buyer_phone,
    ticket_subtotal_clp, administration_total_clp,
    product_subtotal_clp, product_administration_total_clp,
    total_clp, expires_at
  ) values (
    p_checkout_key, trim(p_buyer_name), trim(p_buyer_rut), lower(trim(p_buyer_email)),
    trim(p_buyer_phone), v_ticket_subtotal, v_ticket_fee,
    v_product_subtotal, v_product_fee, v_total, now() + interval '20 minutes'
  )
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select tt.event_id, tt.id, tt.price_clp
      into v_ticket
    from public.ticket_types tt
    where tt.event_id = v_item->>'event_id' and tt.id = v_item->>'ticket_type_id';
    v_item_buyer := coalesce(v_item->'buyer', '{}'::jsonb);
    insert into public.order_items (
      order_id, event_id, ticket_type_id, quantity, unit_price_clp,
      administration_fee_clp, buyer_name, buyer_rut, buyer_email, buyer_phone
    ) values (
      v_order_id, v_ticket.event_id, v_ticket.id, (v_item->>'quantity')::integer,
      v_ticket.price_clp, round(v_ticket.price_clp * 0.10)::integer,
      coalesce(nullif(trim(v_item_buyer->>'name'), ''), trim(p_buyer_name)),
      coalesce(nullif(trim(v_item_buyer->>'rut'), ''), trim(p_buyer_rut)),
      lower(coalesce(nullif(trim(v_item_buyer->>'email'), ''), lower(trim(p_buyer_email)))),
      coalesce(nullif(trim(v_item_buyer->>'phone'), ''), trim(p_buyer_phone))
    );
  end loop;

  for v_item in select value from jsonb_array_elements(p_products)
  loop
    select p.id, p.event_id, p.name, p.category, p.price_clp, p.image_url
      into v_product
    from public.event_products p where p.id = (v_item->>'product_id')::uuid;
    if nullif(v_item->>'variant_id', '') is not null then
      select v.id, v.name into v_variant_id, v_variant_name
      from public.event_product_variants v
      where v.id = (v_item->>'variant_id')::uuid and v.product_id = v_product.id;
    else
      v_variant_name := null;
    end if;
    insert into public.order_product_items (
      order_id, product_id, event_id, variant_id, quantity, unit_price_clp,
      administration_fee_clp, product_name, variant_name, category, image_url
    ) values (
      v_order_id, v_product.id, v_product.event_id,
      nullif(v_item->>'variant_id', '')::uuid, (v_item->>'quantity')::integer,
      v_product.price_clp, round(v_product.price_clp * 0.10)::integer,
      v_product.name,       v_variant_name, v_product.category, v_product.image_url
    );
  end loop;

  select o.id, o.total_clp, o.status, o.expires_at
    into order_id, total_clp, order_status, expires_at
  from public.orders o where o.id = v_order_id;
  return next;
end;
$$;

revoke all on function public.create_pending_order_with_products(uuid, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_pending_order_with_products(uuid, text, text, text, text, jsonb, jsonb) to service_role;

create or replace function public.cancel_pending_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  select o.* into v_order from public.orders o where o.id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.status = 'pending_payment' then
    update public.orders set status = 'cancelled' where id = p_order_id;
    return true;
  end if;
  return false;
end;
$$;

revoke all on function public.cancel_pending_order(uuid) from public, anon, authenticated;
grant execute on function public.cancel_pending_order(uuid) to service_role;

create or replace view public.order_event_financials as
select
  lines.order_id,
  lines.event_id,
  sum(lines.subtotal_clp)::bigint as subtotal_clp,
  sum(lines.administration_clp)::bigint as administration_clp,
  sum(lines.collected_clp)::bigint as collected_clp
from (
  select
    i.order_id,
    i.event_id,
    i.quantity * i.unit_price_clp as subtotal_clp,
    i.quantity * i.administration_fee_clp as administration_clp,
    i.quantity * (i.unit_price_clp + i.administration_fee_clp) as collected_clp
  from public.order_items i
  union all
  select
    i.order_id,
    i.event_id,
    i.quantity * i.unit_price_clp,
    i.quantity * i.administration_fee_clp,
    i.quantity * (i.unit_price_clp + i.administration_fee_clp)
  from public.order_product_items i
) lines
group by lines.order_id, lines.event_id;

revoke all on public.order_event_financials from public, anon, authenticated;

create or replace function public.set_order_paid_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'paid' and new.paid_at is null then
    new.paid_at := clock_timestamp();
  end if;
  return new;
end;
$$;

create trigger orders_set_paid_at
  before insert or update of status on public.orders
  for each row execute function public.set_order_paid_at();

create or replace function public.guard_order_inventory_on_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line record;
  v_capacity integer;
  v_sold bigint;
  v_reserved bigint;
  v_current bigint;
begin
  if new.status <> 'paid' or old.status = 'paid' then return new; end if;

  for v_line in
    select oi.event_id, oi.ticket_type_id
    from public.order_items oi
    where oi.order_id = new.id
    group by oi.event_id, oi.ticket_type_id
    order by oi.event_id, oi.ticket_type_id
  loop
    select tt.quantity_total into v_capacity
    from public.ticket_types tt
    where tt.event_id = v_line.event_id and tt.id = v_line.ticket_type_id
    for update;
    if not found then raise exception 'ticket_type_unavailable'; end if;

    select count(t.id) into v_sold
    from public.tickets t
    join public.order_items oi on oi.id = t.order_item_id
    join public.orders o on o.id = oi.order_id
    where oi.event_id = v_line.event_id and oi.ticket_type_id = v_line.ticket_type_id
      and o.status = 'paid' and t.status <> 'void';
    select coalesce(sum(oi.quantity), 0) into v_reserved
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.event_id = v_line.event_id and oi.ticket_type_id = v_line.ticket_type_id
      and oi.order_id <> new.id
      and o.status = 'pending_payment' and o.expires_at > now();
    select coalesce(sum(oi.quantity), 0) into v_current
    from public.order_items oi
    where oi.order_id = new.id
      and oi.event_id = v_line.event_id
      and oi.ticket_type_id = v_line.ticket_type_id;
    if v_sold + v_reserved + v_current > v_capacity then
      raise exception 'insufficient_inventory';
    end if;
  end loop;

  for v_line in
    select i.product_id, i.variant_id, sum(i.quantity)::bigint as quantity
    from public.order_product_items i
    where i.order_id = new.id
    group by i.product_id, i.variant_id
    order by i.product_id, i.variant_id nulls first
  loop
    perform 1 from public.event_products p where p.id = v_line.product_id for update;
    if not found then raise exception 'product_unavailable'; end if;
    if v_line.variant_id is not null then
      select v.stock_total into v_capacity
      from public.event_product_variants v
      where v.id = v_line.variant_id and v.product_id = v_line.product_id
      for update;
      if not found then raise exception 'product_variant_unavailable'; end if;
    else
      select p.stock_total into v_capacity
      from public.event_products p where p.id = v_line.product_id;
    end if;

    select coalesce(sum(i.quantity), 0) into v_sold
    from public.order_product_items i
    join public.orders o on o.id = i.order_id
    where i.product_id = v_line.product_id
      and i.variant_id is not distinct from v_line.variant_id
      and o.status = 'paid';
    select coalesce(sum(i.quantity), 0) into v_reserved
    from public.order_product_items i
    join public.orders o on o.id = i.order_id
    where i.product_id = v_line.product_id
      and i.variant_id is not distinct from v_line.variant_id
      and i.order_id <> new.id
      and o.status = 'pending_payment' and o.expires_at > now();
    if v_sold + v_reserved + v_line.quantity > v_capacity then
      raise exception 'insufficient_product_inventory';
    end if;
  end loop;
  return new;
end;
$$;

create trigger orders_guard_inventory_on_payment
  before update of status on public.orders
  for each row
  when (new.status = 'paid' and old.status <> 'paid')
  execute function public.guard_order_inventory_on_payment();

create or replace function public.get_producer_sales_dashboard(p_event_id text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_result jsonb;
begin
  if v_actor is null or not exists (
    select 1 from public.profiles p
    where p.id = v_actor and p.role = 'producer' and p.status = 'approved'
  ) then
    raise exception 'producer_not_authorized';
  end if;

  if p_event_id is not null and not exists (
    select 1 from public.events e where e.id = p_event_id and e.producer_id = v_actor
  ) then
    raise exception 'event_not_owned';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id', e.id,
    'title', e.title,
    'status', e.status,
    'tickets', jsonb_build_object(
      'capacity', coalesce((select sum(i.quantity_total) from public.ticket_types i where i.event_id = e.id), 0),
      'sold', coalesce((select sum(i.quantity_sold) from public.ticket_inventory i where i.event_id = e.id), 0),
      'reserved', coalesce((select sum(i.quantity_reserved) from public.ticket_inventory i where i.event_id = e.id), 0),
      'available', coalesce((select sum(i.quantity_available) from public.ticket_inventory i where i.event_id = e.id), 0),
      'revenue_clp', coalesce((
        select sum(oi.quantity * oi.unit_price_clp)
        from public.order_items oi join public.orders o on o.id = oi.order_id
        where oi.event_id = e.id and o.status = 'paid'
      ), 0),
      'administration_clp', coalesce((
        select sum(oi.quantity * oi.administration_fee_clp)
        from public.order_items oi join public.orders o on o.id = oi.order_id
        where oi.event_id = e.id and o.status = 'paid'
      ), 0),
      'types', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', i.ticket_type_id, 'name', i.name, 'capacity', i.quantity_total,
          'sold', i.quantity_sold, 'reserved', i.quantity_reserved, 'available', i.quantity_available,
          'revenue_clp', coalesce((
            select sum(oi.quantity * oi.unit_price_clp)
            from public.order_items oi join public.orders o on o.id = oi.order_id
            where oi.event_id = i.event_id and oi.ticket_type_id = i.ticket_type_id and o.status = 'paid'
          ), 0)
        ) order by i.name)
        from public.ticket_inventory i where i.event_id = e.id
      ), '[]'::jsonb)
    ),
    'products', jsonb_build_object(
      'sold', coalesce((
        select sum(i.quantity) from public.order_product_items i
        join public.orders o on o.id = i.order_id
        where i.event_id = e.id and o.status = 'paid'
      ), 0),
      'revenue_clp', coalesce((
        select sum(i.quantity * i.unit_price_clp) from public.order_product_items i
        join public.orders o on o.id = i.order_id
        where i.event_id = e.id and o.status = 'paid'
      ), 0),
      'administration_clp', coalesce((
        select sum(i.quantity * i.administration_fee_clp) from public.order_product_items i
        join public.orders o on o.id = i.order_id
        where i.event_id = e.id and o.status = 'paid'
      ), 0),
      'inventory', coalesce((
        select jsonb_agg(jsonb_build_object(
          'product_id', i.product_id, 'variant_id', i.variant_id,
          'name', i.name, 'variant', i.variant_name, 'category', i.category,
          'capacity', i.capacity, 'sold', i.quantity_sold, 'reserved', i.quantity_reserved,
          'available', i.quantity_available, 'revenue_clp', coalesce((
            select sum(oi.quantity * oi.unit_price_clp)
            from public.order_product_items oi join public.orders o on o.id = oi.order_id
            where oi.product_id = i.product_id
              and oi.variant_id is not distinct from i.variant_id and o.status = 'paid'
          ), 0)
        ) order by i.name, i.variant_name)
        from public.event_product_inventory i where i.event_id = e.id
      ), '[]'::jsonb)
    ),
    'sales', jsonb_build_object(
      'today_clp', coalesce((
        select sum(oi.quantity * (oi.unit_price_clp + oi.administration_fee_clp))
        from public.order_items oi join public.orders o on o.id = oi.order_id
        where oi.event_id = e.id and o.status = 'paid' and o.paid_at >= date_trunc('day', now())
      ), 0) + coalesce((
        select sum(i.quantity * (i.unit_price_clp + i.administration_fee_clp))
        from public.order_product_items i join public.orders o on o.id = i.order_id
        where i.event_id = e.id and o.status = 'paid' and o.paid_at >= date_trunc('day', now())
      ), 0),
      'last_7_days_clp', coalesce((
        select sum(oi.quantity * (oi.unit_price_clp + oi.administration_fee_clp))
        from public.order_items oi join public.orders o on o.id = oi.order_id
        where oi.event_id = e.id and o.status = 'paid' and o.paid_at >= now() - interval '7 days'
      ), 0) + coalesce((
        select sum(i.quantity * (i.unit_price_clp + i.administration_fee_clp))
        from public.order_product_items i join public.orders o on o.id = i.order_id
        where i.event_id = e.id and o.status = 'paid' and o.paid_at >= now() - interval '7 days'
      ), 0),
      'month_clp', coalesce((
        select sum(oi.quantity * (oi.unit_price_clp + oi.administration_fee_clp))
        from public.order_items oi join public.orders o on o.id = oi.order_id
        where oi.event_id = e.id and o.status = 'paid' and o.paid_at >= date_trunc('month', now())
      ), 0) + coalesce((
        select sum(i.quantity * (i.unit_price_clp + i.administration_fee_clp))
        from public.order_product_items i join public.orders o on o.id = i.order_id
        where i.event_id = e.id and o.status = 'paid' and o.paid_at >= date_trunc('month', now())
      ), 0),
      'daily', coalesce((
        select jsonb_agg(jsonb_build_object(
          'date', to_char(days.sale_day::date, 'YYYY-MM-DD'),
          'tickets_clp', coalesce((
            select sum(oi.quantity * (oi.unit_price_clp + oi.administration_fee_clp))
            from public.order_items oi
            join public.orders o on o.id = oi.order_id
            where oi.event_id = e.id and o.status = 'paid'
              and o.paid_at >= (days.sale_day::date::timestamp at time zone 'America/Santiago')
              and o.paid_at < ((days.sale_day::date + 1)::timestamp at time zone 'America/Santiago')
          ), 0),
          'products_clp', coalesce((
            select sum(i.quantity * (i.unit_price_clp + i.administration_fee_clp))
            from public.order_product_items i
            join public.orders o on o.id = i.order_id
            where i.event_id = e.id and o.status = 'paid'
              and o.paid_at >= (days.sale_day::date::timestamp at time zone 'America/Santiago')
              and o.paid_at < ((days.sale_day::date + 1)::timestamp at time zone 'America/Santiago')
          ), 0),
          'product_categories', coalesce((
            select jsonb_object_agg(category_sales.category, category_sales.total_clp)
            from (
              select i.category, sum(i.quantity * (i.unit_price_clp + i.administration_fee_clp)) as total_clp
              from public.order_product_items i
              join public.orders o on o.id = i.order_id
              where i.event_id = e.id and o.status = 'paid'
                and o.paid_at >= (days.sale_day::date::timestamp at time zone 'America/Santiago')
                and o.paid_at < ((days.sale_day::date + 1)::timestamp at time zone 'America/Santiago')
              group by i.category
            ) category_sales
          ), '{}'::jsonb)
        ) order by days.sale_day)
        from generate_series(
          (now() at time zone 'America/Santiago')::date - 29,
          (now() at time zone 'America/Santiago')::date,
          interval '1 day'
        ) as days(sale_day)
      ), '[]'::jsonb),
      'total_clp', coalesce((
        select sum(oi.quantity * (oi.unit_price_clp + oi.administration_fee_clp))
        from public.order_items oi join public.orders o on o.id = oi.order_id
        where oi.event_id = e.id and o.status = 'paid'
      ), 0) + coalesce((
        select sum(i.quantity * (i.unit_price_clp + i.administration_fee_clp))
        from public.order_product_items i join public.orders o on o.id = i.order_id
        where i.event_id = e.id and o.status = 'paid'
      ), 0),
      'ticket_subtotal_clp', coalesce((
        select sum(oi.quantity * oi.unit_price_clp)
        from public.order_items oi join public.orders o on o.id = oi.order_id
        where oi.event_id = e.id and o.status = 'paid'
      ), 0),
      'product_subtotal_clp', coalesce((
        select sum(i.quantity * i.unit_price_clp)
        from public.order_product_items i join public.orders o on o.id = i.order_id
        where i.event_id = e.id and o.status = 'paid'
      ), 0),
      'administration_clp', coalesce((
        select sum(oi.quantity * oi.administration_fee_clp)
        from public.order_items oi join public.orders o on o.id = oi.order_id
        where oi.event_id = e.id and o.status = 'paid'
      ), 0) + coalesce((
        select sum(i.quantity * i.administration_fee_clp)
        from public.order_product_items i join public.orders o on o.id = i.order_id
        where i.event_id = e.id and o.status = 'paid'
      ), 0),
      'processor_fees_clp', (
        select case when count(*) = count(o.mercadopago_fee_clp)
          then coalesce(sum(round(o.mercadopago_fee_clp::numeric * f.collected_clp / nullif(o.total_clp, 0))), 0)
          else null end
        from public.order_event_financials f
        join public.orders o on o.id = f.order_id
        where f.event_id = e.id and o.total_clp > 0
          and (o.status = 'paid' or o.refunded_total_clp > 0)
      ),
      'refunds_clp', (
        select case when count(*) = count(o.refunded_total_clp)
          then coalesce(sum(round(o.refunded_total_clp::numeric * f.collected_clp / nullif(o.total_clp, 0))), 0)
          else null end
        from public.order_event_financials f
        join public.orders o on o.id = f.order_id
        where f.event_id = e.id and o.total_clp > 0
          and (o.status = 'paid' or o.refunded_total_clp > 0)
      ),
      'settled_clp', (
        select case when count(*) = count(o.settled_total_clp)
          then coalesce(sum(round(o.settled_total_clp::numeric * f.collected_clp / nullif(o.total_clp, 0))), 0)
          else null end
        from public.order_event_financials f
        join public.orders o on o.id = f.order_id and o.status = 'paid'
        where f.event_id = e.id and o.total_clp > 0
      ),
      'pending_settlement_clp', (
        select case when count(*) = count(o.settled_total_clp)
          then coalesce(sum(round((o.total_clp - o.settled_total_clp)::numeric * f.collected_clp / nullif(o.total_clp, 0))), 0)
          else null end
        from public.order_event_financials f
        join public.orders o on o.id = f.order_id and o.status = 'paid'
        where f.event_id = e.id and o.total_clp > 0
      ),
      'estimated_net_clp', (
        select case
            when count(*) = count(o.mercadopago_fee_clp)
            and count(*) = count(o.refunded_total_clp)
            then coalesce(sum(f.subtotal_clp) filter (where o.status = 'paid'), 0)
            - coalesce(sum(round(o.mercadopago_fee_clp::numeric * f.collected_clp / nullif(o.total_clp, 0))), 0)
            - coalesce(sum(round(o.refunded_total_clp::numeric * f.collected_clp / nullif(o.total_clp, 0))), 0)
          else null
        end
        from public.order_event_financials f
          join public.orders o on o.id = f.order_id
        where f.event_id = e.id and o.total_clp > 0
            and (o.status = 'paid' or o.refunded_total_clp > 0)
      )
    )
  ) order by e.starts_at desc), '[]'::jsonb)
  into v_result
  from public.events e
  where e.producer_id = v_actor and (p_event_id is null or e.id = p_event_id);
  return v_result;
end;
$$;

revoke all on function public.get_producer_sales_dashboard(text) from public, anon;
grant execute on function public.get_producer_sales_dashboard(text) to authenticated;

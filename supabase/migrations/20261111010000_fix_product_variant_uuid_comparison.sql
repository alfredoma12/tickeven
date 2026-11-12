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
      and nullif(entry.value->>'variant_id', '')::uuid is not distinct from nullif(v_item->>'variant_id', '')::uuid;
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
      v_product.name, v_variant_name, v_product.category, v_product.image_url
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
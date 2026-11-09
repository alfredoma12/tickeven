create table public.event_discount_coupons (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.events (id) on delete cascade,
  code text not null check (code = upper(trim(code)) and code ~ '^[A-Z0-9_-]{3,32}$'),
  discount_type text not null check (discount_type in ('percent', 'free')),
  discount_percent smallint,
  max_uses integer check (max_uses is null or max_uses > 0),
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (
    (discount_type = 'percent' and discount_percent is not null and discount_percent between 1 and 99)
    or (discount_type = 'free' and discount_percent is null)
  )
);

create unique index event_discount_coupons_code_idx
  on public.event_discount_coupons (upper(code));

create index event_discount_coupons_event_idx
  on public.event_discount_coupons (event_id, is_active);

alter table public.orders
  add column discount_coupon_id uuid references public.event_discount_coupons (id) on delete set null,
  add column discount_code text,
  add column discount_total_clp integer not null default 0 check (discount_total_clp >= 0);

create table public.event_discount_redemptions (
  coupon_id uuid not null references public.event_discount_coupons (id),
  order_id uuid not null references public.orders (id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (coupon_id, order_id),
  unique (order_id)
);

create index event_discount_redemptions_coupon_idx
  on public.event_discount_redemptions (coupon_id, order_id);

alter table public.event_discount_coupons enable row level security;
alter table public.event_discount_redemptions enable row level security;

revoke all on public.event_discount_coupons from public, anon, authenticated;
revoke all on public.event_discount_redemptions from public, anon, authenticated;
grant select, insert, update on public.event_discount_coupons to authenticated;
grant select on public.event_discount_redemptions to authenticated;
grant all on public.event_discount_coupons to service_role;
grant all on public.event_discount_redemptions to service_role;

create policy "Approved producers manage coupons for their own events"
  on public.event_discount_coupons for all to authenticated
  using (
    exists (
      select 1
      from public.events e
      join public.profiles p on p.id = e.producer_id
      where e.id = event_discount_coupons.event_id
        and e.producer_id = (select auth.uid())
        and p.role = 'producer'
        and p.status = 'approved'
    )
  )
  with check (
    exists (
      select 1
      from public.events e
      join public.profiles p on p.id = e.producer_id
      where e.id = event_discount_coupons.event_id
        and e.producer_id = (select auth.uid())
        and p.role = 'producer'
        and p.status = 'approved'
    )
  );

create policy "Approved producers read their coupon redemptions"
  on public.event_discount_redemptions for select to authenticated
  using (
    exists (
      select 1
      from public.event_discount_coupons c
      join public.events e on e.id = c.event_id
      join public.profiles p on p.id = e.producer_id
      where c.id = event_discount_redemptions.coupon_id
        and e.producer_id = (select auth.uid())
        and p.role = 'producer'
        and p.status = 'approved'
    )
  );

create or replace function public.validate_discount_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coupon public.event_discount_coupons%rowtype;
  v_uses integer;
  v_error text;
begin
  if length(trim(coalesce(p_code, ''))) not between 3 and 32
      or trim(p_code) !~ '^[A-Za-z0-9_-]{3,32}$' then
    return jsonb_build_object('valid', false, 'error', 'discount_code_invalid');
  end if;

  select c.* into v_coupon
  from public.event_discount_coupons c
  where c.code = upper(trim(p_code));
  if not found then
    return jsonb_build_object('valid', false, 'error', 'discount_code_invalid');
  end if;

  if not v_coupon.is_active then
    v_error := 'discount_code_inactive';
  elsif v_coupon.expires_at is not null and v_coupon.expires_at <= now() then
    v_error := 'discount_code_expired';
  elsif not exists (
    select 1 from public.events e
    where e.id = v_coupon.event_id and e.status = 'published'
  ) then
    v_error := 'discount_code_unavailable';
  else
    select count(*)::integer into v_uses
    from public.event_discount_redemptions r
    join public.orders o on o.id = r.order_id
    where r.coupon_id = v_coupon.id
      and (
        o.status = 'paid'
        or (o.status = 'pending_payment' and o.expires_at > now())
      );
    if v_coupon.max_uses is not null and v_uses >= v_coupon.max_uses then
      v_error := 'discount_code_limit_reached';
    end if;
  end if;

  if v_error is not null then
    return jsonb_build_object('valid', false, 'error', v_error);
  end if;

  return jsonb_build_object(
    'valid', true,
    'id', v_coupon.id,
    'event_id', v_coupon.event_id,
    'code', v_coupon.code,
    'discount_type', v_coupon.discount_type,
    'discount_percent', v_coupon.discount_percent,
    'expires_at', v_coupon.expires_at,
    'max_uses', v_coupon.max_uses,
    'used_uses', v_uses,
    'uses_remaining', case
      when v_coupon.max_uses is null then null
      else greatest(v_coupon.max_uses - v_uses, 0)
    end
  );
end;
$$;

revoke all on function public.validate_discount_code(text) from public, authenticated;
grant execute on function public.validate_discount_code(text) to anon, authenticated;

create or replace function public.apply_discount_code_to_order(
  p_order_id uuid,
  p_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_coupon public.event_discount_coupons%rowtype;
  v_item record;
  v_uses integer;
  v_discount integer := 0;
  v_net_unit_price integer;
  v_fee integer;
begin
  select o.* into v_order
  from public.orders o
  where o.id = p_order_id
  for update;
  if not found then raise exception 'order_not_found'; end if;

  if v_order.discount_coupon_id is not null then
    if v_order.discount_code = upper(trim(p_code)) then return; end if;
    raise exception 'discount_code_already_applied';
  end if;
  if v_order.status <> 'pending_payment' or v_order.expires_at <= now() then
    raise exception 'order_not_payable';
  end if;

  select c.* into v_coupon
  from public.event_discount_coupons c
  where c.code = upper(trim(p_code))
  for update;
  if not found then raise exception 'discount_code_invalid'; end if;
  if not v_coupon.is_active then raise exception 'discount_code_inactive'; end if;
  if v_coupon.expires_at is not null and v_coupon.expires_at <= now() then
    raise exception 'discount_code_expired';
  end if;
  if not exists (
    select 1 from public.events e
    where e.id = v_coupon.event_id and e.status = 'published'
  ) then
    raise exception 'discount_code_unavailable';
  end if;

  select count(*)::integer into v_uses
  from public.event_discount_redemptions r
  join public.orders o on o.id = r.order_id
  where r.coupon_id = v_coupon.id
    and r.order_id <> p_order_id
    and (
      o.status = 'paid'
      or (o.status = 'pending_payment' and o.expires_at > now())
    );
  if v_coupon.max_uses is not null and v_uses >= v_coupon.max_uses then
    raise exception 'discount_code_limit_reached';
  end if;

  if not exists (
    select 1 from public.order_items i
    where i.order_id = p_order_id and i.event_id = v_coupon.event_id
  ) then
    raise exception 'discount_code_event_mismatch';
  end if;

  for v_item in
    select i.id, i.quantity, i.unit_price_clp, i.administration_fee_clp
    from public.order_items i
    where i.order_id = p_order_id and i.event_id = v_coupon.event_id
    order by i.id
    for update
  loop
    if v_coupon.discount_type = 'free' then
      v_net_unit_price := 0;
      v_fee := 0;
      v_discount := v_discount
        + (v_item.unit_price_clp + v_item.administration_fee_clp) * v_item.quantity;
    else
      v_net_unit_price := v_item.unit_price_clp
        - floor(v_item.unit_price_clp * v_coupon.discount_percent / 100.0)::integer;
      v_fee := v_item.administration_fee_clp;
      v_discount := v_discount
        + (v_item.unit_price_clp - v_net_unit_price) * v_item.quantity;
    end if;

    update public.order_items
    set unit_price_clp = v_net_unit_price,
        administration_fee_clp = v_fee
    where id = v_item.id;
  end loop;

  update public.orders o
  set ticket_subtotal_clp = totals.ticket_subtotal,
      administration_total_clp = totals.administration_total,
      total_clp = totals.ticket_subtotal + totals.administration_total
        + o.product_subtotal_clp + o.product_administration_total_clp,
      discount_coupon_id = v_coupon.id,
      discount_code = v_coupon.code,
      discount_total_clp = v_discount
  from (
    select
      coalesce(sum(i.quantity * i.unit_price_clp), 0)::integer as ticket_subtotal,
      coalesce(sum(i.quantity * i.administration_fee_clp), 0)::integer as administration_total
    from public.order_items i
    where i.order_id = p_order_id
  ) totals
  where o.id = p_order_id;

  insert into public.event_discount_redemptions (coupon_id, order_id)
  values (v_coupon.id, p_order_id);
end;
$$;

revoke all on function public.apply_discount_code_to_order(uuid, text) from public, anon, authenticated;

create or replace function public.create_pending_order_with_discount(
  p_checkout_key uuid,
  p_buyer_name text,
  p_buyer_rut text,
  p_buyer_email text,
  p_buyer_phone text,
  p_items jsonb,
  p_products jsonb,
  p_discount_code text
)
returns table (order_id uuid, total_clp integer, order_status text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
begin
  select * into v_order
  from public.create_pending_order_with_products(
    p_checkout_key,
    p_buyer_name,
    p_buyer_rut,
    p_buyer_email,
    p_buyer_phone,
    p_items,
    p_products
  );

  if nullif(trim(coalesce(p_discount_code, '')), '') is not null then
    perform public.apply_discount_code_to_order(v_order.order_id, p_discount_code);
  end if;

  return query
  select o.id, o.total_clp, o.status, o.expires_at
  from public.orders o
  where o.id = v_order.order_id;
end;
$$;

revoke all on function public.create_pending_order_with_discount(uuid, text, text, text, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_pending_order_with_discount(uuid, text, text, text, text, jsonb, jsonb, text) to service_role;

create or replace function public.create_free_order_with_discount(
  p_checkout_key uuid,
  p_buyer_name text,
  p_buyer_rut text,
  p_buyer_email text,
  p_buyer_phone text,
  p_items jsonb,
  p_discount_code text
)
returns table (order_id uuid, total_clp integer, order_status text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
begin
  if nullif(trim(coalesce(p_discount_code, '')), '') is null then
    raise exception 'discount_code_invalid';
  end if;

  select * into v_order
  from public.create_pending_order_with_discount(
    p_checkout_key,
    p_buyer_name,
    p_buyer_rut,
    p_buyer_email,
    p_buyer_phone,
    p_items,
    '[]'::jsonb,
    p_discount_code
  );
  if v_order.total_clp <> 0 then raise exception 'order_not_free'; end if;
  return query select v_order.order_id, v_order.total_clp, v_order.order_status, v_order.expires_at;
end;
$$;

revoke all on function public.create_free_order_with_discount(uuid, text, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_free_order_with_discount(uuid, text, text, text, text, jsonb, text) to service_role;

create or replace function public.admin_archive_event(p_event_id text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;

  update public.events e
  set status = 'archived'
  where e.id = p_event_id
    and e.status <> 'archived'
  returning e.title into v_title;
  if v_title is null then raise exception 'event_not_found'; end if;
  return v_title;
end;
$$;

revoke all on function public.admin_archive_event(text) from public, anon;
grant execute on function public.admin_archive_event(text) to authenticated;

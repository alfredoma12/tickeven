alter table public.orders
  add column payment_preference_id text,
  add column payment_checkout_url text;

create table public.ticket_delivery_secrets (
  ticket_id uuid primary key references public.tickets (id) on delete cascade,
  qr_token_encrypted text not null,
  security_code_encrypted text not null,
  created_at timestamptz not null default now()
);

alter table public.ticket_delivery_secrets enable row level security;
revoke all on public.ticket_delivery_secrets from public, anon, authenticated;
grant all on public.ticket_delivery_secrets to service_role;

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
  v_entry jsonb;
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

  select coalesce(sum(quantity), 0)::integer into v_expected_count
  from public.order_items
  where order_id = p_order_id;
  select count(*)::integer into v_actual_count
  from jsonb_array_elements(p_tickets);
  if v_actual_count <> v_expected_count then
    raise exception 'ticket_count_mismatch';
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
  set status = 'paid', payment_reference = trim(p_payment_reference)
  where id = p_order_id;

  return jsonb_build_object('completed', true, 'already_processed', false);
end;
$$;

revoke all on function public.complete_mercadopago_order(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.complete_mercadopago_order(uuid, text, jsonb) to service_role;

create table public.ticket_email_deliveries (
  order_id uuid primary key references public.orders (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed')),
  recipient_email text not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  attempt_id uuid,
  locked_at timestamptz,
  sent_at timestamptz,
  brevo_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'sent' and sent_at is not null and brevo_message_id is not null)
    or status <> 'sent'
  )
);

alter table public.ticket_email_deliveries enable row level security;
revoke all on public.ticket_email_deliveries from public, anon, authenticated;
grant all on public.ticket_email_deliveries to service_role;

create or replace function public.claim_ticket_email_delivery(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_delivery public.ticket_email_deliveries%rowtype;
  v_attempt_id uuid;
begin
  select * into v_order
  from public.orders
  where id = p_order_id;

  if not found or v_order.status <> 'paid'
      or left(coalesce(v_order.payment_reference, ''), 3) <> 'mp:' then
    raise exception 'order_not_paid_by_mercadopago';
  end if;

  insert into public.ticket_email_deliveries (order_id, recipient_email)
  values (p_order_id, v_order.buyer_email)
  on conflict (order_id) do nothing;

  select * into v_delivery
  from public.ticket_email_deliveries
  where order_id = p_order_id
  for update;

  if v_delivery.status = 'sent' then
    return jsonb_build_object('claimed', false, 'status', 'sent');
  end if;

  if v_delivery.status = 'processing'
      and v_delivery.locked_at > now() - interval '15 minutes' then
    return jsonb_build_object('claimed', false, 'status', 'processing');
  end if;

  v_attempt_id := gen_random_uuid();
  update public.ticket_email_deliveries
  set status = 'processing',
      recipient_email = v_order.buyer_email,
      attempt_count = attempt_count + 1,
      attempt_id = v_attempt_id,
      locked_at = now(),
      sent_at = null,
      brevo_message_id = null,
      last_error = null,
      updated_at = now()
  where order_id = p_order_id;

  return jsonb_build_object(
    'claimed', true,
    'status', 'processing',
    'attempt_id', v_attempt_id
  );
end;
$$;

revoke all on function public.claim_ticket_email_delivery(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_ticket_email_delivery(uuid) to service_role;

create or replace function public.finish_ticket_email_delivery(
  p_order_id uuid,
  p_attempt_id uuid,
  p_status text,
  p_brevo_message_id text default null,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('sent', 'failed') then
    raise exception 'invalid_ticket_email_status';
  end if;
  if p_status = 'sent' and coalesce(trim(p_brevo_message_id), '') = '' then
    raise exception 'brevo_message_id_required';
  end if;

  update public.ticket_email_deliveries
  set status = p_status,
      sent_at = case when p_status = 'sent' then now() else null end,
      brevo_message_id = case when p_status = 'sent' then p_brevo_message_id else null end,
      last_error = case when p_status = 'failed' then left(coalesce(p_error, 'Unknown delivery error'), 2000) else null end,
      locked_at = null,
      updated_at = now()
  where order_id = p_order_id
    and attempt_id = p_attempt_id
    and status = 'processing';

  return found;
end;
$$;

revoke all on function public.finish_ticket_email_delivery(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.finish_ticket_email_delivery(uuid, uuid, text, text, text)
  to service_role;

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
      or (
        coalesce(v_order.payment_reference, '') !~ '^mp:[0-9]{1,30}$'
        and coalesce(v_order.payment_reference, '') <> 'free:' || p_order_id::text
      ) then
    raise exception 'order_not_paid_or_invalid_payment_reference';
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

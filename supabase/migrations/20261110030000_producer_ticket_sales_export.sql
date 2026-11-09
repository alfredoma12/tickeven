create or replace function public.get_producer_ticket_sales_export(p_event_id text)
returns table (
  event_id text,
  event_title text,
  ticket_id uuid,
  ticket_status text,
  ticket_type text,
  buyer_name text,
  buyer_rut text,
  buyer_email text,
  buyer_phone text,
  order_id uuid,
  purchased_at timestamptz,
  ticket_price_clp integer,
  administration_fee_clp integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not exists (
    select 1
    from public.profiles p
    where p.id = v_actor
      and p.role = 'producer'
      and p.status = 'approved'
  ) then
    raise exception 'producer_not_authorized';
  end if;

  if p_event_id is null or not exists (
    select 1
    from public.events e
    where e.id = p_event_id
      and e.producer_id = v_actor
  ) then
    raise exception 'event_not_owned';
  end if;

  return query
  select
    e.id,
    e.title,
    t.id,
    t.status,
    tt.name,
    oi.buyer_name,
    oi.buyer_rut,
    oi.buyer_email,
    oi.buyer_phone,
    o.id,
    o.paid_at,
    oi.unit_price_clp,
    oi.administration_fee_clp
  from public.tickets t
  join public.order_items oi on oi.id = t.order_item_id
  join public.orders o on o.id = oi.order_id and o.status = 'paid'
  join public.events e on e.id = t.event_id
  join public.ticket_types tt
    on tt.event_id = oi.event_id
    and tt.id = oi.ticket_type_id
  where e.id = p_event_id
    and e.producer_id = v_actor
    and t.status <> 'void'
  order by o.paid_at, o.id, t.id;
end;
$$;

revoke all on function public.get_producer_ticket_sales_export(text) from public, anon;
grant execute on function public.get_producer_ticket_sales_export(text) to authenticated;

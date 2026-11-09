update public.events
set
  slug = 'evento-de-ejemplo-' || id,
  title = 'Evento de ejemplo',
  description = 'Publicación de demostración para mostrar cómo se presenta un evento en TickEven. Este ejemplo no corresponde a una actividad real y no está disponible para compra.',
  venue = 'Tu recinto',
  city = 'Tu ciudad',
  starts_at = now() + interval '30 days' + id::integer * interval '1 day'
where producer_id is null
  and status = 'published'
  and id in ('1', '2', '3', '4', '5', '6', '7', '8');

with example_ticket_types as (
  select
    tt.event_id,
    tt.id,
    row_number() over (partition by tt.event_id order by tt.price_clp, tt.id) as position
  from public.ticket_types tt
  join public.events e on e.id = tt.event_id
  where e.producer_id is null
    and e.status = 'published'
    and e.id in ('1', '2', '3', '4', '5', '6', '7', '8')
)
update public.ticket_types tt
set
  name = case
    when examples.position = 1 then 'Entrada general'
    when examples.position = 2 then 'Entrada preferencial'
    else 'Entrada premium'
  end,
  description = 'Tipo de entrada de ejemplo. Disponibilidad y precio mostrados solo con fines demostrativos.'
from example_ticket_types examples
where tt.event_id = examples.event_id
  and tt.id = examples.id;

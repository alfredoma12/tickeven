alter table public.events
  alter column producer_id drop not null;

alter table public.profiles
  drop constraint if exists profiles_username_key;

insert into storage.buckets (id, name, public)
values ('event-media', 'event-media', true)
on conflict (id) do update set public = excluded.public;

create policy "Public can read event photos"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'event-media');

create policy "Producers upload photos to their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'event-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Producers delete photos from their own folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'event-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

insert into public.events (
  id, producer_id, slug, title, description, category, venue, city,
  starts_at, cover_url, gallery_urls, status
) values
  (
    '1', null, 'festival-de-musica-de-santiago', 'Festival de música de Santiago',
    'Tres días para disfrutar música en vivo, descubrir nuevos artistas y compartir una experiencia al aire libre en Santiago.',
    'Conciertos', 'Parque Cerrillos', 'Santiago', '2026-11-07 12:00:00-03',
    'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=960&q=85',
    array[
      'https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1100&q=85',
      'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1100&q=85'
    ], 'published'
  ),
  (
    '2', null, 'noche-de-vinilos-edicion-disco', 'Noche de vinilos: Edición disco',
    'Una noche para escuchar clásicos en vinilo, bailar y compartir en una pista íntima con selección musical toda la noche.',
    'Fiestas', 'Club Subterráneo', 'Santiago', '2026-11-06 22:00:00-03',
    'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=960&q=85',
    array[
      'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1100&q=85',
      'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1100&q=85'
    ], 'published'
  ),
  (
    '3', null, 'el-lago-de-los-cisnes', 'El lago de los cisnes',
    'El clásico ballet de Tchaikovsky vuelve al escenario en una puesta en escena que reúne danza, música en vivo y una producción inolvidable.',
    'Teatro', 'Teatro Municipal', 'Santiago', '2026-11-07 19:30:00-03',
    'https://images.unsplash.com/photo-1503095396549-807759245b35?auto=format&fit=crop&w=960&q=85',
    array[
      'https://images.unsplash.com/photo-1503095396549-807759245b35?auto=format&fit=crop&w=1100&q=85',
      'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?auto=format&fit=crop&w=1100&q=85'
    ], 'published'
  ),
  (
    '4', null, 'maraton-de-santiago-2026', 'Maratón de Santiago 2026',
    'Corre por las calles de Santiago y elige tu desafío. La inscripción incluye número de corredor, hidratación y acceso a la zona de llegada.',
    'Deportes', 'Plaza de la Ciudadanía', 'Santiago', '2026-12-06 07:00:00-03',
    'https://images.unsplash.com/photo-1533561052604-c3beb6d55b8d?auto=format&fit=crop&w=960&q=85',
    array[
      'https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?auto=format&fit=crop&w=1100&q=85',
      'https://images.unsplash.com/photo-1533561052604-c3beb6d55b8d?auto=format&fit=crop&w=1100&q=85'
    ], 'published'
  ),
  (
    '5', null, 'aventura-bajo-las-estrellas', 'Aventura bajo las estrellas',
    'Una aventura familiar para explorar el universo, conocer sus misterios y vivir una función inmersiva bajo las estrellas.',
    'Familia', 'Planetario USACH', 'Santiago', '2026-11-07 18:00:00-03',
    'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=960&q=85',
    array[
      'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=1100&q=85',
      'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=1100&q=85'
    ], 'published'
  ),
  (
    '6', null, 'ideas-que-mueven-el-futuro', 'Ideas que mueven el futuro',
    'Una jornada de ideas, conversaciones y herramientas para quienes están construyendo el futuro desde distintas disciplinas.',
    'Conferencias', 'Centro GAM', 'Santiago', '2026-11-12 09:00:00-03',
    'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&w=960&q=85',
    array[
      'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&w=1100&q=85',
      'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=1100&q=85'
    ], 'published'
  ),
  (
    '7', null, 'babasonicos-en-vina', 'Babasónicos en Viña',
    'Babasónicos llega a la Quinta Vergara con un show en vivo para cantar sus canciones favoritas en una noche frente al mar.',
    'Conciertos', 'Quinta Vergara', 'Viña del Mar', '2026-11-28 21:00:00-03',
    'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=960&q=85',
    array[
      'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1100&q=85',
      'https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1100&q=85'
    ], 'published'
  ),
  (
    '8', null, 'festival-de-sabores-del-sur', 'Festival de sabores del sur',
    'Un encuentro para probar sabores, conocer productores locales y disfrutar un día al aire libre con actividades para toda la familia.',
    'Familia', 'Parque Bicentenario', 'Santiago', '2026-11-29 12:00:00-03',
    'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=960&q=85',
    array[
      'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1100&q=85',
      'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1100&q=85'
    ], 'published'
  )
on conflict (id) do nothing;

insert into public.ticket_types (event_id, id, name, description, price_clp, quantity_total)
values
  ('1', 'general', 'Acceso general', 'Acceso al festival y escenarios principales.', 119000, 850),
  ('1', 'preferencial', 'Acceso preferencial', 'Acceso preferencial y zona de descanso.', 159000, 180),
  ('1', 'vip', 'Experiencia VIP', 'Acceso VIP, vista preferente y atención exclusiva.', 219000, 60),
  ('2', 'general', 'Preventa general', 'Ingreso a la fiesta desde las 22:00.', 12000, 200),
  ('2', 'barra-libre', 'Entrada + bienvenida', 'Ingreso y un cóctel de bienvenida.', 18000, 80),
  ('3', 'balcon', 'Balcón', 'Ubicación en balcón del teatro.', 18000, 90),
  ('3', 'platea', 'Platea', 'Ubicación en platea central.', 32000, 70),
  ('3', 'palco', 'Palco preferencial', 'Ubicación preferente con vista al escenario.', 45000, 24),
  ('4', '10k', 'Corrida 10K', 'Inscripción individual para el circuito de 10 kilómetros.', 25000, 500),
  ('4', '21k', 'Media maratón 21K', 'Inscripción individual para el circuito de 21 kilómetros.', 35000, 300),
  ('4', '42k', 'Maratón 42K', 'Inscripción individual para el circuito de 42 kilómetros.', 45000, 200),
  ('5', 'general', 'Entrada general', 'Acceso a una función para una persona.', 8500, 150),
  ('5', 'familiar', 'Pack familiar', 'Cuatro entradas para compartir la experiencia.', 28000, 45),
  ('6', 'general', 'Asistente general', 'Acceso a todas las charlas y espacios comunes.', 15000, 250),
  ('6', 'estudiante', 'Estudiante', 'Acceso con acreditación estudiantil vigente.', 9000, 100),
  ('6', 'premium', 'Experiencia completa', 'Acceso, coffee break y material del encuentro.', 28000, 60),
  ('7', 'galeria', 'Galería', 'Ubicación en galería.', 32000, 400),
  ('7', 'preferencial', 'Platea preferencial', 'Ubicación preferencial frente al escenario.', 58000, 180),
  ('7', 'premium', 'Experiencia premium', 'Ubicación premium y acceso prioritario.', 85000, 60),
  ('8', 'general', 'Entrada general', 'Acceso al festival durante toda la jornada.', 6000, 600),
  ('8', 'degustacion', 'Entrada + degustación', 'Acceso y selección de degustaciones de bienvenida.', 12000, 200)
on conflict (event_id, id) do nothing;

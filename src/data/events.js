import { requireSupabase } from "./supabase.js";

const EVENT_SELECT =
  "id, producer_id, slug, title, description, category, venue, city, starts_at, cover_url, gallery_urls, status";

const colors = ["lavender", "peach", "blue", "mint"];
const dateFormatter = new Intl.DateTimeFormat("es-CL", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  timeZone: "America/Santiago",
});
const timeFormatter = new Intl.DateTimeFormat("es-CL", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "America/Santiago",
});

function mapEvent(row, index, ticketInventory = [], productInventory = []) {
  const startsAt = new Date(row.starts_at);
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/Santiago",
  }).formatToParts(startsAt);
  const eventDate = `${dateParts.find((part) => part.type === "year").value}-${dateParts.find((part) => part.type === "month").value}-${dateParts.find((part) => part.type === "day").value}`;
  const ticketTypes = ticketInventory
    .filter((ticketType) => ticketType.is_active)
    .map((ticketType) => ({
      id: ticketType.ticket_type_id,
      name: ticketType.name,
      description: ticketType.description,
      price: ticketType.price_clp,
      capacity: ticketType.quantity_total,
      sold: ticketType.quantity_sold,
      reserved: ticketType.quantity_reserved,
      available: ticketType.quantity_available,
    }));
  const productsById = new Map();
  for (const product of productInventory) {
    let mappedProduct = productsById.get(product.product_id);
    if (!mappedProduct) {
      mappedProduct = {
        id: product.product_id,
        name: product.name,
        description: product.description,
        category: product.category,
        price: product.price_clp,
        image: product.image_url,
        showInCheckout: product.show_in_checkout,
        showOnEventPage: product.show_on_event_page,
        isActive: product.is_active,
        variants: [],
        capacity: 0,
        sold: 0,
        reserved: 0,
        available: 0,
      };
      productsById.set(product.product_id, mappedProduct);
    }
    mappedProduct.variants.push({
      id: product.variant_id,
      name: product.variant_name,
      capacity: product.capacity,
      sold: product.quantity_sold,
      reserved: product.quantity_reserved,
      available: product.quantity_available,
    });
    mappedProduct.capacity += product.capacity;
    mappedProduct.sold += product.quantity_sold;
    mappedProduct.reserved += product.quantity_reserved;
    mappedProduct.available += product.quantity_available;
  }
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "America/Santiago",
  }).format(startsAt);

  return {
    id: row.id,
    producerId: row.producer_id,
    slug: row.slug,
    title: row.title,
    category: row.category,
    date: dateFormatter.format(startsAt).replace(/\./g, "").toLocaleUpperCase("es"),
    eventDate,
    time: timeFormatter.format(startsAt),
    venue: row.venue,
    city: row.city,
    description: row.description,
    ticketTypes,
    ticketCapacity: ticketTypes.reduce((sum, ticket) => sum + ticket.capacity, 0),
    ticketsSold: ticketTypes.reduce((sum, ticket) => sum + ticket.sold, 0),
    ticketsReserved: ticketTypes.reduce((sum, ticket) => sum + ticket.reserved, 0),
    ticketsAvailable: ticketTypes.reduce((sum, ticket) => sum + ticket.available, 0),
    products: [...productsById.values()],
    ticketPrice: Math.min(...ticketTypes.map((ticketType) => ticketType.price)),
    image: row.cover_url,
    imageAlt: `Fotografía del evento ${row.title}`,
    gallery: row.gallery_urls ?? [],
    color: colors[index % colors.length],
    weekend: ["Sat", "Sun"].includes(weekday),
    organizer: row.producer_id,
    publishedAt: startsAt.toISOString(),
  };
}

async function fetchEventInventories(client, eventRows) {
  const eventIds = eventRows.map((event) => event.id);
  if (!eventIds.length) return { tickets: [], products: [] };

  const [ticketResult, productResult] = await Promise.all([
    client.from("ticket_inventory").select("*").in("event_id", eventIds),
    client.from("event_product_inventory").select("*").in("event_id", eventIds),
  ]);
  if (ticketResult.error || productResult.error) {
    console.error("No se pudo cargar el inventario de los eventos.", ticketResult.error ?? productResult.error);
    throw new Error("No pudimos cargar la disponibilidad de entradas y productos.");
  }
  return { tickets: ticketResult.data ?? [], products: productResult.data ?? [] };
}

export async function fetchPublishedEvents() {
  const client = requireSupabase();
  const { data, error } = await client
    .from("events")
    .select(EVENT_SELECT)
    .eq("status", "published")
    .order("starts_at", { ascending: true });

  if (error) {
    console.error("No se pudieron cargar los eventos desde Supabase.", error);
    throw new Error("No pudimos cargar los eventos. Revisa la conexión con Supabase e inténtalo otra vez.");
  }

  const inventory = await fetchEventInventories(client, data);
  return data.map((event, index) => mapEvent(
    event,
    index,
    inventory.tickets.filter((ticket) => ticket.event_id === event.id),
    inventory.products.filter((product) => product.event_id === event.id),
  ));
}

export async function fetchProducerEvents(producerId) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("events")
    .select(EVENT_SELECT)
    .eq("producer_id", producerId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("No se pudieron cargar los eventos del productor.", error);
    throw new Error("No pudimos cargar tus eventos. Vuelve a iniciar sesión e inténtalo otra vez.");
  }

  const inventory = await fetchEventInventories(client, data);
  return data.map((event, index) => mapEvent(
    event,
    index,
    inventory.tickets.filter((ticket) => ticket.event_id === event.id),
    inventory.products.filter((product) => product.event_id === event.id),
  ));
}

export async function publishProducerEvent(event) {
  const client = requireSupabase();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) {
    throw new Error("Tu sesión de productor expiró. Vuelve a iniciar sesión.");
  }

  const eventId = crypto.randomUUID();
  const storagePaths = event.photos.map((_, index) =>
    `${userData.user.id}/${eventId}/${index + 1}.jpg`,
  );
  const uploadedPaths = [];
  let eventCreated = false;

  try {
    const coverUrlAndGallery = [];
    for (const [index, photo] of event.photos.entries()) {
      const path = storagePaths[index];
      const { error: uploadError } = await client.storage
        .from("event-media")
        .upload(path, photo.blob, { contentType: "image/jpeg", upsert: false });
      if (uploadError) throw uploadError;
      uploadedPaths.push(path);
      const { data: publicUrl } = client.storage.from("event-media").getPublicUrl(path);
      coverUrlAndGallery.push(publicUrl.publicUrl);
    }

    const startsAt = new Date(`${event.eventDate}T${event.time}:00-03:00`).toISOString();
    const slug = `${event.slug}-${eventId.slice(0, 8)}`;
    const { error: eventError } = await client.from("events").insert({
      id: eventId,
      producer_id: userData.user.id,
      slug,
      title: event.title,
      description: event.description,
      category: event.category,
      venue: event.venue,
      city: event.city,
      starts_at: startsAt,
      cover_url: coverUrlAndGallery[0],
      gallery_urls: coverUrlAndGallery.slice(1),
      status: "published",
    });
    if (eventError) throw eventError;
    eventCreated = true;

    const { error: ticketsError } = await client.from("ticket_types").insert(
      event.ticketTypes.map((ticketType) => ({
        event_id: eventId,
        id: ticketType.id,
        name: ticketType.name,
        description: ticketType.description,
        price_clp: ticketType.price,
        quantity_total: ticketType.available,
      })),
    );
    if (ticketsError) throw ticketsError;

    const { data, error: fetchError } = await client
      .from("events")
      .select(EVENT_SELECT)
      .eq("id", eventId)
      .single();
    if (fetchError) throw fetchError;
    return mapEvent(data, 0);
  } catch (error) {
    if (eventCreated) {
      const { error: deleteEventError } = await client.from("events").delete().eq("id", eventId);
      if (deleteEventError) console.error("No se pudo revertir la publicación fallida.", deleteEventError);
    }
    if (uploadedPaths.length) {
      const { error: removeError } = await client.storage.from("event-media").remove(uploadedPaths);
      if (removeError) console.error("No se pudieron retirar las imágenes de una publicación fallida.", removeError);
    }
    console.error("No se pudo publicar el evento en Supabase.", error);
    throw new Error(error.message || "No se pudo publicar el evento en Supabase.");
  }
}

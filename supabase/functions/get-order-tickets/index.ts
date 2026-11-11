import { createClient } from "npm:@supabase/supabase-js@2";

const appOrigin = Deno.env.get("APP_ORIGIN");
const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": appOrigin ?? "null",
  "Content-Type": "application/json",
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function decryptCredential(value: string, key: CryptoKey) {
  const [version, iv, encrypted] = value.split(":");
  if (version !== "v1" || !iv || !encrypted) throw new Error("Invalid encrypted ticket credential.");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    key,
    fromBase64(encrypted),
  );
  return new TextDecoder().decode(decrypted);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });
  if (!appOrigin || request.headers.get("origin") !== appOrigin) {
    return jsonResponse(403, { error: "origin_not_allowed" });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }
  const orderId = typeof payload.order_id === "string" ? payload.order_id : "";
  const checkoutKey = typeof payload.checkout_key === "string" ? payload.checkout_key : "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(checkoutKey)
  ) {
    return jsonResponse(400, { error: "invalid_order_credentials" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const encryptionSecret = Deno.env.get("TICKET_CREDENTIALS_ENCRYPTION_KEY");
  if (!supabaseUrl || !serviceRoleKey || !encryptionSecret) {
    return jsonResponse(500, { error: "ticket_delivery_not_configured" });
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, checkout_key, status, created_at")
    .eq("id", orderId)
    .eq("checkout_key", checkoutKey)
    .maybeSingle();
  if (orderError) {
    console.error("Could not load order for ticket delivery.", orderError.message);
    return jsonResponse(500, { error: "order_lookup_failed" });
  }
  if (!order) return jsonResponse(404, { error: "order_not_found" });
  if (order.status !== "paid") return jsonResponse(200, { status: order.status, tickets: [] });

  const { data: items, error: itemsError } = await admin
    .from("order_items")
    .select("id, event_id, ticket_type_id, unit_price_clp, administration_fee_clp, buyer_name, buyer_rut")
    .eq("order_id", orderId);
  if (itemsError) {
    console.error("Could not load paid order items.", itemsError.message);
    return jsonResponse(500, { error: "order_items_lookup_failed" });
  }
  const { data: productItems, error: productItemsError } = await admin
    .from("order_product_items")
    .select("id, event_id, quantity, product_name, variant_name")
    .eq("order_id", orderId);
  if (productItemsError) {
    console.error("Could not load paid order products.", productItemsError.message);
    return jsonResponse(500, { error: "order_products_lookup_failed" });
  }
  const eventIds = [...new Set([
    ...(items ?? []).map((item) => item.event_id),
    ...(productItems ?? []).map((item) => item.event_id),
  ])];
  const ticketTypeIds = [...new Set((items ?? []).map((item) => item.ticket_type_id))];
  const [{ data: events, error: eventsError }, { data: ticketTypes, error: typesError }] = await Promise.all([
    eventIds.length
      ? admin.from("events").select("id, title, category, starts_at, venue, city").in("id", eventIds)
      : Promise.resolve({ data: [], error: null }),
    eventIds.length && ticketTypeIds.length
      ? admin.from("ticket_types").select("event_id, id, name").in("event_id", eventIds).in("id", ticketTypeIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (eventsError || typesError) {
    console.error("Could not load event or ticket type details.", eventsError?.message ?? typesError?.message);
    return jsonResponse(500, { error: "ticket_details_lookup_failed" });
  }
  const itemIds = (items ?? []).map((item) => item.id);
  const { data: tickets, error: ticketsError } = itemIds.length
    ? await admin.from("tickets").select("id, order_item_id, attendee_name, attendee_rut").in("order_item_id", itemIds)
    : { data: [], error: null };
  if (ticketsError) {
    console.error("Could not load issued tickets.", ticketsError.message);
    return jsonResponse(500, { error: "ticket_lookup_failed" });
  }
  const eventById = new Map((events ?? []).map((event) => [event.id, event]));
  const deliveredProducts = (productItems ?? []).map((item) => ({
    id: item.id,
    eventId: item.event_id,
    eventTitle: eventById.get(item.event_id)?.title ?? "el evento",
    quantity: item.quantity,
    name: item.product_name,
    variant: item.variant_name,
  }));
  if (!tickets?.length) {
    return jsonResponse(200, { status: "paid", tickets: [], products: deliveredProducts });
  }
  const ticketIds = (tickets ?? []).map((ticket) => ticket.id);
  const { data: secrets, error: secretsError } = ticketIds.length
    ? await admin.from("ticket_delivery_secrets")
      .select("ticket_id, qr_token_encrypted, security_code_encrypted")
      .in("ticket_id", ticketIds)
    : { data: [], error: null };
  if (secretsError) {
    console.error("Could not load encrypted ticket credentials.", secretsError.message);
    return jsonResponse(500, { error: "ticket_credentials_lookup_failed" });
  }

  let encryptionKey: CryptoKey;
  try {
    const rawKey = fromBase64(encryptionSecret);
    if (rawKey.length !== 32) throw new Error("Encryption key must contain 32 bytes.");
    encryptionKey = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
  } catch (error) {
    console.error("Ticket credential encryption key is invalid.", error);
    return jsonResponse(500, { error: "ticket_encryption_not_configured" });
  }

  const itemById = new Map((items ?? []).map((item) => [item.id, item]));
  const typeById = new Map((ticketTypes ?? []).map((type) => [`${type.event_id}:${type.id}`, type]));
  const secretByTicketId = new Map((secrets ?? []).map((secret) => [secret.ticket_id, secret]));
  try {
    const deliveredTickets = await Promise.all((tickets ?? []).map(async (ticket) => {
      const item = itemById.get(ticket.order_item_id);
      const secret = secretByTicketId.get(ticket.id);
      const event = item && eventById.get(item.event_id);
      const ticketType = item && typeById.get(`${item.event_id}:${item.ticket_type_id}`);
      if (!item || !secret || !event || !ticketType) throw new Error(`Ticket data is missing for ${ticket.id}.`);
      return {
        id: ticket.id,
        eventId: item.event_id,
        eventTitle: event.title,
        eventCategory: event.category,
        eventStartsAt: event.starts_at,
        eventVenue: event.venue,
        eventCity: event.city,
        orderCreatedAt: order.created_at,
        ticketType: ticketType.name,
        unitPriceClp: item.unit_price_clp,
        administrationFeeClp: item.administration_fee_clp,
        attendeeName: ticket.attendee_name,
        attendeeRut: ticket.attendee_rut,
        qrToken: await decryptCredential(secret.qr_token_encrypted, encryptionKey),
        securityCode: await decryptCredential(secret.security_code_encrypted, encryptionKey),
      };
    }));
    return jsonResponse(200, { status: "paid", tickets: deliveredTickets, products: deliveredProducts });
  } catch (error) {
    console.error("Could not decrypt ticket credentials.", error);
    return jsonResponse(500, { error: "ticket_credentials_unavailable" });
  }
});

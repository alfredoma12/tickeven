import { createClient } from "npm:@supabase/supabase-js@2";
import { saveOrderItemAttendees, type OrderItemAttendees } from "../_shared/order-attendees.ts";

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

function isValidRut(value: string) {
  const normalized = value.replace(/[.\s-]/g, "").toUpperCase();
  if (!/^\d{7,8}[0-9K]$/.test(normalized)) return false;
  const body = normalized.slice(0, -1);
  let multiplier = 2;
  let sum = 0;
  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const result = 11 - (sum % 11);
  const digit = result === 11 ? "0" : result === 10 ? "K" : String(result);
  return digit === normalized.at(-1);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });
  if (!appOrigin) return jsonResponse(500, { error: "server_origin_not_configured" });
  if (request.headers.get("origin") !== appOrigin) return jsonResponse(403, { error: "origin_not_allowed" });

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return jsonResponse(400, { error: "invalid_order" });
  }

  const checkoutKey = payload.checkout_key;
  const buyer = payload.buyer as Record<string, unknown> | undefined;
  const items = payload.items;
  const products = payload.products ?? [];
  const discountCode = payload.discount_code ?? null;
  if (
    typeof checkoutKey !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(checkoutKey) ||
    !buyer || typeof buyer.name !== "string" ||
    typeof buyer.rut !== "string" || typeof buyer.email !== "string" ||
    typeof buyer.phone !== "string" || !Array.isArray(items) ||
    items.length > 10 || !Array.isArray(products) ||
    products.length > 20 || (items.length === 0 && products.length === 0) ||
    (discountCode !== null && (typeof discountCode !== "string" || discountCode.length > 32))
  ) {
    return jsonResponse(400, { error: "invalid_order" });
  }
  if (
    buyer.name.trim().length < 2 || buyer.name.length > 120 ||
    buyer.rut.length > 20 || !isValidRut(buyer.rut) ||
    buyer.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyer.email) ||
    buyer.phone.trim().length < 8 || buyer.phone.length > 24
  ) {
    return jsonResponse(400, { error: "invalid_buyer" });
  }
  const normalizedItems: Array<Record<string, unknown>> = [];
  for (const item of items) {
    if (
      typeof item !== "object" || item === null ||
      typeof item.event_id !== "string" || item.event_id.length > 100 ||
      typeof item.ticket_type_id !== "string" || item.ticket_type_id.length > 100 ||
      !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10
    ) {
      return jsonResponse(400, { error: "invalid_order_item" });
    }
    if (item.buyer) {
      if (
        typeof item.buyer.name !== "string" || item.buyer.name.trim().length < 2 ||
        item.buyer.name.length > 120 || typeof item.buyer.rut !== "string" ||
        item.buyer.rut.length > 20 || !isValidRut(item.buyer.rut) ||
        typeof item.buyer.email !== "string" || item.buyer.email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.buyer.email) ||
        typeof item.buyer.phone !== "string" || item.buyer.phone.trim().length < 8 ||
        item.buyer.phone.length > 24
      ) {
        return jsonResponse(400, { error: "invalid_attendee" });
      }
    }
    const fallbackAttendee = {
      name: typeof item.buyer?.name === "string" ? item.buyer.name : buyer.name,
      rut: typeof item.buyer?.rut === "string" ? item.buyer.rut : buyer.rut,
    };
    const rawAttendees = item.attendees ?? Array.from({ length: item.quantity }, () => fallbackAttendee);
    if (!Array.isArray(rawAttendees) || rawAttendees.length !== item.quantity) {
      return jsonResponse(400, { error: "invalid_attendee" });
    }
    const attendees = rawAttendees.map((attendee: Record<string, unknown>) => ({
      name: typeof attendee?.name === "string" ? attendee.name.trim() : "",
      rut: typeof attendee?.rut === "string" ? attendee.rut.trim() : "",
    }));
    if (attendees.some((attendee) =>
      attendee.name.length < 2 || attendee.name.length > 120 ||
      attendee.rut.length > 20 || !isValidRut(attendee.rut)
    )) {
      return jsonResponse(400, { error: "invalid_attendee" });
    }
    normalizedItems.push({ ...item, attendees });
  }
  for (const product of products) {
    if (
      typeof product !== "object" || product === null ||
      typeof product.product_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(product.product_id) ||
      (product.variant_id !== null && product.variant_id !== undefined &&
        (typeof product.variant_id !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(product.variant_id))) ||
      !Number.isInteger(product.quantity) || product.quantity < 1 || product.quantity > 10
    ) {
      return jsonResponse(400, { error: "invalid_product_item" });
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: "server_supabase_not_configured" });
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.rpc("create_pending_order_with_discount", {
    p_checkout_key: checkoutKey,
    p_buyer_name: buyer.name.trim(),
    p_buyer_rut: buyer.rut.trim(),
    p_buyer_email: buyer.email.trim().toLowerCase(),
    p_buyer_phone: buyer.phone.trim(),
    p_items: normalizedItems,
    p_products: products,
    p_discount_code: typeof discountCode === "string" ? discountCode.trim().toUpperCase() || null : null,
  });
  if (error) {
    console.error("create_pending_order failed", error.message);
    const inventoryErrors = new Set(["insufficient_inventory", "ticket_type_unavailable", "insufficient_product_inventory", "product_unavailable", "product_variant_required", "product_variant_unavailable", "discount_code_limit_reached"]);
    const code = error.message.match(/(?:insufficient_inventory|ticket_type_unavailable|insufficient_product_inventory|product_unavailable|product_variant_required|product_variant_unavailable|invalid_buyer|invalid_items|invalid_quantity|discount_code_invalid|discount_code_inactive|discount_code_expired|discount_code_limit_reached|discount_code_event_mismatch|discount_code_unavailable|discount_code_already_applied|order_not_payable)/)?.[0];
    return jsonResponse(inventoryErrors.has(code ?? "") ? 409 : 400, {
      error: code ?? "order_creation_failed",
    });
  }

  const order = Array.isArray(data) ? data[0] : data;
  if (!order) return jsonResponse(500, { error: "empty_order_response" });
  if (order.order_status === "pending_payment") {
    try {
      await saveOrderItemAttendees(admin, order.order_id, normalizedItems as unknown as OrderItemAttendees[]);
    } catch (error) {
      console.error("Could not save attendees for pending order.", order.order_id, error);
      return jsonResponse(500, { error: "order_attendees_save_failed" });
    }
  }
  return jsonResponse(201, {
    id: order.order_id,
    status: order.order_status,
    total_clp: order.total_clp,
    expires_at: order.expires_at,
  });
});

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
  if (
    typeof checkoutKey !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(checkoutKey) ||
    !buyer || typeof buyer.name !== "string" ||
    typeof buyer.rut !== "string" || typeof buyer.email !== "string" ||
    typeof buyer.phone !== "string" || !Array.isArray(items) ||
    items.length < 1 || items.length > 10
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
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: "server_supabase_not_configured" });
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.rpc("create_pending_order", {
    p_checkout_key: checkoutKey,
    p_buyer_name: buyer.name.trim(),
    p_buyer_rut: buyer.rut.trim(),
    p_buyer_email: buyer.email.trim().toLowerCase(),
    p_buyer_phone: buyer.phone.trim(),
    p_items: items,
  });
  if (error) {
    console.error("create_pending_order failed", error.message);
    const inventoryErrors = new Set(["insufficient_inventory", "ticket_type_unavailable"]);
    const code = error.message.match(/(?:insufficient_inventory|ticket_type_unavailable|invalid_buyer|invalid_items|invalid_quantity)/)?.[0];
    return jsonResponse(inventoryErrors.has(code ?? "") ? 409 : 400, {
      error: code ?? "order_creation_failed",
    });
  }

  const order = Array.isArray(data) ? data[0] : data;
  if (!order) return jsonResponse(500, { error: "empty_order_response" });
  return jsonResponse(201, {
    id: order.order_id,
    status: order.order_status,
    total_clp: order.total_clp,
    expires_at: order.expires_at,
  });
});

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
  const accessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
  const appPublicUrl = Deno.env.get("APP_PUBLIC_URL")?.replace(/\/+$/, "");
  if (!supabaseUrl || !serviceRoleKey || !accessToken || !appPublicUrl) {
    console.error("Mercado Pago preference configuration is incomplete.");
    return jsonResponse(500, { error: "payment_not_configured" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, checkout_key, status, total_clp, expires_at, buyer_name, buyer_email, payment_checkout_url")
    .eq("id", orderId)
    .eq("checkout_key", checkoutKey)
    .maybeSingle();
  if (orderError) {
    console.error("Could not load order for payment preference.", orderError.message);
    return jsonResponse(500, { error: "order_lookup_failed" });
  }
  if (!order) return jsonResponse(404, { error: "order_not_found" });
  if (order.status !== "pending_payment" || new Date(order.expires_at).getTime() <= Date.now()) {
    return jsonResponse(409, { error: "order_not_payable" });
  }
  if (order.payment_checkout_url) {
    return jsonResponse(200, { checkout_url: order.payment_checkout_url });
  }

  const { data: items, error: itemsError } = await admin
    .from("order_items")
    .select("quantity, unit_price_clp, administration_fee_clp, ticket_types!inner(name, events!inner(title))")
    .eq("order_id", orderId);
  if (itemsError || !items?.length) {
    console.error("Could not load order items for payment preference.", itemsError?.message);
    return jsonResponse(500, { error: "order_items_lookup_failed" });
  }

  const preferenceBody = {
    items: items.map((item) => ({
      title: `${item.ticket_types.events.title} — ${item.ticket_types.name}`.slice(0, 250),
      quantity: item.quantity,
      currency_id: "CLP",
      unit_price: item.unit_price_clp + item.administration_fee_clp,
    })),
    payer: { email: order.buyer_email },
    external_reference: order.id,
    notification_url: `${supabaseUrl}/functions/v1/mercadopago-webhook`,
    back_urls: {
      success: `${appPublicUrl}/checkout?payment=success&order_id=${order.id}`,
      pending: `${appPublicUrl}/checkout?payment=pending&order_id=${order.id}`,
      failure: `${appPublicUrl}/checkout?payment=failure&order_id=${order.id}`,
    },
    auto_return: "approved",
    expires: true,
    expiration_date_from: new Date().toISOString(),
    expiration_date_to: order.expires_at,
    statement_descriptor: "TICKEVEN",
    metadata: { order_id: order.id },
  };

  let preferenceResponse: Response;
  try {
    preferenceResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": checkoutKey,
      },
      body: JSON.stringify(preferenceBody),
    });
  } catch (error) {
    console.error("Mercado Pago preference request failed.", error);
    return jsonResponse(502, { error: "payment_provider_unavailable" });
  }

  const preference = await preferenceResponse.json().catch(() => null);
  if (!preferenceResponse.ok || typeof preference?.id !== "string") {
    console.error("Mercado Pago rejected the preference.", preferenceResponse.status, preference?.message);
    return jsonResponse(502, { error: "payment_preference_failed" });
  }
  const sandbox = accessToken.startsWith("TEST-");
  const checkoutUrl = sandbox
    ? preference.sandbox_init_point ?? preference.init_point
    : preference.init_point;
  if (typeof checkoutUrl !== "string" || !checkoutUrl.startsWith("https://")) {
    console.error("Mercado Pago returned an invalid checkout URL.");
    return jsonResponse(502, { error: "invalid_payment_url" });
  }

  const { error: saveError } = await admin
    .from("orders")
    .update({ payment_preference_id: preference.id, payment_checkout_url: checkoutUrl })
    .eq("id", orderId)
    .eq("checkout_key", checkoutKey)
    .eq("status", "pending_payment");
  if (saveError) {
    console.error("Could not save Mercado Pago preference.", saveError.message);
    return jsonResponse(500, { error: "payment_preference_save_failed" });
  }

  return jsonResponse(200, { checkout_url: checkoutUrl });
});

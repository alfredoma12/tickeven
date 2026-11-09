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

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptCredential(value: string, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(value),
  );
  return `v1:${toBase64(iv)}:${toBase64(new Uint8Array(encrypted))}`;
}

function createSecurityCode() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const random = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(random, (byte) => alphabet[byte % alphabet.length]).join("");
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
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return jsonResponse(400, { error: "invalid_order" });
  }

  const checkoutKey = payload.checkout_key;
  const buyer = payload.buyer as Record<string, unknown> | undefined;
  const items = payload.items;
  const discountCode = payload.discount_code ?? null;
  if (
    typeof checkoutKey !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(checkoutKey) ||
    !buyer || typeof buyer.name !== "string" ||
    typeof buyer.rut !== "string" || typeof buyer.email !== "string" ||
    typeof buyer.phone !== "string" || !Array.isArray(items) ||
    items.length < 1 || items.length > 10 ||
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
  for (const item of items) {
    if (
      typeof item !== "object" || item === null ||
      typeof item.event_id !== "string" || item.event_id.length > 100 ||
      typeof item.ticket_type_id !== "string" || item.ticket_type_id.length > 100 ||
      !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10
    ) {
      return jsonResponse(400, { error: "invalid_order_item" });
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const encryptionSecret = Deno.env.get("TICKET_CREDENTIALS_ENCRYPTION_KEY");
  if (!supabaseUrl || !serviceRoleKey || !encryptionSecret) {
    return jsonResponse(500, { error: "ticket_delivery_not_configured" });
  }

  let encryptionKey: CryptoKey;
  try {
    const rawKey = fromBase64(encryptionSecret);
    if (rawKey.length !== 32) throw new Error("Encryption key must contain 32 bytes.");
    encryptionKey = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
  } catch (error) {
    console.error("Ticket credential encryption key is invalid.", error);
    return jsonResponse(500, { error: "ticket_encryption_not_configured" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const normalizedDiscountCode = typeof discountCode === "string" ? discountCode.trim().toUpperCase() : "";
  const rpcName = normalizedDiscountCode
    ? "create_free_order_with_discount"
    : "create_free_order";
  const rpcArguments = {
    p_checkout_key: checkoutKey,
    p_buyer_name: buyer.name.trim(),
    p_buyer_rut: buyer.rut.trim(),
    p_buyer_email: buyer.email.trim().toLowerCase(),
    p_buyer_phone: buyer.phone.trim(),
    p_items: items,
    ...(rpcName === "create_free_order_with_discount"
      ? { p_discount_code: normalizedDiscountCode }
      : {}),
  };
  const { data, error } = await admin.rpc(rpcName, rpcArguments);
  if (error) {
    console.error("create_free_order failed", error.message);
    const code = error.message.match(
      /(?:insufficient_inventory|ticket_type_unavailable|invalid_buyer|invalid_items|invalid_quantity|order_not_free|discount_code_invalid|discount_code_inactive|discount_code_expired|discount_code_limit_reached|discount_code_event_mismatch|discount_code_unavailable|discount_code_already_applied|order_not_payable)/,
    )?.[0] ?? "free_order_creation_failed";
    return jsonResponse(
      code === "insufficient_inventory" || code === "ticket_type_unavailable" || code === "discount_code_limit_reached" ? 409 : 400,
      {
      error: code,
      },
    );
  }

  const order = Array.isArray(data) ? data[0] : data;
  if (!order) return jsonResponse(500, { error: "empty_order_response" });
  if (order.order_status !== "paid") {
    const { data: orderItems, error: itemsError } = await admin
      .from("order_items")
      .select("id, quantity")
      .eq("order_id", order.order_id);
    if (itemsError || !orderItems?.length) {
      console.error("Could not load items for free order.", itemsError?.message);
      return jsonResponse(500, { error: "order_items_lookup_failed" });
    }

    const tickets = [];
    for (const item of orderItems) {
      for (let index = 0; index < item.quantity; index += 1) {
        const qrToken = toBase64(crypto.getRandomValues(new Uint8Array(32)))
          .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
        const securityCode = createSecurityCode();
        tickets.push({
          order_item_id: item.id,
          qr_token: qrToken,
          security_code: securityCode,
          qr_token_encrypted: await encryptCredential(qrToken, encryptionKey),
          security_code_encrypted: await encryptCredential(securityCode, encryptionKey),
        });
      }
    }

    const { error: completionError } = await admin.rpc("complete_free_order", {
      p_order_id: order.order_id,
      p_tickets: tickets,
    });
    if (completionError) {
      console.error("complete_free_order failed", completionError.message);
      return jsonResponse(500, { error: "free_order_completion_failed" });
    }
  }

  return jsonResponse(200, {
    id: order.order_id,
    status: "paid",
    total_clp: 0,
  });
});

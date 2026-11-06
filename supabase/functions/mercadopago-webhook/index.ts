import { createClient } from "npm:@supabase/supabase-js@2";

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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

async function verifySignature(request: Request, paymentId: string, secret: string) {
  const signatureHeader = request.headers.get("x-signature");
  const requestId = request.headers.get("x-request-id");
  if (!signatureHeader || !requestId) return false;
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, ...value] = part.trim().split("=");
      return [key, value.join("=")];
    }),
  );
  if (!parts.ts || !parts.v1) return false;
  const manifest = `id:${paymentId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest)));
  const expected = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return expected.length === parts.v1.length &&
    [...expected].reduce((valid, character, index) => valid | (character.charCodeAt(0) ^ parts.v1.charCodeAt(index)), 0) === 0;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });

  const signatureSecret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET");
  const accessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
  const encryptionSecret = Deno.env.get("TICKET_CREDENTIALS_ENCRYPTION_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!signatureSecret || !accessToken || !encryptionSecret || !supabaseUrl || !serviceRoleKey) {
    console.error("Mercado Pago webhook configuration is incomplete.");
    return jsonResponse(500, { error: "webhook_not_configured" });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }
  const data = typeof payload.data === "object" && payload.data !== null
    ? payload.data as Record<string, unknown>
    : {};
  const url = new URL(request.url);
  const paymentId = String(url.searchParams.get("data.id") ?? "");
  if (!/^\d{1,30}$/.test(paymentId)) return jsonResponse(400, { error: "invalid_payment_id" });
  if (!await verifySignature(request, paymentId, signatureSecret)) {
    return jsonResponse(401, { error: "invalid_signature" });
  }

  const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!paymentResponse.ok) {
    console.error("Could not retrieve Mercado Pago payment.", paymentResponse.status);
    return jsonResponse(502, { error: "payment_lookup_failed" });
  }
  const payment = await paymentResponse.json();
  if (payment.status !== "approved") return jsonResponse(200, { received: true, processed: false });

  const orderId = typeof payment.external_reference === "string" ? payment.external_reference : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
    console.error("Approved Mercado Pago payment has no valid order reference.");
    return jsonResponse(400, { error: "invalid_order_reference" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, status, total_clp, expires_at, payment_reference")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError || !order) {
    console.error("Could not find order for approved payment.", orderError?.message);
    return jsonResponse(404, { error: "order_not_found" });
  }
  if (
    payment.currency_id !== "CLP" ||
    Number(payment.transaction_amount) !== Number(order.total_clp) ||
    (payment.collector_id && Deno.env.get("MERCADOPAGO_COLLECTOR_ID") &&
      String(payment.collector_id) !== Deno.env.get("MERCADOPAGO_COLLECTOR_ID"))
  ) {
    console.error("Approved Mercado Pago payment does not match the order.", paymentId);
    return jsonResponse(409, { error: "payment_order_mismatch" });
  }
  if (order.status === "paid") {
    if (order.payment_reference === `mp:${paymentId}`) {
      return jsonResponse(200, { received: true, processed: true });
    }
    const refundResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}/refunds`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": `tickeven-duplicate-refund-${paymentId}`,
      },
      body: JSON.stringify({}),
    });
    if (!refundResponse.ok) {
      console.error("Could not refund duplicate approved payment.", paymentId, refundResponse.status);
      return jsonResponse(502, { error: "duplicate_payment_refund_failed" });
    }
    console.error("Refunded duplicate approved payment for already paid order.", paymentId, orderId);
    return jsonResponse(200, { received: true, processed: true, duplicate_refunded: true });
  }
  if (payment.date_approved && new Date(payment.date_approved).getTime() > new Date(order.expires_at).getTime()) {
    console.error("Approved payment arrived after the order expired.", paymentId, orderId);
    return jsonResponse(409, { error: "payment_after_order_expiry" });
  }

  const { data: items, error: itemsError } = await admin
    .from("order_items")
    .select("id, quantity")
    .eq("order_id", orderId);
  if (itemsError || !items?.length) {
    console.error("Could not load items for approved order.", itemsError?.message);
    return jsonResponse(500, { error: "order_items_lookup_failed" });
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

  const tickets = [];
  for (const item of items) {
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

  const { error: completionError } = await admin.rpc("complete_mercadopago_order", {
    p_order_id: orderId,
    p_payment_reference: `mp:${paymentId}`,
    p_tickets: tickets,
  });
  if (completionError) {
    console.error("Could not complete approved Mercado Pago order.", completionError.message);
    return jsonResponse(500, { error: "ticket_issuance_failed" });
  }
  return jsonResponse(200, { received: true, processed: true });
});

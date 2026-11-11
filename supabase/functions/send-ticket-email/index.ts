import { createClient } from "npm:@supabase/supabase-js@2";
import { jsPDF } from "npm:jspdf@4.2.1";
import QRCode from "npm:qrcode@1.5.4";
import { buildTicketEmail, formatEventDate } from "./email-template.js";

type EventDetails = {
  id: string;
  title: string;
  category: string;
  starts_at: string;
  venue: string;
  city: string;
  cover_url: string | null;
};

type TicketImage = {
  data: string;
  format: "PNG" | "JPEG";
};

type OrderItem = {
  id: string;
  event_id: string;
  ticket_type_id: string;
  quantity: number;
  unit_price_clp: number;
  administration_fee_clp: number;
  buyer_name: string;
  buyer_email: string;
};

const maxImageBytes = 250_000;
const maxAttachmentBytes = 18 * 1024 * 1024;

function parseBrevoSender(value: string, configuredName: string | undefined) {
  const combined = value.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
  const email = (combined?.[2] ?? value).trim();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return null;
  return {
    email,
    name: configuredName?.trim() || combined?.[1]?.trim() || "TickEven",
  };
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function readLimitedBytes(response: Response, maxBytes: number) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Image response has no body.");
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.length;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new Error("Image exceeds the supported size.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

async function decryptCredential(value: string, key: CryptoKey) {
  const [version, iv, encrypted] = value.split(":");
  if (version !== "v1" || !iv || !encrypted) {
    throw new Error("Stored ticket credentials have an invalid format.");
  }
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    key,
    fromBase64(encrypted),
  );
  return new TextDecoder().decode(decrypted);
}

function formatTime(value: string | null) {
  if (!value) return "Hora por confirmar";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Hora por confirmar";
  return `${new Intl.DateTimeFormat("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "America/Santiago",
  }).format(date)} hrs`;
}

async function loadPngData(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw new Error(`Could not load the TickEven logo (${response.status}).`);
  const contentType = response.headers.get("content-type")?.split(";")[0].trim();
  if (contentType !== "image/png") throw new Error("TickEven logo must be a PNG image.");
  const bytes = await readLimitedBytes(response, maxImageBytes);
  return `data:image/png;base64,${toBase64(bytes)}`;
}

async function loadEventCover(event: EventDetails, supabaseUrl: string): Promise<TicketImage | null> {
  if (!event.cover_url) return null;
  let coverUrl: URL;
  try {
    coverUrl = new URL(event.cover_url);
  } catch {
    console.warn("Skipping invalid event cover URL.", event.id);
    return null;
  }
  const supabaseHost = new URL(supabaseUrl).hostname;
  if (coverUrl.protocol !== "https:" ||
      (coverUrl.hostname !== supabaseHost && coverUrl.hostname !== "images.unsplash.com")) {
    console.warn("Skipping event cover outside supported image hosts.", event.id);
    return null;
  }

  try {
    const response = await fetch(coverUrl, {
      redirect: "error",
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get("content-type")?.split(";")[0].trim();
    const format = contentType === "image/png" ? "PNG" : contentType === "image/jpeg" ? "JPEG" : null;
    if (!format) return null;
    const bytes = await readLimitedBytes(response, maxImageBytes);
    if (!bytes.length) return null;
    return {
      data: `data:${contentType};base64,${toBase64(bytes)}`,
      format,
    };
  } catch (error) {
    console.warn("Could not load optional event cover image.", event.id, error);
    return null;
  }
}

function drawBrandGradient(pdf: jsPDF, width: number, y: number, height: number) {
  const stops = [[21, 91, 255], [114, 0, 255], [224, 0, 200]];
  const segments = 100;
  for (let index = 0; index < segments; index += 1) {
    const progress = index / (segments - 1);
    const section = progress < 0.5 ? 0 : 1;
    const localProgress = section === 0 ? progress * 2 : (progress - 0.5) * 2;
    const start = stops[section];
    const end = stops[section + 1];
    const color = start.map((channel, channelIndex) =>
      Math.round(channel + (end[channelIndex] - channel) * localProgress),
    );
    pdf.setFillColor(color[0], color[1], color[2]);
    pdf.rect((width * index) / segments, y, width / segments + 0.12, height, "F");
  }
}

function drawLabel(pdf: jsPDF, label: string, value: string, x: number, y: number, width: number) {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.setTextColor(161, 161, 170);
  pdf.text(label.toLocaleUpperCase("es"), x, y);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(248, 248, 252);
  pdf.text(pdf.splitTextToSize(value || "No informado", width).slice(0, 2), x, y + 6);
}

async function createTicketPdf({
  ticket,
  ticketNumber,
  ticketCount,
  orderId,
  event,
  eventCover,
  ticketType,
  logo,
  qrToken,
  securityCode,
}: {
  ticket: { id: string; created_at: string; attendee_name: string; attendee_rut: string };
  ticketNumber: number;
  ticketCount: number;
  orderId: string;
  event: EventDetails;
  eventCover: TicketImage | null;
  ticketType: string;
  logo: string;
  qrToken: string;
  securityCode: string;
}) {
  const pdf = new jsPDF({ format: "a4", unit: "mm" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const qrImage = await QRCode.toDataURL(JSON.stringify({ ticket_id: ticket.id, token: qrToken }), {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 360,
    color: { dark: "#171717", light: "#ffffff" },
  });

  pdf.setFillColor(5, 5, 5);
  pdf.rect(0, 0, pageWidth, 297, "F");
  pdf.setFillColor(13, 13, 18);
  pdf.rect(0, 0, pageWidth, 53, "F");
  drawBrandGradient(pdf, pageWidth, 51, 2);
  pdf.addImage(logo, "PNG", 15, 10, 59, 19.6);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(161, 161, 170);
  pdf.text("ENTRADA DIGITAL", 17, 39);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(255, 255, 255);
  pdf.text(`${ticketNumber} / ${ticketCount}`, pageWidth - 15, 19, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.text("GUARDA ESTA ENTRADA", pageWidth - 15, 26, { align: "right" });

  pdf.setFillColor(13, 13, 18);
  pdf.setDrawColor(43, 43, 53);
  pdf.roundedRect(12, 59, pageWidth - 24, 199, 4, 4, "FD");
  pdf.setFillColor(22, 17, 34);
  pdf.roundedRect(18, 66, pageWidth - 36, 40, 3, 3, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.setTextColor(198, 169, 255);
  pdf.text((event.category || "EVENTO").toLocaleUpperCase("es").slice(0, 45), 24, 75);
  pdf.setFontSize(19);
  pdf.setTextColor(248, 248, 252);
  if (eventCover) {
    pdf.addImage(eventCover.data, eventCover.format, 22, 79, 34, 24);
    pdf.text(pdf.splitTextToSize(event.title, 78).slice(0, 2), 62, 85);
  } else {
    pdf.text(pdf.splitTextToSize(event.title, 112).slice(0, 2), 24, 85);
  }

  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(145, 71, 44, 44, 2, 2, "F");
  pdf.addImage(qrImage, "PNG", 148, 74, 38, 38);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.setTextColor(161, 161, 170);
  pdf.text("PRESENTA ESTE QR", 167, 120, { align: "center" });

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.setTextColor(21, 91, 255);
  pdf.text("DETALLES DE TU ENTRADA", 20, 119);
  pdf.setDrawColor(43, 43, 53);
  pdf.line(20, 122, pageWidth - 20, 122);
  drawLabel(pdf, "Evento", event.title, 20, 132, 112);
  drawLabel(pdf, "Tipo de entrada", ticketType, 20, 151, 78);
  drawLabel(pdf, "Fecha", formatEventDate(event.starts_at), 20, 170, 78);
  drawLabel(pdf, "Hora", formatTime(event.starts_at), 20, 189, 78);
  drawLabel(pdf, "Recinto", [event.venue, event.city].filter(Boolean).join(" · "), 20, 208, 100);
  drawLabel(pdf, "Titular", ticket.attendee_name, 115, 151, 72);
  drawLabel(pdf, "RUT", ticket.attendee_rut, 115, 170, 72);

  pdf.setFillColor(22, 17, 34);
  pdf.roundedRect(18, 220, pageWidth - 36, 25, 3, 3, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.setTextColor(161, 161, 170);
  pdf.text("CÓDIGO DE SEGURIDAD · USAR SOLO SI NO SE PUEDE LEER EL QR", 24, 229);
  pdf.setFont("courier", "bold");
  pdf.setFontSize(16);
  pdf.setTextColor(255, 255, 255);
  pdf.text(securityCode, 24, 239);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(161, 161, 170);
  pdf.text("Cada código QR corresponde a una sola entrada. Preséntala en el acceso del evento.", 18, 267);
  pdf.text("No compartas el QR ni el código de seguridad antes de ingresar.", 18, 273);
  pdf.setDrawColor(43, 43, 53);
  pdf.line(18, 280, pageWidth - 18, 280);
  pdf.setFontSize(6);
  pdf.text(`Folio de entrada: ${ticket.id}`, 18, 286, { maxWidth: 105 });
  pdf.text(`Orden: ${orderId}`, 18, 291, { maxWidth: 105 });
  pdf.text(`Emitida: ${formatEventDate(ticket.created_at)}`, pageWidth - 18, 286, { align: "right" });
  pdf.text("TickEven.cl · Hecho para vivirlo", pageWidth - 18, 291, { align: "right" });

  return new Uint8Array(pdf.output("arraybuffer"));
}

async function callAdminRpc(
  supabaseUrl: string,
  serviceRoleKey: string,
  functionName: string,
  args: Record<string, unknown>,
) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(10000),
  });
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`${functionName} failed (HTTP ${response.status}): ${responseText.slice(0, 1000)}`);
  }
  try {
    return JSON.parse(responseText);
  } catch {
    throw new Error(`${functionName} returned an invalid response.`);
  }
}

async function finishDelivery(
  supabaseUrl: string,
  serviceRoleKey: string,
  orderId: string,
  attemptId: string,
  status: "sent" | "failed",
  messageId: string | null,
  error: string | null,
) {
  const updated = await callAdminRpc(supabaseUrl, serviceRoleKey, "finish_ticket_email_delivery", {
    p_order_id: orderId,
    p_attempt_id: attemptId,
    p_status: status,
    p_brevo_message_id: messageId,
    p_error: error,
  });
  if (updated !== true) throw new Error("Ticket email delivery attempt is no longer current.");
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const accessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
  const encryptionSecret = Deno.env.get("TICKET_CREDENTIALS_ENCRYPTION_KEY");
  const brevoApiKey = Deno.env.get("BREVO_API_KEY");
  const senderSetting = Deno.env.get("BREVO_SENDER_EMAIL")?.trim();
  const appPublicUrl = Deno.env.get("APP_PUBLIC_URL")?.replace(/\/+$/, "");
  if (!supabaseUrl || !serviceRoleKey || !encryptionSecret ||
      !brevoApiKey || !senderSetting || !appPublicUrl) {
    console.error("Ticket email delivery configuration is incomplete.");
    return jsonResponse(500, { error: "ticket_email_not_configured" });
  }
  const sender = parseBrevoSender(senderSetting, Deno.env.get("BREVO_SENDER_NAME"));
  if (!sender) {
    console.error("BREVO_SENDER_EMAIL must be a valid email address or a name followed by <email>.");
    return jsonResponse(500, { error: "ticket_email_sender_invalid" });
  }
  if (request.headers.get("authorization") !== `Bearer ${serviceRoleKey}`) {
    return jsonResponse(401, { error: "unauthorized" });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }
  const orderId = typeof payload.order_id === "string" ? payload.order_id : "";
  const paymentId = typeof payload.payment_id === "string" ? payload.payment_id : "";
  const deliveryType = payload.delivery_type === "free" ? "free" : "mercadopago";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId) ||
    (deliveryType === "free" ? paymentId !== "" : !/^\d{1,30}$/.test(paymentId))
  ) {
    return jsonResponse(400, { error: "invalid_payment_reference" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, status, payment_reference, buyer_name, buyer_email, total_clp")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError || !order) {
    console.error("Could not load paid order for ticket email.", orderError?.message ?? "order not found");
    return jsonResponse(orderError ? 500 : 404, { error: "order_lookup_failed" });
  }
  if (deliveryType === "free") {
    if (order.status !== "paid" || order.payment_reference !== `free:${orderId}`) {
      console.error("Free ticket order is not confirmed.", orderId);
      return jsonResponse(409, { error: "order_not_confirmed" });
    }
  } else {
    if (!accessToken) {
      console.error("Mercado Pago access token is not configured for ticket email.");
      return jsonResponse(500, { error: "payment_provider_not_configured" });
    }
    let paymentResponse: Response;
    try {
      paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10000),
      });
    } catch (error) {
      console.error("Could not reach Mercado Pago while preparing ticket email.", paymentId, error);
      return jsonResponse(502, { error: "payment_provider_unavailable" });
    }
    if (!paymentResponse.ok) {
      console.error("Could not verify Mercado Pago payment for ticket email.", paymentId, paymentResponse.status);
      return jsonResponse(502, { error: "payment_lookup_failed" });
    }
    const payment = await paymentResponse.json();
    if (
      payment.status !== "approved" ||
      payment.external_reference !== orderId ||
      payment.currency_id !== "CLP" ||
      Number(payment.transaction_amount) !== Number(order.total_clp) ||
      order.status !== "paid" ||
      order.payment_reference !== `mp:${paymentId}`
    ) {
      console.error("Verified Mercado Pago payment does not match ticket email order.", paymentId, orderId);
      return jsonResponse(409, { error: "payment_order_mismatch" });
    }
    const expectedCollectorId = Deno.env.get("MERCADOPAGO_COLLECTOR_ID");
    if (payment.collector_id && expectedCollectorId &&
        String(payment.collector_id) !== expectedCollectorId) {
      console.error("Mercado Pago collector does not match ticket email order.", paymentId, orderId);
      return jsonResponse(409, { error: "payment_order_mismatch" });
    }
  }

  const { data: hasTicketItems, error: ticketItemCheckError } = await admin
    .from("order_items")
    .select("id")
    .eq("order_id", orderId)
    .limit(1);
  if (ticketItemCheckError) {
    console.error("Could not check paid order ticket items.", ticketItemCheckError.message);
    return jsonResponse(500, { error: "order_items_lookup_failed" });
  }
  if (!hasTicketItems?.length) return jsonResponse(200, { received: true, delivery: "no_tickets" });

  let claim: { claimed?: boolean; status?: string; attempt_id?: string };
  try {
    claim = await callAdminRpc(supabaseUrl, serviceRoleKey, "claim_ticket_email_delivery", {
      p_order_id: orderId,
    });
  } catch (error) {
    console.error("Could not claim ticket email delivery.", orderId, error);
    return jsonResponse(500, { error: "ticket_email_claim_failed" });
  }
  if (!claim || typeof claim !== "object") {
    console.error("Ticket email claim returned an invalid response.", orderId);
    return jsonResponse(500, { error: "ticket_email_claim_failed" });
  }
  if (!claim.claimed) return jsonResponse(200, { received: true, delivery: claim.status });
  const attemptId = typeof claim.attempt_id === "string" ? claim.attempt_id : "";
  if (!/^[0-9a-f-]{36}$/i.test(attemptId)) {
    console.error("Ticket email claim returned an invalid attempt identifier.", orderId);
    return jsonResponse(500, { error: "ticket_email_claim_failed" });
  }

  try {
    const { data: items, error: itemsError } = await admin
      .from("order_items")
      .select("id, event_id, ticket_type_id, quantity, unit_price_clp, administration_fee_clp, buyer_name, buyer_email")
      .eq("order_id", orderId);
    if (itemsError) throw new Error(`Could not load order items: ${itemsError.message}`);
    if (!items?.length) throw new Error("Paid order contains no ticket items.");

    const itemIds = items.map((item: OrderItem) => item.id);
    const eventIds = [...new Set(items.map((item: OrderItem) => item.event_id))];
    const ticketTypeIds = [...new Set(items.map((item: OrderItem) => item.ticket_type_id))];
    const [{ data: tickets, error: ticketsError }, { data: events, error: eventsError }, { data: ticketTypes, error: typesError }] =
      await Promise.all([
        admin.from("tickets").select("id, event_id, order_item_id, created_at, attendee_name, attendee_rut").in("order_item_id", itemIds),
        admin.from("events").select("id, title, category, starts_at, venue, city, cover_url").in("id", eventIds),
        admin.from("ticket_types").select("id, event_id, name").in("event_id", eventIds).in("id", ticketTypeIds),
      ]);
    if (ticketsError || eventsError || typesError) {
      throw new Error(`Could not load ticket details: ${ticketsError?.message ?? eventsError?.message ?? typesError?.message}`);
    }

    const expectedTicketCount = items.reduce((count: number, item: OrderItem) => count + item.quantity, 0);
    if (!tickets?.length || tickets.length !== expectedTicketCount) {
      throw new Error("Issued ticket count does not match the order.");
    }
    const itemById = new Map<string, OrderItem>(items.map((item: OrderItem) => [item.id, item]));
    const eventById = new Map<string, EventDetails>((events ?? []).map((event: EventDetails) => [event.id, event]));
    const typeById = new Map<string, { id: string; event_id: string; name: string }>(
      (ticketTypes ?? []).map((type) => [`${type.event_id}:${type.id}`, type]),
    );
    for (const ticket of tickets) {
      const item = itemById.get(ticket.order_item_id) as OrderItem | undefined;
      if (!item || ticket.event_id !== item.event_id ||
          !eventById.has(item.event_id) || !typeById.has(`${item.event_id}:${item.ticket_type_id}`)) {
        throw new Error(`Ticket ${ticket.id} does not belong to this order.`);
      }
    }

    const ticketIds = tickets.map((ticket) => ticket.id);
    const { data: secrets, error: secretsError } = await admin
      .from("ticket_delivery_secrets")
      .select("ticket_id, qr_token_encrypted, security_code_encrypted")
      .in("ticket_id", ticketIds);
    if (secretsError) throw new Error(`Could not load encrypted ticket credentials: ${secretsError.message}`);
    if (!secrets || secrets.length !== tickets.length) {
      throw new Error("Some issued tickets are missing encrypted credentials.");
    }

    const rawKey = fromBase64(encryptionSecret);
    if (rawKey.length !== 32) throw new Error("Ticket credential encryption key must contain 32 bytes.");
    const encryptionKey = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
    const secretByTicketId = new Map(secrets.map((secret) => [secret.ticket_id, secret]));
    const logo = await loadPngData(`${appPublicUrl}/tickevenlogo.png`);
    const eventCoverById = new Map<string, Promise<TicketImage | null>>();
    const groupedEvents = new Map<string, {
      id: string;
      title: string;
      startsAt: string;
      venue: string;
      city: string;
      ticketCount: number;
      totalClp: number;
    }>();
    const attachments = [];

    for (const [index, ticket] of tickets.entries()) {
      const item = itemById.get(ticket.order_item_id) as OrderItem;
      const event = eventById.get(item.event_id) as EventDetails;
      const ticketType = typeById.get(`${item.event_id}:${item.ticket_type_id}`);
      const secret = secretByTicketId.get(ticket.id);
      if (!ticketType || !secret) throw new Error(`Ticket ${ticket.id} is missing event or credential data.`);

      const group = groupedEvents.get(event.id) ?? {
        id: event.id,
        title: event.title,
        startsAt: event.starts_at,
        venue: event.venue,
        city: event.city,
        ticketCount: 0,
        totalClp: 0,
      };
      group.ticketCount += 1;
      group.totalClp += item.unit_price_clp + item.administration_fee_clp;
      groupedEvents.set(event.id, group);
      if (!eventCoverById.has(event.id)) {
        eventCoverById.set(event.id, loadEventCover(event, supabaseUrl));
      }

      const qrToken = await decryptCredential(secret.qr_token_encrypted, encryptionKey);
      const securityCode = await decryptCredential(secret.security_code_encrypted, encryptionKey);
      const pdf = await createTicketPdf({
        ticket: {
          id: ticket.id,
          created_at: ticket.created_at,
          attendee_name: ticket.attendee_name,
          attendee_rut: ticket.attendee_rut,
        },
        ticketNumber: index + 1,
        ticketCount: tickets.length,
        orderId,
        event,
        eventCover: await eventCoverById.get(event.id)!,
        ticketType: ticketType.name,
        logo,
        qrToken,
        securityCode,
      });
      attachments.push({
        name: `tickeven-entrada-${ticket.id}.pdf`,
        content: toBase64(pdf),
      });
    }
    const totalAttachmentBytes = attachments.reduce((total, attachment) => total + attachment.content.length, 0);
    if (totalAttachmentBytes > maxAttachmentBytes) {
      throw new Error("Ticket PDFs exceed TickEven's 18 MB email attachment cap.");
    }

    const { subject, html } = buildTicketEmail({
      buyerName: order.buyer_name,
      events: [...groupedEvents.values()],
      ticketCount: tickets.length,
      orderTotalClp: order.total_clp,
      appPublicUrl,
    });
    let brevoResponse: Response;
    try {
      brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": brevoApiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          sender,
          replyTo: { email: "hola@tickeven.cl", name: "Soporte TickEven" },
          to: [{ email: order.buyer_email, name: order.buyer_name }],
          subject,
          htmlContent: html,
          attachment: attachments,
        }),
        signal: AbortSignal.timeout(30000),
      });
    } catch (error) {
      throw new Error(`Could not reach Brevo: ${error instanceof Error ? error.message : String(error)}`);
    }
    const responseText = await brevoResponse.text();
    let brevoResult: { messageId?: unknown; message?: unknown; code?: unknown } | null = null;
    try {
      brevoResult = responseText ? JSON.parse(responseText) : null;
    } catch {
      brevoResult = null;
    }
    if (!brevoResponse.ok || typeof brevoResult?.messageId !== "string") {
      throw new Error(
        `Brevo rejected the email (HTTP ${brevoResponse.status}): ${responseText.slice(0, 1000) || "missing messageId"}`,
      );
    }

    await finishDelivery(supabaseUrl, serviceRoleKey, orderId, attemptId, "sent", brevoResult.messageId, null);
    return jsonResponse(200, { received: true, delivery: "sent" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await finishDelivery(supabaseUrl, serviceRoleKey, orderId, attemptId, "failed", null, message);
    } catch (finishError) {
      console.error("Could not record ticket email failure.", orderId, finishError);
    }
    console.error("Ticket email delivery failed.", orderId, message);
    return jsonResponse(502, { error: "ticket_email_delivery_failed" });
  }
});

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Origin": origin ?? "null",
  "Content-Type": "application/json",
});

function jsonResponse(status: number, body: Record<string, unknown>, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}

Deno.serve(async (request: Request) => {
  const appOrigin = Deno.env.get("APP_ORIGIN");
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(appOrigin ?? null) });
  if (request.method !== "POST") return jsonResponse(405, { error: "method_not_allowed" }, appOrigin ?? null);
  if (!appOrigin || request.headers.get("origin") !== appOrigin) {
    return jsonResponse(403, { error: "origin_not_allowed" }, appOrigin ?? null);
  }

  const authorization = request.headers.get("authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!token || !supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(401, { error: "authentication_required" }, appOrigin);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !userData.user) return jsonResponse(401, { error: "authentication_required" }, appOrigin);

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: "invalid_json" }, appOrigin);
  }
  const ticketId = typeof payload.ticket_id === "string" ? payload.ticket_id : null;
  const qrToken = typeof payload.qr_token === "string" ? payload.qr_token : null;
  const securityCode = typeof payload.security_code === "string" ? payload.security_code : null;
  const eventId = typeof payload.event_id === "string" ? payload.event_id : "";
  const inputMethod = typeof payload.input_method === "string" ? payload.input_method : "";
  if (!eventId || eventId.length > 100 || !["qr", "manual"].includes(inputMethod)) {
    return jsonResponse(400, { error: "event_and_input_method_required" }, appOrigin);
  }
  if ((!ticketId || !qrToken) && !securityCode && !(inputMethod === "qr" && qrToken)) {
    return jsonResponse(400, { error: "ticket_credentials_required" }, appOrigin);
  }
  if (ticketId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ticketId)) {
    return jsonResponse(400, { error: "invalid_ticket_id" }, appOrigin);
  }
  if ((qrToken && qrToken.length > 200) || (securityCode && securityCode.length > 40)) {
    return jsonResponse(400, { error: "invalid_ticket_credentials" }, appOrigin);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.rpc("validate_ticket", {
    p_producer_id: userData.user.id,
    p_ticket_id: ticketId,
    p_qr_token: qrToken,
    p_security_code: securityCode,
    p_event_id: eventId,
    p_input_method: inputMethod,
  });
  if (error) {
    console.error("validate_ticket failed", error.message);
    return jsonResponse(400, { error: "ticket_validation_failed" }, appOrigin);
  }
  return jsonResponse(200, data, appOrigin);
});

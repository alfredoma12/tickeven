import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        storage: window.sessionStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase no está configurado. Revisa las variables de entorno de la aplicación.");
  }
  return supabase;
}

export async function createPendingOrder({ checkoutKey, lines }) {
  const client = requireSupabase();

  const firstBuyer = lines[0]?.buyer;
  if (!firstBuyer || lines.some((line) => !line.buyer)) {
    throw new Error("Completa los datos del comprador para todas las entradas antes de continuar.");
  }

  const { data, error } = await client.functions.invoke("create-order", {
    body: {
      checkout_key: checkoutKey,
      buyer: firstBuyer,
      items: lines.map((line) => ({
        event_id: String(line.eventId),
        ticket_type_id: String(line.ticketTypeId),
        quantity: line.quantity,
        buyer: line.buyer,
      })),
    },
  });

  if (error) {
    let responseError;
    try {
      responseError = await error.context?.json();
    } catch {
      responseError = null;
    }
    const messages = {
      invalid_buyer: "Revisa los datos del comprador; el RUT debe ser válido.",
      invalid_attendee: "Revisa los datos de las personas asociadas a las entradas.",
      insufficient_inventory: "Ya no hay suficientes entradas disponibles.",
      ticket_type_unavailable: "Este tipo de entrada no está disponible para la venta.",
      order_creation_failed: "No se pudo guardar la orden en el servidor.",
    };
    const errorCode = responseError?.error;
    throw new Error(messages[errorCode] || error.message || "No se pudo guardar la orden en Supabase.");
  }

  return data;
}

export async function createMercadoPagoPreference({ orderId, checkoutKey }) {
  const { data, error } = await requireSupabase().functions.invoke("create-payment-preference", {
    body: { order_id: orderId, checkout_key: checkoutKey },
  });
  if (error) {
    let responseError;
    try {
      responseError = await error.context?.json();
    } catch {
      responseError = null;
    }
    const messages = {
      payment_not_configured: "Mercado Pago todavía no está configurado en el servidor.",
      order_not_found: "No encontramos la orden de compra.",
      order_not_payable: "La orden venció o ya no está pendiente. Vuelve al carrito para iniciar otra compra.",
      payment_provider_unavailable: "Mercado Pago no está disponible en este momento.",
      payment_preference_failed: "Mercado Pago no pudo preparar el pago. Inténtalo nuevamente.",
    };
    throw new Error(messages[responseError?.error] || error.message || "No se pudo iniciar el pago.");
  }
  if (typeof data?.checkout_url !== "string") {
    throw new Error("Mercado Pago no devolvió un enlace de pago válido.");
  }
  return data;
}

export async function getPaidOrderTickets({ orderId, checkoutKey }) {
  const { data, error } = await requireSupabase().functions.invoke("get-order-tickets", {
    body: { order_id: orderId, checkout_key: checkoutKey },
  });
  if (error) {
    let responseError;
    try {
      responseError = await error.context?.json();
    } catch {
      responseError = null;
    }
    const messages = {
      order_not_found: "No encontramos esa orden. Vuelve al sitio y contacta a soporte si ya realizaste el pago.",
      ticket_credentials_unavailable: "El pago está confirmado, pero no pudimos preparar tus entradas. Contacta a soporte.",
    };
    throw new Error(messages[responseError?.error] || error.message || "No se pudo consultar el estado del pago.");
  }
  return data;
}

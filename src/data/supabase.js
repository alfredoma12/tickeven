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

export async function createPendingOrder({ checkoutKey, lines, products = [] }) {
  const client = requireSupabase();

  const firstBuyer = lines[0]?.buyer ?? products[0]?.buyer;
  if (!firstBuyer || lines.some((line) => !line.buyer) || products.some((product) => !product.buyer)) {
    throw new Error("Completa los datos del comprador antes de continuar.");
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
      products: products.map((product) => ({
        product_id: product.productId,
        variant_id: product.variantId || null,
        quantity: product.quantity,
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
      insufficient_product_inventory: "Ya no hay suficiente stock de uno de los productos.",
      product_unavailable: "Uno de los productos ya no está disponible.",
      product_variant_required: "Selecciona una variante disponible para el producto.",
      product_variant_unavailable: "La variante seleccionada ya no está disponible.",
      invalid_product_item: "Revisa los productos y cantidades seleccionados.",
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

export async function registerFreeOrder({ checkoutKey, buyer, items }) {
  const { data, error } = await requireSupabase().functions.invoke("register-free-order", {
    body: {
      checkout_key: checkoutKey,
      buyer,
      items: items.map((item) => ({
        event_id: String(item.eventId),
        ticket_type_id: String(item.ticketTypeId),
        quantity: item.quantity,
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
      insufficient_inventory: "Ya no hay suficientes entradas gratuitas disponibles.",
      ticket_type_unavailable: "Este tipo de entrada gratuita ya no está disponible.",
      invalid_buyer: "Revisa los datos del asistente; el RUT debe ser válido.",
      order_not_free: "Esta inscripción no corresponde a una entrada gratuita.",
      ticket_delivery_not_configured: "No se pudieron preparar las entradas. Contacta al administrador.",
      ticket_encryption_not_configured: "No se pudieron preparar las entradas. Contacta al administrador.",
    };
    throw new Error(messages[responseError?.error] || error.message || "No se pudo completar la inscripción gratuita.");
  }
  if (typeof data?.id !== "string" || data.status !== "paid") {
    throw new Error("No se pudo confirmar la inscripción gratuita.");
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

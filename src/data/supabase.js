import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey)
  : null;

export async function createPendingOrder({ checkoutKey, lines }) {
  if (!supabase) {
    throw new Error("Falta configurar Supabase. Revisa las variables VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY.");
  }

  const firstBuyer = lines[0]?.buyer;
  if (!firstBuyer || lines.some((line) => !line.buyer)) {
    throw new Error("Completa los datos del comprador para todas las entradas antes de continuar.");
  }

  const { data, error } = await supabase.functions.invoke("create-order", {
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

import { getAdministrationFee } from "./pricing.js";

const CART_STORAGE_KEY = "tickeven-cart-v2";
const LEGACY_CART_STORAGE_KEY = "tickeven-cart-v1";

export function readCart() {
  try {
    const storedCart = sessionStorage.getItem(CART_STORAGE_KEY) ?? sessionStorage.getItem(LEGACY_CART_STORAGE_KEY);
    if (!storedCart) return [];

    const parsedCart = JSON.parse(storedCart);
    if (!Array.isArray(parsedCart)) {
      throw new TypeError("El contenido guardado del carrito no es una lista.");
    }

    return parsedCart
      .filter((item) =>
        Number.isInteger(item.eventId) &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0
      )
      .map((item, index) => ({
        ...item,
        cartItemId: typeof item.cartItemId === "string" ? item.cartItemId : `legacy-${item.eventId}-${index}`,
        ticketTypeId: typeof item.ticketTypeId === "string" ? item.ticketTypeId : "general",
        buyer: item.buyer && typeof item.buyer === "object" ? item.buyer : null,
      }));
  } catch (error) {
    console.error("No se pudo recuperar el carrito guardado.", error);
    return [];
  }
}

export function writeCart(cart) {
  try {
    sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  } catch (error) {
    console.error("No se pudo guardar el carrito para esta sesión.", error);
  }
}

export function getCartLines(cart, events) {
  return cart.flatMap((item) => {
    const event = events.find((candidate) => candidate.id === item.eventId);
    const ticketType = event?.ticketTypes.find((candidate) => candidate.id === item.ticketTypeId)
      ?? event?.ticketTypes[0];
    return event && ticketType
      ? [{
          ...event,
          id: item.cartItemId,
          eventId: item.eventId,
          ticketTypeId: ticketType.id,
          ticketTypeName: ticketType.name,
          ticketPrice: ticketType.price,
          administrationFee: getAdministrationFee(ticketType.price),
          maxQuantity: Math.min(10, ticketType.available),
          quantity: item.quantity,
          buyer: item.buyer,
        }]
      : [];
  });
}

export function getCartTotals(lines) {
  const ticketSubtotal = lines.reduce((total, item) => total + item.ticketPrice * item.quantity, 0);
  const administrationTotal = lines.reduce(
    (total, item) => total + item.administrationFee * item.quantity,
    0,
  );
  return {
    ticketSubtotal,
    administrationTotal,
    total: ticketSubtotal + administrationTotal,
    quantity: lines.reduce((total, item) => total + item.quantity, 0),
  };
}

import { getAdministrationFee } from "./pricing.js";

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

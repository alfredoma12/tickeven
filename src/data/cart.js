import { getAdministrationFee } from "./pricing.js";

export function getCartLines(cart, events) {
  return cart.flatMap((item) => {
    const event = events.find((candidate) => candidate.id === item.eventId);
    const ticketType = event?.ticketTypes.find((candidate) => candidate.id === item.ticketTypeId)
      ?? event?.ticketTypes[0];
    return event && ticketType
      ? [{
          ...event,
          kind: "ticket",
          id: item.cartItemId,
          eventId: item.eventId,
          ticketTypeId: ticketType.id,
          ticketTypeName: ticketType.name,
          ticketPrice: ticketType.price,
          administrationFee: getAdministrationFee(ticketType.price),
          maxQuantity: Math.min(10, ticketType.available),
          quantity: item.quantity,
          buyer: item.buyer,
          attendees: item.attendees,
        }]
      : [];
  });
}

export function getCartProductLines(cart, events) {
  return cart.flatMap((item) => {
    const event = events.find((candidate) => candidate.id === item.eventId);
    const product = event?.products.find((candidate) => candidate.id === item.productId);
    const variant = product?.variants.find((candidate) => candidate.id === item.variantId);
    if (!event || !product || (item.variantId && !variant)) return [];
    return [{
      ...event,
      kind: "product",
      id: item.cartItemId,
      eventId: event.id,
      productId: product.id,
      variantId: variant?.id ?? null,
      productName: product.name,
      productCategory: product.category,
      variantName: variant?.name ?? "",
      image: product.image || event.image,
      imageAlt: product.name,
      ticketTypeName: product.name,
      ticketPrice: product.price,
      administrationFee: getAdministrationFee(product.price),
      maxQuantity: Math.min(10, variant?.available ?? product.available),
      quantity: item.quantity,
      buyer: item.buyer,
    }];
  });
}

export function getCartTotals(lines, discountCoupon = null) {
  const ticketLines = lines.filter((item) => item.kind !== "product");
  const productLines = lines.filter((item) => item.kind === "product");
  const discountLines = discountCoupon
    ? ticketLines.filter((item) => item.eventId === discountCoupon.event_id)
    : [];
  const ticketDiscount = discountLines.reduce((total, item) => {
    const discountPerTicket = discountCoupon.discount_type === "free"
      ? item.ticketPrice
      : Math.floor(item.ticketPrice * discountCoupon.discount_percent / 100);
    return total + discountPerTicket * item.quantity;
  }, 0);
  const waivedAdministration = discountCoupon?.discount_type === "free"
    ? discountLines.reduce((total, item) => total + item.administrationFee * item.quantity, 0)
    : 0;
  const ticketSubtotal = ticketLines.reduce((total, item) => total + item.ticketPrice * item.quantity, 0);
  const productSubtotal = productLines.reduce((total, item) => total + item.ticketPrice * item.quantity, 0);
  const ticketAdministrationTotal = ticketLines.reduce(
    (total, item) => total + item.administrationFee * item.quantity,
    0,
  );
  const productAdministrationTotal = productLines.reduce(
    (total, item) => total + item.administrationFee * item.quantity,
    0,
  );
  const administrationTotal = ticketAdministrationTotal + productAdministrationTotal;
  return {
    ticketSubtotal,
    productSubtotal,
    ticketAdministrationTotal,
    productAdministrationTotal,
    administrationTotal,
    discountTotal: ticketDiscount + waivedAdministration,
    total: ticketSubtotal + productSubtotal + administrationTotal - ticketDiscount - waivedAdministration,
    quantity: ticketLines.reduce((total, item) => total + item.quantity, 0),
    productQuantity: productLines.reduce((total, item) => total + item.quantity, 0),
  };
}

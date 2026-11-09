function csvCell(value) {
  const text = String(value ?? "");
  const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

export function buildTicketSalesCsv(tickets) {
  const headers = [
    "Evento",
    "ID de entrada",
    "Estado de entrada",
    "Tipo de entrada",
    "Nombre del cliente",
    "RUT",
    "Correo electrónico",
    "Teléfono",
    "ID de compra",
    "Fecha de compra",
    "Precio entrada CLP",
    "Cargo administración CLP",
  ];
  const rows = tickets.map((ticket) => [
    ticket.event_title,
    ticket.ticket_id,
    ticket.ticket_status,
    ticket.ticket_type,
    ticket.buyer_name,
    ticket.buyer_rut,
    ticket.buyer_email,
    ticket.buyer_phone,
    ticket.order_id,
    ticket.purchased_at,
    ticket.ticket_price_clp,
    ticket.administration_fee_clp,
  ]);
  return `\uFEFF${[headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n")}`;
}

export function createTicketSalesFilename(eventTitle, eventId) {
  const slug = String(eventTitle || eventId || "evento")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `tickeven-entradas-vendidas-${slug || "evento"}.csv`;
}

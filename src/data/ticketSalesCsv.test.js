import test from "node:test";
import assert from "node:assert/strict";
import { buildTicketSalesCsv, createTicketSalesFilename } from "./ticketSalesCsv.js";

test("exports one row for each sold ticket and includes buyer details", () => {
  const csv = buildTicketSalesCsv([
    {
      event_title: "Festival",
      ticket_id: "ticket-1",
      ticket_status: "valid",
      ticket_type: "General",
      buyer_name: "Ana Pérez",
      buyer_rut: "12345678-5",
      buyer_email: "ana@example.cl",
      buyer_phone: "+56912345678",
      order_id: "order-1",
      purchased_at: "2026-11-09T12:00:00Z",
      ticket_price_clp: 12000,
      administration_fee_clp: 1200,
    },
    {
      event_title: "Festival",
      ticket_id: "ticket-2",
      ticket_status: "used",
      ticket_type: "General",
      buyer_name: "Ana Pérez",
      buyer_rut: "12345678-5",
      buyer_email: "ana@example.cl",
      buyer_phone: "+56912345678",
      order_id: "order-1",
      purchased_at: "2026-11-09T12:00:00Z",
      ticket_price_clp: 12000,
      administration_fee_clp: 1200,
    },
  ]);

  const rows = csv.slice(1).split("\r\n");
  assert.equal(rows.length, 3);
  assert.match(rows[1], /ticket-1/);
  assert.match(rows[2], /ticket-2/);
  assert.match(rows[1], /ana@example\.cl/);
  assert.match(rows[1], /12345678-5/);
});

test("escapes quotes and prefixes spreadsheet formula values", () => {
  const csv = buildTicketSalesCsv([{
    event_title: '=HYPERLINK("https://example.com")',
    ticket_id: "ticket-1",
    buyer_name: "Ana, \"Anita\" Pérez",
  }]);

  assert.match(csv, /"'=HYPERLINK\(""https:\/\/example\.com""\)"/);
  assert.match(csv, /"Ana, ""Anita"" Pérez"/);
});

test("creates a safe event-specific filename", () => {
  assert.equal(createTicketSalesFilename("Festival de Música", "1"), "tickeven-entradas-vendidas-festival-de-musica.csv");
});

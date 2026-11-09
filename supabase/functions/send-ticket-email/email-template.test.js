import test from "node:test";
import assert from "node:assert/strict";
import { buildTicketEmail, escapeHtml, formatEventDate } from "./email-template.js";

test("escapes event and buyer text before rendering HTML", () => {
  assert.equal(escapeHtml(`<script a="b">&'`), "&lt;script a=&quot;b&quot;&gt;&amp;&#39;");
  const { html } = buildTicketEmail({
    buyerName: "<img src=x>",
    events: [{ title: "Evento <uno>", startsAt: null, ticketCount: 1, totalClp: 5000 }],
    ticketCount: 1,
    orderTotalClp: 5000,
    appPublicUrl: "https://tickeven.cl",
  });
  assert.match(html, /&lt;img src=x&gt;/);
  assert.match(html, /Evento &lt;uno&gt;/);
  assert.doesNotMatch(html, /<img src=x>/);
});

test("summarizes multiple events, dates, and the total ticket count", () => {
  const { subject, html } = buildTicketEmail({
    buyerName: "Alfredo",
    events: [
      { title: "Festival", startsAt: "2026-12-06T21:00:00-03:00", ticketCount: 2, totalClp: 40000 },
      { title: "Teatro", startsAt: "2027-01-08T19:30:00-03:00", ticketCount: 1, totalClp: 15000 },
    ],
    ticketCount: 3,
    orderTotalClp: 55000,
    appPublicUrl: "https://tickeven.cl/",
  });
  assert.equal(subject, "Tus 3 entradas están listas | TickEven");
  assert.match(html, /Festival/);
  assert.match(html, /Teatro/);
  assert.match(html, /3 entradas/);
  assert.match(html, /\$55\.000 CLP/);
  assert.match(html, /https:\/\/tickeven\.cl\/tickevenlogo\.png/);
});

test("formats a valid Chilean event date and rejects invalid dates", () => {
  assert.match(formatEventDate("2026-12-06T21:00:00-03:00"), /diciembre de 2026/);
  assert.equal(formatEventDate("not-a-date"), "Fecha por confirmar");
});

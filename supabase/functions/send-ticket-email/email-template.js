const money = new Intl.NumberFormat("es-CL");

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

export function formatEventDate(value) {
  if (!value) return "Fecha por confirmar";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha por confirmar";
  return new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Santiago",
  }).format(date);
}

export function buildTicketEmail({ buyerName, events, ticketCount, productCount = 0, orderTotalClp, appPublicUrl }) {
  const eventSummary = events.map((event) => `
    <tr>
      <td style="padding:16px 18px;border-bottom:1px solid #282832">
        <div style="font-size:16px;font-weight:700;color:#fff">${escapeHtml(event.title)}</div>
        <div style="padding-top:6px;color:#a1a1aa;font-size:13px">
          ${escapeHtml(formatEventDate(event.startsAt))}
          ${event.ticketCount ? ` · ${event.ticketCount} ${event.ticketCount === 1 ? "entrada" : "entradas"}` : ""}
          ${event.productCount ? ` · ${event.productCount} ${event.productCount === 1 ? "producto" : "productos"}` : ""}
        </div>
        ${event.venue ? `<div style="padding-top:4px;color:#a1a1aa;font-size:13px">${escapeHtml(event.venue)}${event.city ? ` · ${escapeHtml(event.city)}` : ""}</div>` : ""}
      </td>
    </tr>`).join("");
  const safeName = escapeHtml(buyerName || "¡Hola!");
  const logoUrl = `${appPublicUrl.replace(/\/+$/, "")}/tickevenlogo.png`;
  const purchaseSummary = [
    ticketCount ? `${ticketCount} ${ticketCount === 1 ? "entrada" : "entradas"}` : "",
    productCount ? `${productCount} ${productCount === 1 ? "producto" : "productos"}` : "",
  ].filter(Boolean).join(" · ");
  const attachmentsDescription = [
    ticketCount ? "Recibirás un archivo individual por cada entrada. Guarda cada QR y preséntalo en el acceso del evento." : "",
    productCount ? "Cada unidad de producto tiene su propio QR en PDF adjunto. Preséntalo al retirar el producto en el evento." : "",
  ].filter(Boolean).join("<br>");

  return {
    subject: productCount && ticketCount
      ? "Tus entradas y productos están listos | TickEven"
      : productCount === 1
        ? "Tu código de retiro está listo | TickEven"
        : productCount
          ? `Tus ${productCount} códigos de retiro están listos | TickEven`
          : ticketCount === 1
            ? "Tu entrada está lista | TickEven"
            : `Tus ${ticketCount} entradas están listas | TickEven`,
    html: `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>Compra confirmada | TickEven</title></head>
<body style="margin:0;padding:0;background:#050505;color:#fff;font-family:Inter,'Segoe UI',Arial,sans-serif">
  <div style="display:none;font-size:1px;color:#050505;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">Tu compra fue confirmada. Tus códigos QR individuales están adjuntos en PDF.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#050505">
    <tr><td align="center" style="padding:28px 14px">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#0d0d12;border:1px solid #282832;border-radius:16px;overflow:hidden">
        <tr><td style="padding:24px 30px;border-bottom:1px solid #282832">
          <a href="${escapeHtml(appPublicUrl)}" style="display:inline-block;text-decoration:none"><img src="${escapeHtml(logoUrl)}" width="148" alt="TickEven" style="display:block;width:148px;max-width:100%;height:auto;border:0"></a>
        </td></tr>
        <tr><td style="padding:34px 30px 20px">
          <div style="color:#b6a0ff;font-size:11px;letter-spacing:1.6px;font-weight:700">COMPRA CONFIRMADA</div>
          <h1 style="margin:12px 0 8px;color:#fff;font-size:28px;line-height:1.2">¡Tu compra ha sido confirmada!</h1>
          <p style="margin:0;color:#c7c7d0;font-size:15px;line-height:1.7">${safeName}, gracias por elegir TickEven. Preparamos tus códigos QR para que disfrutes el evento.</p>
        </td></tr>
        <tr><td style="padding:8px 30px 22px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #282832;border-radius:12px;background:#101015">
            <tr><td style="padding:16px 18px 10px;color:#a1a1aa;font-size:11px;font-weight:700;letter-spacing:1px">RESUMEN DE TU COMPRA</td></tr>
            ${eventSummary}
            <tr><td style="padding:15px 18px;color:#fff;font-size:14px;font-weight:700">Compra: ${escapeHtml(purchaseSummary)} · Total pagado: $${money.format(orderTotalClp)} CLP</td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 30px 28px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#17142a;border:1px solid #3b2b60;border-radius:12px">
            <tr><td style="padding:18px;color:#e8e1ff;font-size:14px;line-height:1.7"><strong style="color:#fff">Tus códigos QR individuales están adjuntos en PDF.</strong><br>${attachmentsDescription}</td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:0 30px 34px">
          <a href="${escapeHtml(appPublicUrl)}" style="display:inline-block;padding:13px 22px;border-radius:10px;background:#155bff;background-image:linear-gradient(110deg,#155bff 0%,#7200ff 58%,#b400d0 100%);box-shadow:0 8px 26px rgba(73,32,255,.24);color:#fff;text-decoration:none;font-size:14px;font-weight:700">Volver a TickEven</a>
        </td></tr>
        <tr><td style="padding:20px 30px;border-top:1px solid #282832;color:#a1a1aa;font-size:12px;line-height:1.7">
          ¿Necesitas ayuda? Escríbenos a <a href="mailto:hola@tickeven.cl" style="color:#b6a0ff;text-decoration:underline">hola@tickeven.cl</a>.<br>
          TickEven.cl · Hecho para vivirlo
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

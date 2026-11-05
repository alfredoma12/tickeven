import jsPDF from "jspdf";
import QRCode from "qrcode";

export async function downloadTicketPdf({ eventTitle, tickets }) {
  if (!Array.isArray(tickets) || tickets.length === 0) {
    throw new Error("No hay entradas disponibles para generar el PDF.");
  }

  const pdf = new jsPDF();
  for (const [index, ticket] of tickets.entries()) {
    if (index > 0) pdf.addPage();

    const qrPayload = JSON.stringify({
      ticket_id: ticket.id,
      token: ticket.qrToken,
    });
    const qrImage = await QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 240,
    });

    pdf.setFontSize(20);
    pdf.text("TickEven.cl", 18, 22);
    pdf.setFontSize(16);
    pdf.text(eventTitle, 18, 38, { maxWidth: 115 });
    pdf.setFontSize(11);
    pdf.text(`Entrada: ${ticket.ticketType}`, 18, 56);
    pdf.text(`Titular: ${ticket.attendeeName}`, 18, 65);
    pdf.text(`Código de seguridad: ${ticket.securityCode}`, 18, 74);
    pdf.text("Presenta el código QR en el acceso. Si no se puede leer, entrega el código de seguridad.", 18, 87, { maxWidth: 115 });
    pdf.addImage(qrImage, "PNG", 138, 30, 48, 48);
    pdf.setFontSize(9);
    pdf.text(`Folio: ${ticket.id}`, 18, 105);
  }

  const safeEventName = eventTitle
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  pdf.save(`tickeven-entradas-${safeEventName || "evento"}.pdf`);
}

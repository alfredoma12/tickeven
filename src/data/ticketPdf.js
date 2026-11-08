import jsPDF from "jspdf";
import QRCode from "qrcode";
import logoAsset from "../../style/tickevenlogo.jpeg";

const colors = {
  blue: [21, 91, 255],
  violet: [114, 0, 255],
  magenta: [224, 0, 200],
  paleViolet: [22, 17, 34],
  ink: [248, 248, 252],
  muted: [161, 161, 170],
  line: [43, 43, 53],
  paper: [5, 5, 5],
  surface: [13, 13, 18],
  white: [255, 255, 255],
};

const money = new Intl.NumberFormat("es-CL");

function formatEventDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Santiago",
  }).format(date);
}

function formatEventTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${new Intl.DateTimeFormat("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "America/Santiago",
  }).format(date)} hrs`;
}

function formatPurchaseDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeZone: "America/Santiago",
  }).format(date);
}

async function loadLogo() {
  const image = new Image();
  image.src = logoAsset;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo preparar el logo para la entrada.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.94);
}

function drawBrandGradient(pdf, width, y, height) {
  const stops = [colors.blue, colors.violet, colors.magenta];
  const segments = 120;
  for (let index = 0; index < segments; index += 1) {
    const progress = index / (segments - 1);
    const section = progress < 0.5 ? 0 : 1;
    const localProgress = section === 0 ? progress * 2 : (progress - 0.5) * 2;
    const start = stops[section];
    const end = stops[section + 1];
    const color = start.map((channel, channelIndex) =>
      Math.round(channel + (end[channelIndex] - channel) * localProgress),
    );
    pdf.setFillColor(...color);
    pdf.rect((width * index) / segments, y, width / segments + 0.12, height, "F");
  }
}

function drawLabel(pdf, label, value, x, y, width, valueSize = 11) {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.setTextColor(...colors.muted);
  pdf.text(label.toLocaleUpperCase("es"), x, y);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(valueSize);
  pdf.setTextColor(...colors.ink);
  const lines = pdf.splitTextToSize(value || "No informado", width);
  pdf.text(lines.slice(0, 2), x, y + 6);
  return y + 6 + Math.min(lines.length, 2) * (valueSize * 0.42) + 8;
}

export async function downloadTicketPdf({ eventTitle, event, tickets, orderId }) {
  if (!Array.isArray(tickets) || tickets.length === 0) {
    throw new Error("No hay entradas disponibles para generar el PDF.");
  }
  if (tickets.some((ticket) => !ticket.id || !ticket.qrToken || !ticket.securityCode)) {
    throw new Error("Faltan datos de seguridad para generar una o más entradas.");
  }

  const logo = await loadLogo();
  const pdf = new jsPDF({ format: "a4", unit: "mm" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const safeEventTitle = eventTitle || event?.title || "Evento";
  const date = formatEventDate(event?.startsAt);
  const time = formatEventTime(event?.startsAt);

  for (const [index, ticket] of tickets.entries()) {
    if (index > 0) pdf.addPage();

    const qrPayload = JSON.stringify({ ticket_id: ticket.id, token: ticket.qrToken });
    const qrImage = await QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 360,
      color: { dark: "#171717", light: "#ffffff" },
    });

    pdf.setFillColor(...colors.paper);
    pdf.rect(0, 0, pageWidth, 297, "F");
    pdf.setFillColor(...colors.surface);
    pdf.rect(0, 0, pageWidth, 53, "F");
    drawBrandGradient(pdf, pageWidth, 51, 2);
    pdf.addImage(logo, "JPEG", 15, 12, 68, 19.13);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...colors.muted);
    pdf.text("ENTRADA DIGITAL", 17, 39);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.setTextColor(...colors.white);
    pdf.text(`${index + 1} / ${tickets.length}`, pageWidth - 15, 19, { align: "right" });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.text("GUARDA ESTA ENTRADA", pageWidth - 15, 26, { align: "right" });

    pdf.setFillColor(...colors.surface);
    pdf.setDrawColor(...colors.line);
    pdf.roundedRect(12, 59, pageWidth - 24, 199, 4, 4, "FD");
    pdf.setFillColor(...colors.paleViolet);
    pdf.roundedRect(18, 66, pageWidth - 36, 40, 3, 3, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.setTextColor(198, 169, 255);
    pdf.text((event?.category || "EVENTO").toLocaleUpperCase("es"), 24, 75);
    pdf.setFontSize(19);
    pdf.setTextColor(...colors.ink);
    const titleLines = pdf.splitTextToSize(safeEventTitle, pageWidth - 94);
    pdf.text(titleLines.slice(0, 2), 24, 85);

    pdf.setFillColor(...colors.white);
    pdf.setDrawColor(...colors.line);
    pdf.roundedRect(145, 71, 44, 44, 2, 2, "FD");
    pdf.addImage(qrImage, "PNG", 148, 74, 38, 38);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.setTextColor(...colors.muted);
    pdf.text("PRESENTA ESTE QR", 167, 120, { align: "center" });

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.setTextColor(...colors.blue);
    pdf.text("DETALLES DE TU ENTRADA", 20, 119);
    pdf.setDrawColor(...colors.line);
    pdf.line(20, 122, pageWidth - 20, 122);

    let detailY = 132;
    detailY = drawLabel(pdf, "Tipo de entrada", ticket.ticketType, 20, detailY, 75);
    detailY = drawLabel(pdf, "Fecha", date, 20, detailY, 75);
    detailY = drawLabel(pdf, "Hora", time, 20, detailY, 75);
    detailY = drawLabel(pdf, "Recinto", event?.venue, 20, detailY, 75);
    drawLabel(pdf, "Ciudad", event?.city, 20, detailY, 75);

    pdf.setDrawColor(...colors.line);
    pdf.line(105, 129, 105, 213);
    let holderY = 132;
    holderY = drawLabel(pdf, "Titular", ticket.attendeeName, 115, holderY, 72);
    if (ticket.attendeeRut) {
      holderY = drawLabel(pdf, "RUT", ticket.attendeeRut, 115, holderY, 72);
    }
    const fee = ticket.administrationFeeClp ?? 0;
    const price = ticket.unitPriceClp ?? 0;
    const total = price + fee;
    pdf.setDrawColor(...colors.line);
    pdf.line(115, 178, pageWidth - 20, 178);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...colors.muted);
    pdf.text("Entrada", 115, 186);
    pdf.text(price === 0 ? "Gratis" : `$${money.format(price)} CLP`, pageWidth - 20, 186, { align: "right" });
    pdf.text("Administración", 115, 195);
    pdf.text(fee === 0 ? "Sin cargo" : `$${money.format(fee)} CLP`, pageWidth - 20, 195, { align: "right" });
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...colors.violet);
    pdf.text("Total", 115, 205);
    pdf.text(total === 0 ? "Gratis" : `$${money.format(total)} CLP`, pageWidth - 20, 205, { align: "right" });

    pdf.setFillColor(...colors.paleViolet);
    pdf.roundedRect(18, 220, pageWidth - 36, 25, 3, 3, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.setTextColor(...colors.muted);
    pdf.text("CÓDIGO DE SEGURIDAD · USAR SOLO SI NO SE PUEDE LEER EL QR", 24, 229);
    pdf.setFont("courier", "bold");
    pdf.setFontSize(16);
    pdf.setTextColor(...colors.white);
    pdf.text(ticket.securityCode, 24, 239);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(...colors.muted);
    pdf.text("Cada código QR corresponde a una sola entrada. Preséntala en el acceso del evento.", 18, 267);
    pdf.text("No compartas el QR ni el código de seguridad antes de ingresar.", 18, 273);
    pdf.setDrawColor(...colors.line);
    pdf.line(18, 280, pageWidth - 18, 280);
    pdf.setFontSize(6);
    pdf.text(`Folio de entrada: ${ticket.id}`, 18, 286, { maxWidth: 105 });
    if (orderId) {
      pdf.text(`Orden: ${orderId}`, 18, 291, { maxWidth: 105 });
    }
    const purchaseDate = formatPurchaseDate(ticket.orderCreatedAt);
    if (purchaseDate) pdf.text(`Emitida: ${purchaseDate}`, pageWidth - 18, 286, { align: "right" });
    pdf.text("TickEven.cl · Hecho para vivirlo", pageWidth - 18, 291, { align: "right" });
  }

  const safeEventName = safeEventTitle
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  pdf.save(`tickeven-entradas-${safeEventName || "evento"}.pdf`);
}

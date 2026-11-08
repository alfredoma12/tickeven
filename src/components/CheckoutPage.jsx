import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CreditCard,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { PurchaseSummary } from "./CartPage.jsx";
import { ADMINISTRATION_PERCENTAGE } from "../data/pricing.js";
import { createUUID } from "../data/site.js";
import { createMercadoPagoPreference, createPendingOrder, getPaidOrderTickets } from "../data/supabase.js";

const money = new Intl.NumberFormat("es-CL");

export default function CheckoutPage({ lines, totals }) {
  const [checkoutError, setCheckoutError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkoutKey] = useState(createUUID);
  const [paymentTickets, setPaymentTickets] = useState([]);
  const [paymentProducts, setPaymentProducts] = useState([]);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [pdfError, setPdfError] = useState("");
  const [downloadingEvent, setDownloadingEvent] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const search = new URLSearchParams(window.location.search);
  const returnOrderId = search.get("order_id");
  const paymentReturn = Boolean(returnOrderId && search.get("payment"));
  const isFreeRegistration = search.get("payment") === "free";

  const checkPayment = useCallback(async () => {
    if (!returnOrderId) return;
    setPaymentLoading(true);
    setPaymentError("");
    try {
      const returnCheckoutKey = window.sessionStorage.getItem(`tickeven:checkout:${returnOrderId}`);
      if (!returnCheckoutKey) {
        throw new Error("No encontramos la sesión segura de esta compra. Si realizaste el pago, contacta a soporte con el folio de la orden.");
      }
      const result = await getPaidOrderTickets({ orderId: returnOrderId, checkoutKey: returnCheckoutKey });
      setPaymentStatus(result.status);
      setPaymentTickets(result.tickets ?? []);
      setPaymentProducts(result.products ?? []);
    } catch (error) {
      console.error("No se pudo consultar el resultado del pago.", error);
      setPaymentError(error.message || "No se pudo consultar el estado del pago.");
    } finally {
      setPaymentLoading(false);
    }
  }, [returnOrderId]);

  useEffect(() => {
    document.title = "Checkout — TickEven.cl";
  }, []);

  useEffect(() => {
    if (paymentReturn) void checkPayment();
  }, [paymentReturn, checkPayment]);

  if (paymentReturn) {
    const ticketsByEvent = paymentTickets.reduce((groups, ticket) => {
      const eventKey = `${ticket.eventId}:${ticket.eventTitle}`;
      (groups[eventKey] ??= {
        title: ticket.eventTitle,
        event: {
          title: ticket.eventTitle,
          category: ticket.eventCategory,
          startsAt: ticket.eventStartsAt,
          venue: ticket.eventVenue,
          city: ticket.eventCity,
        },
        tickets: [],
      }).tickets.push(ticket);
      return groups;
    }, {});
    return (
      <main className="purchase-page">
        <div className="purchase-container">
          <section className="checkout-success">
            <span>{paymentStatus === "paid" ? <Check size={26} /> : <CreditCard size={26} />}</span>
            <p className="purchase-kicker">{paymentStatus === "paid"
              ? isFreeRegistration ? "INSCRIPCIÓN GRATUITA CONFIRMADA" : "PAGO CONFIRMADO"
              : "VERIFICANDO PAGO"}</p>
            <h1>{paymentStatus === "paid" ? paymentTickets.length
              ? <>Tus entradas están listas<span>.</span></>
              : <>Tu compra está confirmada<span>.</span></>
              : <>Estamos confirmando tu pago<span>.</span></>}</h1>
            <p>{paymentStatus === "paid"
              ? isFreeRegistration
                ? "Tu inscripción gratuita está confirmada. Descarga el PDF y presenta el código QR en el acceso."
                : paymentTickets.length
                  ? "Mercado Pago confirmó la compra. Descarga el PDF de tus entradas y presenta el QR en el acceso."
                  : "Mercado Pago confirmó tu compra. Tus productos adicionales se retiran en el evento."
              : search.get("payment") === "failure"
                ? "Mercado Pago no confirmó el pago. No se emitieron entradas. Puedes comprobar nuevamente el estado por si el aviso llegó antes que la notificación."
              : "La confirmación puede tardar unos segundos. Las entradas solo aparecen después de verificar el pago con Mercado Pago."}</p>
            {paymentError && <p className="checkout-error" role="alert">{paymentError}</p>}
            {pdfError && <p className="checkout-error" role="alert">{pdfError}</p>}
            {paymentStatus !== "paid" && <button className="checkout-submit checkout-return__retry" type="button" onClick={() => void checkPayment()} disabled={paymentLoading}>
              <RefreshCw size={15} /> {paymentLoading ? "Consultando…" : "Volver a consultar pago"}
            </button>}
            {paymentStatus === "paid" && Object.entries(ticketsByEvent).map(([eventKey, group]) => (
              <button
                className="checkout-submit checkout-return__download"
                key={eventKey}
                type="button"
                disabled={Boolean(downloadingEvent)}
                onClick={async () => {
                  setPdfError("");
                  setDownloadingEvent(eventKey);
                  try {
                    const { downloadTicketPdf } = await import("../data/ticketPdf.js");
                    await downloadTicketPdf({
                      eventTitle: group.title,
                      event: group.event,
                      tickets: group.tickets,
                      orderId: returnOrderId,
                    });
                  } catch (error) {
                    console.error("No se pudo generar el PDF de las entradas.", error);
                    setPdfError(error.message || "No se pudo generar el PDF. Inténtalo otra vez.");
                  } finally {
                    setDownloadingEvent("");
                  }
                }}
              >
                <ArrowRight size={15} /> {downloadingEvent === eventKey ? "Preparando PDF…" : `Descargar entradas · ${group.title}`}
              </button>
            ))}
            {paymentStatus === "paid" && paymentProducts.length > 0 && (
              <section className="checkout-product-receipt" aria-label="Productos adicionales confirmados">
                <h2>Productos adicionales confirmados</h2>
                {paymentProducts.map((product) => (
                  <p key={product.id}>{product.quantity} × {product.name}{product.variant ? ` · ${product.variant}` : ""} · Retiro en {product.eventTitle}</p>
                ))}
              </section>
            )}
            <a href="/">Volver a eventos <ArrowRight size={15} /></a>
          </section>
        </div>
      </main>
    );
  }

  if (!lines.length) {
    return (
      <main className="purchase-page">
        <div className="purchase-container">
          <section className="purchase-empty">
            <span><CreditCard size={25} /></span>
            <h1>No hay productos para pagar</h1>
            <p>Agrega entradas o productos adicionales al carrito antes de comenzar el checkout.</p>
            <a href="/">Explorar eventos <ArrowRight size={15} /></a>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="purchase-page">
      <div className="purchase-container">
        <a className="purchase-back-link" href="/carrito">
          <ArrowLeft size={15} /> Volver al carrito
        </a>
        <div className="purchase-heading">
          <span className="purchase-kicker">PASO FINAL · CHECKOUT</span>
          <h1>Completa tu compra<span>.</span></h1>
          <p>Tus datos ya están registrados. Revisa el resumen antes de pagar.</p>
        </div>
        <div className="checkout-layout">
          <form
            className="checkout-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setCheckoutError("");
              setIsSubmitting(true);
              try {
                const ticketLines = lines.filter((item) => item.kind !== "product");
                const productLines = lines.filter((item) => item.kind === "product");
                const createdOrder = await createPendingOrder({
                  checkoutKey,
                  lines: ticketLines,
                  products: productLines,
                });
                window.sessionStorage.setItem(`tickeven:checkout:${createdOrder.id}`, checkoutKey);
                const preference = await createMercadoPagoPreference({ orderId: createdOrder.id, checkoutKey });
                window.location.assign(preference.checkout_url);
              } catch (error) {
                setCheckoutError(error instanceof Error ? error.message : "No se pudo guardar la orden.");
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            <section className="checkout-form__section">
              <div className="checkout-form__section-title"><span>1</span><div><h2>Pago seguro</h2><p>Completarás el pago en el sitio seguro de Mercado Pago.</p></div></div>
              <div className="checkout-payment-placeholder"><LockKeyhole size={15} /><span>TickEven no recibe ni almacena los datos de tu tarjeta. Las entradas se emiten después de confirmar el pago.</span></div>
            </section>
            <label className="checkout-terms"><input type="checkbox" required /> <span>Acepto los términos y autorizo el uso de mis datos para gestionar esta orden y sus entradas.</span></label>
            {checkoutError && <p className="checkout-error" role="alert">{checkoutError}</p>}
            <button className="checkout-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Conectando con Mercado Pago…" : "Pagar con Mercado Pago"} <ArrowRight size={16} />
            </button>
            <p className="checkout-secure-note"><ShieldCheck size={14} /> No compartimos datos de pago en este paso.</p>
          </form>

          <aside className="checkout-order">
            <h2>Tu orden</h2>
            <div className="checkout-order__items">
              {lines.map((item) => (
                <div className="checkout-order__item" key={item.id}>
                  <img src={item.image} alt="" />
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.kind === "product" ? `${item.productName}${item.variantName ? ` · ${item.variantName}` : ""}` : item.ticketTypeName} · {item.quantity} × ${money.format(item.ticketPrice)}</span>
                    <span>Administración ({ADMINISTRATION_PERCENTAGE}) · ${money.format(item.administrationFee)} c/u</span>
                    {item.kind === "product" && <span>Retiro en {item.title}</span>}
                    {item.buyer && <span>Comprador: {item.buyer.name} · RUT {item.buyer.rut}</span>}
                    {item.buyer && <span>{item.buyer.email} · {item.buyer.phone}</span>}
                  </div>
                </div>
              ))}
            </div>
            <PurchaseSummary totals={totals} hideAction note="El total final se calcula nuevamente en el servidor." />
            <a className="checkout-order__edit" href="/carrito"><ArrowLeft size={13} /> Editar carrito</a>
          </aside>
        </div>
        <p className="purchase-demo-note">El servidor calcula precios y stock. Los tickets se emitirán solo cuando una pasarela confirme el pago.</p>
      </div>
    </main>
  );
}

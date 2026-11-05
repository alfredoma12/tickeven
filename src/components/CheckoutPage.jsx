import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CreditCard,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { PurchaseSummary } from "./CartPage.jsx";
import { ADMINISTRATION_PERCENTAGE } from "../data/pricing.js";
import { createPendingOrder } from "../data/supabase.js";

const money = new Intl.NumberFormat("es-CL");

export default function CheckoutPage({ lines, totals }) {
  const [order, setOrder] = useState(null);
  const [checkoutError, setCheckoutError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkoutKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    document.title = "Checkout — TickEven.cl";
  }, []);

  if (!lines.length) {
    return (
      <main className="purchase-page">
        <div className="purchase-container">
          <section className="purchase-empty">
            <span><CreditCard size={25} /></span>
            <h1>No hay entradas para pagar</h1>
            <p>Agrega un evento al carrito antes de comenzar el checkout.</p>
            <a href="/">Explorar eventos <ArrowRight size={15} /></a>
          </section>
        </div>
      </main>
    );
  }

  if (order) {
    return (
      <main className="purchase-page">
        <div className="purchase-container">
          <section className="checkout-success">
            <span><Check size={26} /></span>
            <p className="purchase-kicker">ORDEN REGISTRADA · PAGO PENDIENTE</p>
            <h1>Guardamos tu orden<span>.</span></h1>
            <p>Orden <strong>{order.id}</strong> por <strong>${money.format(order.total_clp)}</strong>. Todavía no se realizó ningún cobro ni se emitieron entradas.</p>
            <p>Al integrar una pasarela, el pago confirmado permitirá emitir tus códigos QR y entradas PDF.</p>
            <a href="/">Volver a eventos <ArrowRight size={15} /></a>
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
          <p>Tus datos ya están registrados. Revisa el resumen antes de crear la orden.</p>
        </div>
        <div className="checkout-layout">
          <form
            className="checkout-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setCheckoutError("");
              setIsSubmitting(true);
              try {
                const createdOrder = await createPendingOrder({ checkoutKey, lines });
                setOrder(createdOrder);
              } catch (error) {
                setCheckoutError(error instanceof Error ? error.message : "No se pudo guardar la orden.");
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            <section className="checkout-form__section">
              <div className="checkout-form__section-title"><span>1</span><div><h2>Orden de compra</h2><p>Registra la orden de forma segura para continuar cuando se integre el pago.</p></div></div>
              <div className="checkout-payment-placeholder"><LockKeyhole size={15} /><span>La pasarela aún no está configurada. Este paso no realiza cobros ni emite entradas.</span></div>
            </section>
            <label className="checkout-terms"><input type="checkbox" required /> <span>Acepto los términos y autorizo el uso de mis datos para gestionar esta orden y sus entradas.</span></label>
            {checkoutError && <p className="checkout-error" role="alert">{checkoutError}</p>}
            <button className="checkout-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Guardando orden…" : "Crear orden pendiente"} <ArrowRight size={16} />
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
                    <span>{item.ticketTypeName} · {item.quantity} × ${money.format(item.ticketPrice)}</span>
                    <span>Administración ({ADMINISTRATION_PERCENTAGE}) · ${money.format(item.administrationFee)} c/u</span>
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

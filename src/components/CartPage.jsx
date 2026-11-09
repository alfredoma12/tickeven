import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Minus, Plus, ShoppingBag, Ticket, Trash2, X } from "lucide-react";
import { ADMINISTRATION_PERCENTAGE } from "../data/pricing.js";

const money = new Intl.NumberFormat("es-CL");

function PriceLine({ label, value, strong = false, discount = false }) {
  return (
    <div className={`purchase-summary__line${strong ? " purchase-summary__line--total" : ""}`}>
      <span>{label}</span>
      <strong>{discount ? "−" : ""}${money.format(value)}</strong>
    </div>
  );
}

export function PurchaseSummary({ totals, actionLabel, onAction, disabled = false, note, hideAction = false }) {
  return (
    <section className="purchase-summary" aria-label="Resumen de compra">
      <h2>Resumen de compra</h2>
      <PriceLine label="Entradas" value={totals.ticketSubtotal} />
      {totals.productSubtotal > 0 && <PriceLine label="Productos adicionales" value={totals.productSubtotal} />}
      <PriceLine label={`Administración entradas (${ADMINISTRATION_PERCENTAGE})`} value={totals.ticketAdministrationTotal} />
      {totals.productAdministrationTotal > 0 && <PriceLine label={`Administración productos (${ADMINISTRATION_PERCENTAGE})`} value={totals.productAdministrationTotal} />}
      {totals.discountTotal > 0 && <PriceLine label="Descuento aplicado" value={totals.discountTotal} discount />}
      <PriceLine label="Total" value={totals.total} strong />
      {!hideAction && (
        <button className="purchase-summary__action" type="button" disabled={disabled} onClick={onAction}>
          {actionLabel} <ArrowRight size={16} />
        </button>
      )}
      {note && <p className="purchase-summary__note">{note}</p>}
    </section>
  );
}

export default function CartPage({
  lines,
  totals,
  discountCoupon,
  onApplyDiscount,
  onClearDiscount,
  onUpdateQuantity,
  onRemove,
  onNavigate,
}) {
  const [couponCode, setCouponCode] = useState(discountCoupon?.code ?? "");
  const [couponError, setCouponError] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);

  useEffect(() => {
    document.title = "Tu carrito — TickEven.cl";
  }, []);

  useEffect(() => {
    setCouponCode(discountCoupon?.code ?? "");
  }, [discountCoupon]);

  const applyCoupon = async (event) => {
    event.preventDefault();
    setCouponError("");
    setCouponBusy(true);
    try {
      await onApplyDiscount(couponCode);
    } catch (error) {
      setCouponError(error.message || "No se pudo validar el código.");
    } finally {
      setCouponBusy(false);
    }
  };

  return (
    <main className="purchase-page">
      <div className="purchase-container">
        <a className="purchase-back-link" href="/">
          <ArrowLeft size={15} /> Seguir explorando eventos
        </a>
        <div className="purchase-heading">
          <span className="purchase-kicker">TUS ENTRADAS</span>
          <h1>Tu carrito<span>.</span></h1>
          <p>Revisa el detalle de tus entradas y los costos de administración antes de continuar.</p>
        </div>

        {lines.length ? (
          <div className="cart-layout">
            <section className="cart-lines" aria-label="Entradas seleccionadas">
              {lines.map((item) => (
                <article className="cart-line" key={item.id}>
                  <img src={item.image} alt={item.imageAlt} />
                  <div className="cart-line__content">
                    <span className="cart-line__category">{item.kind === "product" ? `${item.productCategory} · ADICIONAL DEL EVENTO` : `${item.category} · ${item.date} · ${item.time}`}</span>
                    <h2>{item.title}</h2>
                    <p className="cart-line__ticket-type">{item.kind === "product" ? `${item.productName}${item.variantName ? ` · ${item.variantName}` : ""}` : item.ticketTypeName}</p>
                    <p>{item.venue}, {item.city}</p>
                    {item.buyer && <p className="cart-line__buyer">A nombre de {item.buyer.name} · {item.buyer.rut}</p>}
                    {item.buyer && <p className="cart-line__buyer">{item.buyer.email} · {item.buyer.phone}</p>}
                    <div className="cart-line__unit-prices">
                      <span>{item.kind === "product" ? "Producto" : "Entrada"} <strong>${money.format(item.ticketPrice)}</strong></span>
                      <span>Adm. ({ADMINISTRATION_PERCENTAGE}) por unidad <strong>${money.format(item.administrationFee)}</strong></span>
                    </div>
                    <div className="cart-line__controls">
                      <div className="quantity-control" aria-label={`Cantidad de ${item.title}`}>
                        <button
                          type="button"
                          aria-label={`Quitar una entrada de ${item.title}`}
                          onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                        ><Minus size={14} /></button>
                        <span>{item.quantity}</span>
                        <button
                          type="button"
                          aria-label={`Agregar una entrada de ${item.title}`}
                          disabled={item.quantity >= item.maxQuantity}
                          onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                        ><Plus size={14} /></button>
                      </div>
                      <button className="cart-line__remove" type="button" onClick={() => onRemove(item.id)}>
                        <Trash2 size={14} /> Quitar
                      </button>
                    </div>
                  </div>
                  <strong className="cart-line__total">
                    ${money.format((item.ticketPrice + item.administrationFee) * item.quantity)}
                    <small>{item.quantity} × {item.kind === "product" ? "producto" : "entrada"} + administración</small>
                  </strong>
                </article>
              ))}
              <section className="cart-coupon" aria-labelledby="cart-coupon-title">
                <div className="cart-coupon__heading">
                  <span><Ticket size={17} /></span>
                  <div><h2 id="cart-coupon-title">¿Tienes un código de descuento?</h2><p>Los códigos pueden aplicar a las entradas de un evento.</p></div>
                </div>
                <form className="cart-coupon__form" onSubmit={applyCoupon}>
                  <label className="sr-only" htmlFor="cart-discount-code">Código de descuento</label>
                  <input
                    id="cart-discount-code"
                    value={couponCode}
                    maxLength={32}
                    autoCapitalize="characters"
                    autoComplete="off"
                    placeholder="Ingresa tu código"
                    onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
                  />
                  <button type="submit" disabled={couponBusy || !couponCode.trim()}>
                    {couponBusy ? "Validando…" : "Aplicar"}
                  </button>
                </form>
                {couponError && <p className="cart-coupon__error" role="alert">{couponError}</p>}
                {discountCoupon && (
                  <div className="cart-coupon__applied" role="status">
                    <Check size={16} />
                    <span><strong>{discountCoupon.code}</strong> · {discountCoupon.discount_type === "free" ? "Entradas gratis" : `${discountCoupon.discount_percent}% en entradas`}</span>
                    <button type="button" onClick={() => { onClearDiscount(); setCouponError(""); }} aria-label="Quitar código de descuento"><X size={15} /></button>
                  </div>
                )}
              </section>
            </section>
            <PurchaseSummary
              totals={totals}
              actionLabel="Continuar al checkout"
              onAction={() => onNavigate("/checkout")}
              note="El costo de administración se detalla por cada entrada o producto."
            />
          </div>
        ) : (
          <section className="purchase-empty">
            <span><ShoppingBag size={25} /></span>
            <h2>Tu carrito está vacío</h2>
            <p>Explora eventos y agrega tus entradas para continuar.</p>
            <a href="/">Descubrir eventos <ArrowRight size={15} /></a>
          </section>
        )}
        <p className="purchase-demo-note">Al continuar, el servidor valida y reserva el stock durante 20 minutos. El inventario se confirma después del pago.</p>
      </div>
    </main>
  );
}

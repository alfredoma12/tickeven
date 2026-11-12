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

export function PurchaseSummary({
  totals,
  actionLabel,
  onAction,
  disabled = false,
  note,
  hideAction = false,
  discountCoupon,
  onApplyDiscount,
  onClearDiscount,
}) {
  const [couponCode, setCouponCode] = useState(discountCoupon?.code ?? "");
  const [couponError, setCouponError] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);

  useEffect(() => {
    setCouponCode(discountCoupon?.code ?? "");
    setCouponError("");
  }, [discountCoupon]);

  const applyCoupon = async (event) => {
    event.preventDefault();
    setCouponError("");
    setCouponBusy(true);
    try {
      const coupon = await onApplyDiscount(couponCode);
      setCouponCode(coupon.code);
    } catch (error) {
      setCouponError(error.message || "No se pudo validar el código.");
    } finally {
      setCouponBusy(false);
    }
  };

  const clearCoupon = () => {
    onClearDiscount();
    setCouponCode("");
    setCouponError("");
  };

  return (
    <section className="purchase-summary" aria-label="Resumen de compra">
      <h2>Resumen de compra</h2>
      <PriceLine label="Entradas" value={totals.ticketSubtotal} />
      {totals.productSubtotal > 0 && <PriceLine label="Productos adicionales" value={totals.productSubtotal} />}
      <PriceLine label={`Administración entradas (${ADMINISTRATION_PERCENTAGE})`} value={totals.ticketAdministrationTotal} />
      {totals.productAdministrationTotal > 0 && <PriceLine label={`Administración productos (${ADMINISTRATION_PERCENTAGE})`} value={totals.productAdministrationTotal} />}
      {totals.discountTotal > 0 && <PriceLine label={discountCoupon ? `Descuento · ${discountCoupon.code}` : "Descuento aplicado"} value={totals.discountTotal} discount />}
      <PriceLine label="Total" value={totals.total} strong />
      {discountCoupon ? (
        <div className="purchase-summary__coupon purchase-summary__coupon--applied" role="status">
          <div className="purchase-summary__coupon-icon"><Check size={16} /></div>
          <div className="purchase-summary__coupon-copy">
            <strong>Código {discountCoupon.code}</strong>
            <span>{discountCoupon.discount_type === "free"
              ? "Entradas gratis"
              : `${discountCoupon.discount_percent}% de descuento en entradas`}</span>
          </div>
          <button
            className="purchase-summary__coupon-remove"
            type="button"
            onClick={clearCoupon}
            aria-label="Quitar cupón de descuento"
            title="Quitar cupón"
          ><X size={15} /></button>
        </div>
      ) : (
        <form className="purchase-summary__coupon" onSubmit={applyCoupon}>
          <label htmlFor="purchase-summary-coupon">¿Tienes un cupón?</label>
          <p>Los descuentos se aplican a las entradas del evento participante.</p>
          <div className="purchase-summary__coupon-entry">
            <Ticket size={16} aria-hidden="true" />
            <input
              id="purchase-summary-coupon"
              value={couponCode}
              maxLength={32}
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="Ingresa tu código"
              onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
            />
            <button type="submit" disabled={couponBusy || !couponCode.trim()}>
              {couponBusy ? "…" : "Aplicar"}
            </button>
          </div>
          {couponError && <p className="purchase-summary__coupon-error" role="alert">{couponError}</p>}
        </form>
      )}
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
  useEffect(() => {
    document.title = "Tu carrito — TickEven.cl";
  }, []);

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
                    {item.kind !== "product" && item.attendees?.length > 1 && (
                      <p className="cart-line__buyer">
                        Otras personas: {item.attendees.slice(1).map((attendee) => `${attendee.name} · ${attendee.rut}`).join(", ")}
                      </p>
                    )}
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
                          disabled={item.quantity >= Math.min(item.maxQuantity, item.attendees?.length ?? item.quantity)}
                          onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                        ><Plus size={14} /></button>
                      </div>
                      {item.kind !== "product" && item.quantity >= Math.min(item.maxQuantity, item.attendees?.length ?? item.quantity) && (
                        <small className="cart-line__attendee-note">Para sumar entradas, vuelve al evento e ingresa sus titulares.</small>
                      )}
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
            </section>
            <PurchaseSummary
              totals={totals}
              actionLabel="Continuar al checkout"
              onAction={() => onNavigate("/checkout")}
              note="El costo de administración se detalla por cada entrada o producto."
              discountCoupon={discountCoupon}
              onApplyDiscount={onApplyDiscount}
              onClearDiscount={onClearDiscount}
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

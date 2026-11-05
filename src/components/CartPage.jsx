import { useEffect } from "react";
import { ArrowLeft, ArrowRight, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { ADMINISTRATION_PERCENTAGE } from "../data/pricing.js";

const money = new Intl.NumberFormat("es-CL");

function PriceLine({ label, value, strong = false }) {
  return (
    <div className={`purchase-summary__line${strong ? " purchase-summary__line--total" : ""}`}>
      <span>{label}</span>
      <strong>${money.format(value)}</strong>
    </div>
  );
}

export function PurchaseSummary({ totals, actionLabel, onAction, disabled = false, note, hideAction = false }) {
  return (
    <section className="purchase-summary" aria-label="Resumen de compra">
      <h2>Resumen de compra</h2>
      <PriceLine label="Entradas" value={totals.ticketSubtotal} />
      <PriceLine label={`Administración (${ADMINISTRATION_PERCENTAGE})`} value={totals.administrationTotal} />
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

export default function CartPage({ lines, totals, onUpdateQuantity, onRemove, onNavigate }) {
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
                    <span className="cart-line__category">{item.category} · {item.date} · {item.time}</span>
                    <h2>{item.title}</h2>
                    <p className="cart-line__ticket-type">{item.ticketTypeName}</p>
                    <p>{item.venue}, {item.city}</p>
                    {item.buyer && <p className="cart-line__buyer">A nombre de {item.buyer.name} · {item.buyer.rut}</p>}
                    {item.buyer && <p className="cart-line__buyer">{item.buyer.email} · {item.buyer.phone}</p>}
                    <div className="cart-line__unit-prices">
                      <span>Entrada <strong>${money.format(item.ticketPrice)}</strong></span>
                      <span>Adm. ({ADMINISTRATION_PERCENTAGE}) por entrada <strong>${money.format(item.administrationFee)}</strong></span>
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
                    <small>{item.quantity} × entrada + administración</small>
                  </strong>
                </article>
              ))}
            </section>
            <PurchaseSummary
              totals={totals}
              actionLabel="Continuar al checkout"
              onAction={() => onNavigate("/checkout")}
              note="El costo de administración se detalla por cada entrada."
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
        <p className="purchase-demo-note">El carrito dura mientras navegas por TickEven; al continuar, la orden queda registrada en Supabase. El pago se habilitará al integrar una pasarela.</p>
      </div>
    </main>
  );
}

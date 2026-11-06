import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  MapPin,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Ticket,
  UserRound,
} from "lucide-react";
import { ADMINISTRATION_PERCENTAGE, getAdministrationFee } from "../data/pricing.js";

const money = new Intl.NumberFormat("es-CL");

function isValidRut(value) {
  const rut = value.replace(/[.\s-]/g, "").toUpperCase();
  if (!/^\d{7,8}[0-9K]$/.test(rut)) return false;

  const body = rut.slice(0, -1);
  const providedDigit = rut.slice(-1);
  let multiplier = 2;
  let sum = 0;

  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);
  const expectedDigit = remainder === 11 ? "0" : remainder === 10 ? "K" : String(remainder);
  return providedDigit === expectedDigit;
}

function formatRut(value) {
  const rut = value.replace(/[.\s-]/g, "").toUpperCase();
  const body = rut.slice(0, -1);
  const digit = rut.slice(-1);
  if (!body || !digit) return value;
  return `${Number(body).toLocaleString("es-CL")}-${digit}`;
}

function NotFound() {
  return (
    <main className="event-detail-page">
      <section className="event-detail-not-found">
        <Ticket size={30} />
        <h1>No encontramos este evento</h1>
        <p>Puede que el enlace haya cambiado o que el evento ya no esté disponible.</p>
        <a href="/">Volver a explorar eventos <ArrowRight size={16} /></a>
      </section>
    </main>
  );
}

export default function EventDetailPage({ event, cartCount, onAddToCart, onFreeRegister, onNavigate }) {
  const [selectedImage, setSelectedImage] = useState(event?.image ?? "");
  const [quantities, setQuantities] = useState({});
  const [buyerFormOpen, setBuyerFormOpen] = useState(false);
  const [rut, setRut] = useState("");
  const [rutError, setRutError] = useState("");
  const [registrationError, setRegistrationError] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const buyerFormRef = useRef(null);

  useEffect(() => {
    if (!event) return undefined;
    document.title = `${event.title} — TickEven.cl`;
    return () => {
      document.title = "TickEven.cl — Encuentra tu próximo plan";
    };
  }, [event]);

  useEffect(() => {
    if (buyerFormOpen) buyerFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [buyerFormOpen]);

  const selectedTickets = useMemo(
    () => event?.ticketTypes.flatMap((ticketType) => {
      const quantity = quantities[ticketType.id] ?? 0;
      return quantity ? [{ ...ticketType, quantity }] : [];
    }) ?? [],
    [event, quantities],
  );
  const ticketCount = selectedTickets.reduce((sum, ticketType) => sum + ticketType.quantity, 0);
  const ticketSubtotal = selectedTickets.reduce((sum, ticketType) => sum + ticketType.price * ticketType.quantity, 0);
  const isFreeSelection = selectedTickets.length > 0 && selectedTickets.every((ticketType) => ticketType.price === 0);
  const administrationTotal = selectedTickets.reduce(
    (sum, ticketType) => sum + getAdministrationFee(ticketType.price) * ticketType.quantity,
    0,
  );

  if (!event) return <NotFound />;

  const changeQuantity = (ticketType, change) => {
    setQuantities((current) => {
      const quantity = current[ticketType.id] ?? 0;
      const nextQuantity = Math.max(0, Math.min(ticketType.available, 10, quantity + change));
      return { ...current, [ticketType.id]: nextQuantity };
    });
  };

  const submitBuyerDetails = async (formEvent) => {
    formEvent.preventDefault();
    const formData = new FormData(formEvent.currentTarget);
    const buyer = {
      name: String(formData.get("name")).trim(),
      rut: rut.trim(),
      email: String(formData.get("email")).trim(),
      phone: String(formData.get("phone")).trim(),
    };

    if (!isValidRut(buyer.rut)) {
      setRutError("Ingresa un RUT chileno válido.");
      return;
    }

    setRutError("");
    setRegistrationError("");
    if (isFreeSelection) {
      setIsRegistering(true);
      try {
        await onFreeRegister(event, selectedTickets, buyer);
      } catch (error) {
        console.error("No se pudo completar la inscripción gratuita.", error);
        setRegistrationError(error.message || "No se pudo completar la inscripción gratuita. Inténtalo otra vez.");
      } finally {
        setIsRegistering(false);
      }
      return;
    }
    onAddToCart(event, selectedTickets, buyer);
    onNavigate("/carrito");
  };

  const gallery = [...new Set([event.image, ...event.gallery])];

  return (
    <div className="event-detail-shell">
      <header className="event-detail-header">
        <nav className="event-detail-header__inner" aria-label="Navegación del evento">
          <a className="brand" href="/" aria-label="TickEven.cl, inicio">
            <span className="brand__mark"><Ticket size={21} strokeWidth={2.5} /></span>
            <span>tickeven<span className="brand__dot">.</span>cl</span>
          </a>
          <a className="event-detail-header__back" href="/"><ArrowLeft size={15} /> Explorar eventos</a>
          <a className="cart-button event-detail-header__cart" href="/carrito" aria-label={`Carrito, ${cartCount} entradas`}>
            <ShoppingBag size={18} /><span>Carrito</span>
            {cartCount > 0 && <span className="cart-button__count">{cartCount}</span>}
          </a>
        </nav>
      </header>

      <main className="event-detail-page">
        <div className="event-detail-container">
          <a className="event-detail-breadcrumb" href="/"><ArrowLeft size={14} /> Todos los eventos <span>/</span> {event.category}</a>
          <section className="event-detail-overview" aria-labelledby="event-title">
            <div className="event-detail-gallery">
              <div className="event-detail-gallery__main">
                <img src={selectedImage} alt={event.imageAlt} />
                <span className={`event-card__category event-card__category--${event.color}`}>{event.category}</span>
                <span className="event-detail-gallery__counter">{gallery.indexOf(selectedImage) + 1} / {gallery.length}</span>
              </div>
              <div className="event-detail-gallery__thumbs" aria-label="Fotos del evento">
                {gallery.map((image, index) => (
                  <button
                    className={selectedImage === image ? "is-selected" : ""}
                    key={image}
                    type="button"
                    aria-label={`Ver foto ${index + 1} de ${event.title}`}
                    aria-pressed={selectedImage === image}
                    onClick={() => setSelectedImage(image)}
                  >
                    <img src={image} alt="" />
                  </button>
                ))}
              </div>
            </div>

            <div className="event-detail-copy">
              <span className="event-detail-eyebrow">{event.category} <span>·</span> TICKEVEN SELECCIÓN</span>
              <h1 id="event-title">{event.title}</h1>
              <div className="event-detail-meta">
                <span><CalendarDays size={17} /> {event.date} · {event.time} hrs</span>
                <span><MapPin size={17} /> {event.venue}, {event.city}</span>
              </div>
              <p>{event.description}</p>
              <div className="event-detail-copy__note"><ShieldCheck size={16} /> Entradas digitales · Compra segura</div>
            </div>
          </section>

          <div className="event-detail-layout">
            <section className="event-ticket-section" aria-labelledby="ticket-options-title">
              <div className="event-detail-section-heading">
                <div>
                  <span className="event-detail-step">01 · SELECCIÓN</span>
                  <h2 id="ticket-options-title">Elige tus entradas</h2>
                </div>
                <span>Máximo 10 por tipo</span>
              </div>
              <div className="event-ticket-list">
                {event.ticketTypes.map((ticketType) => {
                  const quantity = quantities[ticketType.id] ?? 0;
                  const soldOut = ticketType.available === 0;
                  return (
                    <article className={`event-ticket-option${quantity ? " is-selected" : ""}`} key={ticketType.id}>
                      <div className="event-ticket-option__details">
                        <span className="event-ticket-option__icon"><Ticket size={17} /></span>
                        <div>
                          <h3>{ticketType.name}</h3>
                          {ticketType.description && <p>{ticketType.description}</p>}
                          <span className={`event-ticket-option__availability${ticketType.available < 50 && !soldOut ? " is-low" : ""}`}>
                            {soldOut ? "Agotadas" : `${ticketType.available} disponibles`}
                          </span>
                        </div>
                      </div>
                      <div className="event-ticket-option__purchase">
                        <div>
                          <strong>{ticketType.price === 0 ? "Gratis" : `$${money.format(ticketType.price)}`}</strong>
                          <span>{ticketType.price === 0 ? "Sin cargo de administración" : `+ $${money.format(getAdministrationFee(ticketType.price))} administración (${ADMINISTRATION_PERCENTAGE})`}</span>
                        </div>
                        <div className="quantity-control" aria-label={`Cantidad de ${ticketType.name}`}>
                          <button
                            type="button"
                            aria-label={`Quitar una ${ticketType.name}`}
                            disabled={quantity === 0}
                            onClick={() => changeQuantity(ticketType, -1)}
                          ><Minus size={14} /></button>
                          <span>{quantity}</span>
                          <button
                            type="button"
                            aria-label={`Agregar una ${ticketType.name}`}
                            disabled={soldOut || quantity >= Math.min(10, ticketType.available)}
                            onClick={() => changeQuantity(ticketType, 1)}
                          ><Plus size={14} /></button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="event-about-card">
                <span className="event-detail-step">SOBRE EL EVENTO</span>
                <h2>Una experiencia para recordar</h2>
                <p>{event.description}</p>
                <div><CalendarDays size={16} /><span>{event.date} · {event.time} hrs</span></div>
                <div><MapPin size={16} /><span>{event.venue}, {event.city}</span></div>
              </div>

              {buyerFormOpen && (
                <section className="event-buyer-card" ref={buyerFormRef} aria-labelledby="buyer-title">
                  <div className="event-detail-section-heading">
                    <div>
                      <span className="event-detail-step">02 · TUS DATOS</span>
                      <h2 id="buyer-title">¿A quién enviamos las entradas?</h2>
                    </div>
                    <UserRound size={20} />
                  </div>
                  <p>{isFreeSelection
                    ? "Al confirmar, emitiremos tus entradas gratuitas al instante. No necesitas carrito ni pasar por Mercado Pago."
                    : "Al continuar, guardaremos tus datos para preparar la compra y redirigirte al carrito."}</p>
                  <form className="event-buyer-form" onSubmit={submitBuyerDetails}>
                    <label>Nombre y apellido
                      <input name="name" autoComplete="name" placeholder="Como aparece en tu documento" required />
                    </label>
                    <label>RUT
                      <input
                        name="rut"
                        autoComplete="off"
                        placeholder="12.345.678-9"
                        value={rut}
                        aria-invalid={Boolean(rutError)}
                        aria-describedby={rutError ? "event-rut-error" : undefined}
                        onChange={(inputEvent) => { setRut(inputEvent.target.value); setRutError(""); }}
                        onBlur={() => setRut((current) => formatRut(current))}
                        required
                      />
                      {rutError && <span className="event-buyer-form__error" id="event-rut-error">{rutError}</span>}
                    </label>
                    <label>Correo electrónico
                      <input name="email" type="email" autoComplete="email" placeholder="tu@correo.cl" required />
                    </label>
                    <label>Teléfono
                      <input name="phone" type="tel" autoComplete="tel" placeholder="+56 9 1234 5678" required />
                    </label>
                    <label className="event-buyer-form__terms">
                      <input type="checkbox" required />
                      <span>{isFreeSelection
                        ? "Acepto los términos y autorizo el uso de mis datos para gestionar esta inscripción y sus entradas."
                        : "Acepto los términos y autorizo el uso de mis datos para preparar la compra y sus entradas."}</span>
                    </label>
                    {registrationError && <p className="event-buyer-form__error" role="alert">{registrationError}</p>}
                    <button className="event-buyer-form__submit" type="submit" disabled={isRegistering}>
                      {isRegistering
                        ? "Preparando tus entradas…"
                        : isFreeSelection ? "Confirmar inscripción gratuita" : "Guardar datos y continuar"} <ArrowRight size={17} />
                    </button>
                  </form>
                </section>
              )}
            </section>

            <aside className="event-order-card" aria-label="Resumen de entradas seleccionadas">
              <span className="event-detail-step">TU SELECCIÓN</span>
              <h2>Resumen de entradas</h2>
              {selectedTickets.length ? (
                <div className="event-order-card__items">
                  {selectedTickets.map((ticketType) => (
                    <div className="event-order-card__item" key={ticketType.id}>
                      <span>{ticketType.quantity} × {ticketType.name}</span>
                      <strong>{ticketType.price === 0 ? "Gratis" : `$${money.format(ticketType.price * ticketType.quantity)}`}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="event-order-card__empty">Selecciona un tipo de entrada para ver el detalle.</p>
              )}
              <div className="event-order-card__totals">
                <div><span>Entradas · {ticketCount}</span><strong>${money.format(ticketSubtotal)}</strong></div>
                <div><span>{isFreeSelection ? "Administración" : `Administración (${ADMINISTRATION_PERCENTAGE})`}</span><strong>{isFreeSelection ? "Sin cargo" : `$${money.format(administrationTotal)}`}</strong></div>
                <div className="event-order-card__total"><span>Total</span><strong>${money.format(ticketSubtotal + administrationTotal)}</strong></div>
              </div>
              {!buyerFormOpen ? (
                <button
                  className="event-order-card__continue"
                  type="button"
                  disabled={!ticketCount}
                  onClick={() => setBuyerFormOpen(true)}
                >
                  {isFreeSelection ? "Inscribirme gratis" : "Continuar"} <ArrowRight size={16} />
                </button>
              ) : (
                <button
                  className="event-order-card__continue event-order-card__continue--edit"
                  type="button"
                  onClick={() => setBuyerFormOpen(false)}
                >
                  Editar entradas <ArrowLeft size={15} />
                </button>
              )}
              <p className="event-order-card__secure"><Check size={14} /> {isFreeSelection ? "Inscripción gratuita · Sin Mercado Pago" : "No se realizará ningún cobro todavía."}</p>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}

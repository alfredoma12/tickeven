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
import Brand from "./Brand.jsx";

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
  const [productQuantities, setProductQuantities] = useState({});
  const [productVariants, setProductVariants] = useState({});
  const [buyerFormOpen, setBuyerFormOpen] = useState(false);
  const [buyerDetails, setBuyerDetails] = useState(null);
  const [activePurchaseTab, setActivePurchaseTab] = useState("tickets");
  const [rut, setRut] = useState("");
  const [rutError, setRutError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [attendeeErrors, setAttendeeErrors] = useState({});
  const [registrationError, setRegistrationError] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const buyerFormRef = useRef(null);
  const productsSectionRef = useRef(null);

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

  useEffect(() => {
    if (buyerDetails && activePurchaseTab === "products") {
      productsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [buyerDetails, activePurchaseTab]);

  const selectedTickets = useMemo(
    () => event?.ticketTypes.flatMap((ticketType) => {
      const quantity = quantities[ticketType.id] ?? 0;
      return quantity ? [{ ...ticketType, quantity }] : [];
    }) ?? [],
    [event, quantities],
  );
  const ticketCount = selectedTickets.reduce((sum, ticketType) => sum + ticketType.quantity, 0);
  const additionalAttendeeTypes = selectedTickets.flatMap((ticketType) =>
    Array.from({ length: ticketType.quantity }, () => ticketType.name),
  ).slice(1);
  const ticketSubtotal = selectedTickets.reduce((sum, ticketType) => sum + ticketType.price * ticketType.quantity, 0);
  const selectedProducts = useMemo(() => (event?.products ?? []).flatMap((product) => {
    const variants = product.variants.filter((variant) => variant.id);
    const choices = variants.length ? variants : [{ id: null, name: "", available: product.available }];
    return choices.flatMap((variant) => {
      const quantity = productQuantities[`${product.id}:${variant.id ?? ""}`] ?? 0;
      return quantity ? [{
        ...product,
        variantId: variant.id,
        variantName: variant.name,
        quantity,
      }] : [];
    });
  }), [event, productQuantities]);
  const productCount = selectedProducts.reduce((sum, product) => sum + product.quantity, 0);
  const productSubtotal = selectedProducts.reduce((sum, product) => sum + product.price * product.quantity, 0);
  const productAdministrationTotal = selectedProducts.reduce(
    (sum, product) => sum + getAdministrationFee(product.price) * product.quantity,
    0,
  );
  const isFreeSelection = selectedTickets.length > 0 && selectedTickets.every((ticketType) => ticketType.price === 0);
  const administrationTotal = selectedTickets.reduce(
    (sum, ticketType) => sum + getAdministrationFee(ticketType.price) * ticketType.quantity,
    0,
  );

  if (!event) return <NotFound />;
  const eventProducts = event.products ?? [];

  const changeQuantity = (ticketType, change) => {
    setQuantities((current) => {
      const quantity = current[ticketType.id] ?? 0;
      const nextQuantity = Math.max(0, Math.min(ticketType.available, 10, quantity + change));
      return { ...current, [ticketType.id]: nextQuantity };
    });
  };

  const changeProductQuantity = (product, variant, change) => {
    const key = `${product.id}:${variant?.id ?? ""}`;
    setProductQuantities((current) => {
      const quantity = current[key] ?? 0;
      const nextQuantity = Math.max(0, Math.min(variant?.available ?? product.available, 10, quantity + change));
      return { ...current, [key]: nextQuantity };
    });
  };

  const completePurchase = async (purchase) => {
    if (isFreeSelection && selectedProducts.length === 0) {
      setIsRegistering(true);
      try {
        await onFreeRegister(event, purchase.tickets, purchase.buyer);
      } catch (error) {
        console.error("No se pudo completar la inscripción gratuita.", error);
        setRegistrationError(error.message || "No se pudo completar la inscripción gratuita. Inténtalo otra vez.");
      } finally {
        setIsRegistering(false);
      }
      return;
    }
    onAddToCart(event, purchase.tickets, purchase.buyer, selectedProducts);
    onNavigate("/carrito");
  };

  const submitBuyerDetails = async (formEvent) => {
    formEvent.preventDefault();
    const formData = new FormData(formEvent.currentTarget);
    const email = String(formData.get("email")).trim();
    const confirmEmail = String(formData.get("confirmEmail")).trim();
    if (email.toLocaleLowerCase("es") !== confirmEmail.toLocaleLowerCase("es")) {
      setEmailError("Los correos electrónicos no coinciden.");
      return;
    }

    const buyer = {
      name: String(formData.get("name")).trim(),
      rut: rut.trim(),
      email,
      phone: String(formData.get("phone")).trim(),
    };

    const additionalAttendees = additionalAttendeeTypes.map((_, index) => ({
      name: String(formData.getAll("attendeeName")[index] ?? "").trim(),
      rut: String(formData.getAll("attendeeRut")[index] ?? "").trim(),
    }));
    const nextAttendeeErrors = {};
    additionalAttendees.forEach((attendee, index) => {
      const errors = {};
      if (attendee.name.length < 2 || attendee.name.length > 120) {
        errors.name = "Ingresa un nombre de al menos 2 caracteres.";
      }
      if (!isValidRut(attendee.rut)) {
        errors.rut = "Ingresa un RUT chileno válido.";
      }
      if (Object.keys(errors).length) nextAttendeeErrors[index] = errors;
    });
    setAttendeeErrors(nextAttendeeErrors);
    if (Object.keys(nextAttendeeErrors).length) return;

    const attendeeDetails = [{ name: buyer.name, rut: buyer.rut }, ...additionalAttendees];
    let attendeeIndex = 0;
    const ticketsWithAttendees = selectedTickets.map((ticketType) => ({
      ...ticketType,
      attendees: Array.from({ length: ticketType.quantity }, () => attendeeDetails[attendeeIndex++]),
    }));

    setEmailError("");
    if (!isValidRut(buyer.rut)) {
      setRutError("Ingresa un RUT chileno válido.");
      return;
    }

    setRutError("");
    setRegistrationError("");
    const purchase = { buyer, tickets: ticketsWithAttendees };
    if (eventProducts.some((product) => product.showOnEventPage || product.showInCheckout)) {
      setBuyerDetails(purchase);
      setBuyerFormOpen(false);
      setActivePurchaseTab("products");
      return;
    }
    await completePurchase(purchase);
  };

  const gallery = [...new Set([event.image, ...event.gallery])];

  if (event.isExample) {
    return (
      <div className="event-detail-shell">
        <header className="event-detail-header">
          <nav className="event-detail-header__inner" aria-label="Navegación del evento">
            <Brand />
            <a className="event-detail-header__back" href="/"><ArrowLeft size={15} /> Explorar eventos</a>
          </nav>
        </header>
        <main className="event-detail-page">
          <div className="event-detail-container">
            <div className="event-example-preview__notice" role="status">
              <ShieldCheck size={18} />
              <span>Vista de demostración. Este evento no es real y no está disponible para compra.</span>
            </div>
            <section className="event-example-preview">
              <img src={event.image} alt={event.imageAlt} />
              <div className="event-example-preview__content">
                <span className="event-detail-eyebrow">{event.category} <span>·</span> EVENTO DE EJEMPLO</span>
                <h1>{event.title}</h1>
                <div className="event-detail-meta">
                  <span><CalendarDays size={17} /> Fecha y hora por definir</span>
                  <span><MapPin size={17} /> Tu recinto, tu ciudad</span>
                </div>
                <p>{event.description}</p>
                <div className="event-example-preview__ticket">
                  <Ticket size={18} />
                  <div><strong>Tipos de entrada</strong><span>Se mostrarán aquí cuando publiques tu evento.</span></div>
                  <span>No disponible</span>
                </div>
                <a className="event-example-preview__cta" href="/productores">
                  Publica tu evento en TickEven <ArrowRight size={16} />
                </a>
              </div>
            </section>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="event-detail-shell">
      <header className="event-detail-header">
        <nav className="event-detail-header__inner" aria-label="Navegación del evento">
          <Brand />
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
              <div className={`event-inventory-summary${event.ticketsAvailable === 0 ? " is-sold-out" : ""}`}>
                <Ticket size={16} />
                <span>{event.ticketsAvailable === 0
                  ? "ENTRADAS AGOTADAS"
                  : event.ticketsAvailable <= Math.max(10, Math.ceil(event.ticketCapacity * 0.1))
                    ? `¡Últimas entradas disponibles! ${event.ticketsAvailable} restantes`
                    : `¡${money.format(event.ticketsAvailable)} entradas disponibles!`}</span>
              </div>
            </div>
          </section>

          <div className="event-detail-layout">
            <section className="event-ticket-section" aria-label="Selección de entradas o productos adicionales">
              <div className="event-purchase-tabs" role="tablist" aria-label="Tipo de compra">
                <button
                  id="event-tickets-tab"
                  className={activePurchaseTab === "tickets" ? "is-active" : ""}
                  type="button"
                  role="tab"
                  aria-selected={activePurchaseTab === "tickets"}
                  aria-controls="event-tickets-panel"
                  disabled={buyerFormOpen || Boolean(buyerDetails)}
                  onClick={() => setActivePurchaseTab("tickets")}
                ><Ticket size={15} /> Entradas{ticketCount > 0 && <span>{ticketCount}</span>}</button>
                <button
                  id="event-products-tab"
                  className={activePurchaseTab === "products" ? "is-active" : ""}
                  type="button"
                  role="tab"
                  aria-selected={activePurchaseTab === "products"}
                  aria-controls="event-products-panel"
                  disabled={buyerFormOpen}
                  onClick={() => setActivePurchaseTab("products")}
                ><ShoppingBag size={15} /> Productos adicionales{productCount > 0 && <span>{productCount}</span>}</button>
              </div>
              {activePurchaseTab === "tickets" ? (
                <div id="event-tickets-panel" role="tabpanel" aria-labelledby="event-tickets-tab">
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
                </div>
              ) : (
                <section className="event-products-section" id="event-products-panel" ref={productsSectionRef} role="tabpanel" aria-labelledby="event-products-tab">
                  <div className="event-detail-section-heading">
                    <div>
                      <span className="event-detail-step">{buyerDetails ? "03 · PRODUCTOS ADICIONALES" : "PRODUCTOS DEL EVENTO"}</span>
                      <h2>Productos adicionales</h2>
                    </div>
                    <ShoppingBag size={20} />
                  </div>
                  {eventProducts.some((product) => product.showOnEventPage || product.showInCheckout) ? (
                    <div className="event-products-grid">
                      {eventProducts.filter((product) => product.showOnEventPage || product.showInCheckout).map((product) => {
                        const variants = product.variants.filter((variant) => variant.id);
                        const selectedVariantId = productVariants[product.id] ?? variants[0]?.id ?? "";
                        const selectedVariant = variants.find((variant) => variant.id === selectedVariantId);
                        const available = selectedVariant?.available ?? product.available;
                        const quantityKey = `${product.id}:${selectedVariant?.id ?? ""}`;
                        const quantity = productQuantities[quantityKey] ?? 0;
                        return (
                          <article className="event-product-card" key={product.id}>
                            {product.image
                              ? <img src={product.image} alt={product.name} loading="lazy" />
                              : <div className="event-product-card__image-placeholder"><ShoppingBag size={22} /></div>}
                            <div className="event-product-card__content">
                              <span>{product.category || "PRODUCTO DEL EVENTO"}</span>
                              <h3>{product.name}</h3>
                              {product.description && <p>{product.description}</p>}
                              <strong>${money.format(product.price)} <small>+ ${money.format(getAdministrationFee(product.price))} administración</small></strong>
                              {variants.length > 0 && (
                                <label>Opción
                                  <select value={selectedVariantId} onChange={(changeEvent) => setProductVariants((current) => ({ ...current, [product.id]: changeEvent.target.value }))}>
                                    {variants.map((variant) => <option value={variant.id} key={variant.id}>{variant.name} · {variant.available} disponibles</option>)}
                                  </select>
                                </label>
                              )}
                              <div className="event-product-card__footer">
                                <span className={`event-product-card__availability${available === 0 ? " is-sold-out" : available <= 5 ? " is-low" : ""}`}>
                                  {available === 0 ? "AGOTADO" : available <= 5 ? `Últimas unidades · ${available}` : `${available} disponibles`}
                                </span>
                                <div className="quantity-control" aria-label={`Cantidad de ${product.name}`}>
                                  <button type="button" aria-label={`Quitar una unidad de ${product.name}`} disabled={!available || quantity === 0} onClick={() => changeProductQuantity(product, selectedVariant, -1)}><Minus size={14} /></button>
                                  <span>{quantity}</span>
                                  <button type="button" aria-label={`Agregar una unidad de ${product.name}`} disabled={!available || quantity >= Math.min(10, available)} onClick={() => changeProductQuantity(product, selectedVariant, 1)}><Plus size={14} /></button>
                                </div>
                              </div>
                              {quantity > 0 && <small className="event-product-card__hint">Retiro en el evento.</small>}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="event-products-empty">Este evento aún no tiene productos adicionales disponibles.</p>
                  )}
                </section>
              )}
            </section>

            <aside className="event-order-card" aria-label="Resumen de entradas seleccionadas">
              <span className="event-detail-step">TU SELECCIÓN</span>
              <h2>Resumen de compra</h2>
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
                <p className="event-order-card__empty">{productCount ? "Tu selección de adicionales:" : "Selecciona entradas o productos para ver el detalle."}</p>
              )}
              {selectedProducts.length > 0 && <div className="event-order-card__items event-order-card__items--products">
                <span className="event-detail-step">PRODUCTOS ADICIONALES</span>
                {selectedProducts.map((product) => (
                  <div className="event-order-card__item" key={`${product.id}:${product.variantId ?? "default"}`}>
                    <span>{product.quantity} × {product.name}{product.variantName ? ` · ${product.variantName}` : ""}</span>
                    <strong>${money.format(product.price * product.quantity)}</strong>
                  </div>
                ))}
              </div>}
              <div className="event-order-card__totals">
                <div><span>Entradas · {ticketCount}</span><strong>${money.format(ticketSubtotal)}</strong></div>
                {productCount > 0 && <div><span>Productos · {productCount}</span><strong>${money.format(productSubtotal)}</strong></div>}
                <div><span>Administración ({ADMINISTRATION_PERCENTAGE})</span><strong>${money.format(administrationTotal + productAdministrationTotal)}</strong></div>
                <div className="event-order-card__total"><span>Total</span><strong>${money.format(ticketSubtotal + administrationTotal + productSubtotal + productAdministrationTotal)}</strong></div>
              </div>
              {buyerFormOpen ? (
                <button
                  className="event-order-card__continue event-order-card__continue--edit"
                  type="button"
                  onClick={() => setBuyerFormOpen(false)}
                >
                  Volver al resumen <ArrowLeft size={15} />
                </button>
              ) : buyerDetails ? (
                <button
                  className="event-order-card__continue"
                  type="button"
                  disabled={isRegistering}
                  onClick={() => void completePurchase(buyerDetails)}
                >
                  {isRegistering
                    ? "Preparando tus entradas…"
                    : isFreeSelection && !productCount ? "Confirmar inscripción gratuita" : "Continuar al carrito"} <ArrowRight size={16} />
                </button>
              ) : (
                <button
                  className="event-order-card__continue"
                  type="button"
                  disabled={!ticketCount && !productCount}
                  onClick={() => setBuyerFormOpen(true)}
                >
                  {isFreeSelection && !productCount ? "Inscribirme gratis" : productCount && !ticketCount ? "Comprar productos" : "Continuar"} <ArrowRight size={16} />
                </button>
              )}
              <p className="event-order-card__secure"><Check size={14} /> {isFreeSelection && !productCount ? "Inscripción gratuita · Sin Mercado Pago" : "Compra única · productos asociados al evento."}</p>
            </aside>

            {buyerFormOpen && (
              <section className="event-buyer-card" ref={buyerFormRef} aria-labelledby="buyer-title">
                <div className="event-detail-section-heading">
                  <div>
                    <span className="event-detail-step">02 · TUS DATOS</span>
                    <h2 id="buyer-title">{ticketCount ? "¿A quién enviamos las entradas?" : "¿A quién preparamos tu compra?"}</h2>
                  </div>
                  <UserRound size={20} />
                </div>
                <p>{isFreeSelection && !productCount
                  ? "Al confirmar, emitiremos tus entradas gratuitas al instante. No necesitas carrito ni pasar por Mercado Pago."
                  : "Al continuar, guardaremos tus datos para preparar tu compra. Los productos se retiran en el evento."}</p>
                <form className="event-buyer-form" onSubmit={submitBuyerDetails}>
                  <label>Nombre y apellido
                    <input name="name" autoComplete="name" defaultValue={buyerDetails?.buyer.name ?? ""} placeholder="Como aparece en tu documento" required />
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
                    <input
                      id="event-buyer-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      defaultValue={buyerDetails?.buyer.email ?? ""}
                      placeholder="tu@correo.cl"
                      aria-invalid={Boolean(emailError)}
                      aria-describedby={emailError ? "event-email-error" : undefined}
                      onChange={() => setEmailError("")}
                      required
                    />
                  </label>
                  <label>Confirma tu correo electrónico
                    <input
                      id="event-buyer-confirm-email"
                      name="confirmEmail"
                      type="email"
                      autoComplete="email"
                      defaultValue={buyerDetails?.buyer.email ?? ""}
                      placeholder="Repite tu correo"
                      aria-invalid={Boolean(emailError)}
                      aria-describedby={emailError ? "event-email-error" : undefined}
                      onChange={() => setEmailError("")}
                      required
                    />
                    {emailError && <span className="event-buyer-form__error" id="event-email-error">{emailError}</span>}
                  </label>
                  <label>Teléfono
                    <input name="phone" type="tel" autoComplete="tel" defaultValue={buyerDetails?.buyer.phone ?? ""} placeholder="+56 9 1234 5678" required />
                  </label>
                  {additionalAttendeeTypes.length > 0 && (
                    <div className="event-buyer-form__attendees">
                      <div className="event-buyer-form__attendees-heading">
                        <strong>Otras personas</strong>
                        <span>El comprador queda como titular de la primera entrada. Todas las entradas llegarán a su correo.</span>
                      </div>
                      {additionalAttendeeTypes.map((ticketTypeName, index) => (
                        <fieldset className="event-buyer-form__attendee" key={`${ticketTypeName}-${index}`}>
                          <legend>Entrada {index + 2} · {ticketTypeName}</legend>
                          <label>Nombre y apellido
                            <input
                              name="attendeeName"
                              autoComplete="name"
                              defaultValue={buyerDetails?.tickets.flatMap((ticketType) => ticketType.attendees ?? []).slice(1)[index]?.name ?? ""}
                              maxLength={120}
                              placeholder="Nombre de quien usará la entrada"
                              aria-invalid={Boolean(attendeeErrors[index]?.name)}
                              aria-describedby={attendeeErrors[index]?.name ? `attendee-name-error-${index}` : undefined}
                              onChange={() => setAttendeeErrors((current) => ({
                                ...current,
                                [index]: { ...current[index], name: "" },
                              }))}
                              required
                            />
                            {attendeeErrors[index]?.name && <span className="event-buyer-form__error" id={`attendee-name-error-${index}`}>{attendeeErrors[index].name}</span>}
                          </label>
                          <label>RUT
                            <input
                              name="attendeeRut"
                              autoComplete="off"
                              defaultValue={buyerDetails?.tickets.flatMap((ticketType) => ticketType.attendees ?? []).slice(1)[index]?.rut ?? ""}
                              maxLength={20}
                              placeholder="12.345.678-9"
                              aria-invalid={Boolean(attendeeErrors[index]?.rut)}
                              aria-describedby={attendeeErrors[index]?.rut ? `attendee-rut-error-${index}` : undefined}
                              onChange={() => setAttendeeErrors((current) => ({
                                ...current,
                                [index]: { ...current[index], rut: "" },
                              }))}
                              onBlur={(inputEvent) => { inputEvent.target.value = formatRut(inputEvent.target.value); }}
                              required
                            />
                            {attendeeErrors[index]?.rut && <span className="event-buyer-form__error" id={`attendee-rut-error-${index}`}>{attendeeErrors[index].rut}</span>}
                          </label>
                        </fieldset>
                      ))}
                    </div>
                  )}
                  <label className="event-buyer-form__terms">
                    <input type="checkbox" required />
                    <span>{isFreeSelection
                        ? <>Acepto los <a href="/terminos" target="_blank" rel="noreferrer">términos y condiciones</a> y autorizo el uso de mis datos y de los demás asistentes para gestionar esta inscripción y sus entradas.</>
                        : <>Acepto los <a href="/terminos" target="_blank" rel="noreferrer">términos y condiciones</a> y autorizo el uso de mis datos y de los demás asistentes para preparar la compra y sus entradas.</>}</span>
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

            {buyerDetails && !buyerFormOpen && (
              <section className="event-buyer-card event-buyer-card--confirmed" aria-label="Datos de compra confirmados">
                <div className="event-detail-section-heading">
                  <div>
                    <span className="event-detail-step">02 · TUS DATOS</span>
                    <h2>Datos listos</h2>
                  </div>
                  <Check size={20} />
                </div>
                <p>{buyerDetails.buyer.name} recibirá todas las entradas en {buyerDetails.buyer.email}.</p>
                <button
                  className="event-buyer-card__edit"
                  type="button"
                  onClick={() => setBuyerFormOpen(true)}
                >Editar datos</button>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

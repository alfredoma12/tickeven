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
  const [rut, setRut] = useState("");
  const [rutError, setRutError] = useState("");
  const [emailError, setEmailError] = useState("");
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

    setEmailError("");
    if (!isValidRut(buyer.rut)) {
      setRutError("Ingresa un RUT chileno válido.");
      return;
    }

    setRutError("");
    setRegistrationError("");
    if (isFreeSelection && selectedProducts.length === 0) {
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
    onAddToCart(event, selectedTickets, buyer, selectedProducts);
    onNavigate("/carrito");
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

          {eventProducts.some((product) => product.showOnEventPage) && (
            <section className="event-products-section event-products-section--public" aria-labelledby="event-products-public-title">
              <div className="event-detail-section-heading">
                <div><span className="event-detail-step">ADICIONALES Y MERCH OFICIAL</span><h2 id="event-products-public-title">Productos de este evento</h2></div>
                <ShoppingBag size={20} />
              </div>
              <div className="event-products-grid">
                {eventProducts.filter((product) => product.showOnEventPage).map((product) => {
                  const variants = product.variants.filter((variant) => variant.id);
                  const selectedVariantId = productVariants[product.id] ?? variants[0]?.id ?? "";
                  const selectedVariant = variants.find((variant) => variant.id === selectedVariantId);
                  const available = selectedVariant?.available ?? product.available;
                  const quantityKey = `${product.id}:${selectedVariant?.id ?? ""}`;
                  const quantity = productQuantities[quantityKey] ?? 0;
                  return (
                    <article className="event-product-card" key={product.id}>
                      {product.image && <img src={product.image} alt={product.name} loading="lazy" />}
                      <div className="event-product-card__content">
                        <span>{product.category}</span><h3>{product.name}</h3>
                        {product.description && <p>{product.description}</p>}
                        <strong>${money.format(product.price)} <small>+ ${money.format(getAdministrationFee(product.price))} administración</small></strong>
                        {variants.length > 0 && <label>Opción<select value={selectedVariantId} onChange={(changeEvent) => setProductVariants((current) => ({ ...current, [product.id]: changeEvent.target.value }))}>{variants.map((variant) => <option value={variant.id} key={variant.id}>{variant.name} · {variant.available} disponibles</option>)}</select></label>}
                        <span className={`event-product-card__availability${available === 0 ? " is-sold-out" : available <= 5 ? " is-low" : ""}`}>{available === 0 ? "AGOTADO" : available <= 5 ? `Últimas unidades · ${available}` : `${available} disponibles`}</span>
                        <div className="quantity-control" aria-label={`Cantidad de ${product.name}`}>
                          <button type="button" aria-label={`Quitar una unidad de ${product.name}`} disabled={!available || quantity === 0} onClick={() => changeProductQuantity(product, selectedVariant, -1)}><Minus size={14} /></button>
                          <span>{quantity}</span>
                          <button type="button" aria-label={`Agregar una unidad de ${product.name}`} disabled={!available || quantity >= Math.min(10, available)} onClick={() => changeProductQuantity(product, selectedVariant, 1)}><Plus size={14} /></button>
                        </div>
                        {quantity > 0 && <small className="event-product-card__hint">Se retira en el evento.</small>}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

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

              {eventProducts.some((product) => product.showInCheckout) && (
                <section className="event-products-section" aria-labelledby="event-products-title">
                  <div className="event-detail-section-heading">
                    <div><span className="event-detail-step">ADICIONALES PARA TU COMPRA</span><h2 id="event-products-title">Agrega productos a tu orden</h2></div>
                    <ShoppingBag size={20} />
                  </div>
                  <div className="event-products-grid">
                    {eventProducts.filter((product) => product.showInCheckout).map((product) => {
                      const variants = product.variants.filter((variant) => variant.id);
                      const selectedVariantId = productVariants[product.id] ?? variants[0]?.id ?? "";
                      const selectedVariant = variants.find((variant) => variant.id === selectedVariantId);
                      const available = selectedVariant?.available ?? product.available;
                      return (
                        <article className="event-product-card" key={product.id}>
                          {product.image && <img src={product.image} alt={product.name} loading="lazy" />}
                          <div className="event-product-card__content">
                            <span>{product.category}</span>
                            <h3>{product.name}</h3>
                            {product.description && <p>{product.description}</p>}
                            <strong>${money.format(product.price)} <small>+ ${money.format(getAdministrationFee(product.price))} administración</small></strong>
                            {variants.length > 0 && <label>Opción<select value={selectedVariantId} onChange={(changeEvent) => setProductVariants((current) => ({ ...current, [product.id]: changeEvent.target.value }))}>{variants.map((variant) => <option value={variant.id} key={variant.id}>{variant.name} · {variant.available} disponibles</option>)}</select></label>}
                            <span className={`event-product-card__availability${available === 0 ? " is-sold-out" : available <= 5 ? " is-low" : ""}`}>{available === 0 ? "AGOTADO" : available <= 5 ? `Últimas unidades · ${available}` : `${available} disponibles`}</span>
                            <div className="quantity-control" aria-label={`Cantidad de ${product.name}`}>
                              <button type="button" aria-label={`Quitar una unidad de ${product.name}`} disabled={!available || (productQuantities[`${product.id}:${selectedVariant?.id ?? ""}`] ?? 0) === 0} onClick={() => changeProductQuantity(product, selectedVariant, -1)}><Minus size={14} /></button>
                              <span>{productQuantities[`${product.id}:${selectedVariant?.id ?? ""}`] ?? 0}</span>
                              <button type="button" aria-label={`Agregar una unidad de ${product.name}`} disabled={!available || (productQuantities[`${product.id}:${selectedVariant?.id ?? ""}`] ?? 0) >= Math.min(10, available)} onClick={() => changeProductQuantity(product, selectedVariant, 1)}><Plus size={14} /></button>
                            </div>
                            {productQuantities[`${product.id}:${selectedVariant?.id ?? ""}`] > 0 && <small className="event-product-card__hint">Se retira en el evento.</small>}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              )}

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
                      <input
                        id="event-buyer-email"
                        name="email"
                        type="email"
                        autoComplete="email"
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
                        placeholder="Repite tu correo"
                        aria-invalid={Boolean(emailError)}
                        aria-describedby={emailError ? "event-email-error" : undefined}
                        onChange={() => setEmailError("")}
                        required
                      />
                      {emailError && <span className="event-buyer-form__error" id="event-email-error">{emailError}</span>}
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
              {!buyerFormOpen ? (
                <button
                  className="event-order-card__continue"
                  type="button"
                  disabled={!ticketCount && !productCount}
                  onClick={() => setBuyerFormOpen(true)}
                >
                  {isFreeSelection && !productCount ? "Inscribirme gratis" : "Continuar"} <ArrowRight size={16} />
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
              <p className="event-order-card__secure"><Check size={14} /> {isFreeSelection && !productCount ? "Inscripción gratuita · Sin Mercado Pago" : "Compra única · productos asociados al evento."}</p>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}

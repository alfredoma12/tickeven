import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Compass,
  Heart,
  MapPin,
  Menu,
  Search,
  ShieldCheck,
  ShoppingBag,
  Ticket,
  X,
} from "lucide-react";
import ProducerPage from "./components/ProducerPage.jsx";
import CartPage from "./components/CartPage.jsx";
import CheckoutPage from "./components/CheckoutPage.jsx";
import EventDetailPage from "./components/EventDetailPage.jsx";
import ProducerAuthPage from "./components/ProducerAuthPage.jsx";
import ProducerDashboard from "./components/ProducerDashboard.jsx";
import AdminDashboard from "./components/AdminDashboard.jsx";
import Brand from "./components/Brand.jsx";
import { getCartLines, getCartProductLines, getCartTotals } from "./data/cart.js";
import { fetchPublishedEvents, publishProducerEvent } from "./data/events.js";
import { ADMINISTRATION_PERCENTAGE, getAdministrationFee } from "./data/pricing.js";
import { APP_URL, createUUID } from "./data/site.js";
import { registerFreeOrder, validateDiscountCode } from "./data/supabase.js";

const categories = ["Todos", "Conciertos", "Fiestas", "Festivales", "Experiencias", "Teatro", "Deportes", "Familia", "Conferencias"];
const appBasePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const CollaboratorDashboard = lazy(() => import("./components/CollaboratorDashboard.jsx"));

function getRoutePath() {
  let pathname = window.location.pathname;
  if (appBasePath && pathname.startsWith(appBasePath)) {
    pathname = pathname.slice(appBasePath.length) || "/";
  }
  return pathname.replace(/\/+$/, "") || "/";
}

function getBrowserPath(route) {
  const url = new URL(route, window.location.origin);
  let pathname = url.pathname;
  if (appBasePath && pathname.startsWith(appBasePath)) {
    pathname = pathname.slice(appBasePath.length) || "/";
  }
  return `${appBasePath}${pathname}${url.search}${url.hash}` || "/";
}

const slides = [
  {
    eyebrow: "UN ESPACIO PARA TU PRÓXIMO EVENTO",
    title: "Tu evento\npodría estar acá.",
    description: "Publica tu evento y configura sus entradas desde tu espacio de productor.",
    name: "Conciertos · Festivales · Experiencias",
    date: "TU PRÓXIMA HISTORIA COMIENZA AQUÍ",
    image:
      "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=2000&q=90",
    imageAlt: "Escenario y público en un festival de música",
  },
  {
    eyebrow: "TU IDEA TAMBIÉN PUEDE SER LA PRÓXIMA",
    title: "Tu evento\npodría estar acá.",
    description: "Consulta las entradas vendidas, reservas y disponibilidad desde tu dashboard.",
    name: "Entradas · Inventario · Reportes",
    date: "LA INFORMACIÓN DE TU EVENTO, EN UN MISMO LUGAR",
    image:
      "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=2000&q=90",
    imageAlt: "Concierto en vivo con luces sobre el escenario",
  },
  {
    eyebrow: "DE LA PUBLICACIÓN AL ACCESO",
    title: "Tu evento\npodría estar acá.",
    description: "Agrega productos, ofrece entradas gratuitas y valida accesos con QR.",
    name: "Entradas · Productos · Validación QR",
    date: "HERRAMIENTAS PARA CADA ETAPA DEL EVENTO",
    image:
      "https://images.unsplash.com/photo-1503095396549-807759245b35?auto=format&fit=crop&w=2000&q=90",
    imageAlt: "Escenario de teatro preparado para una presentación",
  },
];

const money = new Intl.NumberFormat("es-CL");

function eventSlug(event) {
  if (event.slug) return event.slug;
  return event.title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function EventCard({ event, onBuy, onFavorite, favorite }) {
  const startingPrice = event.ticketTypes.length
    ? Math.min(...event.ticketTypes.map((ticketType) => ticketType.price))
    : null;

  return (
    <article className="event-card">
      <a
        className="event-card__image-link"
        href={`/evento/${eventSlug(event)}`}
        aria-label={`Ver detalles de ${event.title}`}
      >
        <img className="event-card__image" src={event.image} alt={event.imageAlt} loading="lazy" />
        {event.isExample && <span className="event-card__example-badge">EVENTO DE EJEMPLO</span>}
        <span className={`event-card__category event-card__category--${event.color}`}>
          {event.category}
        </span>
      </a>
      <button
        className={`event-card__favorite${favorite ? " is-active" : ""}`}
        type="button"
        onClick={() => onFavorite(event.id)}
        aria-label={favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
        aria-pressed={favorite}
      >
        <Heart size={17} fill={favorite ? "currentColor" : "none"} />
      </button>
      <div className="event-card__content">
        <p className="event-card__date">
          {event.isExample ? "FECHA POR DEFINIR · EJEMPLO" : <>{event.date} <span>·</span> {event.time}</>}
        </p>
        <h3 className="event-card__title"><a href={`/evento/${eventSlug(event)}`}>{event.title}</a></h3>
        <p className="event-card__venue">
          <MapPin size={14} aria-hidden="true" />
          {event.venue}, {event.city}
        </p>
        <div className="event-card__bottom">
          <div className="event-card__price">
            <p>{event.isExample
              ? <strong>Precios de referencia</strong>
              : <>Desde <strong>{startingPrice === 0 ? "Gratis" : `$${money.format(startingPrice)}`}</strong></>}</p>
            <p>{event.isExample
              ? "Muestra visual · no disponible para compra"
              : startingPrice === 0
                ? "Sin cargo de administración"
                : <>Administración ({ADMINISTRATION_PERCENTAGE}) <strong>${money.format(getAdministrationFee(startingPrice))}</strong></>}</p>
          </div>
          <button className="event-card__buy" type="button" onClick={() => onBuy(event)}>
            {event.isExample ? "Ver ejemplo" : "Ver entradas"} <ArrowUpRight size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}

function HomePage({ cartCount, events, loading, error, onNavigate }) {
  const [category, setCategory] = useState("Todos");
  const [city, setCity] = useState("Todas las ciudades");
  const [search, setSearch] = useState("");
  const [slide, setSlide] = useState(0);
  const [favorites, setFavorites] = useState([]);
  const [notice, setNotice] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    return events.filter((event) => {
      const matchesCategory = category === "Todos" || event.category === category;
      const matchesCity = event.isExample || city === "Todas las ciudades" || event.city === city;
      const matchesSearch =
        !query ||
        `${event.title} ${event.category} ${event.venue} ${event.city}`
          .toLocaleLowerCase("es")
          .includes(query);
      return matchesCategory && matchesCity && matchesSearch;
    });
  }, [events, category, city, search]);

  const weekendEvents = events.filter((event) => event.weekend);
  const featuredEvents = events.filter((event) => !event.weekend);
  const currentSlide = slides[slide];

  const showNotice = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2800);
  };

  const handleBuy = (event) => {
    if (!event) {
      showNotice("No pudimos agregar este evento. Intenta nuevamente.");
      return;
    }
    onNavigate(`/evento/${eventSlug(event)}`);
  };

  const toggleFavorite = (id) => {
    setFavorites((current) =>
      current.includes(id) ? current.filter((favorite) => favorite !== id) : [...current, id],
    );
  };

  const moveSlide = (direction) => {
    setSlide((current) => (current + direction + slides.length) % slides.length);
  };

  const renderEventGrid = (list) => (
    <div className="event-grid">
      {list.map((event) => (
        <EventCard
          key={event.id}
          event={event}
          onBuy={handleBuy}
          onFavorite={toggleFavorite}
          favorite={favorites.includes(event.id)}
        />
      ))}
    </div>
  );

  return (
    <div className="site-shell">
      <header className="site-header">
        <nav className="navigation page-container" aria-label="Navegación principal">
          <Brand />
          <button
            className="navigation__menu-toggle"
            type="button"
            aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
          <div className={`navigation__main${menuOpen ? " is-open" : ""}`}>
            <label className="search-box">
              <Search size={18} aria-hidden="true" />
              <span className="sr-only">Buscar eventos o artistas</span>
              <input
                type="search"
                placeholder="¿Qué te gustaría vivir?"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <kbd>⌘ K</kbd>
            </label>
            <label className="city-select">
              <MapPin size={16} aria-hidden="true" />
              <span className="sr-only">Filtrar por ciudad</span>
              <select value={city} onChange={(event) => setCity(event.target.value)}>
                <option>Todas las ciudades</option>
                <option>Santiago</option>
                <option>Viña del Mar</option>
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
            <div className="navigation__actions">
              <a className="navigation__publish" href="/productores">
                Publicar evento <ArrowUpRight size={15} />
              </a>
              <a
                className="cart-button"
                href="/carrito"
                aria-label={`Carrito, ${cartCount} ${cartCount === 1 ? "entrada" : "entradas"}`}
              >
                <ShoppingBag size={18} />
                <span>Carrito</span>
                {cartCount > 0 && <span className="cart-button__count">{cartCount}</span>}
              </a>
            </div>
          </div>
        </nav>
      </header>

      <main>
        <section className="hero page-container" aria-label="Eventos destacados">
          <div className="hero__visual" key={currentSlide.image}>
            <img className="hero__image" src={currentSlide.image} alt={currentSlide.imageAlt} />
            <div className="hero__overlay" />
            <div className="hero__content">
              <span className="hero__eyebrow"><span />{currentSlide.eyebrow}</span>
              <h1>{currentSlide.title.split("\n").map((line) => <span key={line}>{line}</span>)}</h1>
              <p className="hero__description">{currentSlide.description}</p>
              <div className="hero__event-detail">
                <span className="hero__event-name">{currentSlide.name}</span>
                <span className="hero__event-date">{currentSlide.date}</span>
              </div>
              <button
                className="hero__cta"
                type="button"
                onClick={() => onNavigate("/productores")}
              >
                Conoce TickEven para productores <ArrowUpRight size={17} />
              </button>
            </div>
            <div className="hero__controls">
              <span className="hero__counter">0{slide + 1}<span> / 0{slides.length}</span></span>
              <button type="button" aria-label="Evento anterior" onClick={() => moveSlide(-1)}>
                <ArrowLeft size={17} />
              </button>
              <button type="button" aria-label="Siguiente evento" onClick={() => moveSlide(1)}>
                <ArrowRight size={17} />
              </button>
            </div>
            <span className="hero__side-label">HECHO PARA VIVIRLO</span>
          </div>
          <div className="hero__below">
            <span><Compass size={15} /> Tus próximos recuerdos empiezan aquí</span>
            <a href="#eventos">Explorar eventos <ArrowDownRight size={15} /></a>
          </div>
        </section>

        <section className="discover-section page-container" id="eventos">
          <div className="section-heading">
            <div>
              <span className="section-kicker">ENCUENTRA TU PRÓXIMO PLAN</span>
              <h2>¿Qué te mueve<span className="accent-dot">?</span></h2>
            </div>
            <p>Momentos que se convierten<br />en buenas historias.</p>
          </div>
          <div className="category-bar" role="group" aria-label="Filtrar por categoría">
            {categories.map((item, index) => (
              <button
                className={`category-chip${category === item ? " is-selected" : ""}`}
                key={item}
                type="button"
                aria-pressed={category === item}
                onClick={() => setCategory(item)}
              >
                {index === 0 && <Compass size={15} />}
                {item}
              </button>
            ))}
            <span className="category-bar__hint">DESLIZA PARA EXPLORAR <ArrowRight size={13} /></span>
          </div>

          <div className="events-heading">
            <div>
              <h2>{search || category !== "Todos" || city !== "Todas las ciudades" ? "Eventos para ti" : "Cerca de ti"}</h2>
              <p>{filteredEvents.length} experiencias para descubrir</p>
            </div>
            <button className="sort-button" type="button" onClick={() => { setCategory("Todos"); setCity("Todas las ciudades"); setSearch(""); }}>
              Ver todos <ArrowUpRight size={16} />
            </button>
          </div>

          {loading ? (
            <div className="events-loading" role="status">Conectando con TickEven…</div>
          ) : error ? (
            <div className="events-load-error" role="alert">
              <strong>No pudimos cargar los eventos desde Supabase.</strong>
              <span>{error}</span>
              <button type="button" onClick={() => window.location.reload()}>Volver a intentar</button>
            </div>
          ) : filteredEvents.length ? (
            renderEventGrid(filteredEvents)
          ) : (
            <div className="empty-state">
              <Search size={24} />
              <h3>No encontramos ese plan</h3>
              <p>Prueba con otra búsqueda o cambia los filtros.</p>
              <button type="button" onClick={() => { setCategory("Todos"); setCity("Todas las ciudades"); setSearch(""); }}>
                Limpiar filtros
              </button>
            </div>
          )}
        </section>

        <section className="weekend-section" aria-labelledby="weekend-title">
          <div className="page-container">
            <div className="section-heading section-heading--compact">
              <div>
                <span className="section-kicker">EL FINDE SE ACERCA</span>
                <h2 id="weekend-title">Este fin de semana<span className="accent-dot">.</span></h2>
              </div>
              <a className="section-link" href="#eventos" onClick={() => { setCategory("Todos"); setSearch(""); }}>
                Ver agenda completa <ArrowUpRight size={16} />
              </a>
            </div>
            {renderEventGrid(weekendEvents)}
          </div>
        </section>

        <section className="upcoming-section page-container" aria-labelledby="upcoming-title">
          <div className="upcoming-banner">
            <div className="upcoming-banner__art" aria-hidden="true">
              <span className="art-shape art-shape--one" />
              <span className="art-shape art-shape--two" />
              <span className="art-shape art-shape--three" />
              <span className="art-star">✳</span>
            </div>
            <div className="upcoming-banner__content">
              <span className="section-kicker">GUARDA LA FECHA</span>
              <h2 id="upcoming-title">Lo bueno está<br />por venir<span className="accent-dot">.</span></h2>
              <p>Los planes que todos van a querer contar.</p>
            </div>
            <div className="upcoming-banner__link">
              <span>PRÓXIMAMENTE</span>
              <ArrowDownRight size={28} />
            </div>
          </div>
          {renderEventGrid(featuredEvents)}
        </section>

        <section className="benefits-section page-container" aria-labelledby="benefits-title">
          <div className="benefits-section__heading">
            <span className="section-kicker">UNA NUEVA FORMA DE VIVIR EVENTOS</span>
            <h2 id="benefits-title">Todo pasa cuando estás ahí<span className="accent-dot">.</span></h2>
          </div>
          <div className="benefits-grid">
            <article><span><Compass size={19} /></span><h3>Encuentra tu próximo plan</h3><p>Explora experiencias seleccionadas y descubre algo nuevo en tu ciudad.</p></article>
            <article><span><ShieldCheck size={19} /></span><h3>Compra con confianza</h3><p>Un proceso de pago seguro y transparente, con el detalle de cada cargo.</p></article>
            <article><span><Ticket size={19} /></span><h3>Tu entrada, siempre contigo</h3><p>Recibe entradas digitales con código QR listas para presentar en el acceso.</p></article>
          </div>
        </section>

      </main>

      <footer className="site-footer">
        <div className="page-container">
          <div className="footer-main">
            <div className="footer-brand">
              <Brand className="brand brand--footer" />
              <p>La vida pasa fuera<br />de la pantalla.</p>
            </div>
            <div className="footer-links">
              <div><h3>EXPLORA</h3><a href="#eventos">Eventos</a><a href="#weekend-title">Este fin de semana</a><a href="#upcoming-title">Próximamente</a></div>
              <div><h3>AYUDA</h3><a href="#ayuda">Preguntas frecuentes</a><a href="#contacto">Contacto soporte</a><a href="#comprar">¿Cómo comprar?</a></div>
              <div><h3>PARA PRODUCTORES</h3><a href="/productores" target="_blank" rel="noreferrer">Conoce la plataforma</a><a href="/productores#producer-faq" target="_blank" rel="noreferrer">Preguntas frecuentes</a></div>
              <div><h3>ACCESO A PORTALES</h3><a href={getBrowserPath("/productores/login")}>Iniciar sesión productores</a><a href={getBrowserPath("/admin/login")}>Portal administrador</a><a href={getBrowserPath("/colaboradores/login")}>Portal colaboradores</a></div>
              <div><h3>TICKEVEN.CL</h3><a href="#nosotros">Sobre nosotros</a><a href="#terminos">Términos y condiciones</a><a href="#privacidad">Política de privacidad</a></div>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© 2026 TickEven.cl. Hecho para vivirlo en Chile.</span>
            <span className="payment-note"><Check size={14} /> Pagos seguros <span className="payment-note__brands">Mercado Pago</span></span>
          </div>
        </div>
      </footer>

      {notice && (
        <div className="toast-message" role="status">
          <Check size={17} /> {notice}
          <button type="button" aria-label="Cerrar aviso" onClick={() => setNotice("")}><X size={15} /></button>
        </div>
      )}

    </div>
  );
}

function App() {
  const [cart, setCart] = useState([]);
  const [productCart, setProductCart] = useState([]);
  const [discountCoupon, setDiscountCoupon] = useState(null);
  const [publishedEvents, setPublishedEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState("");
  const [path, setPath] = useState(getRoutePath);
  const allEvents = publishedEvents;
  const lines = useMemo(
    () => [...getCartLines(cart, allEvents), ...getCartProductLines(productCart, allEvents)],
    [cart, productCart, allEvents],
  );
  const totals = useMemo(() => getCartTotals(lines), [lines]);

  useEffect(() => {
    if (
      discountCoupon &&
      !lines.some((line) => line.kind !== "product" && line.eventId === discountCoupon.event_id)
    ) {
      setDiscountCoupon(null);
    }
  }, [discountCoupon, lines]);

  useEffect(() => {
    const canonicalUrl = new URL(path, APP_URL);
    canonicalUrl.search = "";
    canonicalUrl.hash = "";
    const description = document.querySelector('meta[name="description"]');
    const openGraphTitle = document.querySelector('meta[property="og:title"]');
    const openGraphDescription = document.querySelector('meta[property="og:description"]');
    const openGraphImage = document.querySelector('meta[property="og:image"]');
    const openGraphImageAlt = document.querySelector('meta[property="og:image:alt"]');
    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    const twitterDescription = document.querySelector('meta[name="twitter:description"]');
    const twitterImage = document.querySelector('meta[name="twitter:image"]');
    const defaultTitle = "TickEven.cl | Entradas para conciertos y eventos en Chile";
    const defaultDescription = "Encuentra entradas para conciertos, fiestas, festivales y experiencias en Chile. Compra fácil, paga seguro y lleva tus tickets digitales en TickEven.";
    const defaultImage = `${APP_URL}/tickevenlogo.png`;
    const routeEvent = path.startsWith("/evento/")
      ? allEvents.find((event) => eventSlug(event) === path.slice("/evento/".length))
      : null;
    let title = defaultTitle;
    let pageDescription = defaultDescription;
    let pageImage = defaultImage;
    const privateRoute = /^\/(admin|colaboradores)(\/|$)/.test(path) ||
      /^\/productores\/(login|dashboard)(\/|$)/.test(path) ||
      /^\/(carrito|checkout)(\/|$)/.test(path);

    if (path === "/productores") {
      title = "Plataforma para productores de eventos | TickEven.cl";
      pageDescription = "Publica y gestiona tus eventos con TickEven: vende entradas, agrega productos, controla inventario y revisa tus ventas desde un solo dashboard.";
    } else if (path.startsWith("/evento/")) {
      if (routeEvent && !routeEvent.isExample) {
        title = `${routeEvent.title} | Entradas en TickEven.cl`;
        pageDescription = `${routeEvent.title}: ${routeEvent.category} en ${routeEvent.city}. ${routeEvent.description}`
          .replace(/\s+/g, " ")
          .slice(0, 160);
        pageImage = routeEvent.image || defaultImage;
      } else {
        title = routeEvent ? "Evento de ejemplo | TickEven.cl" : "Evento no encontrado | TickEven.cl";
      }
    }

    document.title = title;
    document.querySelector('link[rel="canonical"]')?.setAttribute("href", canonicalUrl.toString());
    document.querySelector('meta[property="og:url"]')?.setAttribute("content", canonicalUrl.toString());
    document.querySelector('meta[name="robots"]')?.setAttribute(
      "content",
      privateRoute || (path.startsWith("/evento/") && (!routeEvent || routeEvent.isExample))
        ? "noindex,nofollow"
        : "index,follow",
    );
    description?.setAttribute("content", pageDescription);
    openGraphTitle?.setAttribute("content", title);
    openGraphDescription?.setAttribute("content", pageDescription);
    openGraphImage?.setAttribute("content", pageImage);
    openGraphImageAlt?.setAttribute("content", routeEvent && !routeEvent.isExample
      ? `Imagen de ${routeEvent.title}`
      : "TickEven, plataforma de entradas para eventos en Chile");
    twitterTitle?.setAttribute("content", title);
    twitterDescription?.setAttribute("content", pageDescription);
    twitterImage?.setAttribute("content", pageImage);
  }, [path, allEvents]);

  useEffect(() => {
    let active = true;
    const loadEvents = () => fetchPublishedEvents()
      .then((loadedEvents) => {
        if (active) {
          setPublishedEvents(loadedEvents);
          setEventsError("");
        }
      })
      .catch((error) => {
        console.error("No se pudieron leer los eventos publicados.", error);
        if (active) setEventsError(error.message);
      })
      .finally(() => {
        if (active) setEventsLoading(false);
      });
    void loadEvents();
    const refresh = window.setInterval(() => { void loadEvents(); }, 30_000);
    return () => {
      active = false;
      window.clearInterval(refresh);
    };
  }, []);

  const navigate = useCallback((to, { replace = false } = {}) => {
    const browserPath = getBrowserPath(to);
    if (replace) window.history.replaceState(null, "", browserPath);
    else window.history.pushState(null, "", browserPath);
    setPath(getRoutePath());
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    const handleClick = (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest("a[href]");
      if (!link || link.hasAttribute("download")) return;
      const target = new URL(link.href, window.location.href);
      if (target.origin !== window.location.origin) return;
      if (link.target === "_blank") {
        if (appBasePath && !target.pathname.startsWith(appBasePath)) {
          link.href = getBrowserPath(`${target.pathname}${target.search}${target.hash}`);
        }
        return;
      }
      if (target.hash && target.pathname === window.location.pathname) return;
      event.preventDefault();
      navigate(`${target.pathname}${target.search}${target.hash}`);
    };
    const handlePopState = () => setPath(getRoutePath());
    document.addEventListener("click", handleClick);
    window.addEventListener("popstate", handlePopState);
    return () => {
      document.removeEventListener("click", handleClick);
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const addToCart = (event, selectedTickets, buyer, selectedProducts = []) => {
    const additions = selectedTickets.map((ticketType) => ({
      cartItemId: `${event.id}-${ticketType.id}-${createUUID()}`,
      eventId: event.id,
      ticketTypeId: ticketType.id,
      quantity: ticketType.quantity,
      buyer,
    }));
    const productAdditions = selectedProducts.map((product) => ({
      cartItemId: `${event.id}-${product.id}-${product.variantId ?? "default"}-${createUUID()}`,
      eventId: event.id,
      productId: product.id,
      variantId: product.variantId,
      quantity: product.quantity,
      buyer,
    }));
    setCart((current) => [...current, ...additions]);
    setProductCart((current) => [...current, ...productAdditions]);
  };

  const updateQuantity = (cartItemId, quantity) => {
    const currentItem = lines.find((item) => item.id === cartItemId);
    if (currentItem?.kind === "product") {
      setProductCart((current) => current.flatMap((item) => {
        if (item.cartItemId !== cartItemId) return [item];
        if (quantity < 1) return [];
        return [{ ...item, quantity: Math.min(quantity, currentItem.maxQuantity) }];
      }));
      return;
    }
    setCart((current) => current.flatMap((item) => {
      if (item.cartItemId !== cartItemId) return [item];
      if (quantity < 1) return [];
      const event = allEvents.find((candidate) => candidate.id === item.eventId);
      const ticketType = event?.ticketTypes.find((candidate) => candidate.id === item.ticketTypeId);
      const maxQuantity = ticketType ? Math.min(10, ticketType.available) : quantity;
      return [{ ...item, quantity: Math.min(quantity, maxQuantity) }];
    }));
  };

  const removeFromCart = (cartItemId) => {
    setCart((current) => current.filter((item) => item.cartItemId !== cartItemId));
    setProductCart((current) => current.filter((item) => item.cartItemId !== cartItemId));
  };

  const applyDiscount = async (code) => {
    const coupon = await validateDiscountCode(code);
    if (!lines.some((line) => line.kind !== "product" && line.eventId === coupon.event_id)) {
      throw new Error("Este código no aplica a las entradas de los eventos de tu carrito.");
    }
    setDiscountCoupon(coupon);
    return coupon;
  };

  const handlePublishEvent = async (event) => {
    const savedEvent = await publishProducerEvent(event);
    setPublishedEvents((current) => [savedEvent, ...current]);
    return savedEvent;
  };

  const handleFreeRegistration = async (event, selectedTickets, buyer) => {
    const checkoutKey = createUUID();
    const order = await registerFreeOrder({
      checkoutKey,
      buyer,
      items: selectedTickets.map((ticketType) => ({
        eventId: event.id,
        ticketTypeId: ticketType.id,
        quantity: ticketType.quantity,
      })),
    });
    window.sessionStorage.setItem(`tickeven:checkout:${order.id}`, checkoutKey);
    navigate(`/checkout?payment=free&order_id=${order.id}`);
  };

  if (path === "/productores") return <ProducerPage />;
  if (path === "/productores/login") return <ProducerAuthPage accountType="producer" onNavigate={navigate} />;
  if (path === "/productores/dashboard") {
    return <ProducerDashboard onPublish={handlePublishEvent} onNavigate={navigate} />;
  }
  if (path === "/admin") return <ProducerAuthPage accountType="admin" onNavigate={navigate} />;
  if (path === "/admin/login") return <ProducerAuthPage accountType="admin" onNavigate={navigate} />;
  if (path === "/admin/dashboard") return <AdminDashboard onNavigate={navigate} />;
  if (path === "/colaboradores") return <ProducerAuthPage accountType="collaborator" onNavigate={navigate} />;
  if (path === "/colaboradores/login") return <ProducerAuthPage accountType="collaborator" onNavigate={navigate} />;
  if (path === "/colaboradores/dashboard") {
    return <Suspense fallback={<main className="producer-dashboard-loading">Cargando validador de entradas…</main>}><CollaboratorDashboard onNavigate={navigate} /></Suspense>;
  }
  if (path.startsWith("/evento/")) {
    const requestedSlug = path.slice("/evento/".length);
    const event = allEvents.find((candidate) => eventSlug(candidate) === requestedSlug);
    if (eventsLoading) return <main className="events-loading">Cargando evento…</main>;
    return <EventDetailPage event={event} cartCount={totals.quantity + totals.productQuantity} onAddToCart={addToCart} onFreeRegister={handleFreeRegistration} onNavigate={navigate} />;
  }
  if (path === "/carrito") {
    return <CartPage
      lines={lines}
      totals={getCartTotals(lines, discountCoupon)}
      discountCoupon={discountCoupon}
      onApplyDiscount={applyDiscount}
      onClearDiscount={() => setDiscountCoupon(null)}
      onUpdateQuantity={updateQuantity}
      onRemove={removeFromCart}
      onNavigate={navigate}
    />;
  }
  if (path === "/checkout") {
    return <CheckoutPage
      lines={lines}
      totals={getCartTotals(lines, discountCoupon)}
      discountCoupon={discountCoupon}
    />;
  }

  return <HomePage cartCount={totals.quantity + totals.productQuantity} events={allEvents} loading={eventsLoading} error={eventsError} onNavigate={navigate} />;
}

export default App;

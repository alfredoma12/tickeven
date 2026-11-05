import { useEffect, useMemo, useState } from "react";
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
import { getCartLines, getCartTotals } from "./data/cart.js";
import { fetchPublishedEvents, publishProducerEvent } from "./data/events.js";
import { ADMINISTRATION_PERCENTAGE, getAdministrationFee } from "./data/pricing.js";

const categories = ["Todos", "Conciertos", "Fiestas", "Teatro", "Deportes", "Familia", "Conferencias"];
const appBasePath = import.meta.env.BASE_URL.replace(/\/$/, "");

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

const exampleEventsForMigration = [
  {
    id: 1,
    title: "Festival de música de Santiago",
    category: "Conciertos",
    date: "SÁB 07 NOV",
    time: "12:00",
    venue: "Parque Cerrillos",
    city: "Santiago",
    ticketPrice: 119000,
    description: "Tres días para disfrutar música en vivo, descubrir nuevos artistas y compartir una experiencia al aire libre en Santiago.",
    ticketTypes: [
      { id: "general", name: "Acceso general", description: "Acceso al festival y escenarios principales.", price: 119000, available: 850 },
      { id: "preferencial", name: "Acceso preferencial", description: "Acceso preferencial y zona de descanso.", price: 159000, available: 180 },
      { id: "vip", name: "Experiencia VIP", description: "Acceso VIP, vista preferente y atención exclusiva.", price: 219000, available: 60 },
    ],
    gallery: [
      "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1100&q=85",
      "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1100&q=85",
    ],
    image:
      "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=960&q=85",
    imageAlt: "Público disfrutando de un concierto en vivo",
    color: "lavender",
    weekend: true,
  },
  {
    id: 2,
    title: "Noche de vinilos: Edición disco",
    category: "Fiestas",
    date: "VIE 06 NOV",
    time: "22:00",
    venue: "Club Subterráneo",
    city: "Santiago",
    ticketPrice: 12000,
    description: "Una noche para escuchar clásicos en vinilo, bailar y compartir en una pista íntima con selección musical toda la noche.",
    ticketTypes: [
      { id: "general", name: "Preventa general", description: "Ingreso a la fiesta desde las 22:00.", price: 12000, available: 200 },
      { id: "barra-libre", name: "Entrada + bienvenida", description: "Ingreso y un cóctel de bienvenida.", price: 18000, available: 80 },
    ],
    gallery: [
      "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1100&q=85",
      "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1100&q=85",
    ],
    image:
      "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=960&q=85",
    imageAlt: "Luces de colores en una pista de baile",
    color: "peach",
    weekend: true,
  },
  {
    id: 3,
    title: "El lago de los cisnes",
    category: "Teatro",
    date: "SÁB 07 NOV",
    time: "19:30",
    venue: "Teatro Municipal",
    city: "Santiago",
    ticketPrice: 18000,
    description: "El clásico ballet de Tchaikovsky vuelve al escenario en una puesta en escena que reúne danza, música en vivo y una producción inolvidable.",
    ticketTypes: [
      { id: "balcon", name: "Balcón", description: "Ubicación en balcón del teatro.", price: 18000, available: 90 },
      { id: "platea", name: "Platea", description: "Ubicación en platea central.", price: 32000, available: 70 },
      { id: "palco", name: "Palco preferencial", description: "Ubicación preferente con vista al escenario.", price: 45000, available: 24 },
    ],
    gallery: [
      "https://images.unsplash.com/photo-1503095396549-807759245b35?auto=format&fit=crop&w=1100&q=85",
      "https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?auto=format&fit=crop&w=1100&q=85",
    ],
    image:
      "https://images.unsplash.com/photo-1503095396549-807759245b35?auto=format&fit=crop&w=960&q=85",
    imageAlt: "Bailarina en escena bajo luces cálidas",
    color: "blue",
    weekend: true,
  },
  {
    id: 4,
    title: "Maratón de Santiago 2026",
    category: "Deportes",
    date: "DOM 06 DIC",
    time: "07:00",
    venue: "Plaza de la Ciudadanía",
    city: "Santiago",
    ticketPrice: 25000,
    description: "Corre por las calles de Santiago y elige tu desafío. La inscripción incluye número de corredor, hidratación y acceso a la zona de llegada.",
    ticketTypes: [
      { id: "10k", name: "Corrida 10K", description: "Inscripción individual para el circuito de 10 kilómetros.", price: 25000, available: 500 },
      { id: "21k", name: "Media maratón 21K", description: "Inscripción individual para el circuito de 21 kilómetros.", price: 35000, available: 300 },
      { id: "42k", name: "Maratón 42K", description: "Inscripción individual para el circuito de 42 kilómetros.", price: 45000, available: 200 },
    ],
    gallery: [
      "https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?auto=format&fit=crop&w=1100&q=85",
      "https://images.unsplash.com/photo-1533561052604-c3beb6d55b8d?auto=format&fit=crop&w=1100&q=85",
    ],
    image:
      "https://images.unsplash.com/photo-1533561052604-c3beb6d55b8d?auto=format&fit=crop&w=960&q=85",
    imageAlt: "Corredores participando en una carrera urbana",
    color: "mint",
    weekend: false,
  },
  {
    id: 5,
    title: "Aventura bajo las estrellas",
    category: "Familia",
    date: "SÁB 07 NOV",
    time: "18:00",
    venue: "Planetario USACH",
    city: "Santiago",
    ticketPrice: 8500,
    description: "Una aventura familiar para explorar el universo, conocer sus misterios y vivir una función inmersiva bajo las estrellas.",
    ticketTypes: [
      { id: "general", name: "Entrada general", description: "Acceso a una función para una persona.", price: 8500, available: 150 },
      { id: "familiar", name: "Pack familiar", description: "Cuatro entradas para compartir la experiencia.", price: 28000, available: 45 },
    ],
    gallery: [
      "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=1100&q=85",
      "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=1100&q=85",
    ],
    image:
      "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=960&q=85",
    imageAlt: "Cielo estrellado lleno de galaxias",
    color: "lavender",
    weekend: true,
  },
  {
    id: 6,
    title: "Ideas que mueven el futuro",
    category: "Conferencias",
    date: "JUE 12 NOV",
    time: "09:00",
    venue: "Centro GAM",
    city: "Santiago",
    ticketPrice: 15000,
    description: "Una jornada de ideas, conversaciones y herramientas para quienes están construyendo el futuro desde distintas disciplinas.",
    ticketTypes: [
      { id: "general", name: "Asistente general", description: "Acceso a todas las charlas y espacios comunes.", price: 15000, available: 250 },
      { id: "estudiante", name: "Estudiante", description: "Acceso con acreditación estudiantil vigente.", price: 9000, available: 100 },
      { id: "premium", name: "Experiencia completa", description: "Acceso, coffee break y material del encuentro.", price: 28000, available: 60 },
    ],
    gallery: [
      "https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&w=1100&q=85",
      "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?auto=format&fit=crop&w=1100&q=85",
    ],
    image:
      "https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&w=960&q=85",
    imageAlt: "Auditorio durante una charla en vivo",
    color: "peach",
    weekend: false,
  },
  {
    id: 7,
    title: "Babasónicos en Viña",
    category: "Conciertos",
    date: "SÁB 28 NOV",
    time: "21:00",
    venue: "Quinta Vergara",
    city: "Viña del Mar",
    ticketPrice: 32000,
    description: "Babasónicos llega a la Quinta Vergara con un show en vivo para cantar sus canciones favoritas en una noche frente al mar.",
    ticketTypes: [
      { id: "galeria", name: "Galería", description: "Ubicación en galería.", price: 32000, available: 400 },
      { id: "preferencial", name: "Platea preferencial", description: "Ubicación preferencial frente al escenario.", price: 58000, available: 180 },
      { id: "premium", name: "Experiencia premium", description: "Ubicación premium y acceso prioritario.", price: 85000, available: 60 },
    ],
    gallery: [
      "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1100&q=85",
      "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1100&q=85",
    ],
    image:
      "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=960&q=85",
    imageAlt: "Escenario iluminado durante un show musical",
    color: "blue",
    weekend: false,
  },
  {
    id: 8,
    title: "Festival de sabores del sur",
    category: "Familia",
    date: "DOM 29 NOV",
    time: "12:00",
    venue: "Parque Bicentenario",
    city: "Santiago",
    ticketPrice: 6000,
    description: "Un encuentro para probar sabores, conocer productores locales y disfrutar un día al aire libre con actividades para toda la familia.",
    ticketTypes: [
      { id: "general", name: "Entrada general", description: "Acceso al festival durante toda la jornada.", price: 6000, available: 600 },
      { id: "degustacion", name: "Entrada + degustación", description: "Acceso y selección de degustaciones de bienvenida.", price: 12000, available: 200 },
    ],
    gallery: [
      "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1100&q=85",
      "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1100&q=85",
    ],
    image:
      "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=960&q=85",
    imageAlt: "Mesa con una variedad de platos para compartir",
    color: "mint",
    weekend: false,
  },
];

const slides = [
  {
    eyebrow: "EL PLAN DEL MES",
    title: "La música\nse vive juntos.",
    description: "Tres días para cantar, descubrir y sentirlo todo.",
    name: "Festival de música de Santiago",
    date: "06 — 08 NOVIEMBRE · PARQUE CERRILLOS",
    image:
      "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=2000&q=90",
    imageAlt: "Multitud en un festival de música al aire libre",
    eventId: 1,
  },
  {
    eyebrow: "UNA NOCHE PARA RECORDAR",
    title: "El escenario\nes todo tuyo.",
    description: "Vuelve a encontrarte con la música en vivo.",
    name: "Babasónicos en Viña",
    date: "28 NOVIEMBRE · QUINTA VERGARA",
    image:
      "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=2000&q=90",
    imageAlt: "Concierto en vivo con el público levantando las manos",
    eventId: 7,
  },
  {
    eyebrow: "TU PRÓXIMA HISTORIA",
    title: "Sal de la rutina.\nEntra en escena.",
    description: "Una noche distinta te está esperando.",
    name: "El lago de los cisnes",
    date: "07 NOVIEMBRE · TEATRO MUNICIPAL",
    image:
      "https://images.unsplash.com/photo-1503095396549-807759245b35?auto=format&fit=crop&w=2000&q=90",
    imageAlt: "Ballet clásico sobre el escenario de un teatro",
    eventId: 3,
  },
];

const money = new Intl.NumberFormat("es-CL");

if (exampleEventsForMigration.some((event) =>
  !Number.isSafeInteger(event.ticketPrice) ||
  event.ticketPrice <= 0 ||
  !Array.isArray(event.ticketTypes) ||
  event.ticketTypes.length === 0 ||
  event.ticketTypes.some((ticketType) =>
    !ticketType.id ||
    !ticketType.name ||
    !Number.isSafeInteger(ticketType.price) ||
    ticketType.price <= 0 ||
    !Number.isInteger(ticketType.available) ||
    ticketType.available < 0
  )
)) {
  throw new Error("Cada evento debe tener tipos de entrada con precios y disponibilidad válidos.");
}

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
  const startingPrice = Math.min(...event.ticketTypes.map((ticketType) => ticketType.price));

  return (
    <article className="event-card">
      <a
        className="event-card__image-link"
        href={`/evento/${eventSlug(event)}`}
        aria-label={`Ver detalles de ${event.title}`}
      >
        <img className="event-card__image" src={event.image} alt={event.imageAlt} loading="lazy" />
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
          {event.date} <span>·</span> {event.time}
        </p>
        <h3 className="event-card__title"><a href={`/evento/${eventSlug(event)}`}>{event.title}</a></h3>
        <p className="event-card__venue">
          <MapPin size={14} aria-hidden="true" />
          {event.venue}, {event.city}
        </p>
        <div className="event-card__bottom">
          <div className="event-card__price">
            <p>Desde <strong>${money.format(startingPrice)}</strong></p>
            <p>Administración ({ADMINISTRATION_PERCENTAGE}) <strong>${money.format(getAdministrationFee(startingPrice))}</strong></p>
          </div>
          <button className="event-card__buy" type="button" onClick={() => onBuy(event)}>
            Ver entradas <ArrowUpRight size={15} aria-hidden="true" />
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
      const matchesCity = city === "Todas las ciudades" || event.city === city;
      const matchesSearch =
        !query ||
        `${event.title} ${event.category} ${event.venue} ${event.city}`
          .toLocaleLowerCase("es")
          .includes(query);
      return matchesCategory && matchesCity && matchesSearch;
    });
  }, [category, city, search]);

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
          <a className="brand" href="#" aria-label="TickEven.cl, inicio">
            <span className="brand__mark"><Ticket size={21} strokeWidth={2.5} /></span>
            <span>tickeven<span className="brand__dot">.</span>cl</span>
          </a>
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
            <a className="text-button producer-nav-link" href="/productores" target="_blank" rel="noreferrer">
              Para productores <ArrowUpRight size={15} />
            </a>
            <div className="navigation__actions">
              <a className="login-button" href="/productores/login" hidden>
                Iniciar sesión
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
                onClick={() => handleBuy(events.find((event) => event.id === String(currentSlide.eventId)))}
              >
                Encuentra tus entradas <ArrowUpRight size={17} />
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

      </main>

      <footer className="site-footer">
        <div className="page-container">
          <div className="footer-main">
            <div className="footer-brand">
              <a className="brand brand--footer" href="#" aria-label="TickEven.cl, inicio">
                <span className="brand__mark"><Ticket size={21} strokeWidth={2.5} /></span>
                <span>tickeven<span className="brand__dot">.</span>cl</span>
              </a>
              <p>La vida pasa fuera<br />de la pantalla.</p>
              <div className="footer-socials" aria-label="Redes sociales">
                <a href="https://instagram.com" aria-label="Instagram">ig</a>
                <a href="https://tiktok.com" aria-label="TikTok">tk</a>
                <a href="https://facebook.com" aria-label="Facebook">fb</a>
              </div>
            </div>
            <div className="footer-links">
              <div><h3>EXPLORA</h3><a href="#eventos">Eventos</a><a href="#weekend-title">Este fin de semana</a><a href="#upcoming-title">Próximamente</a></div>
              <div><h3>AYUDA</h3><a href="#ayuda">Preguntas frecuentes</a><a href="#contacto">Contacto soporte</a><a href="#comprar">¿Cómo comprar?</a></div>
              <div><h3>PARA PRODUCTORES</h3><a href="/productores" target="_blank" rel="noreferrer">Conoce la plataforma</a><a href="/productores#producer-faq" target="_blank" rel="noreferrer">Preguntas frecuentes</a></div>
              <div><h3>TICKEVEN.CL</h3><a href="#nosotros">Sobre nosotros</a><a href="#terminos">Términos y condiciones</a><a href="#privacidad">Política de privacidad</a></div>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© 2026 TickEven.cl. Hecho para vivirlo en Chile.</span>
            <span className="payment-note"><Check size={14} /> Pagos seguros <span className="payment-note__brands">Webpay · Transbank</span></span>
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
  const [publishedEvents, setPublishedEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState("");
  const [path, setPath] = useState(getRoutePath);
  const allEvents = publishedEvents;
  const lines = useMemo(() => getCartLines(cart, allEvents), [cart, allEvents]);
  const totals = useMemo(() => getCartTotals(lines), [lines]);

  useEffect(() => {
    let active = true;
    fetchPublishedEvents()
      .then((loadedEvents) => {
        if (active) setPublishedEvents(loadedEvents);
      })
      .catch((error) => {
        console.error("No se pudieron leer los eventos publicados.", error);
        if (active) setEventsError(error.message);
      })
      .finally(() => {
        if (active) setEventsLoading(false);
      });
    return () => { active = false; };
  }, []);

  const navigate = (to, { replace = false } = {}) => {
    const browserPath = getBrowserPath(to);
    if (replace) window.history.replaceState(null, "", browserPath);
    else window.history.pushState(null, "", browserPath);
    setPath(getRoutePath());
    window.scrollTo({ top: 0, behavior: "auto" });
  };

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

  const addToCart = (event, selectedTickets, buyer) => {
    const additions = selectedTickets.map((ticketType) => ({
      cartItemId: `${event.id}-${ticketType.id}-${crypto.randomUUID()}`,
      eventId: event.id,
      ticketTypeId: ticketType.id,
      quantity: ticketType.quantity,
      buyer,
    }));
    setCart((current) => [...current, ...additions]);
  };

  const updateQuantity = (cartItemId, quantity) => {
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
  };

  const handlePublishEvent = async (event) => {
    const savedEvent = await publishProducerEvent(event);
    setPublishedEvents((current) => [savedEvent, ...current]);
    return savedEvent;
  };

  if (path === "/productores") return <ProducerPage />;
  if (path === "/productores/login") return <ProducerAuthPage onNavigate={navigate} />;
  if (path === "/productores/dashboard") {
    return <ProducerDashboard onPublish={handlePublishEvent} onNavigate={navigate} />;
  }
  if (path.startsWith("/evento/")) {
    const requestedSlug = path.slice("/evento/".length);
    const event = allEvents.find((candidate) => eventSlug(candidate) === requestedSlug);
    if (eventsLoading) return <main className="events-loading">Cargando evento…</main>;
    return <EventDetailPage event={event} cartCount={totals.quantity} onAddToCart={addToCart} onNavigate={navigate} />;
  }
  if (path === "/carrito") {
    return <CartPage lines={lines} totals={totals} onUpdateQuantity={updateQuantity} onRemove={removeFromCart} onNavigate={navigate} />;
  }
  if (path === "/checkout") return <CheckoutPage lines={lines} totals={totals} />;

  return <HomePage cartCount={totals.quantity} events={allEvents} loading={eventsLoading} error={eventsError} onNavigate={navigate} />;
}

export default App;

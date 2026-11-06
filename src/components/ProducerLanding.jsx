import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  CircleHelp,
  CreditCard,
  Globe,
  Headphones,
  LayoutDashboard,
  LockKeyhole,
  Mail,
  MapPin,
  Monitor,
  MousePointer2,
  Package,
  Plus,
  Radio,
  ScanLine,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Ticket,
  TrendingUp,
  Users,
  Wallet,
  X,
} from "lucide-react";

const faqs = [
  {
    question: "¿Cuánto cuesta usar la plataforma?",
    answer:
      "El modelo se adapta a tu evento y a los canales de venta que necesites. Cuéntanos qué estás organizando y te compartiremos una propuesta clara antes de publicar.",
  },
  {
    question: "¿Qué tipo de eventos puedo organizar?",
    answer:
      "Puedes gestionar conciertos, festivales, congresos, eventos corporativos, fiestas y actividades gratuitas o pagadas. La operación se configura según el formato de tu evento.",
  },
  {
    question: "¿Puedo vender entradas presencialmente el día del evento?",
    answer:
      "Sí. Puedes habilitar puntos de venta presenciales y administrar sus tickets e inventario junto con tus ventas online desde la misma operación.",
  },
  {
    question: "¿Cuándo y cómo recibo las transferencias de las ventas?",
    answer:
      "Los plazos y el calendario de liquidación dependen del acuerdo comercial y del medio de pago. Antes de activar la venta te explicamos el proceso correspondiente a tu evento.",
  },
  {
    question: "¿Qué soporte recibo durante el evento?",
    answer:
      "Coordinamos contigo el acompañamiento previo y durante la operación, según las necesidades del evento y el alcance acordado con el equipo.",
  },
];

const brandColors = [
  { name: "Verde", value: "#2f7d4a" },
  { name: "Violeta", value: "#6c5ce7" },
  { name: "Turquesa", value: "#007f86" },
  { name: "Coral", value: "#c84a36" },
  { name: "Azul", value: "#3c67be" },
];
const fontOptions = ["Inter", "Playfair", "Mono"];

const operations = [
  {
    title: "Inventario claro",
    description: "Revisa stock, cupos y límites de venta por categoría, canal y etapa.",
    icon: Package,
    metric: "1.248",
    metricLabel: "entradas disponibles",
  },
  {
    title: "Equipo de ventas",
    description: "Supervisa caja, cobros con tarjeta y propinas de cada vendedor en puerta.",
    icon: Users,
    metric: "08",
    metricLabel: "puntos de venta activos",
  },
  {
    title: "Tickets y productos",
    description: "Compara en tiempo real tus entradas y productos más vendidos.",
    icon: TrendingUp,
    metric: "VIP",
    metricLabel: "categoría más vendida",
  },
  {
    title: "Conciliación simple",
    description: "Cuadra efectivo, tarjetas y propinas con un resumen de caja por turno.",
    icon: Wallet,
    metric: "$2.840.000",
    metricLabel: "recaudación del día",
  },
];

function SectionLabel({ children, light = false }) {
  return <span className={`producer-kicker${light ? " producer-kicker--light" : ""}`}>{children}</span>;
}

function TicketingMockup() {
  const [merchAdded, setMerchAdded] = useState(false);
  const [selectedSeats, setSelectedSeats] = useState(["B2"]);
  const seats = ["A1", "A2", "A3", "A4", "A5", "B1", "B2", "B3", "B4", "B5", "C1", "C2", "C3", "C4", "C5"];

  const toggleSeat = (seat) => {
    setSelectedSeats((current) =>
      current.includes(seat) ? current.filter((item) => item !== seat) : [...current, seat],
    );
  };

  return (
    <div className="producer-ticketing" aria-label="Demostración interactiva de compra">
      <div className="producer-ticketing__topbar">
        <div className="producer-ticketing__brand"><span>F</span> festival<span>.</span></div>
        <span className="producer-ticketing__secure"><LockKeyhole size={12} /> COMPRA SEGURA</span>
      </div>
      <div className="producer-ticketing__event">
        <div>
          <span>UNA EXPERIENCIA EN VIVO</span>
          <h3>Festival Aurora</h3>
          <p><MapPin size={12} /> Parque Ciudad · Santiago</p>
        </div>
        <span className="producer-ticketing__event-date">SÁB<br /><strong>28</strong><br />NOV</span>
      </div>
      <div className="producer-ticketing__step">
        <span><b>1</b> Elige tus entradas</span>
        <small>2 de 3</small>
      </div>
      <div className="producer-ticketing__ticket-row">
        <div><strong>Acceso general</strong><span>Entrada individual</span></div>
        <b>$24.900</b>
        <span className="producer-ticketing__count">− &nbsp;1&nbsp; +</span>
      </div>
      <div className="producer-ticketing__step producer-ticketing__step--seat">
        <span><b>2</b> Elige tus asientos</span>
        <small>MAPA INTERACTIVO</small>
      </div>
      <div className="producer-seatmap">
        <div className="producer-seatmap__stage">ESCENARIO</div>
        <div className="producer-seatmap__seats" role="group" aria-label="Selecciona asientos">
          {seats.map((seat) => (
            <button
              key={seat}
              type="button"
              className={selectedSeats.includes(seat) ? "is-selected" : ""}
              aria-label={`Asiento ${seat}${selectedSeats.includes(seat) ? ", seleccionado" : ""}`}
              aria-pressed={selectedSeats.includes(seat)}
              onClick={() => toggleSeat(seat)}
            />
          ))}
        </div>
        <span className="producer-seatmap__legend"><i /> Disponible <i /> Seleccionado</span>
      </div>
      <button
        className={`producer-ticketing__merch${merchAdded ? " is-added" : ""}`}
        type="button"
        onClick={() => setMerchAdded((added) => !added)}
      >
        <span className="producer-ticketing__merch-icon"><ShoppingBag size={16} /></span>
        <span><strong>Polera oficial</strong><small>Merch del festival · $18.000</small></span>
        <span className="producer-ticketing__merch-action">{merchAdded ? <Check size={16} /> : <Plus size={16} />}</span>
      </button>
      <div className="producer-ticketing__total">
        <span>{selectedSeats.length || 1} entradas{merchAdded ? " + merch" : ""}</span>
        <strong>${(24900 * (selectedSeats.length || 1) + (merchAdded ? 18000 : 0)).toLocaleString("es-CL")}</strong>
      </div>
      <button className="producer-ticketing__continue" type="button" onClick={() => setMerchAdded(true)}>
        Continuar compra <ArrowRight size={14} />
      </button>
    </div>
  );
}

function SalesDashboard({ segment, setSegment }) {
  const segmentStats = {
    Todos: { buyers: "2.486", conversion: "68,4%", label: "Público total" },
    VIP: { buyers: "284", conversion: "82,1%", label: "Invitados VIP" },
    Nuevos: { buyers: "1.746", conversion: "61,8%", label: "Clientes nuevos" },
    Recurrentes: { buyers: "456", conversion: "76,2%", label: "Clientes recurrentes" },
  }[segment];

  return (
    <div className="producer-dashboard">
      <div className="producer-dashboard__sidebar">
        <div className="producer-dashboard__logo"><span>F</span> festival</div>
        <span className="producer-dashboard__nav-active"><LayoutDashboard size={14} /> Resumen</span>
        <span><Ticket size={14} /> Tickets</span>
        <span><Users size={14} /> Clientes</span>
        <span><ScanLine size={14} /> Check-in</span>
        <span><Radio size={14} /> Embajadores</span>
        <span><BarChart3 size={14} /> Marketing</span>
        <div className="producer-dashboard__account"><span>AF</span><small>Admin Festival</small></div>
      </div>
      <div className="producer-dashboard__main">
        <div className="producer-dashboard__header">
          <div><small>PANEL DE CONTROL / FESTIVAL AURORA</small><h3>¡Hola, equipo! <span>✳</span></h3></div>
          <span className="producer-dashboard__live"><i /> EN VIVO</span>
        </div>
        <div className="producer-dashboard__metrics">
          <div><span>Tickets vendidos</span><strong>3.842</strong><small><TrendingUp size={12} /> +12,8% <i>vs. semana anterior</i></small></div>
          <div><span>Ingresos brutos</span><strong>$86,4M</strong><small><TrendingUp size={12} /> +8,2% <i>vs. semana anterior</i></small></div>
          <div><span>Asistentes hoy</span><strong>1.206</strong><small><ScanLine size={12} /> 72% <i>ya ingresó</i></small></div>
        </div>
        <div className="producer-dashboard__charts">
          <div className="producer-chart">
            <div className="producer-chart__head"><strong>Ventas a lo largo del tiempo</strong><span>Últimos 7 días⌄</span></div>
            <div className="producer-chart__area">
              <span>$90M</span><span>$60M</span><span>$30M</span>
              <svg viewBox="0 0 450 130" preserveAspectRatio="none" role="img" aria-label="Gráfico de ventas ascendentes">
                <defs><linearGradient id="sales-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#2f7d4a" stopOpacity=".3" /><stop offset="100%" stopColor="#2f7d4a" stopOpacity="0" /></linearGradient></defs>
                <path d="M0 105 C35 98 39 82 75 88 S120 78 145 83 S188 48 220 62 S266 65 290 39 S340 48 362 30 S406 34 450 8 V130 H0Z" fill="url(#sales-fill)" />
                <path d="M0 105 C35 98 39 82 75 88 S120 78 145 83 S188 48 220 62 S266 65 290 39 S340 48 362 30 S406 34 450 8" fill="none" stroke="#88ac42" strokeWidth="3" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
            <div className="producer-chart__days"><span>LUN</span><span>MAR</span><span>MIÉ</span><span>JUE</span><span>VIE</span><span>SÁB</span><span>DOM</span></div>
          </div>
          <div className="producer-audience">
            <div className="producer-chart__head"><strong>Tu audiencia</strong><Users size={14} /></div>
            <div className="producer-audience__count"><strong>{segmentStats.buyers}</strong><span>{segmentStats.label}</span></div>
            <div className="producer-audience__segments">
              {["Todos", "VIP", "Nuevos", "Recurrentes"].map((item) => (
                <button
                  type="button"
                  key={item}
                  className={segment === item ? "is-selected" : ""}
                  aria-pressed={segment === item}
                  onClick={() => setSegment(item)}
                >{item}</button>
              ))}
            </div>
            <div className="producer-audience__conversion"><span>Tasa de conversión</span><strong>{segmentStats.conversion}</strong></div>
            <button className="producer-audience__campaign" type="button" onClick={() => setSegment("VIP")}>
              <Sparkles size={13} /> Crear campaña para VIP
            </button>
          </div>
        </div>
        <div className="producer-dashboard__bottom"><span><ScanLine size={14} /> Check-in activo</span><span><Radio size={14} /> 12 embajadores</span><span><ShieldCheck size={14} /> Datos protegidos</span></div>
      </div>
    </div>
  );
}

function ProducerLeadDialog({ onClose, onSubmit }) {
  const firstInputRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    firstInputRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="producer-lead-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="producer-lead-dialog" role="dialog" aria-modal="true" aria-labelledby="producer-lead-title">
        <button type="button" className="producer-lead-dialog__close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button>
        <SectionLabel>HAGAMOS QUE PASE</SectionLabel>
        <h2 id="producer-lead-title">Hablemos de tu próximo evento.</h2>
        <p>Déjanos tus datos y nuestro equipo te contactará para conocer tu proyecto.</p>
        <form onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onSubmit(form.get("name"));
        }}>
          <label>Tu nombre<input ref={firstInputRef} name="name" autoComplete="name" placeholder="Nombre y apellido" required /></label>
          <label>Correo de trabajo<input name="email" type="email" autoComplete="email" placeholder="tu@empresa.cl" required /></label>
          <label>¿Qué estás organizando?<select name="event" defaultValue="" required><option value="" disabled>Selecciona el tipo de evento</option><option>Concierto o festival</option><option>Congreso o conferencia</option><option>Evento corporativo</option><option>Otro evento</option></select></label>
          <button type="submit">Quiero conversar <ArrowUpRight size={16} /></button>
          <small>Al enviar el formulario aceptas que te contactemos sobre TickEven.cl.</small>
        </form>
      </section>
    </div>
  );
}

export default function ProducerLanding() {
  const landingRef = useRef(null);
  const [channel, setChannel] = useState("online");
  const [brandColor, setBrandColor] = useState(brandColors[0].value);
  const [font, setFont] = useState("Inter");
  const [brandName, setBrandName] = useState("Festival Aurora");
  const [segment, setSegment] = useState("Todos");
  const [activeOperation, setActiveOperation] = useState(0);
  const [openFaq, setOpenFaq] = useState(0);
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadNotice, setLeadNotice] = useState("");
  const [showFloatingCta, setShowFloatingCta] = useState(false);

  useEffect(() => {
    const landing = landingRef.current;
    if (!landing) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setShowFloatingCta(entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(landing);
    return () => observer.disconnect();
  }, []);

  const submitLead = (name) => {
    setLeadOpen(false);
    setLeadNotice(`Gracias, ${name}. Recibimos tus datos de demostración; integra el formulario a tu CRM para activar el contacto.`);
    window.setTimeout(() => setLeadNotice(""), 6000);
  };

  return (
    <div className="producer-page" id="productores" ref={landingRef}>
      <section className="producer-hero" aria-labelledby="producer-hero-title">
        <div className="producer-container producer-hero__layout">
          <div className="producer-hero__copy">
            <SectionLabel light>HERRAMIENTAS PARA QUIENES HACEN QUE PASE</SectionLabel>
            <h2 id="producer-hero-title">El sistema operativo<br />para tu evento<br />o congreso<span>.</span></h2>
            <p>Todo lo que necesitas para vender y operar tu evento en un solo lugar. Tú decides cómo.</p>
            <div className="producer-hero__actions">
              <a className="producer-button producer-button--primary" href="/productores/login">
                Crear mi evento <ArrowUpRight size={17} />
              </a>
              <a className="producer-hero__secondary" href="#producer-sales">Ver cómo funciona <ArrowDown size={15} /></a>
            </div>
            <div className="producer-hero__trust"><ShieldCheck size={15} /> Tecnología y acompañamiento para cada etapa.</div>
          </div>
          <div className="producer-hero__visual">
            <div className="producer-hero__floating-label"><span><Check size={14} /></span> Tu marca, toda la experiencia</div>
            <TicketingMockup />
            <div className="producer-hero__corner-note">UNA PLATAFORMA<br /><strong>TU FORMA DE PRODUCIR</strong></div>
          </div>
        </div>
        <a className="producer-scroll-cue" href="#producer-proof">DESLIZA PARA DESCUBRIR <ArrowDown size={14} /></a>
      </section>

      <section className="producer-proof" id="producer-proof" aria-label="Una plataforma para tu operación">
        <div className="producer-container producer-proof__inner">
          <p>Tu operación merece algo mejor que herramientas desconectadas.</p>
          <div className="producer-proof__stats">
            <div><strong>1</strong><span>panel para todo tu evento</span></div>
            <div><strong>2</strong><span>canales: online y presencial</span></div>
            <div><strong>24/7</strong><span>inventario sincronizado</span></div>
          </div>
          <small>*Funcionalidades ilustrativas del producto; alcance sujeto a configuración.</small>
        </div>
      </section>

      <section className="producer-sales producer-section" id="producer-sales">
        <div className="producer-container">
          <div className="producer-section-heading">
            <SectionLabel>UNA EXPERIENCIA, TODOS LOS CANALES</SectionLabel>
            <h2>Vende como tu público<br />quiere comprar<span>.</span></h2>
            <p>Una sola operación para llegar a más personas, estés donde estés.</p>
          </div>
          <div className="producer-channel-switch" role="tablist" aria-label="Canal de venta">
            <button type="button" role="tab" aria-selected={channel === "online"} className={channel === "online" ? "is-active" : ""} onClick={() => setChannel("online")}><Globe size={16} /> Venta online</button>
            <button type="button" role="tab" aria-selected={channel === "presencial"} className={channel === "presencial" ? "is-active" : ""} onClick={() => setChannel("presencial")}><Monitor size={16} /> Venta presencial</button>
          </div>
          <div className="producer-channel-panel">
            <div className="producer-channel-panel__copy">
              <span className="producer-channel-panel__number">{channel === "online" ? "01" : "02"} / VENTAS</span>
              <h3>{channel === "online" ? "Vende online." : "Vende presencial."}<br /><span>{channel === "online" ? "Conecta desde la primera impresión." : "Vende hasta el último minuto."}</span></h3>
              <p>{channel === "online"
                ? "Una compra simple, rápida y con la identidad de tu evento. Tickets, mapa de asientos y merch, todo en el mismo flujo."
                : "Activa puntos de venta en puerta con inventario sincronizado. Tu equipo cobra y valida accesos desde el mismo sistema."}</p>
              <ul>
                {(channel === "online"
                  ? ["Checkout optimizado para móvil", "Mapa gráfico de asientos", "Venta de merch en el mismo carrito"]
                  : ["Venta en puerta y boletería", "Lectura y validación de tickets", "Stock compartido con venta online"]
                ).map((item) => <li key={item}><Check size={15} /> {item}</li>)}
              </ul>
              <a className="producer-text-link" href="/productores/login">Empezar a vender <ArrowRight size={16} /></a>
            </div>
            {channel === "online" ? <TicketingMockup /> : (
              <div className="producer-pos-mock">
                <div className="producer-pos-mock__top"><span><span /> PUNTO DE VENTA ACTIVO</span><span>Vendedor · Camila R.</span></div>
                <div className="producer-pos-mock__body">
                  <div className="producer-pos-mock__title"><div><SectionLabel>VENTA PRESENCIAL</SectionLabel><h4>Festival Aurora</h4></div><span><MapPin size={13} /> PUERTA NORTE</span></div>
                  <div className="producer-pos-mock__product"><span className="producer-pos-mock__icon"><Ticket size={17} /></span><span><strong>Acceso general</strong><small>Disponibles: 1.248</small></span><b>$24.900</b></div>
                  <div className="producer-pos-mock__product"><span className="producer-pos-mock__icon"><Ticket size={17} /></span><span><strong>Acceso VIP</strong><small>Disponibles: 186</small></span><b>$59.900</b></div>
                  <div className="producer-pos-mock__total"><span>Total a pagar</span><strong>$24.900</strong></div>
                  <div className="producer-pos-mock__payments"><span><Wallet size={15} /> Efectivo</span><span><CreditCard size={15} /> Tarjeta</span></div>
                  <button type="button" onClick={() => setLeadOpen(true)}>Cobrar entrada <ArrowRight size={15} /></button>
                </div>
                <div className="producer-pos-mock__footer"><ScanLine size={14} /> Inventario sincronizado · Actualizado ahora</div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="producer-brand-section producer-section" id="producer-brand">
        <div className="producer-container producer-brand-layout">
          <div className="producer-brand__copy">
            <SectionLabel>IDENTIDAD DE MARCA</SectionLabel>
            <h2>Tu evento.<br />Tu marca.<br /><span>Tu experiencia.</span></h2>
            <p>Personaliza la experiencia de compra para que se sienta como una extensión natural de tu evento.</p>
            <div className="producer-brand__controls">
              <label className="producer-brand__field">Nombre del evento
                <input value={brandName} onChange={(event) => setBrandName(event.target.value)} aria-label="Nombre del evento" />
              </label>
              <div className="producer-brand__field"><span>Color de marca</span>
                <div className="producer-color-picker">
                  {brandColors.map((color) => (
                    <button
                      type="button"
                      key={color.name}
                      style={{ "--swatch": color.value }}
                      className={brandColor === color.value ? "is-active" : ""}
                      aria-label={color.name}
                      aria-pressed={brandColor === color.value}
                      onClick={() => setBrandColor(color.value)}
                    >{brandColor === color.value && <Check size={12} />}</button>
                  ))}
                </div>
              </div>
              <label className="producer-brand__field">Tipografía
                <select value={font} onChange={(event) => setFont(event.target.value)}>
                  {fontOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
            </div>
            <div className="producer-brand__url"><Globe size={14} /><span><i>https://</i><b>suevento</b>.miweb.cl</span><Check size={14} /></div>
            <small>Dominio, paleta, tipografía y portada configurables según tu plan.</small>
          </div>
          <div className="producer-brand-preview">
            <div className="producer-brand-preview__toolbar"><span><i /><i /><i /></span><span>suevento.miweb.cl <LockKeyhole size={11} /></span><span><ArrowUpRight size={14} /></span></div>
            <div className="producer-brand-preview__cover" style={{ "--brand-color": brandColor }}>
              <img src="https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=85" alt="Vista previa de portada de un festival" />
              <div className="producer-brand-preview__shade" />
              <div className="producer-brand-preview__event" style={{ "--preview-font": font === "Playfair" ? "Georgia, serif" : font === "Mono" ? "monospace" : "Inter, Arial, sans-serif" }}>
                <span>28 NOVIEMBRE · SANTIAGO</span>
                <h3>{brandName || "Tu evento"}</h3>
                <p>La música nos encuentra.</p>
                <button type="button" style={{ backgroundColor: brandColor }} onClick={() => setLeadOpen(true)}>Ver entradas <ArrowUpRight size={14} /></button>
              </div>
              <span className="producer-brand-preview__logo" style={{ backgroundColor: brandColor }}>F.</span>
            </div>
            <div className="producer-brand-preview__tickets">
              <span><Ticket size={15} /> Entradas</span>
              <div><strong>Acceso general</strong><span>Desde $24.900</span><button type="button" onClick={() => setLeadOpen(true)}>Elegir</button></div>
              <div><strong>Acceso VIP</strong><span>Desde $59.900</span><button type="button" onClick={() => setLeadOpen(true)}>Elegir</button></div>
            </div>
            <div className="producer-brand-preview__cursor"><MousePointer2 size={18} /><span>Así se verá tu evento</span></div>
          </div>
        </div>
      </section>

      <section className="producer-data producer-section" id="producer-data">
        <div className="producer-container">
          <div className="producer-section-heading">
            <SectionLabel>DATOS QUE MUEVEN DECISIONES</SectionLabel>
            <h2>Conoce a tu público.<br />Haz crecer tu evento<span>.</span></h2>
            <p>Una mirada clara a tus ventas, asistentes y próximos pasos, en el mismo panel.</p>
          </div>
          <SalesDashboard segment={segment} setSegment={setSegment} />
          <div className="producer-data__features">
            <div><span><Users size={17} /></span><strong>Tu comunidad</strong><p>Consulta registros, ventas y clientes desde un mismo lugar.</p></div>
            <div><span><ScanLine size={17} /></span><strong>Check-in conectado</strong><p>Revisa ingresos y ritmo de acceso durante el evento.</p></div>
            <div><span><Radio size={17} /></span><strong>Embajadores y marketing</strong><p>Entiende de dónde viene tu audiencia y activa campañas.</p></div>
            <div><span><BarChart3 size={17} /></span><strong>Segmentos útiles</strong><p>Distingue grupos VIP, nuevos y asistentes recurrentes.</p></div>
          </div>
        </div>
      </section>

      <section className="producer-operations producer-section" id="producer-operations">
        <div className="producer-container">
          <div className="producer-section-heading">
            <SectionLabel>EL CONTROL, EN TUS MANOS</SectionLabel>
            <h2>Tú produces.<br />Tú tienes el control<span>.</span></h2>
            <p>Visibilidad en cada etapa, desde el primer ticket hasta el arqueo de caja.</p>
          </div>
          <div className="producer-operations__layout">
            <div className="producer-operations__list">
              {operations.map((item, index) => {
                const Icon = item.icon;
                return (
                  <button
                    className={`producer-operation${activeOperation === index ? " is-active" : ""}`}
                    type="button"
                    key={item.title}
                    aria-pressed={activeOperation === index}
                    onClick={() => setActiveOperation(index)}
                  >
                    <span className="producer-operation__icon"><Icon size={18} /></span>
                    <span className="producer-operation__copy"><strong>{item.title}</strong><small>{item.description}</small></span>
                    <ArrowUpRight size={16} />
                  </button>
                );
              })}
            </div>
            <div className="producer-operations__preview">
              <div className="producer-operations__preview-top"><span><LayoutDashboard size={15} /> OPERACIÓN DEL EVENTO</span><span><i /> ACTUALIZADO EN VIVO</span></div>
              <div className="producer-operations__preview-title"><SectionLabel>FESTIVAL AURORA · 28 NOV</SectionLabel><h3>{operations[activeOperation].title}<span>.</span></h3><p>{operations[activeOperation].description}</p></div>
              <div className="producer-operations__metric"><span>{operations[activeOperation].metricLabel}</span><strong>{operations[activeOperation].metric}</strong><div><span style={{ width: `${[72, 81, 64, 88][activeOperation]}%` }} /></div><small><Check size={12} /> Datos de muestra para demostración</small></div>
              <div className="producer-operations__mini-cards"><span><Wallet size={14} /> Efectivo <b>$1,2M</b></span><span><CreditCard size={14} /> Tarjeta <b>$1,6M</b></span><span><TrendingUp size={14} /> Propinas <b>$84K</b></span></div>
            </div>
          </div>
        </div>
      </section>

      <section className="producer-support producer-section">
        <div className="producer-container">
          <div className="producer-support__card">
            <div className="producer-support__icon"><Headphones size={23} /></div>
            <div className="producer-support__copy">
              <SectionLabel light>PERSONAS DETRÁS DE LA PLATAFORMA</SectionLabel>
              <h2>Un equipo que responde<br />y te entiende<span>.</span></h2>
              <p>La tecnología importa. Tener a quién llamar cuando el evento está pasando, también.</p>
            </div>
            <a href="mailto:hola@tickeven.cl?subject=Quiero%20conocer%20TickEven">
              Hablemos de tu evento <ArrowUpRight size={16} />
            </a>
            <div className="producer-support__decoration" aria-hidden="true">✳</div>
          </div>
        </div>
      </section>

      <section className="producer-faq producer-section" id="producer-faq">
        <div className="producer-container producer-faq__layout">
          <div className="producer-faq__intro">
            <SectionLabel>ANTES DE EMPEZAR</SectionLabel>
            <h2>Preguntas<br />frecuentes<span>.</span></h2>
            <p>¿Te queda alguna duda? <a href="mailto:hola@tickeven.cl">Conversemos <ArrowUpRight size={13} /></a></p>
            <CircleHelp size={90} strokeWidth={1} aria-hidden="true" />
          </div>
          <div className="producer-faq__list">
            {faqs.map((faq, index) => (
              <div className={`producer-faq__item${openFaq === index ? " is-open" : ""}`} key={faq.question}>
                <button type="button" aria-expanded={openFaq === index} onClick={() => setOpenFaq(openFaq === index ? -1 : index)}>
                  <span>{faq.question}</span><ChevronDown size={17} />
                </button>
                {openFaq === index && <p>{faq.answer}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="producer-final-cta">
        <div className="producer-container producer-final-cta__inner">
          <div><SectionLabel light>EL PRÓXIMO CAPÍTULO ES TUYO</SectionLabel><h2>Tu próximo evento<br />empieza aquí<span>.</span></h2><p>Tecnología para vender, operar y hacer crecer tus eventos.</p></div>
          <div className="producer-final-cta__actions">
            <a className="producer-button producer-button--primary" href="/productores/login">Crear mi evento <ArrowUpRight size={17} /></a>
            <a href="mailto:hola@tickeven.cl?subject=Quiero%20conocer%20TickEven">Contáctanos <Mail size={15} /></a>
          </div>
          <span className="producer-final-cta__star" aria-hidden="true">✳</span>
        </div>
      </section>

      {showFloatingCta && (
        <a className="producer-mobile-cta" href="/productores/login">
          Crear mi evento <ArrowUpRight size={16} />
        </a>
      )}

      {leadOpen && <ProducerLeadDialog onClose={() => setLeadOpen(false)} onSubmit={submitLead} />}
      {leadNotice && <div className="producer-lead-toast" role="status"><Check size={17} />{leadNotice}<button type="button" aria-label="Cerrar aviso" onClick={() => setLeadNotice("")}><X size={15} /></button></div>}
    </div>
  );
}

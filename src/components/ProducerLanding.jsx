import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  CircleHelp,
  Globe,
  Headphones,
  LayoutDashboard,
  Mail,
  Package,
  ShoppingBag,
  ScanLine,
  ShieldCheck,
  Ticket,
} from "lucide-react";
import Brand from "./Brand.jsx";

const faqs = [
  {
    question: "¿Qué puedo gestionar en TickEven?",
    answer:
      "Puedes publicar eventos, configurar tipos de entradas pagadas o gratuitas, ofrecer productos adicionales y consultar ventas e inventario desde tu espacio de productor.",
  },
  {
    question: "¿Puedo crear eventos gratuitos?",
    answer:
      "Sí. Puedes ofrecer entradas gratuitas y gestionar la inscripción sin pasar por el pago de Mercado Pago.",
  },
  {
    question: "¿Qué información de ventas puedo revisar?",
    answer:
      "El panel muestra entradas vendidas, reservadas y disponibles, además de inventario y ventas de productos. También puedes exportar el reporte de ventas a CSV.",
  },
  {
    question: "¿Puedo vender productos además de entradas?",
    answer:
      "Sí. Puedes crear productos adicionales, configurar opciones e inventario, y ofrecerlos en la página del evento o durante el checkout.",
  },
  {
    question: "¿Cómo se procesan los pagos de entradas pagadas?",
    answer:
      "Las compras pagadas se procesan mediante Mercado Pago. Las inscripciones gratuitas no requieren pasar por ese checkout.",
  },
];

const operations = [
  {
    title: "Ventas e inventario",
    description: "Consulta las entradas vendidas, reservadas y disponibles de tus eventos.",
    icon: Package,
    detail: "Estado de entradas por tipo",
  },
  {
    title: "Productos adicionales",
    description: "Crea productos, configura sus opciones y administra su disponibilidad.",
    icon: ShoppingBag,
    detail: "Productos e inventario asociado",
  },
  {
    title: "Reportes de ventas",
    description: "Revisa las ventas de tus eventos y descarga la información en CSV.",
    icon: BarChart3,
    detail: "Reporte exportable a CSV",
  },
  {
    title: "Validación de entradas",
    description: "El equipo autorizado puede validar los tickets mediante su código QR.",
    icon: ScanLine,
    detail: "Validación de tickets con QR",
  },
];

function SectionLabel({ children, light = false }) {
  return <span className={`producer-kicker${light ? " producer-kicker--light" : ""}`}>{children}</span>;
}

function TicketingMockup() {
  return (
    <div className="producer-ticketing" aria-label="Vista ilustrativa de la página de un evento">
      <div className="producer-ticketing__topbar">
        <Brand />
        <span className="producer-ticketing__secure">VISTA DE EJEMPLO</span>
      </div>
      <div className="producer-ticketing__event">
        <div>
          <span>PUBLICACIÓN DEL EVENTO</span>
          <h3>Nombre de tu evento</h3>
          <p>Fecha, lugar y detalles que configures</p>
        </div>
        <Ticket size={24} aria-hidden="true" />
      </div>
      <div className="producer-ticketing__step">
        <span><b>1</b> Tipos de entrada</span>
        <small>SEGÚN TU EVENTO</small>
      </div>
      <div className="producer-ticketing__ticket-row">
        <div><strong>Entrada general</strong><span>Precio y disponibilidad definidos por ti</span></div>
        <Ticket size={16} aria-hidden="true" />
      </div>
      <div className="producer-ticketing__step">
        <span><b>2</b> Productos adicionales</span>
        <small>OPCIONAL</small>
      </div>
      <div className="producer-ticketing__ticket-row">
        <div><strong>Agrega productos</strong><span>Ofrece adicionales en la ficha o el checkout</span></div>
        <ShoppingBag size={16} aria-hidden="true" />
      </div>
      <p className="producer-ticketing__caption">Vista ilustrativa; los datos reales dependen de la configuración de cada evento.</p>
    </div>
  );
}

function ProducerDashboardPreview() {
  return (
    <div className="producer-dashboard">
      <div className="producer-dashboard__sidebar">
        <div className="producer-dashboard__logo"><span><LayoutDashboard size={13} /></span> TickEven</div>
        <span className="producer-dashboard__nav-active"><LayoutDashboard size={14} /> Resumen</span>
        <span><Ticket size={14} /> Mis eventos</span>
        <span><Package size={14} /> Productos</span>
        <span><BarChart3 size={14} /> Ventas e inventario</span>
        <div className="producer-dashboard__account"><span>PR</span><small>Espacio productor</small></div>
      </div>
      <div className="producer-dashboard__main">
        <div className="producer-dashboard__header">
          <div><small>DASHBOARD DE PRODUCTORES / RESUMEN</small><h3>Tu evento, en un solo lugar</h3></div>
          <span className="producer-dashboard__live">VISTA ILUSTRATIVA</span>
        </div>
        <div className="producer-dashboard__metrics">
          <div><span>Entradas vendidas</span><strong>—</strong><small>Datos de tu evento</small></div>
          <div><span>Entradas reservadas</span><strong>—</strong><small>Reservas vigentes</small></div>
          <div><span>Disponibilidad</span><strong>—</strong><small>Inventario por tipo</small></div>
        </div>
        <div className="producer-dashboard__charts">
          <div className="producer-chart">
            <div className="producer-chart__head"><strong>Ventas e inventario</strong><span>Por evento</span></div>
            <div className="producer-dashboard__chart-empty">Consulta el estado de tus entradas y productos desde el panel.</div>
          </div>
        </div>
        <div className="producer-dashboard__bottom"><span><Ticket size={14} /> Entradas</span><span><Package size={14} /> Productos adicionales</span><span><BarChart3 size={14} /> Exportación CSV</span></div>
      </div>
    </div>
  );
}

export default function ProducerLanding() {
  const landingRef = useRef(null);
  const [activeOperation, setActiveOperation] = useState(0);
  const [openFaq, setOpenFaq] = useState(0);
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

  return (
    <div className="producer-page" id="productores" ref={landingRef}>
      <section className="producer-hero" aria-labelledby="producer-hero-title">
        <div className="producer-container producer-hero__layout">
          <div className="producer-hero__copy">
            <SectionLabel light>HERRAMIENTAS PARA QUIENES HACEN QUE PASE</SectionLabel>
            <h2 id="producer-hero-title">El sistema operativo<br />para tu evento<br />o congreso<span>.</span></h2>
            <p>Publica eventos, vende entradas, ofrece productos adicionales y consulta ventas e inventario desde tu dashboard.</p>
            <div className="producer-hero__actions">
              <a className="producer-button producer-button--primary" href="/productores/login">
                Crear mi evento <ArrowUpRight size={17} />
              </a>
              <a className="producer-hero__secondary" href="#producer-sales">Ver cómo funciona <ArrowDown size={15} /></a>
            </div>
            <div className="producer-hero__trust"><ShieldCheck size={15} /> Entradas pagadas o gratuitas, productos y reportes.</div>
          </div>
          <div className="producer-hero__visual">
            <div className="producer-hero__floating-label"><span><Check size={14} /></span> Dashboard de productores</div>
            <ProducerDashboardPreview />
            <div className="producer-hero__corner-note">UNA PLATAFORMA<br /><strong>TU FORMA DE PRODUCIR</strong></div>
          </div>
        </div>
        <a className="producer-scroll-cue" href="#producer-proof">DESLIZA PARA DESCUBRIR <ArrowDown size={14} /></a>
      </section>

      <section className="producer-proof" id="producer-proof" aria-label="Una plataforma para tu operación">
        <div className="producer-container producer-proof__inner">
          <p>Las herramientas que necesitas para gestionar tu evento.</p>
          <div className="producer-proof__stats">
            <div><strong>Entradas</strong><span>Pagadas o gratuitas</span></div>
            <div><strong>Productos</strong><span>Adicionales y merchandising</span></div>
            <div><strong>Reportes</strong><span>Ventas e inventario exportables</span></div>
          </div>
          <small>La vista del dashboard es ilustrativa; los datos reales corresponden a cada evento.</small>
        </div>
      </section>

      <section className="producer-sales producer-section" id="producer-sales">
        <div className="producer-container">
          <div className="producer-section-heading">
            <SectionLabel>PUBLICACIÓN Y CHECKOUT</SectionLabel>
            <h2>Una página para presentar<br />y vender tu evento<span>.</span></h2>
            <p>Configura los detalles y tipos de entrada; también puedes ofrecer productos adicionales.</p>
          </div>
          <div className="producer-channel-panel">
            <div className="producer-channel-panel__copy">
              <span className="producer-channel-panel__number">01 / EVENTOS</span>
              <h3>Entradas y productos.<br /><span>Información clara para tus asistentes.</span></h3>
              <p>La ficha del evento muestra su portada, descripción, fecha, ubicación, tipos de entrada y productos disponibles.</p>
              <ul>
                {["Entradas pagadas o gratuitas", "Productos adicionales en evento y checkout", "Inscripción gratuita sin Mercado Pago"].map((item) => (
                  <li key={item}><Check size={15} /> {item}</li>
                ))}
              </ul>
              <a className="producer-text-link" href="/productores/login">Empezar a vender <ArrowRight size={16} /></a>
            </div>
            <TicketingMockup />
          </div>
        </div>
      </section>

      <section className="producer-brand-section producer-section" id="producer-brand">
        <div className="producer-container producer-brand-layout">
          <div className="producer-brand__copy">
            <SectionLabel>FICHA PÚBLICA DEL EVENTO</SectionLabel>
            <h2>Tu información,<br />en un solo lugar<span>.</span></h2>
            <p>Presenta el evento con su imagen, descripción, fecha, ubicación y alternativas de entrada. La página también puede mostrar productos adicionales.</p>
            <ul className="producer-brand__details">
              <li><Check size={15} /> Portada y detalles del evento</li>
              <li><Check size={15} /> Precios, disponibilidad e inscripción</li>
              <li><Check size={15} /> Productos asociados a la compra</li>
            </ul>
          </div>
          <div className="producer-brand-preview">
            <div className="producer-brand-preview__toolbar"><span><i /><i /><i /></span><span>FICHA PÚBLICA DE EVENTO</span><span><Globe size={14} /></span></div>
            <div className="producer-brand-preview__cover">
              <img src="https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=85" alt="Vista previa de portada de un festival" />
              <div className="producer-brand-preview__shade" />
              <div className="producer-brand-preview__event">
                <span>FECHA Y UBICACIÓN</span>
                <h3>Nombre de tu evento</h3>
                <p>Descripción e información para tus asistentes.</p>
                <span className="producer-brand-preview__action">Ver entradas <ArrowUpRight size={14} /></span>
              </div>
              <span className="producer-brand-preview__logo"><Brand /></span>
            </div>
            <div className="producer-brand-preview__tickets">
              <span><Ticket size={15} /> ENTRADAS</span>
              <div><strong>Tipo de entrada</strong><span>Precio configurado por productor</span><span>Ver detalle</span></div>
            </div>
            <small className="producer-brand-preview__caption">Vista ilustrativa. El diseño mantiene la identidad de TickEven.</small>
          </div>
        </div>
      </section>

      <section className="producer-data producer-section" id="producer-data">
        <div className="producer-container">
          <div className="producer-section-heading">
            <SectionLabel>INFORMACIÓN DE TU EVENTO</SectionLabel>
            <h2>Revisa ventas,<br />entradas y productos<span>.</span></h2>
            <p>El dashboard reúne cifras de venta e inventario para cada evento de tu cuenta.</p>
          </div>
          <ProducerDashboardPreview />
          <div className="producer-data__features">
            <div><span><Ticket size={17} /></span><strong>Entradas vendidas</strong><p>Consulta unidades vendidas, reservadas y disponibles por tipo.</p></div>
            <div><span><ShoppingBag size={17} /></span><strong>Productos adicionales</strong><p>Revisa su stock y las unidades asociadas a tus ventas.</p></div>
            <div><span><BarChart3 size={17} /></span><strong>Reportes</strong><p>Exporta el reporte de ventas de tus eventos en CSV.</p></div>
            <div><span><ScanLine size={17} /></span><strong>Validación QR</strong><p>Valida las entradas con el lector de códigos QR.</p></div>
          </div>
        </div>
      </section>

      <section className="producer-operations producer-section" id="producer-operations">
        <div className="producer-container">
          <div className="producer-section-heading">
            <SectionLabel>HERRAMIENTAS PARA PRODUCTORES</SectionLabel>
            <h2>Gestiona tu evento<br />desde el dashboard<span>.</span></h2>
            <p>Accede a las funciones implementadas para publicar eventos y administrar ventas e inventario.</p>
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
              <div className="producer-operations__preview-top"><span><LayoutDashboard size={15} /> FUNCIONES DEL DASHBOARD</span><span>VISTA ILUSTRATIVA</span></div>
              <div className="producer-operations__preview-title"><SectionLabel>ESPACIO DE PRODUCTOR</SectionLabel><h3>{operations[activeOperation].title}<span>.</span></h3><p>{operations[activeOperation].description}</p></div>
              <div className="producer-operations__metric"><span>En tu panel</span><strong>{operations[activeOperation].detail}</strong><small><Check size={12} /> La información corresponde a tus eventos.</small></div>
            </div>
          </div>
        </div>
      </section>

      <section className="producer-support producer-section">
        <div className="producer-container">
          <div className="producer-support__card">
            <div className="producer-support__icon"><Headphones size={23} /></div>
            <div className="producer-support__copy">
              <SectionLabel light>¿QUIERES PUBLICAR?</SectionLabel>
              <h2>Cuéntanos sobre<br />tu evento<span>.</span></h2>
              <p>Escríbenos para consultar sobre TickEven y sus herramientas para productores.</p>
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

    </div>
  );
}

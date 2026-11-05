import { useEffect } from "react";
import { ArrowLeft, ArrowUpRight, Ticket } from "lucide-react";
import ProducerLanding from "./ProducerLanding.jsx";

export default function ProducerPage() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "TickEven.cl para Productores — Vende y opera tus eventos";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <div className="producer-site">
      <header className="producer-site-header">
        <nav className="producer-site-header__inner" aria-label="Navegación de productores">
          <a className="brand" href="/" aria-label="TickEven.cl, inicio">
            <span className="brand__mark"><Ticket size={21} strokeWidth={2.5} /></span>
            <span>tickeven<span className="brand__dot">.</span>cl</span>
          </a>
          <div className="producer-site-header__links">
            <a href="#producer-sales">Ventas</a>
            <a href="#producer-brand">Marca</a>
            <a href="#producer-data">Analítica</a>
            <a href="#producer-operations">Operación</a>
            <a href="#producer-faq">FAQ</a>
          </div>
          <a className="producer-site-header__back" href="/#eventos">
            <ArrowLeft size={14} /> Volver a eventos
          </a>
        </nav>
      </header>
      <main>
        <ProducerLanding />
      </main>
      <footer className="producer-site-footer">
        <a className="brand" href="/" aria-label="TickEven.cl, inicio">
          <span className="brand__mark"><Ticket size={19} strokeWidth={2.5} /></span>
          <span>tickeven<span className="brand__dot">.</span>cl</span>
        </a>
        <span>© 2026 TickEven.cl · Herramientas para eventos.</span>
        <a href="/#eventos">Explorar eventos <ArrowUpRight size={14} /></a>
      </footer>
    </div>
  );
}

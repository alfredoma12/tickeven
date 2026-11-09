import { useEffect } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import ProducerLanding from "./ProducerLanding.jsx";
import Brand from "./Brand.jsx";

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
          <Brand />
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
        <Brand />
        <span>© 2026 TickEven.cl · Herramientas para eventos.</span>
        <a href="mailto:hola@tickeven.cl">Soporte: hola@tickeven.cl</a>
        <a href="/#eventos">Explorar eventos <ArrowUpRight size={14} /></a>
      </footer>
    </div>
  );
}

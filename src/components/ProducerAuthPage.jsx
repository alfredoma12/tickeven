import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, LockKeyhole, Ticket } from "lucide-react";
import { startProducerDemoSession } from "../data/producerPortal.js";

export default function ProducerAuthPage() {
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Acceso de productores — TickEven.cl";
  }, []);

  const submitLogin = (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    try {
      startProducerDemoSession(
        String(formData.get("username")),
        String(formData.get("password")),
      );
      window.location.href = "/productores/dashboard";
    } catch (loginError) {
      console.error("No se pudo iniciar la sesión de demostración.", loginError);
      setError("No se pudo abrir la sesión en este navegador. Revisa la configuración de almacenamiento.");
    }
  };

  return (
    <main className="producer-auth-page">
      <header className="producer-auth-header">
        <a className="brand" href="/" aria-label="TickEven.cl, inicio">
          <span className="brand__mark"><Ticket size={21} strokeWidth={2.5} /></span>
          <span>tickeven<span className="brand__dot">.</span>cl</span>
        </a>
        <a href="/productores"><ArrowLeft size={15} /> Plataforma para productores</a>
      </header>
      <section className="producer-auth-card" aria-labelledby="producer-auth-title">
        <span className="producer-auth-card__icon"><LockKeyhole size={21} /></span>
        <span className="producer-auth-kicker">PORTAL DE PRODUCTORES</span>
        <h1 id="producer-auth-title">Tu próximo evento empieza aquí<span>.</span></h1>
        <p>Ingresa a tu espacio para crear eventos, administrar entradas y revisar lo que publicaste.</p>
        <form className="producer-auth-form" onSubmit={submitLogin}>
          <label htmlFor="producer-username">Usuario</label>
          <input id="producer-username" name="username" autoComplete="username" placeholder="Tu usuario de productor" required />
          <label htmlFor="producer-password">Contraseña</label>
          <input id="producer-password" name="password" type="password" autoComplete="current-password" placeholder="Tu contraseña" required />
          {error && <p className="producer-portal-error" role="alert">{error}</p>}
          <button type="submit">Ingresar al dashboard <ArrowRight size={16} /></button>
        </form>
        <aside className="producer-demo-notice">
          <strong>Acceso de demostración</strong>
          <span>El proyecto todavía no tiene autenticación de servidor. En este prototipo, cualquier usuario y contraseña no vacíos abren una sesión local en este navegador. No uses credenciales reales.</span>
        </aside>
      </section>
      <p className="producer-auth-footer">¿Aún no trabajas con TickEven? <a href="/productores">Conoce la plataforma</a></p>
    </main>
  );
}

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, LockKeyhole, Ticket } from "lucide-react";
import { signInProducer, signUpProducer } from "../data/producerPortal.js";

export default function ProducerAuthPage({ onNavigate }) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState("login");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = "Acceso de productores — TickEven.cl";
  }, []);

  const submitLogin = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError("");
    setNotice("");
    setSubmitting(true);
    try {
      const email = String(formData.get("email"));
      const password = String(formData.get("password"));
      if (mode === "signup") {
        const result = await signUpProducer(
          email,
          password,
          String(formData.get("name")),
        );
        if (result.session) {
          onNavigate("/productores/dashboard");
        } else {
          setNotice("Cuenta creada. Confirma tu correo para poder ingresar.");
          setMode("login");
        }
      } else {
        await signInProducer(email, password);
        onNavigate("/productores/dashboard");
      }
    } catch (loginError) {
      console.error("No se pudo autenticar al productor con Supabase.", loginError);
      setError(loginError.message || "No se pudo completar el acceso. Revisa el correo y la contraseña.");
    } finally {
      setSubmitting(false);
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
        <h1 id="producer-auth-title">{mode === "signup" ? "Crea tu cuenta de productor" : "Tu próximo evento empieza aquí"}<span>.</span></h1>
        <p>{mode === "signup" ? "Regístrate para publicar y administrar tus eventos desde TickEven." : "Ingresa a tu espacio para crear eventos, administrar entradas y revisar lo que publicaste."}</p>
        <form className="producer-auth-form" onSubmit={submitLogin}>
          {mode === "signup" && <>
            <label htmlFor="producer-name">Nombre del productor</label>
            <input id="producer-name" name="name" autoComplete="name" placeholder="Tu nombre o productora" minLength={2} maxLength={80} required />
          </>}
          <label htmlFor="producer-email">Correo</label>
          <input id="producer-email" name="email" type="email" autoComplete="email" placeholder="tu@correo.cl" required />
          <label htmlFor="producer-password">Contraseña</label>
          <input id="producer-password" name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={6} placeholder="Mínimo 6 caracteres" required />
          {error && <p className="producer-portal-error" role="alert">{error}</p>}
          {notice && <p className="producer-auth-notice" role="status">{notice}</p>}
          <button type="submit" disabled={submitting}>{submitting ? "Conectando…" : mode === "signup" ? "Crear cuenta" : "Ingresar al dashboard"} <ArrowRight size={16} /></button>
          <button className="producer-auth-switch" type="button" onClick={() => { setError(""); setNotice(""); setMode(mode === "signup" ? "login" : "signup"); }}>
            {mode === "signup" ? "Ya tengo cuenta · Iniciar sesión" : "¿Primera vez? Crear cuenta de productor"}
          </button>
        </form>
        <aside className="producer-demo-notice producer-demo-notice--connected">
          <strong>Acceso con Supabase Auth</strong>
          <span>Las cuentas y sesiones se validan en Supabase. Si el proyecto solicita confirmación, revisa el correo antes de iniciar sesión.</span>
        </aside>
      </section>
      <p className="producer-auth-footer">¿Aún no trabajas con TickEven? <a href="/productores">Conoce la plataforma</a></p>
    </main>
  );
}

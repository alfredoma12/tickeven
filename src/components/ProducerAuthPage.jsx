import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, LockKeyhole } from "lucide-react";
import { signInAccount, signUpAccount } from "../data/producerPortal.js";
import Brand from "./Brand.jsx";

function isValidRut(value) {
  const rut = value.replace(/[.\s-]/g, "").toUpperCase();
  if (!/^\d{7,8}[0-9K]$/.test(rut)) return false;
  let multiplier = 2;
  let sum = 0;
  for (let index = rut.length - 2; index >= 0; index -= 1) {
    sum += Number(rut[index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const result = 11 - (sum % 11);
  return rut.at(-1) === (result === 11 ? "0" : result === 10 ? "K" : String(result));
}

export default function ProducerAuthPage({ accountType = "producer", onNavigate }) {
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState(accountType === "admin" ? "login" : "login");
  const [submitting, setSubmitting] = useState(false);

  const accountLabel = accountType === "collaborator"
    ? "COLABORADORES"
    : accountType === "admin" ? "ADMINISTRACIÓN" : "PRODUCTORES";
  const dashboardPath = accountType === "admin"
    ? "/admin/dashboard"
    : accountType === "collaborator" ? "/colaboradores/dashboard" : "/productores/dashboard";
  const isAdmin = accountType === "admin";

  useEffect(() => {
    document.title = `Acceso de ${accountLabel.toLocaleLowerCase("es")} — TickEven.cl`;
  }, [accountLabel]);

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
        const confirmEmail = String(formData.get("confirmEmail"));
        const confirmPassword = String(formData.get("confirmPassword"));
        if (email !== confirmEmail) throw new Error("Los correos electrónicos no coinciden.");
        if (password !== confirmPassword) throw new Error("Las contraseñas no coinciden.");
        const rut = String(formData.get("rut")).trim();
        if (!isValidRut(rut)) throw new Error("Ingresa un RUT chileno válido.");
        await signUpAccount({
          email,
          password,
          fullName: String(formData.get("fullName")),
          rut,
          phone: String(formData.get("phone")),
          role: accountType,
        });
        setNotice("Recibimos tu solicitud. Un administrador debe aprobarla antes de que puedas ingresar.");
        setMode("login");
      } else {
        await signInAccount(email, password, accountType);
        onNavigate(dashboardPath);
      }
    } catch (loginError) {
      console.error("No se pudo completar el acceso con Supabase.", loginError);
      const message = loginError.message?.toLowerCase() || "";
      if (message.includes("email rate limit exceeded") || message.includes("too many requests")) {
        setError("Supabase alcanzó el límite de correos de registro/confirmación. No vuelvas a intentarlo repetidamente; espera a que se restablezca el límite o configura SMTP personalizado en Supabase.");
      } else if (mode === "signup" && message.includes("email signups are disabled")) {
        setError("El registro por correo está desactivado en Supabase. Pídele al administrador que habilite Email signups en Authentication → Sign In / Providers → Email.");
      } else if (mode === "login" && message.includes("invalid login credentials")) {
        setError("Correo o contraseña incorrectos. Si aún no tienes cuenta, solicita acceso desde el enlace inferior; si ya te registraste, verifica el correo y la contraseña usados.");
      } else if (mode === "login" && message.includes("email not confirmed")) {
        setError("Confirma tu correo desde el mensaje enviado por Supabase antes de iniciar sesión.");
      } else if (mode === "signup" && message.includes("already registered")) {
        setError("No se pudo crear la cuenta con ese correo. En Supabase → Authentication → Users, revisa si el usuario aún existe. Si existe, inicia sesión o restablece su contraseña; no basta con borrar su perfil.");
      } else {
        setError(loginError.message || "No se pudo completar el acceso. Revisa tus datos e inténtalo otra vez.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const title = mode === "signup"
    ? accountType === "collaborator" ? "Solicita acceso como colaborador" : "Crea tu cuenta de productor"
    : isAdmin ? "Acceso de administración" : accountType === "collaborator" ? "Validación de entradas" : "Tu próximo evento empieza aquí";

  return (
    <main className="producer-auth-page">
      <header className="producer-auth-header">
        <Brand />
        <a href={isAdmin ? "/" : "/productores"}><ArrowLeft size={15} /> {isAdmin ? "Volver al sitio" : "Plataforma TickEven"}</a>
      </header>
      <section className="producer-auth-card" aria-labelledby="producer-auth-title">
        <span className="producer-auth-card__icon"><LockKeyhole size={21} /></span>
        <span className="producer-auth-kicker">PORTAL DE {accountLabel}</span>
        <h1 id="producer-auth-title">{title}<span>.</span></h1>
        <p>{mode === "signup"
          ? "Completa tus datos. La cuenta quedará pendiente hasta que el administrador la apruebe."
          : isAdmin
            ? "Ingresa con la cuenta administrativa habilitada en Supabase."
            : "Ingresa con el correo y contraseña de tu cuenta aprobada."}</p>
        <form className="producer-auth-form" onSubmit={submitLogin}>
          {mode === "signup" && <>
            <label htmlFor="account-full-name">Nombre completo</label>
            <input id="account-full-name" name="fullName" autoComplete="name" placeholder="Nombre y apellido" minLength={2} maxLength={100} required />
            <label htmlFor="account-rut">RUT</label>
            <input id="account-rut" name="rut" autoComplete="off" placeholder="12.345.678-9" maxLength={12} required />
            <label htmlFor="account-phone">Teléfono</label>
            <input id="account-phone" name="phone" type="tel" autoComplete="tel" placeholder="+56 9 1234 5678" minLength={8} maxLength={24} required />
          </>}
          <label htmlFor="account-email">Correo</label>
          <input id="account-email" name="email" type="email" autoComplete="email" placeholder="tu@correo.cl" required />
          {mode === "signup" && <>
            <label htmlFor="account-confirm-email">Confirma tu correo</label>
            <input id="account-confirm-email" name="confirmEmail" type="email" autoComplete="email" placeholder="Repite tu correo" required />
          </>}
          <label htmlFor="account-password">Contraseña</label>
          <input id="account-password" name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={8} placeholder="Mínimo 8 caracteres" required />
          {mode === "signup" && <>
            <label htmlFor="account-confirm-password">Confirma tu contraseña</label>
            <input id="account-confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} placeholder="Repite tu contraseña" required />
          </>}
          {error && <p className="producer-portal-error" role="alert">{error}</p>}
          {notice && <p className="producer-auth-notice" role="status">{notice}</p>}
          <button type="submit" disabled={submitting}>{submitting ? "Conectando…" : mode === "signup" ? "Enviar solicitud de acceso" : "Ingresar"} <ArrowRight size={16} /></button>
          {!isAdmin && <button className="producer-auth-switch" type="button" onClick={() => { setError(""); setNotice(""); setMode(mode === "signup" ? "login" : "signup"); }}>
            {mode === "signup" ? "Ya tengo cuenta · Iniciar sesión" : accountType === "collaborator" ? "Solicitar cuenta de colaborador" : "Solicitar cuenta de productor"}
          </button>}
        </form>
        <aside className="producer-demo-notice producer-demo-notice--connected">
          <strong>{mode === "signup" ? "Aprobación requerida" : "Acceso protegido con Supabase Auth"}</strong>
          <span>{mode === "signup"
            ? "No tendrás acceso al dashboard hasta que un administrador apruebe tu solicitud."
            : isAdmin
              ? "La clave no está escrita en la web. El rol de administrador se asigna de forma segura en Supabase."
              : "Las cuentas nuevas quedan pendientes y no pueden publicar ni validar entradas hasta ser aprobadas."}</span>
        </aside>
      </section>
    </main>
  );
}

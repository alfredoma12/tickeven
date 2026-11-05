import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Camera, Check, CircleAlert, LogOut, RefreshCw, ShieldCheck, Ticket } from "lucide-react";
import { endProducerSession } from "../data/producerPortal.js";
import { requireSupabase } from "../data/supabase.js";

const validationMessages = {
  already_used: "Esta entrada ya fue utilizada.",
  not_found: "No encontramos una entrada válida con esos datos para tus eventos asignados.",
  invalid_credentials: "Los datos del código no son válidos.",
  account_not_approved: "La cuenta no tiene autorización para validar entradas.",
};

function readQrPayload(value) {
  let payload;
  try {
    payload = JSON.parse(value);
  } catch {
    throw new Error("El QR no corresponde a una entrada de TickEven.");
  }
  if (typeof payload.ticket_id !== "string" || typeof payload.token !== "string") {
    throw new Error("El QR no contiene los datos necesarios para validar esta entrada.");
  }
  return { ticket_id: payload.ticket_id, qr_token: payload.token };
}

export default function CollaboratorDashboard({ onNavigate }) {
  const [profile, setProfile] = useState(null);
  const [assignedEvents, setAssignedEvents] = useState([]);
  const [securityCode, setSecurityCode] = useState("");
  const [validation, setValidation] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cameraState, setCameraState] = useState("idle");
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const validationInProgressRef = useRef(false);

  const loadDashboard = useCallback(async () => {
    const client = requireSupabase();
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (!sessionData.session?.user) {
      onNavigate("/colaboradores/login", { replace: true });
      return;
    }

    const { data: account, error: profileError } = await client
      .from("profiles")
      .select("id, role, status, full_name, rut")
      .eq("id", sessionData.session.user.id)
      .single();
    if (profileError) throw profileError;
    if (account.role !== "collaborator" || account.status !== "approved") {
      await client.auth.signOut();
      onNavigate("/colaboradores/login", { replace: true });
      return;
    }
    const { data: assignments, error: assignmentsError } = await client
      .from("event_staff")
      .select("event_id")
      .eq("collaborator_id", account.id);
    if (assignmentsError) throw assignmentsError;
    const eventIds = (assignments ?? []).map((assignment) => assignment.event_id);
    const { data: events, error: eventsError } = eventIds.length
      ? await client.from("events").select("id, title, starts_at, venue, city").in("id", eventIds)
      : { data: [], error: null };
    if (eventsError) throw eventsError;
    setProfile(account);
    setAssignedEvents(events ?? []);
  }, [onNavigate]);

  useEffect(() => {
    document.title = "Validación de entradas — TickEven.cl";
    let active = true;
    loadDashboard()
      .catch((loadError) => {
        console.error("No se pudo cargar el panel del colaborador.", loadError);
        if (active) setMessage(loadError.message || "No se pudo cargar la información del colaborador.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const { data: listener } = requireSupabase().auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session?.user) onNavigate("/colaboradores/login", { replace: true });
    });
    return () => {
      active = false;
      controlsRef.current?.stop();
      listener.subscription.unsubscribe();
    };
  }, [loadDashboard, onNavigate]);

  const stopCamera = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setCameraState("idle");
  };

  const validate = async (credentials) => {
    if (validationInProgressRef.current) return;
    validationInProgressRef.current = true;
    setBusy(true);
    setValidation(null);
    setMessage("");
    setSecurityCode("");
    try {
      const { data, error } = await requireSupabase().functions.invoke("validate-ticket", { body: credentials });
      if (error) {
        let code;
        try {
          code = (await error.context?.json())?.error;
        } catch (parseError) {
          console.error("No se pudo leer la respuesta de validación.", parseError);
        }
        throw new Error(validationMessages[code] || error.message || "No se pudo validar la entrada.");
      }
      if (!data?.valid) {
        setMessage(validationMessages[data?.reason] || "La entrada no pudo validarse.");
        return;
      }
      setValidation(data);
      stopCamera();
    } catch (validationError) {
      console.error("No se pudo validar la entrada.", validationError);
      setMessage(validationError.message || "No se pudo validar la entrada. Inténtalo otra vez.");
    } finally {
      validationInProgressRef.current = false;
      setBusy(false);
    }
  };

  const startCamera = async () => {
    setMessage("");
    setValidation(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("Este navegador no permite usar la cámara. Usa el código de seguridad de la entrada.");
      return;
    }
    setCameraState("starting");
    try {
      const reader = new BrowserMultiFormatReader();
      controlsRef.current = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
        if (!result || validationInProgressRef.current) return;
        stopCamera();
        let credentials;
        try {
          credentials = readQrPayload(result.getText());
        } catch (qrError) {
          setMessage(qrError.message);
          return;
        }
        void validate(credentials);
      });
      setCameraState("scanning");
    } catch (cameraError) {
      console.error("No se pudo iniciar la cámara para leer el QR.", cameraError);
      setCameraState("idle");
      setMessage(cameraError.name === "NotAllowedError"
        ? "Se denegó el permiso de cámara. Habilítalo en el navegador o utiliza el código de seguridad."
        : "No se pudo iniciar la cámara. Comprueba los permisos e inténtalo otra vez.");
    }
  };

  const submitSecurityCode = (event) => {
    event.preventDefault();
    const code = securityCode.trim();
    if (!code) {
      setMessage("Ingresa el código de seguridad de la entrada.");
      return;
    }
    void validate({ security_code: code });
  };

  const signOut = async () => {
    try {
      stopCamera();
      await endProducerSession();
      onNavigate("/colaboradores/login", { replace: true });
    } catch (signOutError) {
      console.error("No se pudo cerrar la sesión del colaborador.", signOutError);
      setMessage("No se pudo cerrar la sesión. Inténtalo otra vez.");
    }
  };

  if (loading) return <main className="producer-dashboard-loading">Conectando con Supabase…</main>;

  return (
    <div className="producer-dashboard collaborator-dashboard">
      <aside className="producer-dashboard-sidebar">
        <a className="brand" href="/" aria-label="TickEven.cl, inicio">
          <span className="brand__mark"><Ticket size={20} strokeWidth={2.5} /></span><span>tickeven<span className="brand__dot">.</span>cl</span>
        </a>
        <span className="producer-dashboard-sidebar__label">ACCESO DE EVENTO</span>
        <span className="admin-dashboard__nav-link is-current"><ShieldCheck size={17} /> Validar entradas</span>
        <div className="producer-dashboard-sidebar__account"><span>{profile?.full_name?.slice(0, 1).toUpperCase() || "C"}</span><div><strong>{profile?.full_name || "Colaborador"}</strong><small>Acceso aprobado</small></div><button type="button" aria-label="Cerrar sesión" onClick={signOut}><LogOut size={16} /></button></div>
      </aside>
      <main className="producer-dashboard-main">
        <header className="producer-dashboard-topbar">
          <div><span>COLABORADORES</span><strong>Validación de entradas</strong></div>
          <button type="button" onClick={() => { setLoading(true); loadDashboard().catch((loadError) => setMessage(loadError.message)).finally(() => setLoading(false)); }}><RefreshCw size={14} /> Actualizar</button>
        </header>
        <section className="staff-validator">
          <div className="staff-validator__intro">
            <span className="producer-dashboard-kicker">CONTROL DE ACCESO</span>
            <h1>Valida una entrada<span>.</span></h1>
            <p>Escanea el QR con la cámara o ingresa el código de seguridad si no se puede leer.</p>
            <div className="staff-validator__event-list">
              <strong>Eventos asignados</strong>
              {assignedEvents.length ? assignedEvents.map((event) => <span key={event.id}><Ticket size={14} /> {event.title}</span>) : <span>Aún no tienes eventos asignados. Contacta al administrador.</span>}
            </div>
          </div>
          <section className="staff-validator__panel" aria-label="Validación de entradas">
            <div className="staff-validator__camera">
              <video ref={videoRef} muted playsInline aria-label="Vista de la cámara para escanear el código QR" />
              {cameraState !== "scanning" && <div className="staff-validator__camera-placeholder"><Camera size={30} /><span>{cameraState === "starting" ? "Iniciando cámara…" : "La cámara está apagada"}</span></div>}
              {cameraState === "scanning" && <span className="staff-validator__scan-guide" aria-hidden="true" />}
            </div>
            <div className="staff-validator__camera-actions">
              {cameraState === "scanning"
                ? <button className="is-secondary" type="button" onClick={stopCamera}>Detener cámara</button>
                : <button type="button" onClick={startCamera} disabled={cameraState === "starting"}><Camera size={16} /> {cameraState === "starting" ? "Iniciando…" : "Escanear código QR"}</button>}
            </div>
            <div className="staff-validator__divider"><span>O ingresa el código manualmente</span></div>
            <form className="staff-validator__code-form" onSubmit={submitSecurityCode}>
              <label htmlFor="ticket-security-code">Código de seguridad</label>
              <div><input id="ticket-security-code" value={securityCode} onChange={(event) => setSecurityCode(event.target.value)} autoComplete="off" maxLength={40} placeholder="Ingresa el código de la entrada" /><button type="submit" disabled={busy || !securityCode.trim()}>{busy ? "Validando…" : "Validar"}</button></div>
            </form>
            {message && <p className="staff-validator__message" role="alert"><CircleAlert size={16} />{message}</p>}
            {validation && <article className="staff-validator__success" role="status">
              <span><Check size={18} /> Entrada validada</span>
              <dl>
                <div><dt>Asistente</dt><dd>{validation.attendee_name}</dd></div>
                <div><dt>RUT</dt><dd>{validation.attendee_rut}</dd></div>
                <div><dt>Tipo de entrada</dt><dd>{validation.ticket_type}</dd></div>
                <div><dt>Evento</dt><dd>{validation.event_title}</dd></div>
              </dl>
              <button type="button" onClick={() => { setValidation(null); setMessage(""); }}>Validar otra entrada</button>
            </article>}
          </section>
          <aside className="staff-validator__privacy"><ShieldCheck size={16} /><span>Los datos del titular solo aparecen cuando una entrada válida se confirma. Cada ticket se puede validar una sola vez.</span></aside>
        </section>
        <footer className="producer-dashboard-footer"><span>Si no tienes acceso a un evento, solicita la asignación al administrador.</span><a href="/">Volver al sitio <Ticket size={13} /></a></footer>
      </main>
    </div>
  );
}

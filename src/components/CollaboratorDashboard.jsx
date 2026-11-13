import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Camera, Check, CircleAlert, CircleX, Clock3, LogOut, RefreshCw, ScanLine, ShieldCheck, Ticket, TriangleAlert, Wifi, WifiOff } from "lucide-react";
import { endProducerSession } from "../data/producerPortal.js";
import { requireSupabase } from "../data/supabase.js";
import Brand from "./Brand.jsx";

const validationMessages = {
  already_used: "Este código ya fue utilizado.",
  not_found: "No encontramos un código válido para tus eventos asignados.",
  invalid_credentials: "Los datos del código no son válidos.",
  account_not_approved: "La cuenta no tiene autorización para validar entradas.",
  event_not_assigned: "No tienes permiso para validar entradas de este evento.",
  other_event: "Esta entrada pertenece a otro evento.",
  invalid_ticket: "La entrada no es válida.",
};

const formatDateTime = (value) => value
  ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(value))
  : "Sin registros";

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
  const [selectedEventId, setSelectedEventId] = useState("");
  const [dashboardData, setDashboardData] = useState(null);
  const [securityCode, setSecurityCode] = useState("");
  const [validation, setValidation] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cameraState, setCameraState] = useState("idle");
  const [connectionState, setConnectionState] = useState("checking");
  const [serverLatency, setServerLatency] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [connectionRestored, setConnectionRestored] = useState(false);
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const validationInProgressRef = useRef(false);
  const scanPausedRef = useRef(false);
  const statsInFlightRef = useRef(false);
  const previousConnectionStateRef = useRef("checking");
  const validationRef = useRef(validation);
  validationRef.current = validation;

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
    setSelectedEventId((current) => eventIds.includes(current) ? current : eventIds[0] ?? "");
    setConnectionState("online");
    setLastSync(new Date());
    setMessage("");
  }, [onNavigate]);

  const refreshStats = useCallback(async () => {
    if (!selectedEventId || statsInFlightRef.current) return;
    if (!navigator.onLine) {
      setConnectionState("offline");
      return;
    }
    statsInFlightRef.current = true;
    const startedAt = performance.now();
    try {
      const { data, error } = await requireSupabase().rpc("get_validation_dashboard", { p_event_id: selectedEventId });
      if (error) throw error;
      setDashboardData(data);
      setConnectionState("online");
      setServerLatency(Math.round(performance.now() - startedAt));
      setLastSync(new Date());
    } catch (error) {
      console.error("No se pudieron actualizar las estadísticas del evento.", error);
      setConnectionState(navigator.onLine ? "unstable" : "offline");
    } finally {
      statsInFlightRef.current = false;
    }
  }, [selectedEventId]);

  useEffect(() => {
    document.title = "Validación de entradas — TickEven.cl";
    let active = true;
    loadDashboard()
      .catch((loadError) => {
        console.error("No se pudo cargar el panel del colaborador.", loadError);
        if (active) {
          setMessage("No se pudo cargar la información del colaborador. Reintentando conexión automáticamente.");
          setConnectionState(navigator.onLine ? "unstable" : "offline");
        }
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

  useEffect(() => {
    const handleOffline = () => setConnectionState("offline");
    const handleOnline = () => {
      if (selectedEventId) {
        void refreshStats();
        return;
      }
      void loadDashboard().catch((loadError) => {
        console.error("No se pudo reconectar el panel del colaborador.", loadError);
        setConnectionState("unstable");
        setMessage("No se pudo recuperar la información del colaborador. Reintenta la conexión.");
      });
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [loadDashboard, refreshStats, selectedEventId]);

  useEffect(() => {
    if (profile || !["offline", "unstable"].includes(connectionState)) return undefined;
    const intervalId = window.setInterval(() => {
      void loadDashboard().catch((loadError) => {
        console.error("No se pudo reintentar la conexión del colaborador.", loadError);
        setConnectionState(navigator.onLine ? "unstable" : "offline");
      });
    }, 10000);
    return () => window.clearInterval(intervalId);
  }, [connectionState, loadDashboard, profile]);

  useEffect(() => {
    if (
      connectionState === "online"
      && ["offline", "unstable"].includes(previousConnectionStateRef.current)
    ) {
      setConnectionRestored(true);
      if (["connection_unavailable", "server_error"].includes(validationRef.current?.reason)) {
        setValidation(null);
        setMessage("");
        scanPausedRef.current = false;
      }
    }
    previousConnectionStateRef.current = connectionState;
  }, [connectionState]);

  useEffect(() => {
    if (!connectionRestored) return undefined;
    const timeoutId = window.setTimeout(() => setConnectionRestored(false), 3500);
    return () => window.clearTimeout(timeoutId);
  }, [connectionRestored]);

  useEffect(() => {
    if (!selectedEventId) return undefined;
    void refreshStats();
    const intervalId = window.setInterval(() => void refreshStats(), 10000);
    return () => window.clearInterval(intervalId);
  }, [selectedEventId, refreshStats]);

  const stopCamera = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setCameraState("idle");
  };

  const validate = async (credentials, inputMethod, invalidQrMessage = "") => {
    if (validationInProgressRef.current || scanPausedRef.current) return;
    if (!selectedEventId) {
      setMessage("Selecciona un evento asignado antes de validar.");
      return;
    }
    validationInProgressRef.current = true;
    scanPausedRef.current = true;
    setBusy(true);
    setValidation(null);
    setMessage("");
    setSecurityCode("");
    if (!navigator.onLine) {
      setConnectionState("offline");
      setValidation({ valid: false, reason: "connection_unavailable", message: "VALIDACIÓN NO DISPONIBLE. VERIFIQUE SU CONEXIÓN." });
      validationInProgressRef.current = false;
      setBusy(false);
      return;
    }
    try {
      const requestStartedAt = performance.now();
      const { data, error } = await requireSupabase().functions.invoke("validate-ticket", {
        body: { ...credentials, event_id: selectedEventId, input_method: inputMethod },
      });
      if (error) {
        let code;
        try {
          code = (await error.context?.json())?.error;
        } catch (parseError) {
          console.error("No se pudo leer la respuesta de validación.", parseError);
        }
        const requestError = new Error(validationMessages[code] || error.message || "No se pudo validar la entrada.");
        requestError.code = code || (error.context ? "server_error" : "connection_unavailable");
        throw requestError;
      }
      if (!data || typeof data.valid !== "boolean") {
        throw new Error("El servidor no devolvió una confirmación válida para esta entrada.");
      }
      setValidation(invalidQrMessage && !data.valid ? { ...data, message: invalidQrMessage } : data);
      setConnectionState("online");
      setServerLatency(Math.round(performance.now() - requestStartedAt));
      setLastSync(new Date());
      void refreshStats();
    } catch (validationError) {
      console.error("No se pudo validar la entrada.", validationError);
      const connectionUnavailable = !navigator.onLine || validationError.code === "connection_unavailable";
      setConnectionState(navigator.onLine ? "unstable" : "offline");
      setValidation({
        valid: false,
        reason: connectionUnavailable ? "connection_unavailable" : "server_error",
        message: connectionUnavailable
          ? "VALIDACIÓN NO DISPONIBLE. VERIFIQUE SU CONEXIÓN."
          : validationError.message || "No se pudo confirmar la entrada con el servidor.",
      });
    } finally {
      validationInProgressRef.current = false;
      setBusy(false);
    }
  };

  const startCamera = async () => {
    setMessage("");
    setValidation(null);
    if (!selectedEventId) {
      setMessage("Selecciona un evento asignado antes de iniciar el escáner.");
      return;
    }
    if (controlsRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("Este navegador no permite usar la cámara. Usa el código de seguridad de la entrada.");
      return;
    }
    scanPausedRef.current = false;
    setCameraState("starting");
    try {
      const reader = new BrowserMultiFormatReader();
      controlsRef.current = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
        if (!result || validationInProgressRef.current || scanPausedRef.current) return;
        let credentials;
        try {
          credentials = readQrPayload(result.getText());
        } catch (qrError) {
          void validate({ qr_token: "invalid-qr-format" }, "qr", qrError.message);
          return;
        }
        void validate(credentials, "qr");
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
    void validate({ security_code: code }, "manual");
  };

  const continueScanning = () => {
    setValidation(null);
    setMessage("");
    setSecurityCode("");
    scanPausedRef.current = false;
    if (!controlsRef.current) void startCamera();
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

  const activeEvent = assignedEvents.find((event) => event.id === selectedEventId);
  const resultKind = validation?.valid
    ? "authorized"
    : validation?.reason === "already_used"
      ? "used"
      : validation?.reason === "other_event"
        ? "warning"
        : ["connection_unavailable", "server_error"].includes(validation?.reason)
          ? "unavailable"
          : "rejected";
  const connectionLabels = {
    checking: "Comprobando servidor",
    online: "Servidor conectado",
    unstable: "Conexión inestable",
    offline: "Sin conexión con servidor",
  };
  const historyLabels = {
    authorized: "Acceso autorizado",
    already_used: "Ya utilizada",
    invalid: "No válida",
    other_event: "Otro evento",
  };

  return (
    <div className="producer-dashboard collaborator-dashboard">
      <aside className="producer-dashboard-sidebar">
        <Brand />
        <span className="producer-dashboard-sidebar__label">ACCESO DE EVENTO</span>
        <span className="admin-dashboard__nav-link is-current"><ShieldCheck size={17} /> Validar entradas</span>
        <div className="producer-dashboard-sidebar__account"><span>{profile?.full_name?.slice(0, 1).toUpperCase() || "C"}</span><div><strong>{profile?.full_name || "Colaborador"}</strong><small>Acceso aprobado</small></div><button type="button" aria-label="Cerrar sesión" onClick={signOut}><LogOut size={16} /></button></div>
      </aside>
      <main className="producer-dashboard-main">
        <header className="producer-dashboard-topbar access-topbar">
          <div><span>CONTROL DE ACCESO</span><strong>{activeEvent?.title || "Selecciona un evento asignado"}</strong></div>
          <div className="access-topbar__status-group">
            <span className={`access-status access-status--${connectionState}`}><i />{connectionLabels[connectionState]}</span>
            <span className={`access-status access-status--${cameraState === "scanning" ? "online" : "idle"}`}><Camera size={13} />{cameraState === "scanning" ? "Cámara activa" : cameraState === "starting" ? "Iniciando cámara" : "Cámara apagada"}</span>
            <button type="button" onClick={() => void refreshStats()}><RefreshCw size={14} /> Sincronizar</button>
          </div>
        </header>
        <section className="access-dashboard">
          <div className="access-toolbar">
            <div>
              <span className="access-kicker">VALIDADOR DE CÓDIGOS</span>
              <h1>Control de acceso<span>.</span></h1>
              <p>{profile?.full_name || "Colaborador"}<i />{activeEvent?.venue || "Evento asignado"}{activeEvent?.city ? ` · ${activeEvent.city}` : ""}</p>
            </div>
            <label className="access-event-select">Evento activo
              <select value={selectedEventId} disabled={!assignedEvents.length || cameraState !== "idle" || busy || Boolean(validation)} onChange={(event) => { setSelectedEventId(event.target.value); setDashboardData(null); setValidation(null); scanPausedRef.current = false; }}>
                {!assignedEvents.length && <option value="">Sin eventos asignados</option>}
                {assignedEvents.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
              </select>
            </label>
          </div>

          <div className={`access-connection-banner access-connection-banner--${connectionState}`} role="status" aria-live="polite">
            {connectionState === "offline" ? <WifiOff size={17} /> : connectionState === "online" ? <Wifi size={17} /> : <TriangleAlert size={17} />}
            <div><strong>{connectionState === "offline" ? "SIN CONEXIÓN CON EL SERVIDOR" : connectionState === "unstable" ? "CONEXIÓN INESTABLE" : connectionState === "online" ? "SERVIDOR OPERATIVO" : "VERIFICANDO CONEXIÓN"}</strong><span>{connectionState === "offline" ? "No es posible confirmar la validez de las entradas. Ninguna entrada recibirá autorización sin respuesta del servidor." : connectionState === "unstable" ? "El servidor presenta errores. El sistema no autoriza accesos sin confirmación." : connectionState === "online" ? `Última sincronización ${lastSync ? formatDateTime(lastSync) : "ahora"}${serverLatency !== null ? ` · ${serverLatency} ms` : ""}` : "Comprobando conexión segura con el servidor."}</span></div>
            {connectionState === "online" && <span className="access-connection-banner__dot" />}
          </div>
          {connectionRestored && <div className="access-reconnected" role="status" aria-live="polite"><Wifi size={15} /> CONEXIÓN RESTABLECIDA · Validador listo para continuar.</div>}

          {!assignedEvents.length ? (
            <div className="access-empty"><Ticket size={24} /><strong>{connectionState === "online" ? "Sin eventos asignados" : "No se pudo conectar con el servidor"}</strong><span>{connectionState === "online" ? "Solicita al administrador que te asigne un evento para habilitar el validador." : message || "Reintentando conexión automáticamente…"}</span>{connectionState !== "online" && <button className="access-button access-button--secondary" type="button" onClick={() => void loadDashboard().catch((loadError) => { console.error("No se pudo reintentar la conexión del colaborador.", loadError); setConnectionState(navigator.onLine ? "unstable" : "offline"); setMessage("No se pudo recuperar la información del colaborador. Reintenta la conexión."); })}><RefreshCw size={15} /> Reintentar conexión</button>}</div>
          ) : (
            <>
              <div className="access-workbench">
                <section className="access-scanner" aria-label="Escáner de entradas">
                  <div className="access-scanner__heading"><div><span>ESCÁNER QR</span><strong>{cameraState === "scanning" ? "Listo para validar" : "Activa la cámara para comenzar"}</strong></div><span className={`access-scanner__ready${cameraState === "scanning" && !validation ? " is-ready" : ""}`}><i />{validation ? "Resultado" : cameraState === "scanning" ? "Preparado" : "En espera"}</span></div>
                  <div className={`access-scanner__viewport${cameraState === "scanning" ? " is-scanning" : ""}`}>
                    <video ref={videoRef} muted playsInline aria-label="Vista de cámara para escanear entradas" />
                    {cameraState !== "scanning" && <div className="access-camera-placeholder"><Camera size={34} /><strong>{cameraState === "starting" ? "Abriendo cámara…" : "Cámara desactivada"}</strong><span>Centra el código QR dentro del marco.</span></div>}
                    {cameraState === "scanning" && !validation && <div className="access-scan-frame" aria-hidden="true"><i /><i /><i /><i /><span>ENCUADRA EL CÓDIGO QR</span></div>}
                    {validation && <article className={`access-result access-result--${resultKind}`} role="alert" aria-live="assertive">
                      <div className="access-result__icon">{resultKind === "authorized" ? <Check size={34} strokeWidth={3} /> : resultKind === "used" || resultKind === "rejected" ? <CircleX size={34} strokeWidth={2.5} /> : <TriangleAlert size={34} strokeWidth={2.5} />}</div>
                      <span className="access-result__eyebrow">{activeEvent?.title || "Evento"}</span>
                      <h2>{resultKind === "authorized"
                        ? validation.ticket_kind === "product" ? "¡PRODUCTO LISTO PARA RETIRO!" : "¡ACCESO AUTORIZADO!"
                        : resultKind === "used"
                          ? validation.ticket_kind === "product" ? "PRODUCTO YA RETIRADO" : "ENTRADA YA VALIDADA"
                          : resultKind === "warning" ? validation.ticket_kind === "product" ? "PRODUCTO DE OTRO EVENTO" : "ENTRADA DE OTRO EVENTO"
                          : resultKind === "unavailable" ? "VALIDACIÓN NO DISPONIBLE" : "CÓDIGO NO VÁLIDO"}</h2>
                      <p className="access-result__summary">{validation.message || validationMessages[validation.reason] || (validation.valid ? "Código confirmado por el servidor." : "El servidor no pudo autorizar este código.")}</p>
                      {(validation.event_title || validation.attendee_name || validation.ticket_type || validation.ticket_id) && <dl className="access-result__details">
                        {validation.attendee_name && <div><dt>Titular</dt><dd>{validation.attendee_name}</dd></div>}
                        {validation.attendee_rut && <div><dt>RUT</dt><dd>{validation.attendee_rut}</dd></div>}
                        {validation.event_title && <div><dt>{resultKind === "warning" ? "Evento de la entrada" : "Evento"}</dt><dd>{validation.event_title}</dd></div>}
                        {validation.ticket_type && <div><dt>{validation.ticket_kind === "product" ? "Producto" : "Tipo de entrada"}</dt><dd>{validation.ticket_type}</dd></div>}
                        {validation.ticket_id && <div><dt>{validation.ticket_kind === "product" ? "Código" : "Entrada"}</dt><dd>…{String(validation.ticket_id).slice(-8).toUpperCase()}</dd></div>}
                        {validation.checked_in_at && <div><dt>Primera validación</dt><dd>{formatDateTime(validation.checked_in_at)}</dd></div>}
                        {validation.checked_in_by && <div><dt>Validada por</dt><dd>{validation.checked_in_by === profile?.id ? profile?.full_name : validation.checked_in_by}</dd></div>}
                        {validation.valid && <div><dt>Validada ahora</dt><dd>{formatDateTime(validation.checked_in_at)}</dd></div>}
                      </dl>}
                      <button className="access-result__next" type="button" onClick={continueScanning}><Check size={18} /> OK - SIGUIENTE CÓDIGO</button>
                    </article>}
                  </div>
                  <div className="access-scanner__controls">
                    {cameraState === "scanning"
                      ? <button className="access-button access-button--secondary" type="button" onClick={stopCamera}><Camera size={17} /> Desactivar cámara</button>
                      : <button className="access-button access-button--primary" type="button" onClick={() => void startCamera()} disabled={cameraState === "starting" || !selectedEventId}><Camera size={17} /> {cameraState === "starting" ? "Iniciando cámara…" : "Activar cámara"}</button>}
                    <span><ScanLine size={15} />{cameraState === "scanning" ? "La cámara permanece activa entre lecturas" : "Se requiere cámara y conexión segura"}</span>
                  </div>
                  <div className="access-manual">
                    <div className="access-manual__title"><CircleAlert size={17} /><div><strong>¿Problemas con el código QR?</strong><span>Ingresa el código de seguridad impreso.</span></div></div>
                    <form onSubmit={submitSecurityCode}>
                      <input aria-label="Código de seguridad" inputMode="text" autoComplete="off" autoCapitalize="characters" maxLength={40} value={securityCode} onChange={(event) => setSecurityCode(event.target.value.toUpperCase())} placeholder="CÓDIGO DE SEGURIDAD" disabled={busy || Boolean(validation)} />
                      <button type="submit" disabled={busy || Boolean(validation) || !securityCode.trim() || !selectedEventId}>{busy ? "Validando…" : "VALIDAR CÓDIGO"}</button>
                    </form>
                  </div>
                  {message && <p className="access-inline-message" role="alert"><CircleAlert size={15} />{message}</p>}
                </section>

                <aside className="access-side-panel">
                  <section className="access-event-card"><span className="access-kicker">EVENTO ACTIVO</span><h2>{activeEvent?.title || "Selecciona un evento"}</h2><p>{activeEvent?.venue || ""}{activeEvent?.city ? ` · ${activeEvent.city}` : ""}</p>{activeEvent?.starts_at && <span className="access-event-card__date"><Clock3 size={14} />{formatDateTime(activeEvent.starts_at)}</span>}</section>
                  <section className="access-stats"><div className="access-section-heading"><span className="access-kicker">ESTADÍSTICAS DEL EVENTO</span><span>{dashboardData ? "EN VIVO · 10 S" : "SIN SINCRONIZAR"}</span></div><div className="access-stats__grid">
                    <article><span>Códigos emitidos</span><strong>{dashboardData?.stats?.sold ?? "—"}</strong><small>Entradas y productos</small></article>
                    <article className="is-success"><span>Códigos utilizados</span><strong>{dashboardData?.stats?.validated ?? "—"}</strong><small>Accesos y retiros</small></article>
                    <article><span>Pendientes</span><strong>{dashboardData?.stats?.pending ?? "—"}</strong><small>Sin utilizar</small></article>
                    <article><span>Porcentaje de acceso</span><strong>{dashboardData ? `${dashboardData.stats.percent}%` : "—"}</strong><small>Del total vendido</small></article>
                  </div></section>
                  <section className="access-activity"><div className="access-section-heading"><span className="access-kicker">MI ACTIVIDAD</span><span>{profile?.full_name}</span></div><div className="access-activity__rows"><div><span>Códigos procesados</span><strong>{dashboardData?.activity?.attempts ?? "—"}</strong></div><div><span>Usos autorizados</span><strong>{dashboardData?.activity?.authorized ?? "—"}</strong></div><div><span>Códigos ya utilizados</span><strong>{dashboardData?.activity?.already_used ?? "—"}</strong></div><div><span>Último titular o comprador</span><strong>{dashboardData?.activity?.last_attendee || "Sin registros"}</strong></div><div><span>Hora de última autorización</span><strong>{formatDateTime(dashboardData?.activity?.last_validation)}</strong></div></div></section>
                </aside>
              </div>

              <section className="access-history"><div className="access-section-heading"><div><span className="access-kicker">HISTORIAL</span><h2>Últimos códigos procesados</h2></div><span>{dashboardData?.history?.length ?? 0} registros</span></div>
                {dashboardData?.history?.length ? <div className="access-history__table"><div className="access-history__head"><span>TITULAR</span><span>RUT</span><span>TIPO</span><span>HORA</span><span>RESULTADO</span></div>{dashboardData.history.map((item) => <article key={item.id}><strong>{item.attendee_name}</strong><span>{item.attendee_rut || "—"}</span><span>{item.ticket_type || "—"}</span><span>{formatDateTime(item.attempted_at)}</span><span className={`access-history__result access-history__result--${item.outcome}`}><i />{historyLabels[item.outcome] || item.outcome}</span></article>)}</div> : <div className="access-history__empty">Las validaciones de este evento aparecerán aquí.</div>}
              </section>
            </>
          )}
          <aside className="access-security-note"><ShieldCheck size={16} /><span>Las entradas y los productos se verifican en el servidor. Sin confirmación no se autoriza el acceso ni el retiro; cada código admite un solo uso.</span></aside>
        </section>
        <footer className="producer-dashboard-footer"><span>Si no tienes acceso a un evento, solicita la asignación al administrador.</span><a href="/">Volver al sitio <Ticket size={13} /></a></footer>
      </main>
    </div>
  );
}

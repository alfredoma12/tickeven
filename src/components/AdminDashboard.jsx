import { useCallback, useEffect, useState } from "react";
import { Archive, Check, LogOut, RefreshCw, ShieldCheck, Ticket, UserCheck, UserX } from "lucide-react";
import { endProducerSession } from "../data/producerPortal.js";
import { requireSupabase } from "../data/supabase.js";
import Brand from "./Brand.jsx";

const profileFields = "id, role, status, full_name, rut, phone, created_at";

export default function AdminDashboard({ onNavigate }) {
  const [admin, setAdmin] = useState(null);
  const [pendingAccounts, setPendingAccounts] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [events, setEvents] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [selectedCollaborator, setSelectedCollaborator] = useState("");
  const [selectedEvent, setSelectedEvent] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadDashboard = useCallback(async () => {
    const client = requireSupabase();
    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (!sessionData.session?.user) {
      onNavigate("/admin/login", { replace: true });
      return;
    }

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select(profileFields)
      .eq("id", sessionData.session.user.id)
      .single();
    if (profileError) throw profileError;
    if (profile.role !== "admin" || profile.status !== "approved") {
      await client.auth.signOut();
      onNavigate("/admin/login", { replace: true });
      return;
    }
    setAdmin(profile);

    const pendingAccountsRequest = async () => {
      const result = await client
        .from("profiles")
        .select(`${profileFields}, email`)
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (
        !result.error ||
        !["42703", "PGRST204"].includes(result.error.code) ||
        !result.error.message.toLowerCase().includes("email")
      ) {
        return result;
      }
      console.warn("La migración de correo de solicitudes aún no está aplicada.");
      return client
        .from("profiles")
        .select(profileFields)
        .eq("status", "pending")
        .order("created_at", { ascending: true });
    };
    const [pendingResult, collaboratorsResult, eventsResult, assignmentsResult] = await Promise.all([
      pendingAccountsRequest(),
      client.from("profiles").select(profileFields).eq("role", "collaborator").eq("status", "approved").order("full_name"),
      client.from("events").select("id, title, starts_at").eq("status", "published").order("starts_at", { ascending: true }),
      client.from("event_staff").select("event_id, collaborator_id, assigned_at").order("assigned_at", { ascending: false }),
    ]);
    const failure = [pendingResult, collaboratorsResult, eventsResult, assignmentsResult].find((result) => result.error);
    if (failure?.error) throw failure.error;
    setPendingAccounts(pendingResult.data ?? []);
    setCollaborators(collaboratorsResult.data ?? []);
    setEvents(eventsResult.data ?? []);
    setAssignments(assignmentsResult.data ?? []);
    setError("");
  }, [onNavigate]);

  useEffect(() => {
    document.title = "Administración — TickEven.cl";
    let active = true;
    loadDashboard()
      .catch((loadError) => {
        console.error("No se pudo cargar el panel de administración.", loadError);
        if (active) setError(loadError.message || "No se pudo cargar la información.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const client = requireSupabase();
    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session?.user) onNavigate("/admin/login", { replace: true });
    });
    const refreshTimer = window.setInterval(() => {
      loadDashboard().catch((loadError) => {
        console.error("No se pudieron actualizar las solicitudes de acceso.", loadError);
        if (active) setError(loadError.message || "No se pudieron actualizar las solicitudes.");
      });
    }, 20000);
    return () => {
      active = false;
      window.clearInterval(refreshTimer);
      listener.subscription.unsubscribe();
    };
  }, [loadDashboard, onNavigate]);

  const updateAccountStatus = async (profile, status) => {
    setBusyId(profile.id);
    setError("");
    setNotice("");
    try {
      const { error: updateError } = await requireSupabase()
        .from("profiles")
        .update({ status })
        .eq("id", profile.id);
      if (updateError) throw updateError;
      await loadDashboard();
      setNotice(status === "approved"
        ? `La cuenta de ${profile.full_name} fue aprobada.`
        : `La solicitud de ${profile.full_name} fue rechazada.`);
    } catch (actionError) {
      console.error("No se pudo actualizar la aprobación de la cuenta.", actionError);
      setError(actionError.message || "No se pudo actualizar la solicitud.");
    } finally {
      setBusyId("");
    }
  };

  const assignCollaborator = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusyId("assignment");
    try {
      const { data: userData, error: userError } = await requireSupabase().auth.getUser();
      if (userError) throw userError;
      const { error: insertError } = await requireSupabase().from("event_staff").insert({
        event_id: selectedEvent,
        collaborator_id: selectedCollaborator,
        assigned_by: userData.user.id,
      });
      if (insertError) throw insertError;
      await loadDashboard();
      setNotice("Colaborador asignado al evento.");
    } catch (actionError) {
      console.error("No se pudo asignar el colaborador al evento.", actionError);
      setError(actionError.code === "23505"
        ? "Ese colaborador ya está asignado a este evento."
        : actionError.message || "No se pudo guardar la asignación.");
    } finally {
      setBusyId("");
    }
  };

  const removeAssignment = async (assignment) => {
    setError("");
    setNotice("");
    setBusyId(`${assignment.event_id}-${assignment.collaborator_id}`);
    try {
      const { error: deleteError } = await requireSupabase()
        .from("event_staff")
        .delete()
        .eq("event_id", assignment.event_id)
        .eq("collaborator_id", assignment.collaborator_id);
      if (deleteError) throw deleteError;
      await loadDashboard();
      setNotice("Se quitó la asignación del colaborador.");
    } catch (actionError) {
      console.error("No se pudo quitar la asignación del colaborador.", actionError);
      setError(actionError.message || "No se pudo quitar la asignación.");
    } finally {
      setBusyId("");
    }
  };

  const archiveEvent = async (event) => {
    if (!window.confirm(`¿Retirar “${event.title}” de los eventos publicados? Se conservarán las órdenes y entradas existentes.`)) return;
    setError("");
    setNotice("");
    setBusyId(`event-${event.id}`);
    try {
      const { error: archiveError } = await requireSupabase().rpc("admin_archive_event", {
        p_event_id: event.id,
      });
      if (archiveError) throw archiveError;
      await loadDashboard();
      setNotice(`“${event.title}” fue retirado. El historial de ventas y entradas se conserva.`);
    } catch (archiveError) {
      console.error("No se pudo retirar el evento.", archiveError);
      setError(archiveError.message || "No se pudo retirar el evento.");
    } finally {
      setBusyId("");
    }
  };

  const signOut = async () => {
    try {
      await endProducerSession();
      onNavigate("/admin/login", { replace: true });
    } catch (signOutError) {
      console.error("No se pudo cerrar la sesión administrativa.", signOutError);
      setError("No se pudo cerrar la sesión. Inténtalo otra vez.");
    }
  };

  if (loading) return <main className="producer-dashboard-loading">Conectando con Supabase…</main>;

  return (
    <div className="producer-dashboard admin-dashboard">
      <aside className="producer-dashboard-sidebar">
        <Brand />
        <span className="producer-dashboard-sidebar__label">ADMINISTRACIÓN</span>
        <a className="admin-dashboard__nav-link" href="#solicitudes"><UserCheck size={17} /> Solicitudes <span>{pendingAccounts.length}</span></a>
        <a className="admin-dashboard__nav-link" href="#asignaciones"><ShieldCheck size={17} /> Colaboradores</a>
        <a className="admin-dashboard__nav-link" href="#eventos"><Ticket size={17} /> Eventos <span>{events.length}</span></a>
        <div className="producer-dashboard-sidebar__account"><span>A</span><div><strong>{admin?.full_name || "Administrador"}</strong><small>Acceso verificado</small></div><button type="button" aria-label="Cerrar sesión" onClick={signOut}><LogOut size={16} /></button></div>
      </aside>
      <main className="producer-dashboard-main">
        <header className="producer-dashboard-topbar">
          <div><span>ADMINISTRACIÓN</span><strong>Solicitudes y accesos</strong></div>
          <button type="button" onClick={() => { setLoading(true); loadDashboard().catch((loadError) => setError(loadError.message)).finally(() => setLoading(false)); }}><RefreshCw size={14} /> Actualizar</button>
        </header>
        {error && <p className="producer-portal-error admin-dashboard__message" role="alert">{error}</p>}
        {notice && <p className="producer-dashboard-notice admin-dashboard__message" role="status"><Check size={16} />{notice}</p>}

        <section className="admin-dashboard__content" id="solicitudes">
          <div className="producer-dashboard-welcome">
            <div><span className="producer-dashboard-kicker">CONTROL DE ACCESO</span><h2>Solicitudes de cuenta</h2><p>Aprueba productores y colaboradores antes de que puedan acceder a sus herramientas. La lista se actualiza automáticamente cada 20 segundos.</p></div>
          </div>
          <div className="admin-dashboard__accounts">
            {pendingAccounts.length ? pendingAccounts.map((profile) => (
              <article className="admin-dashboard__account-card" key={profile.id}>
                <div className="admin-dashboard__avatar">{profile.full_name?.slice(0, 1).toUpperCase() || "?"}</div>
                <div className="admin-dashboard__identity">
                  <strong>{profile.full_name}</strong>
                  <span>{profile.role === "collaborator" ? "Colaborador/a" : "Productor/a"} · RUT {profile.rut}</span>
                  {profile.email && <span>{profile.email}</span>}
                  <span>{profile.phone}</span>
                </div>
                <div className="admin-dashboard__actions">
                  <button type="button" disabled={Boolean(busyId)} onClick={() => updateAccountStatus(profile, "approved")}><UserCheck size={15} /> Aprobar</button>
                  <button type="button" className="is-reject" disabled={Boolean(busyId)} onClick={() => updateAccountStatus(profile, "rejected")}><UserX size={15} /> Rechazar</button>
                </div>
              </article>
            )) : (
              <div className="producer-dashboard-empty"><ShieldCheck size={24} /><strong>No hay solicitudes pendientes</strong><span>Las nuevas cuentas aparecerán aquí.</span></div>
            )}
          </div>
        </section>

        <section className="admin-dashboard__content" id="asignaciones">
          <div className="producer-dashboard-welcome">
            <div><span className="producer-dashboard-kicker">VALIDACIÓN EN TERRENO</span><h2>Asignar colaboradores</h2><p>Solo los colaboradores aprobados podrán validar entradas de los eventos asignados.</p></div>
          </div>
          <form className="admin-dashboard__assignment-form" onSubmit={assignCollaborator}>
            <label>Colaborador
              <select value={selectedCollaborator} onChange={(event) => setSelectedCollaborator(event.target.value)} required>
                <option value="">Selecciona un colaborador</option>
                {collaborators.map((profile) => <option value={profile.id} key={profile.id}>{profile.full_name} · {profile.rut}</option>)}
              </select>
            </label>
            <label>Evento
              <select value={selectedEvent} onChange={(event) => setSelectedEvent(event.target.value)} required>
                <option value="">Selecciona un evento publicado</option>
                {events.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}
              </select>
            </label>
            <button type="submit" disabled={busyId === "assignment" || !collaborators.length || !events.length}>
              <ShieldCheck size={15} /> {busyId === "assignment" ? "Asignando…" : "Asignar evento"}
            </button>
          </form>
          <div className="admin-dashboard__assignment-list">
            <h3>Asignaciones actuales</h3>
            {assignments.length ? assignments.map((assignment) => (
              <div className="admin-dashboard__assignment" key={`${assignment.event_id}-${assignment.collaborator_id}`}>
                <span><strong>{collaborators.find((profile) => profile.id === assignment.collaborator_id)?.full_name || "Colaborador"}</strong><small>{events.find((item) => item.id === assignment.event_id)?.title || "Evento"}</small></span>
                <button type="button" disabled={Boolean(busyId)} onClick={() => removeAssignment(assignment)} aria-label={`Quitar asignación del evento`}><UserX size={15} /> Quitar</button>
              </div>
            )) : <p className="admin-dashboard__empty">Aún no hay colaboradores asignados.</p>}
          </div>
        </section>
        <section className="admin-dashboard__content" id="eventos">
          <div className="producer-dashboard-welcome">
            <div><span className="producer-dashboard-kicker">CATÁLOGO PÚBLICO</span><h2>Eventos publicados</h2><p>Retira publicaciones que ya no deban aparecer en el sitio. Las órdenes y entradas existentes se mantienen.</p></div>
          </div>
          <div className="admin-dashboard__event-list">
            {events.length ? events.map((event) => (
              <article className="admin-dashboard__event" key={event.id}>
                <span><strong>{event.title}</strong><small>{new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(new Date(event.starts_at))}</small></span>
                <button
                  type="button"
                  disabled={Boolean(busyId)}
                  onClick={() => void archiveEvent(event)}
                >
                  <Archive size={15} /> {busyId === `event-${event.id}` ? "Retirando…" : "Retirar evento"}
                </button>
              </article>
            )) : <div className="producer-dashboard-empty"><Ticket size={23} /><strong>No hay eventos publicados</strong><span>Cuando se publique un evento, aparecerá aquí.</span></div>}
          </div>
        </section>
        <footer className="producer-dashboard-footer"><span>Accesos y asignaciones protegidos por políticas RLS de Supabase.</span><a href="/">Volver al sitio <Ticket size={13} /></a></footer>
      </main>
    </div>
  );
}

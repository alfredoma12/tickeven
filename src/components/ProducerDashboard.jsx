import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CirclePlus,
  ImagePlus,
  LayoutDashboard,
  LogOut,
  MapPin,
  Plus,
  Ticket,
  Trash2,
  Upload,
} from "lucide-react";
import { fetchProducerEvents } from "../data/events.js";
import { endProducerSession } from "../data/producerPortal.js";
import { requireSupabase } from "../data/supabase.js";
import { ADMINISTRATION_PERCENTAGE, getAdministrationFee } from "../data/pricing.js";

const categories = ["Conciertos", "Fiestas", "Teatro", "Deportes", "Familia", "Conferencias"];
const money = new Intl.NumberFormat("es-CL");

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatEventDate(value) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("es-CL", { weekday: "short", day: "2-digit", month: "short" })
    .format(date)
    .replace(/\./g, "")
    .toLocaleUpperCase("es");
}

function getLocalDateInputValue() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

async function optimizeImage(file) {
  if (!file.type.startsWith("image/")) {
    throw new TypeError(`${file.name} no es un archivo de imagen.`);
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new RangeError(`${file.name} supera el máximo de 8 MB.`);
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("No fue posible preparar la imagen en este navegador.");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("No fue posible convertir la imagen."));
    }, "image/jpeg", 0.78);
  });
  return { blob, preview: URL.createObjectURL(blob) };
}

function newTicketType(index) {
  return { id: `ticket-${index + 1}`, name: "", description: "", price: "", available: "" };
}

function OverviewTab({ events, onCreate }) {
  const ticketCount = events.reduce(
    (sum, event) => sum + event.ticketTypes.reduce((eventSum, ticket) => eventSum + ticket.available, 0),
    0,
  );

  return (
    <section className="producer-dashboard-content">
      <div className="producer-dashboard-welcome">
        <div><span className="producer-dashboard-kicker">TU ESPACIO DE TRABAJO</span><h2>Un buen evento empieza acá.</h2><p>Publica tu próxima experiencia y administra tus eventos desde un solo lugar.</p></div>
        <button className="producer-dashboard-primary" type="button" onClick={onCreate}><Plus size={17} /> Crear evento</button>
      </div>
      <div className="producer-dashboard-stats">
        <article><span>EVENTOS PUBLICADOS</span><strong>{events.length}</strong><small>Experiencias en tu cuenta</small></article>
        <article><span>ENTRADAS PUBLICADAS</span><strong>{money.format(ticketCount)}</strong><small>Unidades disponibles en total</small></article>
        <article><span>ADMINISTRACIÓN</span><strong>{ADMINISTRATION_PERCENTAGE}</strong><small>Sobre el precio de cada entrada</small></article>
      </div>
      <div className="producer-dashboard-list-card">
        <div className="producer-dashboard-list-card__heading"><div><span className="producer-dashboard-kicker">TU AGENDA</span><h3>Eventos publicados</h3></div><button type="button" onClick={onCreate}>Nuevo evento <ArrowRight size={14} /></button></div>
        {events.length ? (
          <div className="producer-dashboard-events">
            {events.slice(0, 5).map((event) => (
              <a className="producer-dashboard-event-row" href={`/evento/${event.slug}`} key={event.id}>
                <img src={event.image} alt="" />
                <span><strong>{event.title}</strong><small>{event.date} · {event.venue}, {event.city}</small></span>
                <span className="producer-dashboard-event-row__status"><i /> Publicado</span>
                <ArrowRight size={16} />
              </a>
            ))}
          </div>
        ) : (
          <div className="producer-dashboard-empty"><Ticket size={24} /><strong>Aún no publicas eventos</strong><span>Cuando publiques el primero, aparecerá aquí.</span></div>
        )}
      </div>
    </section>
  );
}

function EventsTab({ events, onCreate }) {
  return (
    <section className="producer-dashboard-content">
      <div className="producer-dashboard-welcome">
        <div><span className="producer-dashboard-kicker">TU AGENDA</span><h2>Mis eventos</h2><p>Consulta las fichas públicas de los eventos que publicaste.</p></div>
        <button className="producer-dashboard-primary" type="button" onClick={onCreate}><Plus size={17} /> Crear evento</button>
      </div>
      <div className="producer-dashboard-list-card producer-dashboard-list-card--all">
        {events.length ? (
          <div className="producer-dashboard-events">
            {events.map((event) => (
              <a className="producer-dashboard-event-row" href={`/evento/${event.slug}`} key={event.id}>
                <img src={event.image} alt="" />
                <span><strong>{event.title}</strong><small>{event.date} · {event.venue}, {event.city}</small></span>
                <span className="producer-dashboard-event-row__status"><i /> Publicado · {event.ticketTypes.reduce((sum, ticket) => sum + ticket.available, 0)} entradas</span>
                <ArrowRight size={16} />
              </a>
            ))}
          </div>
        ) : (
          <div className="producer-dashboard-empty"><Ticket size={24} /><strong>Aún no publicas eventos</strong><span>Cuando publiques el primero, aparecerá aquí.</span><button className="producer-dashboard-primary" type="button" onClick={onCreate}><Plus size={15} /> Crear evento</button></div>
        )}
      </div>
    </section>
  );
}

function CreateEventTab({ onPublish, onCancel }) {
  const [ticketTypes, setTicketTypes] = useState([newTicketType(0)]);
  const [photos, setPhotos] = useState([]);
  const [photoError, setPhotoError] = useState("");
  const [publishError, setPublishError] = useState("");
  const [saving, setSaving] = useState(false);

  const updateTicketType = (index, field, value) => {
    setTicketTypes((current) => current.map((ticketType, ticketIndex) =>
      ticketIndex === index ? { ...ticketType, [field]: value } : ticketType,
    ));
  };

  const addTicketType = () => setTicketTypes((current) => [...current, newTicketType(current.length)]);
  const removeTicketType = (index) => setTicketTypes((current) => current.filter((_, ticketIndex) => ticketIndex !== index));

  const handlePhotos = async (event) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    if (files.length + photos.length > 4) {
      setPhotoError("Puedes cargar un máximo de 4 fotos por evento.");
      return;
    }

    try {
      const preparedPhotos = await Promise.all(files.map(optimizeImage));
      setPhotos((current) => [...current, ...preparedPhotos]);
      setPhotoError("");
    } catch (error) {
      console.error("No se pudieron procesar las fotos del evento.", error);
      setPhotoError(error.message || "No fue posible procesar las fotos seleccionadas.");
    }
  };

  const submitEvent = async (event) => {
    event.preventDefault();
    setPublishError("");
    setSaving(true);
    const formData = new FormData(event.currentTarget);
    const validTicketTypes = ticketTypes.map((ticketType) => ({
      ...ticketType,
      name: ticketType.name.trim(),
      description: ticketType.description.trim(),
      price: Number(ticketType.price),
      available: Number(ticketType.available),
    }));

    if (!photos.length) {
      setPublishError("Agrega al menos una foto para publicar el evento.");
      setSaving(false);
      return;
    }
    if (validTicketTypes.some((ticketType) =>
      !ticketType.name ||
      !Number.isSafeInteger(ticketType.price) ||
      ticketType.price <= 0 ||
      !Number.isSafeInteger(ticketType.available) ||
      ticketType.available <= 0
    )) {
      setPublishError("Revisa los nombres, precios y cantidades disponibles de las entradas.");
      setSaving(false);
      return;
    }

    const title = String(formData.get("title")).trim();
    const selectedDate = String(formData.get("date"));
    const now = Date.now();
    const eventData = {
      id: now,
      title,
      slug: `${slugify(title)}-${now}`,
      category: String(formData.get("category")),
      date: formatEventDate(selectedDate),
      eventDate: selectedDate,
      time: String(formData.get("time")),
      venue: String(formData.get("venue")).trim(),
      city: String(formData.get("city")).trim(),
      description: String(formData.get("description")).trim(),
      ticketTypes: validTicketTypes,
      ticketPrice: Math.min(...validTicketTypes.map((ticketType) => ticketType.price)),
      image: photos[0].preview,
      imageAlt: `Fotografía del evento ${title}`,
      gallery: photos.slice(1).map((photo) => photo.preview),
      photos,
      color: ["lavender", "peach", "blue", "mint"][now % 4],
      weekend: [0, 6].includes(new Date(`${selectedDate}T12:00:00`).getDay()),
      publishedAt: new Date().toISOString(),
    };

    try {
      await onPublish(eventData);
    } catch (error) {
      console.error("No se pudo guardar el evento publicado.", error);
      setPublishError(error.message || "No se pudo guardar el evento en Supabase. Inténtalo nuevamente.");
      setSaving(false);
    }
  };

  return (
    <section className="producer-dashboard-content">
      <button className="producer-dashboard-back" type="button" onClick={onCancel}><ArrowLeft size={15} /> Volver al dashboard</button>
      <div className="producer-dashboard-welcome producer-dashboard-welcome--form">
        <div><span className="producer-dashboard-kicker">NUEVA PUBLICACIÓN</span><h2>Cuéntanos qué estás organizando.</h2><p>Completa la información para mostrar el evento en TickEven.cl.</p></div>
      </div>
      <form className="producer-event-form" onSubmit={submitEvent}>
        <section className="producer-event-form__section">
          <div className="producer-event-form__section-heading"><span>01</span><div><h3>Información del evento</h3><p>Los datos principales que verá tu público.</p></div></div>
          <div className="producer-event-form__grid">
            <label className="producer-event-form__wide">Nombre del evento<input name="title" placeholder="Ej. Festival de verano" maxLength={100} required /></label>
            <label>Categoría<select name="category" defaultValue="" required><option value="" disabled>Selecciona una categoría</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label>Ciudad o comuna<input name="city" placeholder="Ej. Santiago" maxLength={70} required /></label>
            <label>Recinto o lugar<input name="venue" placeholder="Ej. Parque Bicentenario" maxLength={100} required /></label>
            <label>Fecha<input name="date" type="date" min={getLocalDateInputValue()} required /></label>
            <label>Hora<input name="time" type="time" required /></label>
            <label className="producer-event-form__wide">Descripción<textarea name="description" rows={4} maxLength={2000} placeholder="Cuéntale a tu público qué hace especial este evento." required /></label>
          </div>
        </section>

        <section className="producer-event-form__section">
          <div className="producer-event-form__section-heading"><span>02</span><div><h3>Fotos del evento</h3><p>La primera foto será la portada. Puedes cargar hasta 4 imágenes.</p></div></div>
          <label className="producer-photo-upload">
            <input type="file" accept="image/*" multiple onChange={handlePhotos} />
            <ImagePlus size={23} /><strong>Selecciona tus fotos</strong><span>JPG, PNG o WebP · Máximo 8 MB por archivo</span>
            <span className="producer-photo-upload__button"><Upload size={15} /> Elegir imágenes</span>
          </label>
          {photoError && <p className="producer-portal-error" role="alert">{photoError}</p>}
          {photos.length > 0 && (
            <div className="producer-photo-previews">
              {photos.map((photo, index) => (
                <div key={`${index}-${photo.preview}`}>
                  <img src={photo.preview} alt={`Vista previa ${index + 1}`} />
                  <span>{index === 0 ? "Portada" : `Foto ${index + 1}`}</span>
                  <button type="button" aria-label={`Quitar foto ${index + 1}`} onClick={() => { URL.revokeObjectURL(photo.preview); setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index)); }}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="producer-event-form__section">
          <div className="producer-event-form__section-heading"><span>03</span><div><h3>Tipos de entrada e inventario</h3><p>Configura el precio y la cantidad disponible de cada tipo. Se añade un 10% de administración.</p></div></div>
          <div className="producer-ticket-editor">
            {ticketTypes.map((ticketType, index) => (
              <fieldset key={ticketType.id}>
                <legend>Tipo de entrada {index + 1}</legend>
                {ticketTypes.length > 1 && <button className="producer-ticket-editor__remove" type="button" aria-label={`Quitar tipo de entrada ${index + 1}`} onClick={() => removeTicketType(index)}><Trash2 size={15} /></button>}
                <div className="producer-event-form__grid">
                  <label>Nombre<input value={ticketType.name} onChange={(event) => updateTicketType(index, "name", event.target.value)} placeholder="Ej. Acceso general" maxLength={60} required /></label>
                  <label>Precio por entrada (CLP)<input type="number" min="1" step="1" value={ticketType.price} onChange={(event) => updateTicketType(index, "price", event.target.value)} placeholder="15000" required /><small>Administración: {ticketType.price > 0 ? `$${money.format(getAdministrationFee(Number(ticketType.price)))}` : "$0"} ({ADMINISTRATION_PERCENTAGE})</small></label>
                  <label>Cantidad disponible<input type="number" min="1" step="1" value={ticketType.available} onChange={(event) => updateTicketType(index, "available", event.target.value)} placeholder="100" required /></label>
                  <label>Descripción (opcional)<input value={ticketType.description} onChange={(event) => updateTicketType(index, "description", event.target.value)} placeholder="Detalles de esta entrada" maxLength={160} /></label>
                </div>
              </fieldset>
            ))}
          </div>
          <button className="producer-event-form__add-ticket" type="button" onClick={addTicketType}><CirclePlus size={16} /> Agregar otro tipo de entrada</button>
        </section>

        <div className="producer-event-form__publish">
          {publishError && <p className="producer-portal-error" role="alert">{publishError}</p>}
          <button className="producer-dashboard-primary" type="submit" disabled={saving}><Check size={16} /> Publicar evento</button>
          <p>Al publicar, el evento se mostrará en la página de inicio.</p>
        </div>
      </form>
    </section>
  );
}

export default function ProducerDashboard({ onPublish, onNavigate }) {
  const [producer, setProducer] = useState(null);
  const [producerEvents, setProducerEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    document.title = "Dashboard de productores — TickEven.cl";
    let active = true;
    const client = requireSupabase();
    client.auth.getSession().then(async ({ data, error }) => {
      if (error) throw error;
      if (!data.session?.user) {
        onNavigate("/productores/login", { replace: true });
        return;
      }
      if (!active) return;
      const { data: profile, error: profileError } = await client
        .from("profiles")
        .select("role, status, full_name")
        .eq("id", data.session.user.id)
        .single();
      if (profileError) throw profileError;
      if (profile.role !== "producer" || profile.status !== "approved") {
        await client.auth.signOut();
        onNavigate("/productores/login", { replace: true });
        return;
      }
      setProducer(data.session.user);
      const rows = await fetchProducerEvents(data.session.user.id);
      if (active) setProducerEvents(rows);
    }).catch((error) => {
      console.error("No se pudo cargar la sesión o los eventos del productor.", error);
      if (active) setLoadError(error.message || "No se pudo conectar con Supabase.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    const { data: authListener } = client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session?.user) {
        setProducer(null);
        onNavigate("/productores/login", { replace: true });
      }
    });
    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    try {
      await endProducerSession();
      onNavigate("/productores/login", { replace: true });
    } catch (error) {
      console.error("No se pudo cerrar la sesión de Supabase.", error);
      setLoadError("No se pudo cerrar la sesión. Inténtalo otra vez.");
    }
  };

  const publishEvent = async (event) => {
    const savedEvent = await onPublish(event);
    setProducerEvents((current) => [savedEvent, ...current]);
    setActiveTab("overview");
    setNotice(`“${savedEvent.title}” ya está publicado en Supabase.`);
    window.setTimeout(() => setNotice(""), 6000);
  };

  if (loading) return <main className="producer-dashboard-loading">Conectando con Supabase…</main>;
  if (loadError) return <main className="producer-dashboard-loading" role="alert">{loadError} <a href="/productores/login">Volver al acceso</a></main>;
  if (!producer) return null;
  const producerName = producer.user_metadata?.full_name || producer.email;

  return (
    <div className="producer-dashboard">
      <aside className="producer-dashboard-sidebar">
        <a className="brand" href="/" aria-label="TickEven.cl, inicio">
          <span className="brand__mark"><Ticket size={20} strokeWidth={2.5} /></span><span>tickeven<span className="brand__dot">.</span>cl</span>
        </a>
        <span className="producer-dashboard-sidebar__label">PRODUCTORES</span>
        <button className={activeTab === "overview" ? "is-active" : ""} type="button" onClick={() => setActiveTab("overview")}><LayoutDashboard size={17} /> Resumen</button>
        <button className={activeTab === "events" ? "is-active" : ""} type="button" onClick={() => setActiveTab("events")}><Ticket size={17} /> Mis eventos <span>{producerEvents.length}</span></button>
        <button className="producer-dashboard-sidebar__create" type="button" onClick={() => setActiveTab("create")}><Plus size={16} /> Crear evento</button>
        <div className="producer-dashboard-sidebar__account"><span>{producerName.slice(0, 1).toUpperCase()}</span><div><strong>{producerName}</strong><small>Cuenta Supabase</small></div><button type="button" aria-label="Cerrar sesión" onClick={signOut}><LogOut size={16} /></button></div>
      </aside>
      <main className="producer-dashboard-main">
        <header className="producer-dashboard-topbar">
          <div><span>PRODUCTORES</span><strong>{activeTab === "create" ? "Crear evento" : activeTab === "events" ? "Mis eventos" : "Dashboard"}</strong></div>
          <a href="/" target="_blank" rel="noreferrer">Ver sitio público <ArrowRight size={15} /></a>
        </header>
        {notice && <div className="producer-dashboard-notice" role="status"><Check size={16} />{notice}<button type="button" aria-label="Cerrar aviso" onClick={() => setNotice("")}>×</button></div>}
        {activeTab === "create" ? (
          <CreateEventTab onPublish={publishEvent} onCancel={() => setActiveTab("overview")} />
        ) : activeTab === "events" ? (
          <EventsTab events={producerEvents} onCreate={() => setActiveTab("create")} />
        ) : (
          <OverviewTab events={producerEvents} onCreate={() => setActiveTab("create")} />
        )}
        <footer className="producer-dashboard-footer"><span>Tus eventos e imágenes se guardan en Supabase.</span><a href="/productores">Conocer TickEven <MapPin size={13} /></a></footer>
      </main>
    </div>
  );
}

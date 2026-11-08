import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  CirclePlus,
  ImagePlus,
  LayoutDashboard,
  LogOut,
  MapPin,
  Package,
  Plus,
  ShoppingBag,
  Ticket,
  Trash2,
  Upload,
} from "lucide-react";
import { fetchProducerEvents } from "../data/events.js";
import { endProducerSession } from "../data/producerPortal.js";
import { requireSupabase } from "../data/supabase.js";
import { ADMINISTRATION_PERCENTAGE, getAdministrationFee } from "../data/pricing.js";
import Brand from "./Brand.jsx";

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
  const ticketTotals = events.reduce((totals, event) => ({
    capacity: totals.capacity + event.ticketCapacity,
    sold: totals.sold + event.ticketsSold,
    reserved: totals.reserved + event.ticketsReserved,
    available: totals.available + event.ticketsAvailable,
  }), { capacity: 0, sold: 0, reserved: 0, available: 0 });

  return (
    <section className="producer-dashboard-content">
      <div className="producer-dashboard-welcome">
        <div><span className="producer-dashboard-kicker">TU ESPACIO DE TRABAJO</span><h2>Un buen evento empieza acá.</h2><p>Publica tu próxima experiencia y administra tus eventos desde un solo lugar.</p></div>
        <button className="producer-dashboard-primary" type="button" onClick={onCreate}><Plus size={17} /> Crear evento</button>
      </div>
      <div className="producer-dashboard-stats">
        <article><span>EVENTOS PUBLICADOS</span><strong>{events.length}</strong><small>Experiencias en tu cuenta</small></article>
        <article><span>ENTRADAS VENDIDAS</span><strong>{money.format(ticketTotals.sold)}</strong><small>Reservadas temporalmente: {money.format(ticketTotals.reserved)}</small></article>
        <article><span>DISPONIBLES</span><strong>{money.format(ticketTotals.available)}</strong><small>De {money.format(ticketTotals.capacity)} entradas publicadas</small></article>
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
                <span className="producer-dashboard-event-row__status"><i /> Publicado · {money.format(event.ticketsAvailable)} disponibles</span>
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
      ticketType.price < 0 ||
      !Number.isSafeInteger(ticketType.available) ||
      ticketType.available <= 0
    )) {
      setPublishError("Revisa los nombres, precios (mayores o iguales a $0) y cantidades disponibles de las entradas.");
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
          <div className="producer-event-form__section-heading"><span>03</span><div><h3>Tipos de entrada e inventario</h3><p>Configura el precio y la cantidad disponible. Las entradas a $0 son gratuitas y no tienen cargo de administración.</p></div></div>
          <div className="producer-ticket-editor">
            {ticketTypes.map((ticketType, index) => (
              <fieldset key={ticketType.id}>
                <legend>Tipo de entrada {index + 1}</legend>
                {ticketTypes.length > 1 && <button className="producer-ticket-editor__remove" type="button" aria-label={`Quitar tipo de entrada ${index + 1}`} onClick={() => removeTicketType(index)}><Trash2 size={15} /></button>}
                <div className="producer-event-form__grid">
                  <label>Nombre<input value={ticketType.name} onChange={(event) => updateTicketType(index, "name", event.target.value)} placeholder="Ej. Acceso general" maxLength={60} required /></label>
                  <label>Precio por entrada (CLP)<input type="number" min="0" step="1" value={ticketType.price} onChange={(event) => updateTicketType(index, "price", event.target.value)} placeholder="15000" required /><small>{Number(ticketType.price) === 0 ? "Entrada gratuita · sin cargo de administración" : `Administración: $${money.format(getAdministrationFee(Number(ticketType.price)))} (${ADMINISTRATION_PERCENTAGE})`}</small></label>
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

function emptyProduct() {
  return {
    name: "",
    description: "",
    category: "Merchandising",
    price: "",
    stock: "",
    imageUrl: "",
    imageFile: null,
    showInCheckout: true,
    showOnEventPage: true,
    isActive: true,
    variants: [],
  };
}

function ProductManagementTab({ events }) {
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadProducts = async () => {
    if (!eventId) return;
    setLoading(true);
    setErrorMessage("");
    try {
      const client = requireSupabase();
      const [productsResult, inventoryResult] = await Promise.all([
        client.from("event_products")
          .select("id, event_id, name, description, category, price_clp, stock_total, image_url, show_in_checkout, show_on_event_page, is_active, event_product_variants(id, name, stock_total, is_active)")
          .eq("event_id", eventId)
          .order("created_at", { ascending: false }),
        client.from("event_product_inventory")
          .select("*")
          .eq("event_id", eventId),
      ]);
      if (productsResult.error) throw productsResult.error;
      if (inventoryResult.error) throw inventoryResult.error;
      setProducts(productsResult.data ?? []);
      setInventory(inventoryResult.data ?? []);
    } catch (error) {
      console.error("No se pudieron cargar los productos del evento.", error);
      setErrorMessage(error.message || "No se pudieron cargar los productos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setProduct(null);
    void loadProducts();
    const refresh = window.setInterval(() => { void loadProducts(); }, 30_000);
    return () => window.clearInterval(refresh);
  }, [eventId]);

  const saveProduct = async (formEvent) => {
    formEvent.preventDefault();
    if (!eventId || !product) return;
    setSaving(true);
    setErrorMessage("");
    let previewUrl = "";
    try {
      const client = requireSupabase();
      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError || !userData.user) throw userError ?? new Error("Tu sesión de productor expiró.");

      let imageUrl = product.imageUrl;
      if (product.imageFile) {
        const prepared = await optimizeImage(product.imageFile);
        previewUrl = prepared.preview;
        const imagePath = `${userData.user.id}/${eventId}/products/${product.id ?? crypto.randomUUID()}.jpg`;
        const { error: uploadError } = await client.storage.from("event-media")
          .upload(imagePath, prepared.blob, { contentType: "image/jpeg", upsert: true });
        if (uploadError) throw uploadError;
        imageUrl = client.storage.from("event-media").getPublicUrl(imagePath).data.publicUrl;
      }

      const variants = product.variants.map((variant) => ({
        ...(variant.id ? { id: variant.id } : {}),
        name: variant.name.trim(),
        stock_total: Number(variant.stock_total),
      }));
      const { error } = await client.rpc("save_event_product", {
        p_product_id: product.id ?? null,
        p_event_id: eventId,
        p_name: product.name.trim(),
        p_description: product.description.trim(),
        p_category: product.category.trim(),
        p_price_clp: Number(product.price),
        p_stock_total: variants.length ? 0 : Number(product.stock),
        p_image_url: imageUrl || null,
        p_show_in_checkout: product.showInCheckout,
        p_show_on_event_page: product.showOnEventPage,
        p_is_active: product.isActive,
        p_variants: variants,
      });
      if (error) throw error;
      setProduct(null);
      await loadProducts();
    } catch (error) {
      console.error("No se pudo guardar el producto.", error);
      setErrorMessage(error.message || "No se pudo guardar el producto.");
    } finally {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setSaving(false);
    }
  };

  const editProduct = (item) => setProduct({
    id: item.id,
    name: item.name,
    description: item.description,
    category: item.category,
    price: String(item.price_clp),
    stock: String(item.stock_total),
    imageUrl: item.image_url ?? "",
    imageFile: null,
    showInCheckout: item.show_in_checkout,
    showOnEventPage: item.show_on_event_page,
    isActive: item.is_active,
    variants: (item.event_product_variants ?? [])
      .filter((variant) => variant.is_active)
      .map((variant) => ({ ...variant, stock_total: String(variant.stock_total) })),
  });

  const inventoryFor = (item) => inventory.filter((row) => row.product_id === item.id);

  return (
    <section className="producer-dashboard-content">
      <div className="producer-dashboard-welcome">
        <div><span className="producer-dashboard-kicker">VENTA ASOCIADA A TUS EVENTOS</span><h2>Productos adicionales y merchandising</h2><p>El stock se reserva al crear la orden y queda confirmado junto con el pago.</p></div>
        <button className="producer-dashboard-primary" type="button" disabled={!eventId} onClick={() => setProduct(emptyProduct())}><Plus size={17} /> Crear producto</button>
      </div>
      <label className="producer-event-filter">Evento
        <select value={eventId} onChange={(event) => setEventId(event.target.value)}>
          {events.map((event) => <option value={event.id} key={event.id}>{event.title}</option>)}
        </select>
      </label>
      {errorMessage && <p className="producer-portal-error" role="alert">{errorMessage}</p>}
      {product && (
        <form className="producer-event-form producer-product-form" onSubmit={saveProduct}>
          <section className="producer-event-form__section">
            <div className="producer-event-form__section-heading"><span>+</span><div><h3>{product.id ? "Editar producto" : "Nuevo producto"}</h3><p>Nombre, precio, stock y dónde estará disponible.</p></div></div>
            <div className="producer-event-form__grid">
              <label>Nombre<input value={product.name} maxLength={100} required onChange={(event) => setProduct({ ...product, name: event.target.value })} /></label>
              <label>Categoría<input list="product-categories" value={product.category} maxLength={60} required onChange={(event) => setProduct({ ...product, category: event.target.value })} /><datalist id="product-categories">{["Bebidas", "Comida", "Merchandising", "Accesorios", "Experiencias", "Otros"].map((category) => <option key={category} value={category} />)}</datalist></label>
              <label>Precio (CLP)<input type="number" min="1" step="1" value={product.price} required onChange={(event) => setProduct({ ...product, price: event.target.value })} /></label>
              <label className="producer-event-form__wide">Descripción<textarea rows={3} maxLength={1000} value={product.description} onChange={(event) => setProduct({ ...product, description: event.target.value })} /></label>
              <label className="producer-event-form__wide">Fotografía<input type="file" accept="image/*" onChange={(event) => setProduct({ ...product, imageFile: event.target.files?.[0] ?? null })} />{product.imageUrl && <img className="producer-product-preview" src={product.imageUrl} alt="" />}</label>
              {!product.variants.length && <label>Stock disponible<input type="number" min="0" step="1" value={product.stock} required onChange={(event) => setProduct({ ...product, stock: event.target.value })} /></label>}
            </div>
          </section>
          <section className="producer-event-form__section">
            <div className="producer-event-form__section-heading"><span>+</span><div><h3>Variantes y stock</h3><p>Opcional. Cada opción mantiene inventario propio (ej. talla, formato).</p></div></div>
            {product.variants.map((variant, index) => (
              <div className="producer-product-variant" key={variant.id ?? index}>
                <label>Opción<input value={variant.name} maxLength={60} required onChange={(event) => setProduct({ ...product, variants: product.variants.map((item, row) => row === index ? { ...item, name: event.target.value } : item) })} /></label>
                <label>Stock inicial<input type="number" min="0" step="1" value={variant.stock_total} required onChange={(event) => setProduct({ ...product, variants: product.variants.map((item, row) => row === index ? { ...item, stock_total: event.target.value } : item) })} /></label>
                <button type="button" onClick={() => setProduct({ ...product, variants: product.variants.filter((_, row) => row !== index) })}>Quitar</button>
              </div>
            ))}
            <button className="producer-event-form__add-ticket" type="button" onClick={() => setProduct({ ...product, stock: "", variants: [...product.variants, { name: "", stock_total: "" }] })}><CirclePlus size={16} /> Agregar variante</button>
          </section>
          <div className="producer-product-options">
            <label><input type="checkbox" checked={product.showInCheckout} onChange={(event) => setProduct({ ...product, showInCheckout: event.target.checked })} /> Mostrar durante la compra de entradas</label>
            <label><input type="checkbox" checked={product.showOnEventPage} onChange={(event) => setProduct({ ...product, showOnEventPage: event.target.checked })} /> Mostrar en adicionales y merch del evento</label>
            <label><input type="checkbox" checked={product.isActive} onChange={(event) => setProduct({ ...product, isActive: event.target.checked })} /> Venta activa</label>
          </div>
          <div className="producer-event-form__publish">
            <button className="producer-dashboard-primary" type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar producto"}</button>
            <button className="producer-dashboard-back" type="button" onClick={() => setProduct(null)}>Cancelar</button>
          </div>
        </form>
      )}
      <div className="producer-dashboard-list-card">
        <div className="producer-dashboard-list-card__heading"><div><span className="producer-dashboard-kicker">STOCK Y DISPONIBILIDAD</span><h3>Productos del evento</h3></div></div>
        {loading ? <p className="producer-dashboard-empty">Cargando inventario…</p> : products.length ? (
          <div className="producer-product-list">
            {products.map((item) => {
              const rows = inventoryFor(item);
              const available = rows.reduce((sum, row) => sum + row.quantity_available, 0);
              const sold = rows.reduce((sum, row) => sum + row.quantity_sold, 0);
              const reserved = rows.reduce((sum, row) => sum + row.quantity_reserved, 0);
              return (
                <article className="producer-product-row" key={item.id}>
                  {item.image_url ? <img src={item.image_url} alt="" /> : <span className="producer-product-row__placeholder"><Package size={22} /></span>}
                  <div><strong>{item.name}</strong><small>{item.category} · ${money.format(item.price_clp)} · {item.is_active ? "Venta activa" : "Desactivado"}</small><small>Vendidos {sold} · Reservados {reserved} · Disponibles {available}</small></div>
                  <button type="button" onClick={() => editProduct(item)}>Editar</button>
                </article>
              );
            })}
          </div>
        ) : <div className="producer-dashboard-empty"><ShoppingBag size={24} /><strong>Aún no hay productos</strong><span>Asocia productos a este evento para vender adicionales o merchandising.</span></div>}
      </div>
    </section>
  );
}

function SalesTab({ events }) {
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [period, setPeriod] = useState("total");
  const [category, setCategory] = useState("all");
  const [reports, setReports] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const report = reports[0];
  const sales = report?.sales;
  const ticketData = report?.tickets;
  const productData = report?.products;

  const loadSales = async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const { data, error } = await requireSupabase().rpc("get_producer_sales_dashboard", {
        p_event_id: eventId || null,
      });
      if (error) throw error;
      setReports(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("No se pudieron cargar los informes de ventas.", error);
      setErrorMessage(error.message || "No se pudieron cargar los informes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSales();
    const refresh = window.setInterval(() => { void loadSales(); }, 30_000);
    return () => window.clearInterval(refresh);
  }, [eventId]);

  const allProducts = productData?.inventory ?? [];
  const categories = [...new Set(allProducts.map((item) => item.category))].sort();
  const visibleTicketTypes = category === "all" || category === "Entradas" ? ticketData?.types ?? [] : [];
  const visibleProducts = category === "all" || category === "Productos"
    ? allProducts
    : category === "Entradas" ? [] : allProducts.filter((item) => item.category === category);
  const dailyRows = (sales?.daily ?? []).slice(period === "7d" ? -7 : period === "today" ? -1 : -30);
  const dailyValues = dailyRows.map((day) => ({
    ...day,
    value: category === "Entradas" ? day.tickets_clp
      : categories.includes(category) ? day.product_categories?.[category] ?? 0
        : category === "Productos" ? day.products_clp : day.tickets_clp + day.products_clp,
  }));
  const dailyMax = Math.max(1, ...dailyValues.map((day) => day.value));
  const selectedPeriodTotal = period === "today" ? sales?.today_clp
    : period === "7d" ? sales?.last_7_days_clp
      : period === "month" ? sales?.month_clp : sales?.total_clp;
  const exportCsv = () => {
    const records = [
      ["Tipo", "Nombre", "Capacidad", "Vendidas", "Reservadas", "Disponibles", "Recaudacion CLP"],
      ...visibleTicketTypes.map((item) => ["Entrada", item.name, item.capacity, item.sold, item.reserved, item.available, item.revenue_clp]),
      ...visibleProducts.map((item) => ["Producto", `${item.name}${item.variant ? ` - ${item.variant}` : ""}`, item.capacity, item.sold, item.reserved, item.available, item.revenue_clp]),
    ];
    const csv = records.map((row) => row.map((field) => `"${String(field ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `tickeven-ventas-${report?.event_id ?? "eventos"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="producer-dashboard-content">
      <div className="producer-dashboard-welcome">
        <div><span className="producer-dashboard-kicker">INVENTARIO Y RECAUDACIÓN REAL</span><h2>Ventas de tus eventos</h2><p>Las cifras consideran órdenes aprobadas y reservas con vencimiento vigente.</p></div>
        <button className="producer-dashboard-primary" type="button" onClick={exportCsv} disabled={!report}><BarChart3 size={16} /> Exportar CSV</button>
      </div>
      <label className="producer-event-filter">Evento
        <select value={eventId} onChange={(event) => setEventId(event.target.value)}>
          {!events.length && <option value="">No hay eventos disponibles</option>}
          {events.map((event) => <option value={event.id} key={event.id}>{event.title}</option>)}
        </select>
      </label>
      {errorMessage && <p className="producer-portal-error" role="alert">{errorMessage}</p>}
      {loading ? <p className="producer-dashboard-empty">Consultando ventas confirmadas…</p> : report ? (
        <>
          <div className="producer-dashboard-stats producer-sales-stats">
            <article><span>RECAUDACIÓN BRUTA</span><strong>${money.format(sales.total_clp)}</strong><small>Entradas + adicionales, cargos incluidos</small></article>
            <article><span>ENTRADAS VENDIDAS</span><strong>{money.format(ticketData.sold)}</strong><small>Capacidad {money.format(ticketData.capacity)} · {money.format(ticketData.reserved)} reservadas</small></article>
            <article><span>PRODUCTOS VENDIDOS</span><strong>{money.format(productData.sold)}</strong><small>Adicionales y merchandising</small></article>
            <article><span>PRECIO PROMEDIO ENTRADA</span><strong>${money.format(ticketData.sold ? Math.round(ticketData.revenue_clp / ticketData.sold) : 0)}</strong><small>Sin sumar productos</small></article>
          </div>
          <div className="producer-dashboard-list-card producer-sales-chart">
            <div className="producer-dashboard-list-card__heading">
              <div><span className="producer-dashboard-kicker">EVOLUCIÓN DE VENTAS</span><h3>Recaudación diaria</h3></div>
              <div className="producer-sales-filters">
                <select aria-label="Filtrar por período" value={period} onChange={(event) => setPeriod(event.target.value)}>
                  <option value="today">Hoy</option><option value="7d">Últimos 7 días</option><option value="30d">Últimos 30 días</option><option value="month">Este mes</option><option value="total">Acumulado</option>
                </select>
                <select aria-label="Filtrar por categoría" value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option value="all">Todas las categorías</option><option value="Entradas">Entradas</option><option value="Productos">Todos los productos</option>
                  {categories.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
            </div>
            <div className="producer-sales-chart__headline"><span>Período seleccionado</span><strong>${money.format(selectedPeriodTotal ?? 0)}</strong></div>
            <div className="producer-sales-chart__bars" role="img" aria-label="Gráfico de recaudación diaria">
              {dailyValues.map((day) => (
                <div className="producer-sales-chart__bar" key={day.date} title={`${day.date}: $${money.format(day.value)}`}>
                  <span><i style={{ height: `${Math.max(3, day.value / dailyMax * 100)}%` }} /></span>
                  <small>{day.date.slice(5)}</small>
                </div>
              ))}
            </div>
          </div>
          <div className="producer-dashboard-stats producer-sales-stats">
            <article><span>VENTAS HOY</span><strong>${money.format(sales.today_clp)}</strong></article>
            <article><span>ÚLTIMOS 7 DÍAS</span><strong>${money.format(sales.last_7_days_clp)}</strong></article>
            <article><span>ESTE MES</span><strong>${money.format(sales.month_clp)}</strong></article>
            <article><span>ACUMULADO</span><strong>${money.format(sales.total_clp)}</strong></article>
          </div>
          <div className="producer-dashboard-list-card">
            <div className="producer-dashboard-list-card__heading"><div><span className="producer-dashboard-kicker">COMPOSICIÓN DEL EVENTO</span><h3>{report.title}</h3></div></div>
            <div className="producer-finance-breakdown">
              <span>Entradas: <strong>${money.format(sales.ticket_subtotal_clp)}</strong></span>
              <span>Adicionales: <strong>${money.format(sales.product_subtotal_clp)}</strong></span>
              <span>Administración cobrada (10%): <strong>${money.format(sales.administration_clp)}</strong></span>
              <span>Procesamiento Mercado Pago: <strong>{sales.processor_fees_clp === null ? "No registrado en todas las órdenes" : `$${money.format(sales.processor_fees_clp)}`}</strong></span>
              <span>Reembolsos registrados: <strong>{sales.refunds_clp === null ? "No registrados" : `$${money.format(sales.refunds_clp)}`}</strong></span>
              <span>Neto estimado: <strong>{sales.estimated_net_clp === null ? "No estimable con datos actuales" : `$${money.format(sales.estimated_net_clp)}`}</strong></span>
              <span>Liquidado al productor: <strong>{sales.settled_clp === null ? "No registrado" : `$${money.format(sales.settled_clp)}`}</strong></span>
              <span>Pendiente de liquidación: <strong>{sales.pending_settlement_clp === null ? "No registrado" : `$${money.format(sales.pending_settlement_clp)}`}</strong></span>
            </div>
          </div>
          <div className="producer-dashboard-list-card">
            <div className="producer-dashboard-list-card__heading"><div><span className="producer-dashboard-kicker">INVENTARIO</span><h3>Tipos de entrada</h3></div></div>
            <div className="producer-sales-table">
              {visibleTicketTypes.map((item) => (
                <div className="producer-sales-table__row" key={item.id}>
                  <span><strong>{item.name}</strong><small>{item.sold} vendidas · {item.reserved} reservadas · {item.available} disponibles</small><i><b style={{ width: `${item.capacity ? Math.min(100, item.sold / item.capacity * 100) : 0}%` }} /></i></span>
                  <strong>{item.capacity ? (item.sold / item.capacity * 100).toFixed(1) : "0.0"}%</strong>
                  <strong>${money.format(item.revenue_clp)}</strong>
                </div>
              ))}
            </div>
          </div>
          <div className="producer-dashboard-list-card">
            <div className="producer-dashboard-list-card__heading"><div><span className="producer-dashboard-kicker">ADICIONALES Y MERCHANDISING</span><h3>Ventas e inventario de productos</h3></div></div>
            <div className="producer-sales-table">
              {visibleProducts.map((item) => (
                <div className="producer-sales-table__row" key={`${item.product_id}:${item.variant_id ?? "default"}`}>
                  <span><strong>{item.name}{item.variant ? ` · ${item.variant}` : ""}</strong><small>{item.category} · {item.sold} vendidos · {item.reserved} reservados · {item.available} disponibles</small><i><b style={{ width: `${item.capacity ? Math.min(100, item.sold / item.capacity * 100) : 0}%` }} /></i></span>
                  <strong>{item.capacity ? (item.sold / item.capacity * 100).toFixed(1) : "0.0"}%</strong>
                  <strong>${money.format(item.revenue_clp)}</strong>
                </div>
              ))}
              {!productData.inventory?.length && <p className="producer-dashboard-empty">Este evento aún no tiene productos asociados.</p>}
            </div>
          </div>
        </>
      ) : <div className="producer-dashboard-empty">No hay ventas registradas para mostrar.</div>}
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

  useEffect(() => {
    if (!producer?.id) return undefined;
    let active = true;
    const refresh = async () => {
      try {
        const rows = await fetchProducerEvents(producer.id);
        if (active) setProducerEvents(rows);
      } catch (error) {
        console.error("No se pudo actualizar el inventario del productor.", error);
      }
    };
    const interval = window.setInterval(() => { void refresh(); }, 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [producer?.id]);

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
        <Brand />
        <span className="producer-dashboard-sidebar__label">PRODUCTORES</span>
        <button className={activeTab === "overview" ? "is-active" : ""} type="button" onClick={() => setActiveTab("overview")}><LayoutDashboard size={17} /> Resumen</button>
        <button className={activeTab === "events" ? "is-active" : ""} type="button" onClick={() => setActiveTab("events")}><Ticket size={17} /> Mis eventos <span>{producerEvents.length}</span></button>
        <button className={activeTab === "products" ? "is-active" : ""} type="button" onClick={() => setActiveTab("products")}><Package size={17} /> Productos</button>
        <button className={activeTab === "sales" ? "is-active" : ""} type="button" onClick={() => setActiveTab("sales")}><BarChart3 size={17} /> Ventas e inventario</button>
        <button className="producer-dashboard-sidebar__create" type="button" onClick={() => setActiveTab("create")}><Plus size={16} /> Crear evento</button>
        <div className="producer-dashboard-sidebar__account"><span>{producerName.slice(0, 1).toUpperCase()}</span><div><strong>{producerName}</strong><small>Cuenta Supabase</small></div><button type="button" aria-label="Cerrar sesión" onClick={signOut}><LogOut size={16} /></button></div>
      </aside>
      <main className="producer-dashboard-main">
        <header className="producer-dashboard-topbar">
          <div><span>PRODUCTORES</span><strong>{activeTab === "create" ? "Crear evento" : activeTab === "events" ? "Mis eventos" : activeTab === "products" ? "Productos adicionales" : activeTab === "sales" ? "Ventas e inventario" : "Dashboard"}</strong></div>
          <a href="/" target="_blank" rel="noreferrer">Ver sitio público <ArrowRight size={15} /></a>
        </header>
        {notice && <div className="producer-dashboard-notice" role="status"><Check size={16} />{notice}<button type="button" aria-label="Cerrar aviso" onClick={() => setNotice("")}>×</button></div>}
        {activeTab === "create" ? (
          <CreateEventTab onPublish={publishEvent} onCancel={() => setActiveTab("overview")} />
        ) : activeTab === "events" ? (
          <EventsTab events={producerEvents} onCreate={() => setActiveTab("create")} />
        ) : activeTab === "products" ? (
          <ProductManagementTab events={producerEvents} />
        ) : activeTab === "sales" ? (
          <SalesTab events={producerEvents} />
        ) : (
          <OverviewTab events={producerEvents} onCreate={() => setActiveTab("create")} />
        )}
        <footer className="producer-dashboard-footer"><span>Tus eventos e imágenes se guardan en Supabase.</span><a href="/productores">Conocer TickEven <MapPin size={13} /></a></footer>
      </main>
    </div>
  );
}

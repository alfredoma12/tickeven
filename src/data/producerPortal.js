const PRODUCER_SESSION_KEY = "tickeven-producer-demo-session";
const PUBLISHED_EVENTS_KEY = "tickeven-producer-events-v1";

export function readProducerSession() {
  return sessionStorage.getItem(PRODUCER_SESSION_KEY);
}

export function startProducerDemoSession(username, password) {
  const normalizedUsername = username.trim();
  if (!normalizedUsername || !password) {
    throw new Error("Ingresa tu usuario y contraseña.");
  }

  sessionStorage.setItem(PRODUCER_SESSION_KEY, normalizedUsername);
  return normalizedUsername;
}

export function endProducerSession() {
  sessionStorage.removeItem(PRODUCER_SESSION_KEY);
}

export function readPublishedEvents() {
  const storedEvents = localStorage.getItem(PUBLISHED_EVENTS_KEY);
  if (!storedEvents) return [];

  const parsedEvents = JSON.parse(storedEvents);
  if (!Array.isArray(parsedEvents)) {
    throw new TypeError("Los eventos publicados guardados no tienen un formato válido.");
  }

  return parsedEvents.filter((event) =>
    event !== null &&
    typeof event === "object" &&
    Number.isSafeInteger(event.id) &&
    typeof event.title === "string" &&
    typeof event.slug === "string" &&
    typeof event.image === "string" &&
    Array.isArray(event.ticketTypes) &&
    event.ticketTypes.length > 0
  );
}

export function publishProducerEvent(event) {
  const currentEvents = readPublishedEvents();
  const updatedEvents = [event, ...currentEvents];
  localStorage.setItem(PUBLISHED_EVENTS_KEY, JSON.stringify(updatedEvents));
  return updatedEvents;
}

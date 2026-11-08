export const APP_URL = (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/+$/, "");

export function createUUID() {
  const secureCrypto = globalThis.crypto;
  if (!secureCrypto?.getRandomValues) {
    throw new Error("Este navegador no permite generar identificadores seguros. Abre TickEven en un navegador actualizado mediante HTTPS.");
  }
  if (typeof secureCrypto.randomUUID === "function") return secureCrypto.randomUUID();

  const bytes = secureCrypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

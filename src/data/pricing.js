export const ADMINISTRATION_RATE = 0.1;
export const ADMINISTRATION_PERCENTAGE = `${ADMINISTRATION_RATE * 100}%`;

export function getAdministrationFee(ticketPrice) {
  if (!Number.isSafeInteger(ticketPrice) || ticketPrice < 0) {
    throw new RangeError("El precio de la entrada debe ser un entero no negativo en pesos chilenos.");
  }

  return Math.round(ticketPrice * ADMINISTRATION_RATE);
}

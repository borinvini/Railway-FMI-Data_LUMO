/**
 * Plain-language names for the train-type codes in the data (`IC`, `S`, ...), shown next to the
 * code wherever it appears so nobody has to look a legend up. Digitraffic's own metadata carries
 * only the code and category, so the names live here.
 *
 * Only add a name once it is confirmed: a code that is not listed falls back to a generic label
 * rather than a guess. Still unconfirmed: HDM, MV, PVV, V. HSM is only a loose label: a 2021
 * Sweco noise study for Tampere lists it as electric multiple units (Sm2/Sm4) and once as a
 * diesel railcar (Dm12), so it is not one vehicle type.
 */
const NAMES: Record<string, string> = {
  IC: 'InterCity',
  S: 'Pendolino',
  AE: 'Allegro (to St Petersburg)',
  PYO: 'Night train',
  HSM: 'Multiple-unit train',
}

export const FALLBACK_TRAIN_NAME = 'Other long-distance'

export const trainTypeName = (code: string): string => NAMES[code] ?? FALLBACK_TRAIN_NAME

/**
 * Drops keys whose value is `undefined`.
 * DTO instances define every declared field (ES2022 class fields), so a PATCH body that omits a
 * field still carries `field: undefined` — assigning that onto a Mongoose document would clear it.
 */
export function defined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

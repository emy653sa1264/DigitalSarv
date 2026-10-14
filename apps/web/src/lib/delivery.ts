/** Contract v4.2 «Delivery on the order»: school books, cartridges and devices are collected at home (mirrors the API's `needsHomePickup`). */
export const HOME_PICKUP_KINDS = ['cart', 'repair']
export function needsHomePickup(d: { children: unknown[]; services: { kind: string }[] }): boolean {
  return d.children.length > 0 || d.services.some((s) => HOME_PICKUP_KINDS.includes(s.kind))
}

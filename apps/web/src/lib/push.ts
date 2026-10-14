import { api } from '@/lib/api'

/** Browser (Web Push) notifications through the shared root worker `public/sw.js`. */
export type PushState = 'unsupported' | 'denied' | 'off' | 'on'

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** Same worker/scope as `lib/pwa.ts`; registered on demand so push also works before the load-time registration ran. */
async function workerRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/')
  if (!existing) await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  return navigator.serviceWorker.ready
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration('/')
  return reg ? reg.pushManager.getSubscription() : null
}

export async function readPushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted') return 'off'
  return (await currentSubscription()) ? 'on' : 'off'
}

/**
 * Subscribes this browser. The server key is fetched first so no permission prompt is shown
 * when push isn't configured (`publicKey: null` → inbox only).
 */
export async function enablePush(): Promise<'on' | 'denied' | 'nokey'> {
  const { publicKey } = await api.get<{ publicKey: string | null }>('/notifications/push/key')
  if (!publicKey) return 'nokey'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'
  const reg = await workerRegistration()
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }))
  const json = sub.toJSON()
  await api.post('/notifications/push/subscribe', { endpoint: json.endpoint, keys: json.keys })
  return 'on'
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  await api.post('/notifications/push/unsubscribe', { endpoint: sub.endpoint })
  await sub.unsubscribe()
}

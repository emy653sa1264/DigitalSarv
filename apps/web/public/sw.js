/*
 * Digital Sarv service worker — one worker (scope "/") for the four apps:
 * landing "/", customer "/app/", courier "/courier/", admin "/admin/".
 *
 * - navigations: network-first; offline → the app's cached index.html
 * - /assets/* (hashed) and /icons/*: cache-first
 * - never touches /api, /uploads, cross-origin or non-GET requests
 *
 * VERSION is stamped at build time (vite.config.ts); a new build drops the old caches.
 */
const VERSION = '__SW_VERSION__'
const CACHE = `sarv-${VERSION}`
const SHELLS = ['/index.html', '/app/index.html', '/courier/index.html', '/admin/index.html']

const OFFLINE_HTML = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>دیجیتال سرو</title></head><body style="margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;background:#eef2fb;color:#0f1320;font-family:Vazirmatn,system-ui,sans-serif;text-align:center">
<div style="padding:24px"><h1 style="font-size:22px;font-weight:900">اتصال اینترنت برقرار نیست</h1>
<p style="color:#4a5268;line-height:1.8">لطفاً اتصال خود را بررسی کنید و دوباره تلاش کنید.</p>
<button onclick="location.reload()" style="margin-top:8px;border:0;border-radius:999px;background:#2f6df6;color:#fff;font:inherit;font-weight:800;padding:14px 28px;cursor:pointer">تلاش دوباره</button></div></body></html>`

function shellFor(pathname) {
  for (const app of ['app', 'courier', 'admin']) {
    if (pathname === `/${app}` || pathname.startsWith(`/${app}/`)) return `/${app}/index.html`
  }
  return '/index.html'
}

function isBypassed(url) {
  return url.pathname === '/api' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads')
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.allSettled(SHELLS.map((url) => cache.add(new Request(url, { cache: 'reload' })))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('sarv-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || isBypassed(url)) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, shellFor(url.pathname)))
  } else if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(request))
  }
})

async function networkFirst(request, shell) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    const isHtml = (response.headers.get('content-type') || '').includes('text/html')
    if (response.ok && response.type === 'basic' && !response.redirected && isHtml) {
      await cache.put(shell, response.clone())
    }
    return response
  } catch (error) {
    const cached = (await cache.match(shell)) || (await cache.match('/index.html'))
    return cached || new Response(OFFLINE_HTML, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok && response.type === 'basic') await cache.put(request, response.clone())
  return response
}

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { expect, inject } from 'vitest'

export const origin = () => inject('origin')
export const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'phone', width: 390, height: 844 },
] as const
export type Viewport = (typeof VIEWPORTS)[number]
export type AppKey = 'app' | 'courier' | 'provider' | 'admin'
export const PHONES = { admin: '09120000000', courier: '09121111111', provider: '09122222222', customer: '09123456789' } as const
export interface Session { token: string; user: { id: string; role: string; [k: string]: unknown } }

const ARTIFACTS = path.resolve(import.meta.dirname, '.artifacts')
let browser: Browser | null = null

/** The installed Microsoft Edge (D37) — never a downloaded browser. */
async function launch(): Promise<Browser> {
  browser ??= await chromium.launch({ channel: 'msedge', headless: true })
  return browser
}
export async function closeBrowser() {
  await browser?.close()
  browser = null
}

export async function apiCall<T = any>(token: string | null, method: string, p: string, body?: unknown): Promise<{ status: number; body: T }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = await fetch(`${origin()}/api${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, body: (text ? JSON.parse(text) : undefined) as T }
}

const sessions = new Map<string, Session>()
const SESSION_FILE = path.join(ARTIFACTS, 'sessions.json')
const readSessions = (): Record<string, Session> => { try { return JSON.parse(readFileSync(SESSION_FILE, 'utf8')) } catch { return {} } }
/**
 * OTP login through the API (`devCode`), once per phone per RUN (cached in memory and in `.artifacts/sessions.json`, which
 * global setup deletes). OTP budget: 5 requests per phone per 600 s; every phone stays at <= 3 per run — one API login each
 * (admin, provider, courier, customer Maryam) plus at most 2 UI logins (customer UI logins use Mehdi's phone; the courier UI
 * login runs once at desktop width and once more in the sessions spec).
 */
export async function session(phone: string): Promise<Session> {
  const hit = sessions.get(phone) ?? readSessions()[phone]
  if (hit) { sessions.set(phone, hit); return hit }
  const req = await apiCall<{ devCode?: string }>(null, 'POST', '/auth/otp/request', { phone })
  if (!req.body?.devCode) throw new Error('OTP_DEV_CODE=1 is required for the browser suite')
  const v = await apiCall<{ accessToken: string; user: Session['user'] }>(null, 'POST', '/auth/otp/verify', { phone, code: req.body.devCode })
  const s = { token: v.body.accessToken, user: v.body.user }
  sessions.set(phone, s)
  mkdirSync(ARTIFACTS, { recursive: true })
  writeFileSync(SESSION_FILE, JSON.stringify({ ...readSessions(), [phone]: s }))
  return s
}

/** Collects every `/api/` JSON response body the page receives (for the §91 response scans). */
export function captureApi(o: Opened): { url: string; text: string }[] {
  const seen: { url: string; text: string }[] = []
  o.page.on('response', (r) => {
    if (!r.url().includes('/api/') || !(r.headers()['content-type'] ?? '').includes('json')) return
    void r.text().then((text) => { seen.push({ url: r.url().replace(/^https?:\/\/[^/]+/, ''), text }) }).catch(() => undefined)
  })
  return seen
}

export interface Opened { page: Page; context: BrowserContext; problems: string[] }

/**
 * A fresh browser context (service workers blocked) at `vp`; `sessions` are seeded under each app's own key (D36) and
 * `storage` as raw localStorage items — once per context (a later logout or migration is not undone by the next navigation).
 */
export async function openPage(vp: Viewport, opts: { sessions?: Partial<Record<AppKey, Session>>; storage?: Record<string, string> } = {}): Promise<Opened> {
  const context = await (await launch()).newContext({
    viewport: { width: vp.width, height: vp.height }, serviceWorkers: 'block', locale: 'fa-IR',
    ...(vp.name === 'phone' ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
  })
  const seed: Record<string, string> = { ...(opts.storage ?? {}) }
  for (const [app, s] of Object.entries(opts.sessions ?? {})) seed[`sarv-auth:${app}`] = JSON.stringify({ state: { token: s!.token, user: s!.user }, version: 0 })
  if (Object.keys(seed).length) {
    await context.addInitScript((items: Record<string, string>) => {
      if (localStorage.getItem('e2e-seeded')) return
      for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v)
      localStorage.setItem('e2e-seeded', '1')
    }, seed)
  }
  const page = await context.newPage()
  const problems: string[] = []
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  // refused API calls are expected in some tests; the browser's own «Failed to load resource» line is not an app error
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push(`console: ${m.text()}`) })
  return { page, context, problems }
}

/** §92 checks of the page as rendered: RTL + fa, no horizontal overflow, Persian digits only, a title, no console errors. */
export async function checkPage(o: Opened, label: string) {
  await o.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined)
  await o.page.waitForFunction(() => (document.getElementById('root')?.childElementCount ?? 0) > 0, undefined, { timeout: 15_000 })
  const facts = await o.page.evaluate(() => {
    const html = document.documentElement
    // Latin size names (A3–A6) and masked Sheba numbers are allowed to stay Latin
    const allow = /\bA[3-6]\b|IR[\d•]+/g
    const ascii: string[] = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement
      if (!el || el.closest('script,style,noscript,input,textarea,code,[data-ascii]')) continue
      if (!el.getClientRects().length) continue // not rendered
      // a whitespace-delimited token with Latin letters (HP 85A, SCHOOL14, #2f6df6) is an identifier read verbatim (R15-1)
      const text = (n.textContent ?? '').replace(allow, '').split(/\s+/).filter((t) => !/[A-Za-z]/.test(t)).join(' ')
      for (const d of text.match(/\d+/g) ?? []) ascii.push(`${d} in «${text.trim().slice(0, 40)}»`)
    }
    return { dir: html.getAttribute('dir'), lang: html.getAttribute('lang'), overflow: html.scrollWidth - window.innerWidth, ascii: ascii.slice(0, 5), title: document.title }
  })
  expect(facts.dir, label).toBe('rtl')
  expect(facts.lang, label).toBe('fa')
  expect(facts.overflow, `${label}: horizontal overflow (px)`).toBeLessThanOrEqual(1)
  expect(facts.ascii, `${label}: ASCII digits in the UI`).toEqual([])
  expect(facts.title.trim().length, `${label}: title`).toBeGreaterThan(0)
  expect(o.problems, `${label}: console errors`).toEqual([])
}

/** Navigates and checks; on failure a full-page screenshot goes to `e2e/.artifacts/` (git-ignored). */
export async function visit(o: Opened, p: string, label: string) {
  try {
    const res = await o.page.goto(`${origin()}${p}`, { waitUntil: 'domcontentloaded' })
    expect(res?.status(), `${label}: HTTP status`).toBe(200)
    await checkPage(o, label)
  } catch (err) {
    mkdirSync(ARTIFACTS, { recursive: true })
    await o.page.screenshot({ path: path.join(ARTIFACTS, `${label.replace(/[^\w-]+/g, '_')}.png`), fullPage: true }).catch(() => undefined)
    throw err
  }
}

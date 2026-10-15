import type { Page } from 'playwright-core'
import { closeBrowser, openPage, origin, PHONES, session, VIEWPORTS } from './kit'

afterAll(closeBrowser)
const desktop = VIEWPORTS[0]
const tokenOf = (key: string) => `(() => { try { return JSON.parse(localStorage.getItem('${key}') ?? 'null')?.state?.token ?? null } catch { return null } })()`

/** The admin panel is really open: settled, not on the login, and an admin-only control (the sidebar sign-out) is visible. */
async function settledAsAdmin(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined)
  await page.getByRole('button', { name: 'خروج از حساب' }).waitFor()
  expect(page.url()).not.toMatch(/\/admin\/login/)
}

describe('one login per app (D36)', () => {
  it('signing in to the courier app in another tab signs nobody out of the customer app or the admin panel', async () => {
    const [cust, admin] = [await session(PHONES.customer), await session(PHONES.admin)]
    const o = await openPage(desktop, { sessions: { app: cust, admin } })
    await o.page.goto(`${origin()}/app`)
    const courierTab = await o.context.newPage()
    await courierTab.goto(`${origin()}/courier/login`)
    await courierTab.fill('#courier-phone', PHONES.courier)
    const requested = courierTab.waitForResponse((r) => r.url().endsWith('/api/auth/otp/request'))
    await courierTab.locator('button[type=submit]').first().click()
    await requested
    await courierTab.locator('button[type=submit]').first().click()
    await courierTab.waitForURL((u) => !u.pathname.startsWith('/courier/login'))
    await o.page.reload()
    expect(await o.page.evaluate(tokenOf('sarv-auth:app'))).toBe(cust.token)
    await o.page.goto(`${origin()}/admin`)
    await settledAsAdmin(o.page)
    expect(await o.page.evaluate(tokenOf('sarv-auth:admin'))).toBe(admin.token)
    expect(await o.page.evaluate(tokenOf('sarv-auth:courier'))).toEqual(expect.any(String))
    await o.context.close()
  })

  it('the legacy shared session moves once, only into the app of its role', async () => {
    const admin = await session(PHONES.admin)
    const legacy = JSON.stringify({ state: { token: admin.token, user: admin.user }, version: 0 })
    const o = await openPage(desktop, { storage: { 'sarv-auth': legacy } })
    await o.page.goto(`${origin()}/app`)
    expect(await o.page.evaluate(tokenOf('sarv-auth:app'))).toBeNull() // an admin session never lands in the customer app
    expect(await o.page.evaluate(() => localStorage.getItem('sarv-auth'))).not.toBeNull()
    await o.page.goto(`${origin()}/admin`)
    await settledAsAdmin(o.page)
    expect(await o.page.evaluate(tokenOf('sarv-auth:admin'))).toBe(admin.token)
    expect(await o.page.evaluate(() => localStorage.getItem('sarv-auth'))).toBeNull()
    await o.context.close()
  })

  it('a wrong-role session is ignored: a customer token under the admin key shows the login form', async () => {
    const cust = await session(PHONES.customer)
    const o = await openPage(desktop, { sessions: { admin: cust } })
    await o.page.goto(`${origin()}/admin`)
    await o.page.locator('#admin-phone').waitFor()
    await o.context.close()
  })

  it('a rejected token signs out only the app that used it', async () => {
    const cust = await session(PHONES.customer)
    const admin = await session(PHONES.admin)
    const o = await openPage(desktop, { sessions: { app: cust, admin: { ...admin, token: 'not-a-valid-token' } } })
    await o.page.goto(`${origin()}/admin`)
    await o.page.waitForURL(/\/admin\/login/)
    await o.page.locator('#admin-phone').waitFor()
    await o.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined) // the sign-out has been persisted
    expect(await o.page.evaluate(tokenOf('sarv-auth:admin'))).toBeNull()
    await o.page.goto(`${origin()}/app/me`)
    await o.page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined)
    await o.page.waitForFunction(() => (document.getElementById('root')?.childElementCount ?? 0) > 0)
    expect(o.page.url()).not.toMatch(/\/app\/login/)
    expect(await o.page.evaluate(tokenOf('sarv-auth:app'))).toBe(cust.token)
    await o.context.close()
  })
})

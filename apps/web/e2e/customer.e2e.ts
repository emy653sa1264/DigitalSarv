import { apiCall, checkPage, closeBrowser, openPage, PHONES, session, visit, VIEWPORTS, type Session } from './kit'

afterAll(closeBrowser)

const ANON = ['/app', '/app/print', '/app/print/bw', '/app/print/color', '/app/docs', '/app/flyer', '/app/cart', '/app/repair', '/app/family', '/app/membership', '/app/login']
const SIGNED = ['/app', '/app/me', '/app/orders', '/app/notifications', '/app/track', '/app/summary']
const docs = { kind: 'docs', spec: { pages: 20, scope: 'all', ink: 'bw', sides: 'single', copies: 1 } }
/** The persisted order draft (`sarv-draft`, version 3) of a thesis print delivered by courier. */
const draft = (payMethod: 'gateway' | 'cod') => JSON.stringify({
  state: {
    children: [], services: [docs], urgent: false,
    pickup: { address: 'تهران، خیابان آزمون، پلاک ۷', phone: PHONES.customer, date: '', slot: '' },
    delivery: { method: 'courier', note: '' }, payMethod, activeChild: null, newChildIndex: null, uploads: {},
  },
  version: 3,
})
const myOrders = async (s: Session) => (await apiCall<{ id: string; code: string; status: string }[]>(s.token, 'GET', '/orders/mine')).body

describe.each(VIEWPORTS)('customer app at $name', (vp) => {
  let cust: Session
  beforeAll(async () => { cust = await session(PHONES.customer) })

  it('§92 existing menus and services render for a visitor', async () => {
    const o = await openPage(vp)
    for (const p of ANON) await visit(o, p, `customer-anon${p.replaceAll('/', '-')}-${vp.name}`)
    await o.context.close()
  })

  it('§92 login by OTP in the UI keeps the session under the customer app’s own key (D36)', async () => {
    const o = await openPage(vp)
    await visit(o, '/app/login', `customer-login-${vp.name}`)
    await o.page.fill('#login-phone', PHONES.customer)
    const requested = o.page.waitForResponse((r) => r.url().endsWith('/api/auth/otp/request'))
    await o.page.locator('button[type=submit]').first().click()
    await requested
    const verified = o.page.waitForResponse((r) => r.url().endsWith('/api/auth/otp/verify'))
    await o.page.locator('button[type=submit]').first().click() // the dev code is filled in
    expect((await verified).status()).toBe(200)
    await o.page.waitForURL((u) => !u.pathname.startsWith('/app/login'))
    const stored = await o.page.evaluate(() => ({ app: localStorage.getItem('sarv-auth:app'), legacy: localStorage.getItem('sarv-auth') }))
    expect(JSON.parse(stored.app!).state.token).toEqual(expect.any(String))
    expect(stored.legacy).toBeNull()
    await o.context.close()
  })

  it('§92 account, orders, an existing order, notifications and the cart render for a signed-in customer', async () => {
    const o = await openPage(vp, { sessions: { app: cust } })
    for (const p of SIGNED) await visit(o, p, `customer-signed${p.replaceAll('/', '-')}-${vp.name}`)
    const existing = (await myOrders(cust))[0]
    expect(existing, 'the demo seed has orders for this customer').toBeTruthy()
    await visit(o, `/app/track/${existing.id}`, `customer-track-${vp.name}`)
    await o.context.close()
  })

  it('§92 checkout and payment through the (mock) gateway; the order is paid, then cancelled to keep the data clean', async () => {
    const before = (await myOrders(cust)).length
    const o = await openPage(vp, { sessions: { app: cust }, storage: { 'sarv-draft': draft('gateway') } })
    await visit(o, '/app/pay', `customer-pay-${vp.name}`)
    await o.page.getByRole('button', { name: 'پرداخت و ثبت سفارش' }).click()
    await o.page.waitForURL(/\/api\/payments\/mock\/pay/)
    expect(await o.page.evaluate(() => document.documentElement.dir)).toBe('rtl')
    await o.page.getByRole('link', { name: 'پرداخت موفق' }).click()
    await o.page.waitForURL(/\/app\/pay\/return\?.*status=ok/)
    await checkPage(o, `customer-pay-return-${vp.name}`)
    const orders = await myOrders(cust)
    expect(orders.length).toBe(before + 1)
    expect(orders[0].status).toBe('registered')
    expect((await apiCall(cust.token, 'POST', `/orders/${orders[0].id}/cancel`)).status).toBe(200) // refunded to the wallet
    await o.context.close()
  })

  it('§91 a price changed in the browser is never charged: the server answers 409 and the app asks to confirm the real total', async () => {
    const before = (await myOrders(cust)).length
    const o = await openPage(vp, { sessions: { app: cust }, storage: { 'sarv-draft': draft('cod') } })
    await o.page.route('**/api/orders/quote', async (route) => {
      const response = await route.fetch()
      const json = await response.json()
      await route.fulfill({ response, json: { ...json, total: 1 } })
    })
    await visit(o, '/app/pay', `customer-forged-${vp.name}`)
    await o.page.getByRole('button', { name: 'ثبت سفارش', exact: true }).click()
    await o.page.getByText('قیمت سفارش تغییر کرده است').waitFor()
    expect((await myOrders(cust)).length).toBe(before)
    await o.context.close()
  })
})

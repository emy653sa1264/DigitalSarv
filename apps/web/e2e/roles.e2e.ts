import { apiCall, captureApi, closeBrowser, openPage, origin, PHONES, session, visit, VIEWPORTS, type Session } from './kit'

afterAll(closeBrowser)

/** The provider-app key scan of security.e2e-spec.ts, with the escapes the API spec's source lost: no customer/margin/markup/profit fields, quote, charge, base provider, idempotency keys. */
const PROVIDER_LEAK = /"(?:customer\w*|margin\w*|markup\w*|profit\w*|negative|basis|createdBy|slot|quote|chargedAmount|baseProviderId)"\s*:/
const KEY_LEAK = /"key"\s*:\s*"(?:led|ord|pay|due|dueback|gw)[:|]/

const TABS = ['new', 'pending', 'accepted', 'in_production', 'ready', 'delivery', 'completed', 'cancelled']
/**
 * The id of a job the provider can open. The demo seed creates no jobs, so on a fresh database the suite books one itself
 * (a cash-on-delivery thesis print by the demo customer, assigned by the admin) and leaves it assigned: later runs reuse it.
 */
async function providerJob(prov: Session): Promise<string> {
  for (const tab of TABS) {
    const items = (await apiCall<{ items: { id: string }[] }>(prov.token, 'GET', `/provider/jobs?tab=${tab}`)).body.items
    if (items[0]) return items[0].id
  }
  const [cust, admin] = [await session(PHONES.customer), await session(PHONES.admin)]
  const draft = { children: [], services: [{ kind: 'docs', spec: { pages: 20, scope: 'all', ink: 'bw', sides: 'single', copies: 1 } }], urgent: false,
    delivery: { method: 'courier', note: '' }, payMethod: 'cod', pickup: { address: 'تهران، خیابان آزمون، پلاک ۷', phone: PHONES.customer } }
  const quote = await apiCall<{ total: number }>(null, 'POST', '/orders/quote', draft)
  const order = await apiCall<{ id: string }>(cust.token, 'POST', '/orders', { ...draft, expectedTotal: quote.body.total })
  expect(order.status, 'the suite can book an order').toBeLessThan(300)
  const job = await apiCall<{ id: string }>(admin.token, 'GET', `/admin/dispatch/jobs/${order.body.id}`)
  const assigned = await apiCall(admin.token, 'POST', `/admin/dispatch/jobs/${job.body.id}/assign`, { providerId: String(prov.user.providerId), confirmMissingPrice: true })
  expect(assigned.status, 'the admin can assign it to the demo provider').toBeLessThan(300)
  return job.body.id
}

describe.each(VIEWPORTS)('courier and provider apps at $name', (vp) => {
  it('§92 courier: login screen, UI login (desktop only: OTP budget), today and profile', async () => {
    const o = await openPage(vp)
    await visit(o, '/courier/login', `courier-login-${vp.name}`)
    if (vp.name === 'desktop') {
      await o.page.fill('#courier-phone', PHONES.courier)
      const requested = o.page.waitForResponse((r) => r.url().endsWith('/api/auth/otp/request'))
      await o.page.locator('button[type=submit]').first().click()
      await requested
      await o.page.locator('button[type=submit]').first().click()
      await o.page.waitForURL((u) => !u.pathname.startsWith('/courier/login'))
      for (const p of ['/courier', '/courier/me']) await visit(o, p, `courier${p.replaceAll('/', '-')}-${vp.name}`)
      expect(await o.page.evaluate(() => JSON.parse(localStorage.getItem('sarv-auth:courier') ?? 'null')?.state?.user?.role)).toBe('courier')
    } else {
      const courier = await session(PHONES.courier)
      const signed = await openPage(vp, { sessions: { courier } })
      for (const p of ['/courier', '/courier/me']) await visit(signed, p, `courier${p.replaceAll('/', '-')}-${vp.name}`)
      await signed.context.close()
    }
    await o.context.close()
  })

  it('§92 courier: task lists, a task and its recount (the seed provides a task)', async () => {
    const courier = await session(PHONES.courier)
    const o = await openPage(vp, { sessions: { courier } })
    for (const p of ['/courier/task', '/courier/verify']) await visit(o, p, `courier${p.replaceAll('/', '-')}-${vp.name}`)
    const tasks = (await apiCall<{ orderId: string }[]>(courier.token, 'GET', '/courier/tasks')).body ?? []
    expect(tasks.length, 'the demo seed has a courier task').toBeGreaterThan(0)
    await visit(o, `/courier/task/${tasks[0].orderId}`, `courier-task-${vp.name}`)
    await visit(o, `/courier/verify/${tasks[0].orderId}`, `courier-verify-${vp.name}`)
    await o.context.close()
  })

  it('§92 provider: jobs, a job, prices, settlement, notifications and profile — never a customer price or a margin (§91, screen and API bodies)', async () => {
    const prov = await session(PHONES.provider)
    const o = await openPage(vp, { sessions: { provider: prov } })
    const seen = captureApi(o)
    for (const p of ['/provider', '/provider/prices', '/provider/settlement', '/provider/notifications', '/provider/me']) {
      await visit(o, p, `provider${p.replaceAll('/', '-')}-${vp.name}`)
      expect(await o.page.locator('body').innerText(), p).not.toMatch(/قیمت مشتری|حاشیه سود|درصد سود/)
    }
    await visit(o, `/provider/jobs/${await providerJob(prov)}`, `provider-job-${vp.name}`)
    await new Promise((r) => setTimeout(r, 500)) // bodies are read asynchronously
    expect(seen.some((s) => s.url.includes('/api/provider/jobs')), 'captured the job list').toBe(true)
    for (const s of seen) {
      for (const re of [PROVIDER_LEAK, KEY_LEAK]) {
        const hit = re.exec(s.text)
        expect(hit && `${s.url}: ${s.text.slice(Math.max(0, hit.index - 60), hit.index + 80)}`, 'customer-side data in a provider response').toBeNull()
      }
    }
    await o.context.close()
  })

  it('§91 a customer session cannot open the admin panel or the provider app', async () => {
    const cust = await session(PHONES.customer)
    const o = await openPage(vp, { sessions: { admin: cust, provider: cust } })
    await o.page.goto(`${origin()}/admin/orders`)
    await o.page.locator('#admin-phone').waitFor()
    await o.page.goto(`${origin()}/provider`)
    await o.page.locator('#provider-phone').waitFor()
    await o.context.close()
  })
})

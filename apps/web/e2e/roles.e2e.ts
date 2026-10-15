import { apiCall, closeBrowser, openPage, origin, PHONES, session, visit, VIEWPORTS } from './kit'

afterAll(closeBrowser)

describe.each(VIEWPORTS)('courier and provider apps at $name', (vp) => {
  it('§92 courier: login screen, UI login, today and profile', async () => {
    const o = await openPage(vp)
    await visit(o, '/courier/login', `courier-login-${vp.name}`)
    await o.page.fill('#courier-phone', PHONES.courier)
    const requested = o.page.waitForResponse((r) => r.url().endsWith('/api/auth/otp/request'))
    await o.page.locator('button[type=submit]').first().click()
    await requested
    await o.page.locator('button[type=submit]').first().click()
    await o.page.waitForURL((u) => !u.pathname.startsWith('/courier/login'))
    for (const p of ['/courier', '/courier/me']) await visit(o, p, `courier${p.replaceAll('/', '-')}-${vp.name}`)
    expect(await o.page.evaluate(() => JSON.parse(localStorage.getItem('sarv-auth:courier') ?? 'null')?.state?.user?.role)).toBe('courier')
    await o.context.close()
  })

  it('§92 courier: task lists and, when the seed has one, a task and its recount', async () => {
    const courier = await session(PHONES.courier)
    const o = await openPage(vp, { sessions: { courier } })
    for (const p of ['/courier/task', '/courier/verify']) await visit(o, p, `courier${p.replaceAll('/', '-')}-${vp.name}`)
    const tasks = (await apiCall<{ orderId: string }[]>(courier.token, 'GET', '/courier/tasks')).body ?? []
    if (tasks[0]) {
      await visit(o, `/courier/task/${tasks[0].orderId}`, `courier-task-${vp.name}`)
      await visit(o, `/courier/verify/${tasks[0].orderId}`, `courier-verify-${vp.name}`)
    }
    await o.context.close()
  })

  it('§92 provider: jobs, a job, prices, settlement, notifications and profile — never a customer price or a margin (§91)', async () => {
    const prov = await session(PHONES.provider)
    const o = await openPage(vp, { sessions: { provider: prov } })
    for (const p of ['/provider', '/provider/prices', '/provider/settlement', '/provider/notifications', '/provider/me']) {
      await visit(o, p, `provider${p.replaceAll('/', '-')}-${vp.name}`)
      expect(await o.page.locator('body').innerText(), p).not.toMatch(/قیمت مشتری|حاشیه سود|درصد سود/)
    }
    const jobs = (await apiCall<{ items: { id: string }[] }>(prov.token, 'GET', '/provider/jobs')).body.items
    if (jobs[0]) await visit(o, `/provider/jobs/${jobs[0].id}`, `provider-job-${vp.name}`)
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

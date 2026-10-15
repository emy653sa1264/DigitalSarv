import { checkPage, closeBrowser, openPage, PHONES, session, visit, VIEWPORTS } from './kit'

afterAll(closeBrowser)

const ROUTES = ['/admin', '/admin/orders', '/admin/dispatch', '/admin/production', '/admin/services', '/admin/prices', '/admin/pricing', '/admin/plans',
  '/admin/settings', '/admin/rules', '/admin/campaigns', '/admin/customers', '/admin/couriers', '/admin/providers', '/admin/ledger', '/admin/centers',
  '/admin/cms', '/admin/notifications', '/admin/staff']

describe.each(VIEWPORTS)('admin panel at $name', (vp) => {
  it('§92 the login screen renders', async () => {
    const o = await openPage(vp)
    await visit(o, '/admin/login', `admin-login-${vp.name}`)
    await o.context.close()
  })

  it('§92 every admin page renders for the super-admin', async () => {
    const o = await openPage(vp, { sessions: { admin: await session(PHONES.admin) } })
    for (const p of ROUTES) await visit(o, p, `admin${p.replaceAll('/', '-')}-${vp.name}`)
    await o.context.close()
  })

  it('§92 «مرکز تخصیص سفارش» shows its heading', async () => {
    const o = await openPage(vp, { sessions: { admin: await session(PHONES.admin) } })
    await visit(o, '/admin/dispatch', `admin-dispatch-${vp.name}`)
    await o.page.getByText('مرکز تخصیص سفارش').first().waitFor()
    await o.context.close()
  })

  it('§92 «تسویه مجریان»: every tab, including «تحویل‌شده، هنوز بدون سهم مجری» (S12)', async () => {
    const o = await openPage(vp, { sessions: { admin: await session(PHONES.admin) } })
    for (const tab of ['balances', 'pending', 'compensation', 'wallet']) await visit(o, `/admin/ledger?tab=${tab}`, `admin-ledger-${tab}-${vp.name}`)
    await visit(o, '/admin/ledger?tab=pending', `admin-ledger-waiting-${vp.name}`)
    await o.page.getByText('تحویل‌شده، هنوز بدون سهم مجری').waitFor()
    await o.context.close()
  })

  it('§92 «مرکز مدیریت قیمت»: every view, the compare view paged by provider (S8)', async () => {
    const o = await openPage(vp, { sessions: { admin: await session(PHONES.admin) } })
    await visit(o, '/admin/pricing', `admin-pricing-${vp.name}`)
    for (const view of ['provider', 'compare', 'pending']) await visit(o, `/admin/pricing?view=${view}`, `admin-pricing-${view}-${vp.name}`)
    for (const name of ['قیمت مجریان', 'مقایسه و حاشیه سود']) {
      await o.page.getByRole('tab', { name }).first().click()
      await checkPage(o, `admin-pricing-click-${name}-${vp.name}`)
    }
    await o.context.close()
  })
})

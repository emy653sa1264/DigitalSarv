import { closeBrowser, openPage, origin, visit, VIEWPORTS } from './kit'

afterAll(closeBrowser)

describe.each(VIEWPORTS)('landing at $name ($width px)', (vp) => {
  it('renders in RTL with Persian digits, no overflow and no console errors; menus and services link into the customer app', async () => {
    const o = await openPage(vp)
    await visit(o, '/', `landing-${vp.name}`)
    expect(await o.page.locator('h1').first().isVisible()).toBe(true)
    expect(await o.page.locator('a[href^="/app"]').count()).toBeGreaterThan(0)
    await o.context.close()
  })
})

describe('SEO and installability (§92)', () => {
  it('the landing has title, description, canonical and Open Graph; every app is noindex; robots, sitemap and manifests are served', async () => {
    const html = await (await fetch(`${origin()}/`)).text()
    expect(html).toMatch(/<html lang="fa" dir="rtl">/)
    expect(html).toMatch(/<title>[^<]+<\/title>/)
    expect(html).toMatch(/name="description"/)
    expect(html).toMatch(/rel="canonical"/)
    expect(html).toMatch(/property="og:title"/)
    for (const app of ['app', 'courier', 'provider', 'admin']) {
      const page = await (await fetch(`${origin()}/${app}/`)).text()
      expect(page, app).toMatch(/name="robots" content="noindex/)
      expect(page, app).toMatch(/rel="manifest"/)
    }
    const robots = await (await fetch(`${origin()}/robots.txt`)).text()
    for (const p of ['/app', '/courier', '/admin', '/provider', '/api']) expect(robots).toContain(`Disallow: ${p}`)
    expect(await (await fetch(`${origin()}/sitemap.xml`)).text()).toMatch(/<urlset/)
    for (const m of ['landing', 'customer', 'courier', 'provider', 'admin']) {
      const res = await fetch(`${origin()}/manifest-${m}.webmanifest`)
      expect(res.status, m).toBe(200)
      expect((await res.json()).name, m).toEqual(expect.any(String))
    }
  })
})

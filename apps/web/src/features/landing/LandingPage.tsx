import { useSectionVisibility } from './api'
import { CtaBand, LandingFooter, PricesSection } from './Closing'
import { SERVICE_CARDS } from './content'
import { HeroSection, LandingNav, type AnchorLink } from './Hero'
import { HowItWorksSection } from './HowItWorks'
import { MembershipSection } from './Membership'
import { ServicesSection } from './Services'

export function LandingPage() {
  const show = useSectionVisibility()
  const hasServices = show('school') || SERVICE_CARDS.some((c) => show(c.key))

  const navLinks: AnchorLink[] = [
    hasServices && { href: '#services', label: 'سرویس‌ها' },
    show('how') && { href: '#how', label: 'چطور کار می‌کند' },
    show('plans') && { href: '#plans', label: 'عضویت' },
  ].filter((l): l is AnchorLink => !!l)
  // Footer lists the same anchors in the prototype's footer order.
  const footerLinks = ['#services', '#plans', '#how'].flatMap((href) => navLinks.filter((l) => l.href === href))

  return (
    <div data-role="customer" className="min-h-dvh bg-shell pb-10 text-ink">
      <div className="mx-auto max-w-[1140px] px-4 sm:px-6">
        <LandingNav links={navLinks} />
        {show('hero') && <HeroSection showCampaign={show('campaign')} />}
        <ServicesSection show={show} />
        {show('how') && <HowItWorksSection />}
        {show('prices') && <PricesSection />}
        <MembershipSection showPlans={show('plans')} showFaq={show('faq')} />
        {show('cta') && <CtaBand />}
        {show('footer') && <LandingFooter links={footerLinks} />}
      </div>
    </div>
  )
}

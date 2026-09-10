import { HOW_STEPS } from './content'

export function HowItWorksSection() {
  return (
    <section id="how" className="relative my-[34px] scroll-mt-24 overflow-hidden rounded-[30px] bg-violet-dark p-6 sm:p-[34px]">
      <div className="pointer-events-none absolute -top-[60px] start-[-30px] size-[220px] rounded-full bg-[rgba(124,92,245,0.55)]" />
      <h2 className="relative mt-0 mb-1 text-[24px] text-white sm:text-[28px]">پنج قدم، و کار تمام است</h2>
      <p className="relative mt-0 mb-[26px] text-[15px] text-[#d5cbff] sm:text-base">چند فرزند، چند پایه، ده‌ها کتاب — همه در یک سفارش خانوادگی.</p>
      <ol className="relative m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-5">
        {HOW_STEPS.map((h) => (
          <li key={h.n} className="flex items-start gap-3 rounded-[22px] bg-white/[0.13] p-4 sm:max-lg:last:col-span-2 lg:block">
            <div className="flex size-[30px] shrink-0 items-center justify-center rounded-[10px] bg-white text-[13px] font-black text-violet-dark shadow-[0_4px_10px_rgba(7,9,15,0.2)]">
              {h.n}
            </div>
            <div className="lg:mt-3">
              <div className="text-[15px] font-extrabold text-white">{h.title}</div>
              <div className="mt-1 text-[12.5px] leading-[1.6] text-[#d5cbff]">{h.body}</div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

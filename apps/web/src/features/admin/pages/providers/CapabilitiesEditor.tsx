import { Chip } from '@/components/brand'
import { CAPABILITY_ADDON_LABEL, COLOR_TYPE_LABEL, PRINT_SERVICES, PROVIDER_SERVICE_LABEL, PROVIDER_SERVICES, SIDE_LABEL } from '@/lib/provider-labels'
import type { Capability, CapabilityAddon, ProviderService } from '@/lib/types'

const SIZES = ['A3', 'A4', 'A5', 'A6'] as const
const ADDONS = Object.keys(CAPABILITY_ADDON_LABEL) as CapabilityAddon[]
const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

function empty(service: ProviderService): Capability {
  if (!PRINT_SERVICES.includes(service)) return { service, sizes: [], colorTypes: [], papers: [], sides: [], addons: [] }
  return { service, sizes: ['A4'], colorTypes: service === 'color_printing' ? ['full'] : [], papers: [], sides: ['single'], addons: [] }
}

function OptionRow<T extends string>({ label, options, selected, onToggle }: { label: string; options: { value: T; label: string }[]; selected: T[]; onToggle: (v: T) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-[86px] text-[12.5px] font-extrabold text-muted-1">{label}</span>
      {options.map((o) => (
        <Chip key={o.value} size="sm" selected={selected.includes(o.value)} onClick={() => onToggle(o.value)}>{o.label}</Chip>
      ))}
    </div>
  )
}

/** Structured capabilities (§46–47): one entry per service; print services carry their exact options. */
export function CapabilitiesEditor({ value, onChange, papers }: { value: Capability[]; onChange: (v: Capability[]) => void; papers: { key: string; name: string }[] }) {
  const has = (s: ProviderService) => value.some((c) => c.service === s)
  const patch = (s: ProviderService, p: Partial<Capability>) => onChange(value.map((c) => (c.service === s ? { ...c, ...p } : c)))
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {PROVIDER_SERVICES.map((s) => (
          <Chip key={s} size="sm" selected={has(s)} onClick={() => onChange(has(s) ? value.filter((c) => c.service !== s) : [...value, empty(s)])}>
            {PROVIDER_SERVICE_LABEL[s]}
          </Chip>
        ))}
      </div>
      {value.filter((c) => PRINT_SERVICES.includes(c.service)).map((c) => (
        <div key={c.service} className="grid gap-2 rounded-[18px] border border-line-soft p-3">
          <div className="text-[13px] font-black">{PROVIDER_SERVICE_LABEL[c.service]}</div>
          <OptionRow label="قطع" options={SIZES.map((s) => ({ value: s, label: s }))} selected={c.sizes} onToggle={(v) => patch(c.service, { sizes: toggle(c.sizes, v) })} />
          {c.service === 'color_printing' && (
            <>
              <OptionRow label="نوع رنگ" options={(['text', 'full'] as const).map((t) => ({ value: t, label: COLOR_TYPE_LABEL[t] }))} selected={c.colorTypes} onToggle={(v) => patch(c.service, { colorTypes: toggle(c.colorTypes, v) })} />
              <OptionRow label="کاغذ" options={papers.map((p) => ({ value: p.key, label: p.name }))} selected={c.papers} onToggle={(v) => patch(c.service, { papers: toggle(c.papers, v) })} />
            </>
          )}
          <OptionRow label="رو" options={(['single', 'double'] as const).map((s) => ({ value: s, label: SIDE_LABEL[s] }))} selected={c.sides} onToggle={(v) => patch(c.service, { sides: toggle(c.sides, v) })} />
          <OptionRow label="خدمات جانبی" options={ADDONS.filter((a) => a !== 'mixed' || c.service === 'color_printing').map((a) => ({ value: a, label: CAPABILITY_ADDON_LABEL[a] }))}
            selected={c.addons} onToggle={(v) => patch(c.service, { addons: toggle(c.addons, v) })} />
        </div>
      ))}
      <div className="text-[12px] leading-6 text-muted-2">پایان‌نامه، فنری کتاب مدرسه، تراکت، کارتریج و تعمیر گزینه چاپ ندارند؛ انتخاب آن‌ها یعنی مجری این سرویس را انجام می‌دهد.</div>
    </div>
  )
}

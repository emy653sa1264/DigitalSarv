import { useEffect, useMemo, useRef } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import { User, X } from 'lucide-react'
import { Chip, DsSwitch, ErrorState, FieldLabel, GradientBadge, LoadingBlock, Panel, Stepper, TONES, TotalsPanel } from '@/components/brand'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { notify } from '@/components/ui/sonner'
import { Textarea } from '@/components/ui/textarea'
import { fa, money } from '@/lib/format'
import { useCatalog } from '@/lib/query'
import type { ChildDraft } from '@/lib/types'
import { CHILD_TONES, useDraft } from '@/stores/draft'
import { ColorSwatchPicker } from '../components/ColorSwatchPicker'
import { Screen } from '../components/Screen'
import { CtaButton, InlineStepper, NumInput, ToneTile } from '../components/parts'
import { useReturnTo } from '../hooks/nav'
import { useQuote } from '../hooks/queries'
import { CHILD_SERVICE_TILES, SERVICE_META } from '../lib/constants'
import { serviceView } from '../lib/services'

/** `ChildDraftDto.books` max. */
const MAX_BOOKS = 200

/** `/app/child/new` — creates a blank child from catalog defaults, then opens its editor. */
export function ChildNewScreen() {
  const catalog = useCatalog()
  const navigate = useNavigate()
  const created = useRef(false)

  useEffect(() => {
    if (!catalog.data || created.current) return
    created.current = true
    const { grades, colors } = catalog.data
    const { children, addChild } = useDraft.getState()
    const index = addChild({
      name: '',
      grade: grades[0]?.name ?? '',
      books: grades[0]?.books ?? 1,
      tone: CHILD_TONES[children.length % CHILD_TONES.length],
      color: colors[0]?.key ?? '',
      lined: false,
      linedCount: 10,
      linedPos: 'all',
      extras: [],
      note: '',
    })
    navigate(`/app/child/${index}`, { replace: true })
  }, [catalog.data, navigate])

  return (
    <Screen title="افزودن فرزند" subtitle="پایه تحصیلی و گزینه‌ها" icon={User} back="/app/family">
      {catalog.isError ? <ErrorState error={catalog.error} onRetry={() => void catalog.refetch()} /> : <LoadingBlock rows={5} />}
    </Screen>
  )
}

export function ChildEditorScreen() {
  const { index = '' } = useParams()
  const i = Number(index)
  const navigate = useNavigate()
  const returnTo = useReturnTo()
  const [params] = useSearchParams()
  const fromSummary = params.get('from') === 'summary'
  const child = useDraft((s) => s.children[i])
  const isNew = useDraft((s) => s.newChildIndex === i)
  const services = useDraft((s) => s.services)
  const updateChild = useDraft((s) => s.updateChild)
  const removeService = useDraft((s) => s.removeService)
  const setActiveChild = useDraft((s) => s.setActiveChild)
  const markChildSaved = useDraft((s) => s.markChildSaved)
  const catalog = useCatalog()

  const own = useMemo(() => services.map((s, si) => ({ s, si })).filter((x) => x.s.childIndex === i), [services, i])
  // Price this child alone (its books + its services) so "جمع این فرزند" comes from the server.
  const quote = useQuote({ children: child ? [child] : [], services: own.map((x) => ({ ...x.s, childIndex: 0 })) }, !!child)

  useEffect(() => {
    setActiveChild(Number.isInteger(i) ? i : null)
  }, [i, setActiveChild])

  // v3.3: only extras offered for school books (older APIs without `services` → everywhere); out-of-scope or
  // switched-off keys are dropped from the draft so only those are sent.
  const schoolExtras = (catalog.data?.extras ?? []).filter((x) => (x.services ?? ['school', 'print']).includes('school'))
  const schoolKeys = catalog.data ? schoolExtras.map((x) => x.key).join(',') : null
  useEffect(() => {
    if (!child || schoolKeys === null) return
    const allowed = schoolKeys.split(',')
    const kept = child.extras.filter((k) => allowed.includes(k))
    if (kept.length !== child.extras.length) updateChild(i, { extras: kept })
  }, [child, schoolKeys, i, updateChild])

  if (!child) return <Navigate to="/app/family" replace />

  const patch = (p: Partial<ChildDraft>) => updateChild(i, p)
  const linedFrom = child.pageFrom ?? 20
  const linedTo = child.pageTo ?? 40
  const linedRangeBad = child.lined && child.linedPos === 'range' && (linedFrom < 1 || linedTo < linedFrom)
  /** A chosen extra prints text (e.g. «برچسب نام») → ask for `labelText`. */
  const needsText = schoolExtras.some((x) => x.needsText && child.extras.includes(x.key))
  const save = () => {
    if (linedRangeBad) return notify('بازه صفحات خط‌دار درست نیست؛ صفحه شروع باید قبل از صفحه پایان باشد')
    const name = child.name.trim() || `فرزند ${fa(i + 1)}`
    if (!child.name.trim()) patch({ name })
    if (needsText && !child.labelText?.trim()) patch({ labelText: name.slice(0, 60) })
    if (!needsText && child.labelText !== undefined) patch({ labelText: undefined })
    markChildSaved()
    notify('اطلاعات ذخیره شد')
    returnTo(fromSummary ? '/app/summary' : '/app/family')
  }

  const q = quote.data

  return (
    <Screen title={isNew ? 'افزودن فرزند' : child.name || 'فرزند'} subtitle="پایه تحصیلی و گزینه‌ها" icon={User} back="/app/family" addMore>
      {catalog.isPending ? (
        <LoadingBlock rows={5} />
      ) : catalog.isError ? (
        <ErrorState error={catalog.error} onRetry={() => void catalog.refetch()} />
      ) : (
        <div className="flex flex-col gap-[17px]">
          <div>
            <FieldLabel htmlFor="child-name" className="mb-[7px]">
              نام فرزند
            </FieldLabel>
            <Input id="child-name" value={child.name} onChange={(e) => patch({ name: e.target.value })} placeholder="مثلاً سارا" />
          </div>

          <GradeField child={child} grades={catalog.data.grades} onChange={patch} />

          <div>
            <FieldLabel className="mb-[7px]">تعداد کتاب</FieldLabel>
            <Stepper
              value={fa(child.books)}
              onDecrement={() => patch({ books: Math.max(1, child.books - 1) })}
              onIncrement={() => patch({ books: Math.min(MAX_BOOKS, child.books + 1) })}
            />
          </div>

          <div>
            <FieldLabel className="mb-[9px]">رنگ فنری</FieldLabel>
            <ColorSwatchPicker colors={catalog.data.colors} value={child.color} onChange={(color) => patch({ color })} unit="برای هر کتاب" />
          </div>

          <Panel className="p-[15px]">
            <div className="flex items-center justify-between gap-2.5">
              <div>
                <div className="text-[14.5px] font-extrabold">کاغذ خط‌دار</div>
                <div className="mt-0.5 text-[11.5px] text-muted-2">افزودن برگه‌های خط‌دار به کتاب‌ها</div>
              </div>
              <DsSwitch checked={child.lined} onCheckedChange={(lined) => patch({ lined })} label="کاغذ خط‌دار" />
            </div>
            {child.lined && (
              <div className="mt-3.5 flex flex-col gap-[13px] border-t border-line-soft pt-3.5">
                <div>
                  <div className="mb-[7px] text-[13px] font-bold">تعداد برگ در هر کتاب</div>
                  <InlineStepper
                    size={40}
                    value={fa(child.linedCount || 10)}
                    onDecrement={() => patch({ linedCount: Math.max(5, (child.linedCount || 10) - 5) })}
                    onIncrement={() => patch({ linedCount: (child.linedCount || 10) + 5 })}
                  />
                </div>
                <div>
                  <div className="mb-[7px] text-[13px] font-bold">محل قرارگیری</div>
                  <div className="flex flex-wrap gap-2">
                    <Chip selected={child.linedPos === 'all'} onClick={() => patch({ linedPos: 'all' })}>
                      کل کتاب
                    </Chip>
                    <Chip
                      selected={child.linedPos === 'range'}
                      onClick={() => patch({ linedPos: 'range', pageFrom: child.pageFrom ?? 20, pageTo: child.pageTo ?? 40 })}
                    >
                      صفحات مشخص
                    </Chip>
                  </div>
                </div>
                {child.linedPos === 'range' && (
                  <div className="rounded-[22px] bg-accent-soft p-4 text-accent-soft-ink">
                    <div className="mb-2.5 text-[13px] font-extrabold">بازه صفحات</div>
                    <div className="flex items-center gap-[9px]">
                      <span className="text-[12.5px] font-bold">از صفحه</span>
                      <NumInput aria-label="از صفحه" value={child.pageFrom} onValueChange={(pageFrom) => patch({ pageFrom })} />
                      <span className="text-[12.5px] font-bold">تا صفحه</span>
                      <NumInput aria-label="تا صفحه" value={child.pageTo} onValueChange={(pageTo) => patch({ pageTo })} />
                    </div>
                    <div className="mt-[9px] text-[11.5px] opacity-85">
                      برگه‌های خط‌دار بین صفحه {fa(child.pageFrom || 20)} و صفحه {fa(child.pageTo || 40)} قرار می‌گیرند.
                    </div>
                    {linedRangeBad && <div className="mt-1.5 text-[11.5px] font-bold text-pink-dark">صفحه شروع باید قبل از صفحه پایان باشد.</div>}
                  </div>
                )}
              </div>
            )}
          </Panel>

          {schoolExtras.length > 0 && (
            <div>
              <FieldLabel className="mb-[9px]">خدمات اضافی</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {schoolExtras.map((x) => {
                  const on = child.extras.includes(x.key)
                  return (
                    <Chip
                      key={x.key}
                      selected={on}
                      className="px-3.5 py-2.5"
                      onClick={() =>
                        patch({
                          extras: on ? child.extras.filter((k) => k !== x.key) : [...child.extras, x.key],
                          // The label text defaults to the child's name the first time such an extra is chosen.
                          ...(!on && x.needsText && child.labelText === undefined ? { labelText: child.name.slice(0, 60) } : {}),
                        })
                      }
                    >
                      {x.label} · {fa(x.price)}
                    </Chip>
                  )
                })}
              </div>
              {needsText && (
                <div className="mt-3">
                  <FieldLabel htmlFor="child-label" className="mb-[7px]">
                    متن برچسب / چاپ روی جلد
                  </FieldLabel>
                  <Input
                    id="child-label"
                    maxLength={60}
                    value={child.labelText ?? ''}
                    onChange={(e) => patch({ labelText: e.target.value.slice(0, 60) })}
                    placeholder={child.name || 'مثلاً سارا رضایی'}
                  />
                  <div className="mt-1.5 text-[11.5px] text-muted-2">همین متن روی برچسب یا جلد چاپ می‌شود · حداکثر {fa(60)} حرف</div>
                </div>
              )}
            </div>
          )}

          <div>
            <FieldLabel htmlFor="child-note" className="mb-[7px]">
              توضیحات
            </FieldLabel>
            <Textarea
              id="child-note"
              rows={3}
              value={child.note ?? ''}
              onChange={(e) => patch({ note: e.target.value })}
              placeholder="مثلاً جلد پشت را مقوایی بگذارید"
            />
          </div>

          <Panel>
            <div className="text-[14.5px] font-extrabold">سفارش دیگری برای این فرزند</div>
            <div className="mt-[3px] text-[11.5px] leading-[1.7] text-muted-2">جزوه، تراکت، کارتریج یا تعمیر — همه در همین سفارش خانوادگی و یک تحویل.</div>
            <div className="mt-3 grid grid-cols-2 gap-[9px]">
              {CHILD_SERVICE_TILES.map((t) => {
                const meta = SERVICE_META[t.kind]
                return (
                  <ToneTile
                    key={t.kind}
                    tone={meta.tone}
                    onClick={() => navigate(`${meta.path}?for=${i}`)}
                    className="flex min-h-[96px] flex-col items-start justify-between rounded-[18px] p-[13px] odd:last:col-span-2"
                  >
                    <GradientBadge tone={meta.tone} size={34}>
                      <meta.icon className="size-[18px]" strokeWidth={2.3} />
                    </GradientBadge>
                    <div>
                      <div className="text-[13.5px] font-extrabold">{t.label}</div>
                      <div className="mt-0.5 text-[11px] opacity-[0.78]">{t.sub}</div>
                    </div>
                  </ToneTile>
                )
              })}
            </div>
            {own.length > 0 && (
              <div className="mt-3 flex flex-col gap-2 border-t border-line-soft pt-3">
                {own.map(({ s, si }, j) => {
                  const v = serviceView(s, j, q)
                  const t = TONES[v.meta.tone]
                  return (
                    <div key={si} className="flex items-center gap-2.5 rounded-2xl px-3 py-[11px]" style={{ background: t.soft, color: t.ink }}>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-extrabold">{v.label}</div>
                        <div className="mt-0.5 text-[11px] opacity-80">{v.detail}</div>
                      </div>
                      <span className="text-xs font-extrabold whitespace-nowrap">{v.price}</span>
                      <button
                        type="button"
                        aria-label={`حذف ${v.label}`}
                        onClick={() => {
                          removeService(si)
                          notify(`${v.label} حذف شد`)
                        }}
                        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-white/75"
                      >
                        <X className="size-[13px] text-pink-dark" strokeWidth={2.8} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>

          <TotalsPanel
            meta={`سرویس‌های دیگر (${fa(own.length)} مورد)`}
            metaEnd={q ? money(q.servicesTotal) : '…'}
            label="جمع این فرزند"
            amount={q ? money(q.subtotal) : quote.isError ? '—' : '…'}
          />
          <CtaButton onClick={save}>{isNew ? 'افزودن به سفارش خانوادگی' : 'ذخیره تغییرات'}</CtaButton>
        </div>
      )}
    </Screen>
  )
}

function GradeField({
  child,
  grades,
  onChange,
}: {
  child: ChildDraft
  grades: { id: string; name: string; books: number }[]
  onChange: (p: Partial<ChildDraft>) => void
}) {
  // Keep a renamed/disabled historical grade selectable so the value never renders blank.
  const items = !child.grade || grades.some((g) => g.name === child.grade) ? grades : [{ id: '__current', name: child.grade, books: child.books }, ...grades]
  const defaultBooks = grades.find((g) => g.name === child.grade)?.books ?? child.books
  return (
    <div>
      <FieldLabel className="mb-[7px]">مقطع و پایه تحصیلی</FieldLabel>
      <Select
        value={child.grade}
        onValueChange={(name) => onChange({ grade: name, books: grades.find((g) => g.name === name)?.books ?? child.books })}
      >
        <SelectTrigger
          aria-label="مقطع و پایه تحصیلی"
          className="w-full rounded-full border-line-input bg-white px-[18px] text-[15px] text-ink shadow-none data-[size=default]:h-12"
        >
          <SelectValue placeholder="انتخاب پایه" />
        </SelectTrigger>
        <SelectContent position="popper" className="rounded-2xl">
          {items.map((g) => (
            <SelectItem key={g.id} value={g.name}>
              {g.name} — {fa(g.books)} کتاب
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {child.grade && (
        <div className="mt-1.5 text-[11.5px] text-muted-2">
          کتاب‌های پایه {child.grade} به‌صورت پیش‌فرض {fa(defaultBooks)} جلد است؛ در صورت نیاز تعداد را تغییر دهید.
        </div>
      )}
    </div>
  )
}

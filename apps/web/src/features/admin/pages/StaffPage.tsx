import { useState } from 'react'
import { Chip, DsSwitch, InfoBanner, TONES } from '@/components/brand'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/sonner'
import { fa, toEnDigits } from '@/lib/format'
import { isSuperAdmin } from '@/lib/permissions'
import { PERMISSION_GROUPS } from '@/lib/provider-labels'
import type { Permission, StaffMember } from '@/lib/types'
import { useAuth } from '@/stores/auth'
import { AddButton, ConfirmDelete, IconAction, Tag } from '../components/controls'
import { Field, FormDialog } from '../components/FormDialog'
import { PageHeader, QueryView } from '../components/kit'
import { AdminRow, AdminTable } from '../components/table'
import { useStaffMutations, useStaff } from '../staff-api'

const COLUMNS = 'minmax(0,1.4fr) 140px minmax(0,1.6fr) 120px 90px'
const LABEL = new Map(PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => [i.key, `${g.title} · ${i.label}`] as const)))

/** §81 «کارکنان و دسترسی‌ها» — super-admins only (the API enforces it too). */
export function StaffPage() {
  const user = useAuth((s) => s.user)
  const superAdmin = isSuperAdmin(user)
  const query = useStaff(superAdmin)
  const { remove } = useStaffMutations()
  const [dialog, setDialog] = useState<{ open: boolean; item?: StaffMember }>({ open: false })

  if (!superAdmin) {
    return (
      <>
        <PageHeader title="کارکنان و دسترسی‌ها" />
        <InfoBanner>فقط مدیر کل (مدیری بدون محدودیت دسترسی) می‌تواند کارکنان و دسترسی‌ها را مدیریت کند.</InfoBanner>
      </>
    )
  }
  return (
    <>
      <PageHeader title="کارکنان و دسترسی‌ها" subtitle="چه کسی به کدام بخش قیمت‌گذاری و مجریان دسترسی دارد"
        actions={<AddButton onClick={() => setDialog({ open: true })}>افزودن مدیر</AddButton>} />
      <QueryView query={query} rows={4} isEmpty={(d) => d.length === 0} empty={{ title: 'مدیری ثبت نشده است' }}>
        {(list) => (
          <AdminTable columns={COLUMNS} minWidth={820} head={['نام', 'موبایل', 'دسترسی', 'نوع', '']}>
            {list.map((m) => {
              const shown = (m.permissions ?? []).filter((p) => LABEL.has(p))
              const hidden = (m.permissions?.length ?? 0) - shown.length // permissions without a label here (unknown future permissions)
              return (
                <AdminRow key={m.id} className="py-3">
                  <span className="truncate font-bold">{m.name || '—'}{m.id === user?.id && <span className="ms-1.5 text-[11.5px] text-muted-2">(شما)</span>}</span>
                  <span dir="ltr" className="text-start font-bold">{fa(m.phone)}</span>
                  <span className="text-[12.5px] leading-6 text-muted-1">
                    {m.superAdmin ? 'همه بخش‌ها' : shown.length === 0 ? 'فقط بخش‌های عمومی پنل' : shown.map((p) => LABEL.get(p)).join('، ')}
                    {!m.superAdmin && hidden > 0 && <span className="ms-1 font-bold text-muted-2">{shown.length ? '، ' : ''}+{fa(hidden)} دسترسی دیگر</span>}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    <Tag bg={m.superAdmin ? TONES.violet.soft : TONES.cyan.soft} fg={m.superAdmin ? TONES.violet.ink : TONES.cyan.ink}>{m.superAdmin ? 'مدیر کل' : 'محدود'}</Tag>
                    {m.bootstrap && <Tag bg={TONES.amber.soft} fg={TONES.amber.ink}>تنظیمات سرور</Tag>}
                  </span>
                  <span className="flex justify-end gap-1.5">
                    <IconAction kind="edit" label="ویرایش" onClick={() => setDialog({ open: true, item: m })} />
                    {!m.bootstrap && (
                      <ConfirmDelete title={`حذف دسترسی مدیر ${m.name || fa(m.phone)}؟`}
                        description="این شماره حساب مشتری عادی می‌شود و نشست‌های بازش بسته می‌شود. آخرین مدیر کل حذف نمی‌شود."
                        onConfirm={() => remove.mutate(m.id)} />
                    )}
                  </span>
                </AdminRow>
              )
            })}
          </AdminTable>
        )}
      </QueryView>
      <StaffDialog key={`${dialog.item?.id ?? 'new'}-${dialog.open}`} open={dialog.open} item={dialog.item} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
    </>
  )
}

function StaffDialog({ open, onOpenChange, item }: { open: boolean; onOpenChange: (o: boolean) => void; item?: StaffMember }) {
  const { create, update } = useStaffMutations()
  const [phone, setPhone] = useState(item?.phone ?? '')
  const [name, setName] = useState(item?.name ?? '')
  const [superAdmin, setSuperAdmin] = useState(item?.superAdmin ?? false)
  // permissions not shown here (unknown future permissions) are kept as they are
  const [perms, setPerms] = useState<Permission[]>(item?.permissions ?? [])
  const toggle = (p: Permission) => setPerms((list) => (list.includes(p) ? list.filter((x) => x !== p) : [...list, p]))
  const locked = !!item?.bootstrap

  const submit = () => {
    const permissions = superAdmin ? null : perms
    const done = () => onOpenChange(false)
    if (item) {
      update.mutate({ id: item.id, name: name.trim(), ...(locked ? {} : { permissions }) }, { onSuccess: done })
      return
    }
    const p = toEnDigits(phone).trim()
    if (p.replace(/\D/g, '').length < 10) {
      toast.error('شماره موبایل را درست وارد کنید')
      return
    }
    create.mutate({ phone: p, name: name.trim(), permissions }, { onSuccess: done })
  }

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={item ? `دسترسی‌های ${item.name || fa(item.phone)}` : 'افزودن مدیر'} pending={create.isPending || update.isPending} onSubmit={submit} className="sm:max-w-[620px]">
      <div className="grid gap-3 sm:grid-cols-2">
        {!item && (
          <Field label="شماره موبایل" hint="اگر این شماره حساب مشتری داشته باشد، به مدیر تبدیل می‌شود.">
            <Input dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="text-center" placeholder="۰۹۱۲۳۴۵۶۷۸۹" />
          </Field>
        )}
        <Field label="نام"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      </div>
      <Field label="مدیر کل (همه دسترسی‌ها)" hint={locked ? 'این مدیر از تنظیمات سرور (ADMIN_PHONES) تعیین شده و همیشه مدیر کل است.' : 'مدیر کل به همه بخش‌ها، از جمله همین صفحه، دسترسی دارد.'}>
        <div className="flex h-11 items-center gap-2.5">
          <DsSwitch checked={superAdmin} onCheckedChange={setSuperAdmin} disabled={locked} label="مدیر کل" />
          <span className="text-[13px] font-bold">{superAdmin ? 'بله' : 'خیر — فقط دسترسی‌های انتخاب‌شده'}</span>
        </div>
      </Field>
      {!superAdmin && (
        <div className="grid gap-3">
          {PERMISSION_GROUPS.map((g) => (
            <div key={g.title} className="grid gap-1.5">
              <div className="text-[13px] font-black">{g.title}</div>
              <div className="flex flex-wrap gap-1.5">
                {g.items.map((i) => <Chip key={i.key} size="sm" selected={perms.includes(i.key)} disabled={locked} onClick={() => toggle(i.key)}>{i.label}</Chip>)}
              </div>
            </div>
          ))}
          <div className="text-[12px] leading-6 text-muted-2">بخش‌های عمومی پنل (سفارش‌ها، تولید، مشتریان، …) برای همه مدیران باز است؛ این فهرست قیمت‌گذاری، مجریان و تخصیص سفارش را محدود می‌کند.</div>
        </div>
      )}
    </FormDialog>
  )
}

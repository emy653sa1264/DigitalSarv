import { useNavigate } from 'react-router'
import { Route } from 'lucide-react'
import { EmptyState, ErrorState, LoadingBlock, MobileHeader, ScreenBody, ToneTag } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { fa } from '@/lib/format'
import type { CourierTask } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useCourierTasks } from './api'
import { KindTag } from './components'
import { isTaskDone, openMap, todayLabel, useLastTask } from './utils'

export function TodayScreen() {
  const tasks = useCourierTasks()
  return (
    <>
      <MobileHeader title="مسیر امروز" subtitle={todayLabel()} icon={Route} tone="ink" />
      <ScreenBody>
        {tasks.isPending ? (
          <LoadingBlock rows={4} />
        ) : tasks.isError ? (
          <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />
        ) : (
          <TodayRoute tasks={tasks.data} />
        )}
      </ScreenBody>
    </>
  )
}

function TodayRoute({ tasks }: { tasks: CourierTask[] }) {
  const pickups = tasks.filter((t) => t.kind === 'pickup').length
  const deliveries = tasks.length - pickups
  return (
    <>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-[22px] bg-night p-4 text-white">
          <div className="text-[12.5px] text-[#9aa2b8]">تحویل‌گیری امروز</div>
          <div className="mt-1 text-[30px] font-black">{fa(pickups)}</div>
        </div>
        <div className="rounded-[22px] bg-green p-4 text-white shadow-[0_10px_22px_rgba(31,169,104,0.32)]">
          <div className="text-[12.5px] text-green-soft">تحویل امروز</div>
          <div className="mt-1 text-[30px] font-black">{fa(deliveries)}</div>
        </div>
      </div>

      <div className="mt-5 mb-2.5 text-[17px] font-black">مسیر امروز</div>
      {tasks.length === 0 ? (
        <EmptyState title="امروز کاری در مسیر شما نیست" hint="سفارش‌های جدید پس از تعیین پیک همین‌جا نمایش داده می‌شوند." />
      ) : (
        <div className="flex flex-col gap-2.5">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}
    </>
  )
}

function TaskCard({ task }: { task: CourierTask }) {
  const navigate = useNavigate()
  const remember = useLastTask((s) => s.remember)
  const done = isTaskDone(task.kind, task.status)

  const open = () => {
    remember(task.orderId, task.kind)
    navigate(`/courier/task/${task.orderId}`)
  }

  return (
    <div className={cn('rounded-[22px] border border-line bg-white p-[15px]', done && 'opacity-75')}>
      <div className="flex items-center gap-2.5">
        <KindTag kind={task.kind} />
        <span className="text-[12.5px] font-semibold text-muted-2">{fa(task.slot)}</span>
        <span className="flex-1" />
        {done && <ToneTag tone="green">انجام شد</ToneTag>}
        <span className="text-[12.5px] font-bold text-muted-1">{fa(task.code)}</span>
      </div>
      <div className="mt-2.5 text-[15px] font-extrabold">{task.customer}</div>
      <div className="mt-[3px] text-[12.5px] leading-[1.6] text-muted-2">{fa(task.address)}</div>
      <div className="mt-2 text-[12.5px] font-extrabold text-green-dark">{fa(task.detail)}</div>
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" size="sm" className="h-10 flex-1" onClick={open}>
          جزئیات
        </Button>
        <Button variant="night" size="sm" className="h-10 flex-1" onClick={() => openMap(task.address)}>
          مسیریابی
        </Button>
      </div>
    </div>
  )
}

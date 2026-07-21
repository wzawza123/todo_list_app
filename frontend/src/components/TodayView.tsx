import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useStore } from '../store'
import type { TodayItem } from '../types'
import { TaskRow } from './TaskRow'

export function TodayView() {
  const { today, reorderToday, cleanToday, carryOver, dismissCarryOver, carryOverPrompted } = useStore()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  if (!today) return null
  const items = today.items
  const stale = items.filter((i) => i.stale)
  const pending = today.carry_over ?? []

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = items.map((i) => i.id)
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    const next = [...ids]
    next.splice(to, 0, next.splice(from, 1)[0])
    reorderToday(next)
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-neutral-200 px-4 py-2">
        <h1 className="text-sm font-semibold">☀ Today</h1>
        <span className="text-xs text-neutral-400">{today.date}</span>
        <span className="ml-auto text-xs text-neutral-600">
          已完成 {today.done} / 总数 {today.total}
        </span>
        {stale.length > 0 && (
          <button onClick={() => cleanToday()} className="rounded border border-neutral-200 px-2 py-0.5 text-xs hover:bg-neutral-50">
            清除 {stale.length} 条失效引用
          </button>
        )}
      </header>

      {pending.length > 0 && !carryOverPrompted && (
        <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          <span>历史日程中有 {pending.length} 条未完成任务（{pending.map((p) => p.title).slice(0, 3).join('、')}
            {pending.length > 3 ? '…' : ''}）</span>
          <button onClick={() => carryOver()} className="ml-auto rounded bg-amber-600 px-2 py-0.5 text-white hover:bg-amber-700">
            顺延到今天
          </button>
          <button onClick={() => dismissCarryOver()} className="rounded border border-amber-300 px-2 py-0.5">
            忽略
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {items.length === 0 ? (
          <div className="mt-24 text-center text-sm text-neutral-400">
            今天还没有安排。在任何视图选中任务后按 <kbd>T</kbd> 加入今日。
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
            modifiers={[restrictToVerticalAxis]}
          >
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {items.map((item) => (
                <SortableRow key={item.id} item={item} />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  )
}

function SortableRow({ item }: { item: TodayItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const toggleToday = useStore((s) => s.toggleToday)
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  const handle = (
    <span
      {...attributes}
      {...listeners}
      className="shrink-0 cursor-grab select-none px-0.5 text-xs text-neutral-300 hover:text-neutral-500"
      title="拖拽排序"
    >
      ⠿
    </span>
  )

  if (item.stale || !item.task) {
    return (
      <div ref={setNodeRef} style={style} className="flex items-center gap-2 rounded px-2 py-[3px] text-sm text-neutral-400">
        {handle}
        <span className="flex-1 truncate line-through">{item.id}（任务已不存在）</span>
        <button onClick={() => toggleToday(item.id)} className="text-xs hover:text-red-600">
          移除
        </button>
      </div>
    )
  }

  return (
    <div ref={setNodeRef} style={style}>
      <TaskRow task={item.task} showFile dragHandle={handle} />
    </div>
  )
}

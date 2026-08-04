import { useId } from 'react'
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
import { useTaskDnd } from '../useTaskDnd'
import type { TodayItem } from '../types'
import { TaskRow, type RowDnd } from './TaskRow'
import { groupTodayItems, reorderTodayGroup, todayGroupKey, type TodayGroup } from './todayGrouping'

export function TodayView() {
  const { today, reorderToday, cleanToday, carryOver, dismissCarryOver, carryOverPrompted } = useStore()
  const dndFor = useTaskDnd()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  if (!today) return null
  const items = today.items
  const groups = groupTodayItems(items)
  const stale = items.filter((item) => item.stale || !item.task)
  const pending = today.carry_over ?? []

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    // A websocket refresh or task edit may land while dragging. Persist against
    // the latest schedule so we never overwrite those newer changes.
    const latestItems = useStore.getState().today?.items ?? []
    const activeItem = latestItems.find((item) => item.id === String(active.id))
    if (!activeItem) return
    const next = reorderTodayGroup(latestItems, todayGroupKey(activeItem), String(active.id), String(over.id))
    if (!next) return
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
            <div className="space-y-3">
              {groups.map((group) => (
                <TodayGroupSection
                  key={group.key === null ? 'stale:' : `file:${group.key}`}
                  group={group}
                  dndFor={dndFor}
                />
              ))}
            </div>
          </DndContext>
        )}
      </div>
    </div>
  )
}

function TodayGroupSection({
  group,
  dndFor,
}: {
  group: TodayGroup
  dndFor: (task: NonNullable<TodayItem['task']>) => RowDnd
}) {
  const headingId = useId()

  return (
    <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white" aria-labelledby={headingId}>
      <div className="flex items-center gap-3 border-b border-neutral-100 bg-neutral-50/80 px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 id={headingId} className="truncate text-xs font-semibold text-neutral-700">
              {group.title}
            </h2>
            {group.stale && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[12px] font-medium text-amber-700">需清理</span>
            )}
          </div>
          {group.path && (
            <p className="mt-0.5 truncate text-[12px] text-neutral-400" title={group.path}>
              {group.path}
            </p>
          )}
        </div>

        {group.stale ? (
          <span className="shrink-0 text-[12px] tabular-nums text-neutral-400">{group.total} 条引用</span>
        ) : (
          <div className="w-28 shrink-0">
            <div className="mb-1 flex items-center justify-between text-[12px] tabular-nums text-neutral-400">
              <span>完成</span>
              <span>{group.done} / {group.total}</span>
            </div>
            <div
              className="h-1 overflow-hidden rounded-full bg-neutral-200"
              role="progressbar"
              aria-label={`${group.title} 完成进度`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={group.progress}
            >
              <div className="h-full rounded-full bg-blue-500" style={{ width: `${group.progress}%` }} />
            </div>
          </div>
        )}
      </div>

      <SortableContext items={group.items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <div className="py-1">
          {group.items.map((item) => (
            <SortableRow key={item.id} item={item} dnd={item.task ? dndFor(item.task) : undefined} />
          ))}
        </div>
      </SortableContext>
    </section>
  )
}

function SortableRow({ item, dnd }: { item: TodayItem; dnd?: RowDnd }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const toggleToday = useStore((s) => s.toggleToday)
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  const handle = !item.stale && item.task ? (
    <span
      {...attributes}
      {...listeners}
      // 手柄专管 dnd-kit 排序：挡掉原生拖放，免得同时触发「拖成子任务」
      draggable={false}
      onDragStart={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      aria-label="调整该任务在当前项目内的 Today 顺序"
      className="shrink-0 cursor-grab select-none rounded px-0.5 text-xs text-neutral-300 hover:text-neutral-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      title="仅调整同项目内的 Today 顺序；拖整行可跨项目变成子任务"
    >
      ⠿
    </span>
  ) : null

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
      <TaskRow task={item.task} dragHandle={handle} dnd={dnd} />
    </div>
  )
}

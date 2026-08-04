import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useStore } from '../store'
import type { Task } from '../types'
import { PriorityBar } from './PriorityBar'

/** 原生 HTML5 拖放接线，由 FileView 提供（把任务拖成另一条任务的子任务）。 */
export interface RowDnd {
  draggable: boolean
  dragging: boolean
  over: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
}

interface Props {
  task: Task
  indent?: number
  showFile?: boolean
  dragHandle?: React.ReactNode
  stale?: boolean
  dnd?: RowDnd
  endAction?: ReactNode
}

export function TaskRow({ task, indent = 0, showFile = false, dragHandle, dnd, endAction }: Props) {
  const { selected, select, patchTask, deleteTask, toggleToday, todayIds, toggleCollapse, collapsed, taskById } =
    useStore()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [draft, setDraft] = useState(task.title)
  const inputRef = useRef<HTMLInputElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const isSelected = selected === task.key
  const inToday = task.id ? todayIds().has(task.id) : false
  const hasChildren = task.children.length > 0
  const isCollapsed = collapsed.has(task.key)

  useEffect(() => {
    if (editing) {
      setDraft(task.title)
      requestAnimationFrame(() => inputRef.current?.select())
    }
  }, [editing])

  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail === task.key) setEditing(true)
    }
    window.addEventListener('mdtask:edit', handler)
    return () => window.removeEventListener('mdtask:edit', handler)
  }, [task.key])

  const commit = async () => {
    setEditing(false)
    if (draft.trim() && draft !== task.title && task.id) {
      await patchTask(task.id, { title: draft.trim() })
    }
  }

  const blockers = task.depends_on
    .map((d) => taskById(d))
    .filter((t): t is Task => !!t && t.status !== 'done')

  const openCount = countOpen(task.children)

  const handleDelete = async () => {
    if (!task.id || deleting || !confirm(`删除「${task.title}」及其所有子任务？`)) return
    setDeleting(true)
    await deleteTask(task.id)
    setDeleting(false)
  }

  return (
    <div
      ref={rowRef}
      data-task-key={task.key}
      onClick={() => select(task.key)}
      onDoubleClick={() => task.id && setEditing(true)}
      // 按在勾选框 / 箭头 / 优先级这类小控件上时临时关掉拖动：
      // 否则手一抖就变成拖拽，click 事件被浏览器吞掉（折叠点不动）。
      onMouseDown={(e) => {
        if (!dnd?.draggable || !rowRef.current) return
        const hit = (e.target as HTMLElement).closest('button, input, select, textarea, a, label, [data-nodrag]')
        rowRef.current.draggable = !hit
      }}
      draggable={!!dnd?.draggable && !editing}
      onDragStart={dnd?.onDragStart}
      onDragEnd={dnd?.onDragEnd}
      onDragOver={dnd?.onDragOver}
      onDragLeave={dnd?.onDragLeave}
      onDrop={dnd?.onDrop}
      className={`group flex items-center gap-1.5 rounded px-1.5 py-[3px] text-sm ${
        dnd?.over
          ? 'bg-blue-100 ring-2 ring-inset ring-blue-400'
          : isSelected
            ? 'bg-blue-50 ring-1 ring-inset ring-blue-300'
            : 'hover:bg-neutral-100'
      } ${dnd?.dragging ? 'opacity-40' : ''}`}
      style={{ paddingLeft: 6 + indent * 18 }}
    >
      {dragHandle}

      <button
        onClick={(e) => {
          e.stopPropagation()
          if (hasChildren) toggleCollapse(task.key)
        }}
        className={`w-3 shrink-0 text-[12px] text-neutral-400 ${hasChildren ? '' : 'invisible'}`}
      >
        {isCollapsed ? '▶' : '▼'}
      </button>

      <PriorityBar priority={task.priority} onChange={(p) => task.id && patchTask(task.id, { priority: p })} />

      <input
        type="checkbox"
        checked={task.status === 'done'}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => task.id && patchTask(task.id, { status: e.target.checked ? 'done' : 'todo' })}
        className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-blue-600"
      />

      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setEditing(false)
          }}
          autoFocus
          className="min-w-0 flex-1 rounded border border-blue-400 px-1 py-0 text-sm outline-none"
        />
      ) : (
        <span
          className={`min-w-0 flex-1 truncate ${task.status === 'done' ? 'text-neutral-400 line-through' : ''} ${
            task.blocked ? 'opacity-50' : ''
          }`}
          title={task.title}
        >
          {task.title || <span className="text-neutral-300">（空标题）</span>}
        </span>
      )}

      {task.blocked && blockers.length > 0 && (
        <span
          data-nodrag
          className="shrink-0 cursor-pointer text-xs text-amber-600"
          title={`被阻塞于：${blockers.map((b) => b.title).join('、')}`}
          onClick={(e) => {
            e.stopPropagation()
            select(blockers[0].key)
            document.querySelector(`[data-task-key="${CSS.escape(blockers[0].key)}"]`)?.scrollIntoView({
              block: 'center',
            })
          }}
        >
          🔒
        </span>
      )}

      {openCount > 0 && <span className="shrink-0 text-xs text-neutral-400">{openCount}</span>}

      {task.due && <span className="shrink-0 text-xs text-neutral-400">📅 {task.due}</span>}

      {showFile && <span className="shrink-0 max-w-[180px] truncate text-xs text-neutral-400">{task.file}</span>}

      {!task.id && <span className="shrink-0 text-xs text-neutral-300" title="尚未写入 🆔，修改时会自动补写">·</span>}

      {endAction}

      <button
        onClick={(e) => {
          e.stopPropagation()
          if (task.id) toggleToday(task.id)
        }}
        title={inToday ? '从今日移除' : '加入今日 (T)'}
        className={`shrink-0 rounded px-1 text-xs ${
          inToday ? 'bg-amber-100 text-amber-700' : 'invisible text-neutral-400 group-hover:visible hover:bg-neutral-200'
        }`}
      >
        ☀
      </button>

      {task.id && (
        <button
          type="button"
          data-nodrag
          disabled={deleting}
          aria-label={`删除任务「${task.title}」`}
          title="删除任务"
          onClick={(event) => {
            event.stopPropagation()
            void handleDelete()
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          className={`shrink-0 rounded px-1 text-xs transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:cursor-wait disabled:text-neutral-300 ${
            isSelected
              ? 'text-neutral-400'
              : 'invisible text-neutral-300 group-hover:visible focus-visible:visible'
          }`}
        >
          {deleting ? '…' : '删除'}
        </button>
      )}
    </div>
  )
}

function countOpen(children: Task[]): number {
  let n = 0
  for (const c of children) {
    if (c.status !== 'done') n++
    n += countOpen(c.children)
  }
  return n
}

import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { PRIORITIES, PRIORITY_COLOR, PRIORITY_LABEL, type Task } from '../types'

export function DetailPanel() {
  const { detailOpen, setDetailOpen, selected, allTasks, patchTask, deleteTask, toggleToday, todayIds } = useStore()
  const [query, setQuery] = useState('')

  const tasks = allTasks()
  const task = tasks.find((t) => t.key === selected)

  const candidates = useMemo(() => {
    if (!task || !query.trim()) return []
    const q = query.trim().toLowerCase()
    return tasks
      .filter((t) => t.id && t.id !== task.id && !task.depends_on.includes(t.id) && t.title.toLowerCase().includes(q))
      .slice(0, 8)
  }, [query, tasks, task])

  if (!detailOpen || !task) return null

  const deps = task.depends_on.map((d) => ({ id: d, task: tasks.find((t) => t.id === d) }))
  const canEdit = !!task.id

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col gap-3 overflow-y-auto border-l border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold leading-5">{task.title || '（空标题）'}</h2>
        <button onClick={() => setDetailOpen(false)} className="shrink-0 text-neutral-400 hover:text-neutral-700">
          ✕
        </button>
      </div>

      <Field label="所属文件">
        <span className="text-xs text-neutral-500">
          {task.file}:{task.line + 1}
        </span>
      </Field>

      <Field label="ID">
        <span className="font-mono text-xs text-neutral-500">{task.id ?? '（修改时自动生成）'}</span>
      </Field>

      <Field label="优先级">
        <div className="flex gap-1">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              disabled={!canEdit}
              onClick={() => task.id && patchTask(task.id, { priority: p })}
              className={`rounded border px-1.5 py-0.5 text-xs ${
                task.priority === p ? 'border-blue-400 bg-blue-50' : 'border-neutral-200 hover:bg-neutral-50'
              }`}
              style={{ color: p === 'none' ? undefined : PRIORITY_COLOR[p] }}
            >
              {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
      </Field>

      <Field label="依赖（前置任务）">
        <div className="space-y-1">
          {deps.length === 0 && <div className="text-xs text-neutral-400">无</div>}
          {deps.map(({ id, task: dep }) => (
            <div key={id} className="flex items-center gap-2 rounded bg-neutral-50 px-2 py-1 text-xs">
              <span className={`flex-1 truncate ${dep ? '' : 'text-neutral-400 line-through'}`}>
                {dep ? dep.title : `${id}（不存在）`}
              </span>
              {dep && <span className="text-neutral-400">{dep.status === 'done' ? '✓' : '…'}</span>}
              <button
                className="text-neutral-400 hover:text-red-600"
                onClick={() =>
                  task.id &&
                  patchTask(task.id, { depends_on: task.depends_on.filter((d) => d !== id) })
                }
              >
                ✕
              </button>
            </div>
          ))}
          <input
            value={query}
            disabled={!canEdit}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="搜索任务以添加依赖…"
            className="w-full rounded border border-neutral-200 px-2 py-1 text-xs outline-none focus:border-blue-400"
          />
          {candidates.map((c) => (
            <button
              key={c.key}
              onClick={async () => {
                if (!task.id || !c.id) return
                setQuery('')
                await patchTask(task.id, { depends_on: [...task.depends_on, c.id] })
              }}
              className="block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-blue-50"
            >
              {c.title} <span className="text-neutral-400">· {c.file}</span>
            </button>
          ))}
        </div>
      </Field>

      <Field label="状态">
        <div className="flex items-center gap-2 text-xs">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={task.status === 'done'}
              onChange={(e) => task.id && patchTask(task.id, { status: e.target.checked ? 'done' : 'todo' })}
              className="accent-blue-600"
            />
            已完成
          </label>
          {task.done_date && <span className="text-neutral-400">✅ {task.done_date}</span>}
          {task.blocked && <span className="text-amber-600">🔒 被阻塞</span>}
        </div>
      </Field>

      <div className="mt-auto flex gap-2 pt-4">
        <button
          onClick={() => task.id && toggleToday(task.id)}
          className="flex-1 rounded border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
        >
          {task.id && todayIds().has(task.id) ? '☀ 从今日移除' : '☀ 加入今日'}
        </button>
        <button
          onClick={() => task.id && confirm(`删除「${task.title}」及其所有子任务？`) && deleteTask(task.id)}
          className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
        >
          删除
        </button>
      </div>
    </aside>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">{label}</div>
      {children}
    </div>
  )
}

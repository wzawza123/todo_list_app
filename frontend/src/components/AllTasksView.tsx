import { useState } from 'react'
import { useStore } from '../store'
import { useTaskDnd } from '../useTaskDnd'
import { PRIORITY_LABEL, PRIORITY_RANK, type Priority, type Task } from '../types'
import { TaskTree } from './TaskTree'
import { TaskRow } from './TaskRow'

type GroupBy = 'file' | 'priority'
type TaskScope = 'open' | 'all'

export function AllTasksView() {
  const { snapshot } = useStore()
  const dndFor = useTaskDnd()
  const [groupBy, setGroupBy] = useState<GroupBy>('file')
  const [scope, setScope] = useState<TaskScope>('open')
  const [hideBlocked, setHideBlocked] = useState(false)
  const [filter, setFilter] = useState('')
  const hideDone = scope === 'open'

  const entries = Object.entries(snapshot.files).filter(
    ([path, roots]) =>
      path.toLowerCase().includes(filter.toLowerCase()) && hasVisibleTask(roots, hideDone, hideBlocked),
  )
  const priorityGroups = groupBy === 'priority' ? groupByPriority(entries, hideDone, hideBlocked) : []
  const empty = groupBy === 'file' ? entries.length === 0 : priorityGroups.length === 0

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-neutral-200 px-4 py-2">
        <h1 className="shrink-0 text-sm font-semibold">📋 All Tasks</h1>
        <span className="min-w-0 truncate text-xs text-neutral-300">拖到另一条任务上 = 成为它的子任务（可跨文件）</span>
        <div className="ml-auto flex shrink-0 items-center gap-3 whitespace-nowrap text-xs text-neutral-600">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="筛选文件路径…"
            className="w-40 rounded border border-neutral-200 px-2 py-0.5 outline-none focus:border-blue-400"
          />
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            className="rounded border border-neutral-200 px-1 py-0.5"
          >
            <option value="file">按文件</option>
            <option value="priority">按优先级</option>
          </select>
          <div
            role="group"
            aria-label="任务显示范围"
            className="flex overflow-hidden rounded border border-neutral-200 bg-neutral-50 p-0.5"
          >
            <ScopeButton active={scope === 'open'} onClick={() => setScope('open')}>
              未完成任务
            </ScopeButton>
            <ScopeButton active={scope === 'all'} onClick={() => setScope('all')}>
              所有任务
            </ScopeButton>
          </div>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={hideBlocked} onChange={(e) => setHideBlocked(e.target.checked)} /> 隐藏阻塞
          </label>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {groupBy === 'file'
          ? entries.map(([path, roots]) => (
              <section key={path} className="mb-4">
                <div className="px-2 py-1 text-xs font-medium text-neutral-500">{path}</div>
                <TaskTree
                  tasks={sortByPriority(roots)}
                  hideDone={hideDone}
                  hideBlocked={hideBlocked}
                  dndFor={dndFor}
                />
              </section>
            ))
          : priorityGroups.map(([p, tasks]) => (
              <section key={p} className="mb-4">
                <div className="px-2 py-1 text-xs font-medium text-neutral-500">{PRIORITY_LABEL[p]}</div>
                {tasks.map((t) => (
                  <TaskRow key={t.key} task={t} showFile dnd={dndFor(t)} />
                ))}
              </section>
            ))}
        {empty && <Empty scope={scope} filtered={Boolean(filter.trim())} />}
      </div>
    </div>
  )
}

function ScopeButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded px-2 py-0.5 font-medium transition ${
        active ? 'bg-white text-blue-600 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'
      }`}
    >
      {children}
    </button>
  )
}

function Empty({ scope, filtered }: { scope: TaskScope; filtered: boolean }) {
  const message = filtered
    ? '没有符合当前筛选条件的任务。'
    : scope === 'open'
      ? '当前没有未完成任务。'
      : '还没有任务。按 Q 快速添加。'
  return (
    <div className="mt-24 text-center text-sm text-neutral-400">{message}</div>
  )
}

function hasVisibleTask(tasks: Task[], hideDone: boolean, hideBlocked: boolean): boolean {
  return tasks.some(
    (task) =>
      (!(hideDone && task.status === 'done') && !(hideBlocked && task.blocked)) ||
      hasVisibleTask(task.children, hideDone, hideBlocked),
  )
}

export function sortByPriority(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority])
}

function groupByPriority(
  entries: [string, Task[]][],
  hideDone: boolean,
  hideBlocked: boolean,
): [Priority, Task[]][] {
  const flat: Task[] = []
  const walk = (ts: Task[]) => ts.forEach((t) => (flat.push(t), walk(t.children)))
  entries.forEach(([, roots]) => walk(roots))
  const visible = flat.filter((t) => !(hideDone && t.status === 'done') && !(hideBlocked && t.blocked))
  const order: Priority[] = ['highest', 'high', 'medium', 'low', 'none']
  return order
    .map((p) => [p, visible.filter((t) => t.priority === p)] as [Priority, Task[]])
    .filter(([, ts]) => ts.length > 0)
}

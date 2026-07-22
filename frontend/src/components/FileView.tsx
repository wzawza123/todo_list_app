import { useState } from 'react'
import { useStore } from '../store'
import type { Task } from '../types'
import type { RowDnd } from './TaskRow'
import { TaskTree } from './TaskTree'

const MAX_LEVEL = 4

function findById(tasks: Task[], id: string): Task | undefined {
  for (const t of tasks) {
    if (t.id === id) return t
    const hit = findById(t.children, id)
    if (hit) return hit
  }
  return undefined
}

/** 子树相对深度：叶子为 1。 */
function subtreeDepth(task: Task): number {
  return 1 + Math.max(0, ...task.children.map(subtreeDepth))
}

export function FileView({ path, title }: { path: string; title: string }) {
  const { snapshot, createTask, moveTask } = useStore()
  const [hideDone, setHideDone] = useState(true)
  const [draft, setDraft] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)
  const roots = snapshot.files[path] ?? []

  const dragged = dragId ? findById(roots, dragId) : undefined

  const canDrop = (target: Task): boolean => {
    if (!dragged || !target.id || target.id === dragId) return false
    if (findById(dragged.children, target.id)) return false // 不能拖到自己的子孙上
    return target.level + subtreeDepth(dragged) <= MAX_LEVEL
  }

  const dndFor = (task: Task): RowDnd => ({
    draggable: !!task.id,
    dragging: !!task.id && task.id === dragId,
    over: overKey === task.key,
    onDragStart: (e) => {
      if (!task.id) return
      setDragId(task.id)
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', task.id)
    },
    onDragEnd: () => {
      setDragId(null)
      setOverKey(null)
    },
    onDragOver: (e) => {
      if (!canDrop(task)) return
      e.preventDefault() // 只有 preventDefault 的目标才允许放下
      e.dataTransfer.dropEffect = 'move'
      if (overKey !== task.key) setOverKey(task.key)
    },
    onDragLeave: () => setOverKey((k) => (k === task.key ? null : k)),
    onDrop: async (e) => {
      e.preventDefault()
      const id = dragId
      const ok = canDrop(task) // 非法目标不会 preventDefault，本就收不到 drop
      setDragId(null)
      setOverKey(null)
      if (!id || !task.id || !ok) return
      await moveTask(id, task.id)
    },
  })

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-neutral-200 px-4 py-2">
        <h1 className="text-sm font-semibold">{title}</h1>
        <span className="text-xs text-neutral-400">{path}</span>
        <span className="text-xs text-neutral-300">拖到另一条任务上 = 成为它的子任务</span>
        <label className="ml-auto flex items-center gap-1 text-xs text-neutral-600">
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> 隐藏已完成
        </label>
      </header>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {roots.length === 0 ? (
          <div className="mt-24 text-center text-sm text-neutral-400">
            这个文件还没有任务。按 <kbd>Q</kbd> 快速添加。
          </div>
        ) : (
          <TaskTree tasks={roots} hideDone={hideDone} dndFor={dndFor} />
        )}
      </div>

      <div className="border-t border-neutral-200 px-4 py-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={async (e) => {
            e.stopPropagation()
            if (e.key === 'Enter' && draft.trim()) {
              const title = draft.trim()
              setDraft('')
              await createTask({ title, file: path })
            }
          }}
          placeholder="新建任务…（结尾 !1~!4 设置优先级）"
          className="w-full rounded border border-neutral-200 px-2 py-1 text-sm outline-none focus:border-blue-400"
        />
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useStore } from './store'
import type { Task } from './types'
import type { RowDnd } from './components/TaskRow'

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

/**
 * 「拖到另一条任务上 = 成为它的子任务」的原生 HTML5 拖放接线。
 * 跨文件也可以拖（后端按 🆔 搬运整棵子树），所以各个视图共用同一套判定。
 */
export function useTaskDnd() {
  const { snapshot, moveTask } = useStore()
  const [dragId, setDragId] = useState<string | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)

  const roots = Object.values(snapshot.files).flat()
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

  return dndFor
}

import { useStore } from '../store'
import type { Task } from '../types'
import { TaskRow, type RowDnd } from './TaskRow'

export function TaskTree({
  tasks,
  showFile = false,
  hideDone = true,
  hideBlocked = false,
  depth = 0,
  dndFor,
}: {
  tasks: Task[]
  showFile?: boolean
  hideDone?: boolean
  hideBlocked?: boolean
  depth?: number
  dndFor?: (task: Task) => RowDnd | undefined
}) {
  const collapsed = useStore((s) => s.collapsed)
  return (
    <>
      {tasks.map((task) => {
        const selfHidden = (hideDone && task.status === 'done') || (hideBlocked && task.blocked)
        const kids = (
          <TaskTree
            tasks={task.children}
            showFile={showFile}
            hideDone={hideDone}
            hideBlocked={hideBlocked}
            depth={selfHidden ? depth : depth + 1}
            dndFor={dndFor}
          />
        )
        if (selfHidden) return <div key={task.key}>{kids}</div>
        return (
          <div key={task.key}>
            <TaskRow task={task} indent={depth} showFile={showFile} dnd={dndFor?.(task)} />
            {!collapsed.has(task.key) && kids}
          </div>
        )
      })}
    </>
  )
}

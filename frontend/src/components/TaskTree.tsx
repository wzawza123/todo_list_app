import { useStore } from '../store'
import type { Task } from '../types'
import { TaskRow } from './TaskRow'

export function TaskTree({
  tasks,
  showFile = false,
  hideDone = true,
  hideBlocked = false,
  depth = 0,
}: {
  tasks: Task[]
  showFile?: boolean
  hideDone?: boolean
  hideBlocked?: boolean
  depth?: number
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
          />
        )
        if (selfHidden) return <div key={task.key}>{kids}</div>
        return (
          <div key={task.key}>
            <TaskRow task={task} indent={depth} showFile={showFile} />
            {!collapsed.has(task.key) && kids}
          </div>
        )
      })}
    </>
  )
}

import { useState } from 'react'
import { useStore } from '../store'
import type { ProjectSummary, Task } from '../types'
import { useTaskDnd } from '../useTaskDnd'
import { TaskTree } from './TaskTree'

export function FileView({
  path,
  title,
  allowMoveToProject = false,
}: {
  path: string
  title: string
  allowMoveToProject?: boolean
}) {
  const { snapshot, projects, createTask, moveTaskToProject, toast } = useStore()
  const dndFor = useTaskDnd()
  const [hideDone, setHideDone] = useState(true)
  const [draft, setDraft] = useState('')
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null)
  const roots = snapshot.files[path] ?? []

  const moveToProject = async (task: Task, project: ProjectSummary) => {
    if (!task.id || movingTaskId) return
    setMovingTaskId(task.id)
    const moved = await moveTaskToProject(task.id, project.path)
    setMovingTaskId(null)
    if (moved) toast(`已将「${task.title}」移动到项目「${project.name}」`)
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-neutral-200 px-4 py-2">
        <h1 className="min-w-0 truncate text-sm font-semibold" title={title}>{title}</h1>
        <span className="min-w-0 truncate text-xs text-neutral-400" title={path}>{path}</span>
        <span className="min-w-0 truncate text-xs text-neutral-300">拖到另一条任务上 = 成为它的子任务</span>
        <label className="ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-neutral-600">
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> 隐藏已完成
        </label>
      </header>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {roots.length === 0 ? (
          <div className="mt-24 text-center text-sm text-neutral-400">
            这个文件还没有任务。按 <kbd>Q</kbd> 快速添加。
          </div>
        ) : (
          <TaskTree
            tasks={roots}
            hideDone={hideDone}
            dndFor={dndFor}
            renderEndAction={
              allowMoveToProject
                ? (task) => (
                    <MoveToProjectSelect
                      task={task}
                      projects={projects}
                      moving={movingTaskId === task.id}
                      disabled={movingTaskId !== null}
                      onMove={moveToProject}
                    />
                  )
                : undefined
            }
          />
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

function MoveToProjectSelect({
  task,
  projects,
  moving,
  disabled,
  onMove,
}: {
  task: Task
  projects: ProjectSummary[]
  moving: boolean
  disabled: boolean
  onMove: (task: Task, project: ProjectSummary) => Promise<void>
}) {
  const placeholder = moving
    ? '移动中…'
    : !task.id
      ? '无 ID，暂不可移动'
      : projects.length === 0
        ? '暂无项目'
        : '移动到项目…'

  return (
    <select
      data-nodrag
      value=""
      disabled={disabled || !task.id || projects.length === 0}
      aria-label={`将任务「${task.title}」移动到项目`}
      title={placeholder}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onChange={(event) => {
        const project = projects.find((candidate) => candidate.path === event.target.value)
        if (project) void onMove(task, project)
      }}
      className="max-w-44 shrink-0 rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-xs text-neutral-500 outline-none hover:border-neutral-300 focus:border-blue-400 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-300"
    >
      <option value="">{placeholder}</option>
      {projects.map((project) => (
        <option key={project.path} value={project.path}>
          {project.name} · {project.path}
        </option>
      ))}
    </select>
  )
}

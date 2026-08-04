import { useStore } from '../store'
import { PRIORITY_COLOR, type ProjectSummary, type Task } from '../types'

const number = new Intl.NumberFormat('zh-CN')

export function DashboardView() {
  const { projects, setView } = useStore()
  const totalTasks = projects.reduce((sum, project) => sum + project.total_tasks, 0)
  const completedTasks = projects.reduce((sum, project) => sum + project.completed_tasks, 0)
  const overallProgress = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100)

  return (
    <div className="flex h-full flex-col bg-neutral-50/60">
      <header className="border-b border-neutral-200 bg-white px-6 py-5">
        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-[0.16em] text-neutral-400">Overview</p>
            <h1 className="text-xl font-semibold tracking-tight text-neutral-900">项目 Dashboard</h1>
            <p className="mt-1 text-sm text-neutral-500">集中查看每个项目的进展与最近任务。</p>
          </div>
          <div className="flex items-end gap-6">
            {projects.length > 0 && (
              <div className="flex gap-8 text-right">
                <SummaryStat label="项目" value={projects.length} />
                <SummaryStat label="已完成任务" value={`${number.format(completedTasks)} / ${number.format(totalTasks)}`} />
                <SummaryStat label="整体进度" value={`${overallProgress}%`} accent />
              </div>
            )}
            <button
              type="button"
              onClick={() => setView({ kind: 'projects' })}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm transition hover:border-neutral-400 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              管理项目
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {projects.length === 0 ? (
          <div className="mx-auto mt-24 max-w-md rounded-lg border border-dashed border-neutral-300 bg-white px-8 py-10 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 text-lg text-neutral-500">
              ▦
            </div>
            <h2 className="text-sm font-semibold text-neutral-700">还没有项目</h2>
            <p className="mt-1 text-xs leading-5 text-neutral-400">
              创建一个项目后，就可以在这里追踪任务进展。
            </p>
            <button
              type="button"
              onClick={() => setView({ kind: 'projects' })}
              className="mt-4 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              创建项目
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 2xl:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard
                key={project.path}
                project={project}
                onOpen={() => setView({ kind: 'file', file: project.path })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryStat({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div>
      <div className="text-[13px] text-neutral-400">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold tabular-nums ${accent ? 'text-blue-600' : 'text-neutral-700'}`}>
        {value}
      </div>
    </div>
  )
}

function ProjectCard({ project, onOpen }: { project: ProjectSummary; onOpen: () => void }) {
  const progress = projectProgress(project)
  const openTasks = Math.max(0, project.total_tasks - project.completed_tasks)

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
      className="group cursor-pointer rounded-lg border border-neutral-200 bg-white p-4 shadow-sm outline-none transition hover:-translate-y-0.5 hover:border-neutral-300 hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      aria-label={`打开项目 ${project.name}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50 text-sm font-semibold text-blue-600">
          {projectInitial(project.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-neutral-800">{project.name}</h2>
            <span className="ml-auto shrink-0 text-neutral-300 transition group-hover:translate-x-0.5 group-hover:text-neutral-500">→</span>
          </div>
          <p className="mt-0.5 truncate text-[13px] text-neutral-400" title={project.path}>
            {project.path}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-neutral-500">
            已完成 <span className="font-medium tabular-nums text-neutral-700">{number.format(project.completed_tasks)}</span>
            <span className="text-neutral-300"> / </span>
            <span className="tabular-nums">{number.format(project.total_tasks)}</span>
          </span>
          <span className="font-semibold tabular-nums text-blue-600">{progress}%</span>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-neutral-100"
          role="progressbar"
          aria-label={`${project.name} 完成进度`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div className="h-full rounded-full bg-blue-500 transition-[width]" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-1.5 text-[13px] text-neutral-400">{openTasks === 0 ? '所有任务均已完成' : `还有 ${openTasks} 项待完成`}</p>
      </div>

      <div className="mt-4 border-t border-neutral-100 pt-3">
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-[13px] font-medium uppercase tracking-wide text-neutral-400">最新任务</h3>
          <span className="text-[13px] text-neutral-300">最近 {Math.min(project.latest_tasks.length, 3)} 项</span>
        </div>
        {project.latest_tasks.length === 0 ? (
          <p className="py-2 text-xs text-neutral-400">暂无任务</p>
        ) : (
          <div className="space-y-0.5">
            {project.latest_tasks.slice(0, 3).map((task) => (
              <LatestTask key={task.key || task.id || `${task.file}:${task.line}`} task={task} />
            ))}
          </div>
        )}
      </div>
    </article>
  )
}

function LatestTask({ task }: { task: Task }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded px-1 py-1.5 text-xs text-neutral-600 group-hover:bg-neutral-50">
      <span
        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border text-[9px] ${
          task.status === 'done' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-neutral-300 bg-white'
        }`}
        aria-hidden="true"
      >
        {task.status === 'done' ? '✓' : ''}
      </span>
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: task.priority === 'none' ? '#d4d4d4' : PRIORITY_COLOR[task.priority] }}
        aria-hidden="true"
      />
      <span className={`truncate ${task.status === 'done' ? 'text-neutral-400 line-through' : ''}`}>{task.title}</span>
      {task.blocked && <span className="ml-auto shrink-0 text-[12px] text-amber-600">阻塞</span>}
    </div>
  )
}

function projectProgress(project: ProjectSummary): number {
  const value = Number.isFinite(project.progress) ? project.progress : 0
  return Math.min(100, Math.max(0, Math.round(value)))
}

function projectInitial(name: string): string {
  const trimmed = name.trim()
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : 'P'
}

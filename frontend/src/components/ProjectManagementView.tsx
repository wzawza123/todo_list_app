import { type FormEvent, useEffect, useState } from 'react'
import { useStore } from '../store'
import type { ProjectSummary } from '../types'

const number = new Intl.NumberFormat('zh-CN')

export function ProjectManagementView() {
  const { projects, setView, createProject, renameProject, deleteProject, toast } = useStore()
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<ProjectSummary | null>(null)
  const [renameName, setRenameName] = useState('')
  const [savingRename, setSavingRename] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null)
  const [deleting, setDeleting] = useState(false)

  const totalTasks = projects.reduce((sum, project) => sum + project.total_tasks, 0)
  const completedTasks = projects.reduce((sum, project) => sum + project.completed_tasks, 0)
  const openTasks = Math.max(0, totalTasks - completedTasks)

  useEffect(() => {
    if (!deleteTarget) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !deleting) setDeleteTarget(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [deleteTarget, deleting])

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault()
    const name = newName.trim()
    if (!name || creating) return
    setCreating(true)
    const project = await createProject(name)
    setCreating(false)
    if (!project) return
    setNewName('')
    toast(`已创建项目「${project.name}」`)
  }

  const startRename = (project: ProjectSummary) => {
    setRenaming(project)
    setRenameName(project.name)
  }

  const handleRename = async (event: FormEvent) => {
    event.preventDefault()
    if (!renaming || savingRename) return
    const name = renameName.trim()
    if (!name) return
    if (name === renaming.name) {
      setRenaming(null)
      return
    }
    setSavingRename(true)
    const project = await renameProject(renaming.path, name)
    setSavingRename(false)
    if (!project) return
    setRenaming(null)
    toast(`项目已重命名为「${project.name}」`)
  }

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    const result = await deleteProject(deleteTarget.path)
    setDeleting(false)
    if (!result) return
    toast(`项目「${deleteTarget.name}」已移入 ${result.trashed_to}`)
    setDeleteTarget(null)
  }

  return (
    <div className="flex h-full flex-col bg-neutral-50/60">
      <header className="border-b border-neutral-200 bg-white px-6 py-5">
        <div className="flex items-end justify-between gap-8">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-[0.16em] text-neutral-400">Projects</p>
            <h1 className="text-xl font-semibold tracking-tight text-neutral-900">项目管理</h1>
            <p className="mt-1 text-sm text-neutral-500">创建、重命名或归档项目，并快速查看每个项目的完成情况。</p>
          </div>
          <div className="flex gap-8 text-right">
            <SummaryStat label="项目" value={projects.length} />
            <SummaryStat label="待完成任务" value={number.format(openTasks)} />
            <SummaryStat label="已完成任务" value={number.format(completedTasks)} accent />
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <form
          onSubmit={handleCreate}
          className="mb-5 flex items-end gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
        >
          <label className="min-w-0 flex-1">
            <span className="mb-1.5 block text-xs font-medium text-neutral-700">新建项目</span>
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="例如：移动端 2.0 发布"
              maxLength={120}
              className="h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none transition placeholder:text-neutral-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              aria-label="项目名称"
            />
          </label>
          <button
            type="submit"
            disabled={!newName.trim() || creating}
            className="h-9 shrink-0 rounded-md bg-blue-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            {creating ? '创建中…' : '创建项目'}
          </button>
        </form>

        <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm" aria-label="项目列表">
          <div className="grid grid-cols-[minmax(200px,1.6fr)_minmax(150px,1fr)_100px_minmax(140px,1fr)_190px] gap-4 border-b border-neutral-200 bg-neutral-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            <span>项目</span>
            <span>进度</span>
            <span>任务</span>
            <span>最新任务</span>
            <span className="text-right">操作</span>
          </div>

          {projects.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-lg text-blue-600">＋</div>
              <h2 className="text-sm font-semibold text-neutral-700">创建第一个项目</h2>
              <p className="mt-1 text-xs text-neutral-400">输入项目名称后即可开始添加和跟踪任务。</p>
            </div>
          ) : (
            projects.map((project) => (
              <ProjectRow
                key={project.path}
                project={project}
                editing={renaming?.path === project.path}
                renameName={renameName}
                savingRename={savingRename}
                onRenameNameChange={setRenameName}
                onRenameSubmit={handleRename}
                onRenameStart={() => startRename(project)}
                onRenameCancel={() => setRenaming(null)}
                onOpen={() => setView({ kind: 'file', file: project.path })}
                onDelete={() => setDeleteTarget(project)}
              />
            ))
          )}
        </section>
      </div>

      {deleteTarget && (
        <DeleteProjectDialog
          project={deleteTarget}
          deleting={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}

function ProjectRow({
  project,
  editing,
  renameName,
  savingRename,
  onRenameNameChange,
  onRenameSubmit,
  onRenameStart,
  onRenameCancel,
  onOpen,
  onDelete,
}: {
  project: ProjectSummary
  editing: boolean
  renameName: string
  savingRename: boolean
  onRenameNameChange: (name: string) => void
  onRenameSubmit: (event: FormEvent) => void
  onRenameStart: () => void
  onRenameCancel: () => void
  onOpen: () => void
  onDelete: () => void
}) {
  const progress = projectProgress(project)
  const openTasks = Math.max(0, project.total_tasks - project.completed_tasks)
  const latestTask = project.latest_tasks[0]

  return (
    <div className="grid min-h-[76px] grid-cols-[minmax(200px,1.6fr)_minmax(150px,1fr)_100px_minmax(140px,1fr)_190px] items-center gap-4 border-b border-neutral-100 px-4 py-3 last:border-b-0 hover:bg-neutral-50/70">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50 text-sm font-semibold text-blue-600">
          {projectInitial(project.name)}
        </div>
        {editing ? (
          <form onSubmit={onRenameSubmit} className="flex min-w-0 flex-1 items-center gap-1.5">
            <input
              autoFocus
              value={renameName}
              onChange={(event) => onRenameNameChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') onRenameCancel()
              }}
              maxLength={120}
              className="h-8 min-w-0 flex-1 rounded border border-blue-400 px-2 text-sm outline-none ring-2 ring-blue-100"
              aria-label={`重命名项目 ${project.name}`}
            />
            <button
              type="submit"
              disabled={!renameName.trim() || savingRename}
              className="h-8 rounded bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-neutral-300"
            >
              {savingRename ? '保存中…' : '保存'}
            </button>
            <button type="button" onClick={onRenameCancel} disabled={savingRename} className="h-8 px-1.5 text-xs text-neutral-500 hover:text-neutral-800 disabled:text-neutral-300">
              取消
            </button>
          </form>
        ) : (
          <div className="min-w-0">
            <button type="button" onClick={onOpen} className="block max-w-full truncate text-left text-sm font-semibold text-neutral-800 hover:text-blue-600">
              {project.name}
            </button>
            <p className="mt-0.5 truncate text-[11px] text-neutral-400" title={project.path}>
              {project.path}
            </p>
          </div>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between text-[11px]">
          <span className="text-neutral-400">完成进度</span>
          <span className="font-semibold tabular-nums text-blue-600">{progress}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100" role="progressbar" aria-label={`${project.name} 完成进度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <div className="h-full rounded-full bg-blue-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="text-xs tabular-nums">
        <div className="font-medium text-neutral-700">{project.completed_tasks} / {project.total_tasks}</div>
        <div className="mt-0.5 text-[11px] text-neutral-400">{openTasks === 0 ? '全部完成' : `${openTasks} 项待办`}</div>
      </div>

      <div className="min-w-0">
        {latestTask ? (
          <>
            <p className={`truncate text-xs ${latestTask.status === 'done' ? 'text-neutral-400 line-through' : 'text-neutral-600'}`} title={latestTask.title}>
              {latestTask.title}
            </p>
            <p className="mt-0.5 text-[11px] text-neutral-400">{latestTask.status === 'done' ? '已完成' : latestTask.blocked ? '已阻塞' : '进行中'}</p>
          </>
        ) : (
          <span className="text-xs text-neutral-300">暂无任务</span>
        )}
      </div>

      <div className="flex items-center justify-end gap-1">
        <ActionButton onClick={onOpen}>打开</ActionButton>
        <ActionButton onClick={onRenameStart} disabled={editing}>重命名</ActionButton>
        <ActionButton onClick={onDelete} danger>删除</ActionButton>
      </div>
    </div>
  )
}

function ActionButton({ children, onClick, disabled = false, danger = false }: { children: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded px-2.5 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:text-neutral-300 ${
        danger ? 'text-red-600 hover:bg-red-50' : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
      }`}
    >
      {children}
    </button>
  )
}

function DeleteProjectDialog({ project, deleting, onCancel, onConfirm }: { project: ProjectSummary; deleting: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/35 px-4" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !deleting) onCancel()
    }}>
      <div role="dialog" aria-modal="true" aria-labelledby="delete-project-title" aria-describedby="delete-project-description" className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-lg text-red-600">!</div>
          <div>
            <h2 id="delete-project-title" className="text-base font-semibold text-neutral-900">删除项目「{project.name}」？</h2>
            <p id="delete-project-description" className="mt-1.5 text-sm leading-6 text-neutral-500">
              项目文件将移入 <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs text-neutral-700">.trash</code>，项目任务在 Today 与依赖关系中的引用也会被清理。
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={deleting} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:text-neutral-300">
            取消
          </button>
          <button autoFocus type="button" onClick={onConfirm} disabled={deleting} className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:bg-red-300">
            {deleting ? '删除中…' : '确认删除'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SummaryStat({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-neutral-400">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold tabular-nums ${accent ? 'text-blue-600' : 'text-neutral-700'}`}>{value}</div>
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

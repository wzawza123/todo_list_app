import { useStore } from '../store'

export function Sidebar() {
  const { view, setView, files, projects, inbox, today, snapshot } = useStore()
  const openTotal = files.reduce((n, f) => n + f.open, 0)
  const todayOpen = (today?.total ?? 0) - (today?.done ?? 0)

  const item = (active: boolean, label: string, badge?: number, onClick?: () => void) => (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm ${
        active ? 'bg-neutral-200 font-medium' : 'hover:bg-neutral-150 hover:bg-neutral-100'
      }`}
    >
      <span className="truncate">{label}</span>
      {badge ? <span className="ml-2 shrink-0 text-xs text-neutral-500">{badge}</span> : null}
    </button>
  )

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-neutral-200 bg-neutral-50 p-2">
      <div className="px-2 pb-2 text-xs font-semibold tracking-wide text-neutral-400">MD TASK MANAGER</div>
      {item(view.kind === 'dashboard', '▦ Dashboard', projectsOpenBadge(projects), () =>
        setView({ kind: 'dashboard' }),
      )}
      {item(view.kind === 'projects', '▤ 项目管理', projects.length, () => setView({ kind: 'projects' }))}
      {item(view.kind === 'today', '☀ Today', todayOpen, () => setView({ kind: 'today' }))}
      {item(view.kind === 'inbox', '📥 Inbox', files.find((f) => f.path === inbox)?.open, () =>
        setView({ kind: 'inbox' }),
      )}
      {item(view.kind === 'all', '📋 All Tasks', openTotal, () => setView({ kind: 'all' }))}

      <div className="mt-3 px-2 pb-1 text-xs font-semibold tracking-wide text-neutral-400">项目</div>
      {projects.length === 0 && <div className="px-2 text-xs text-neutral-400">（暂无项目）</div>}
      {projects.map((project) =>
        item(
          view.kind === 'file' && view.file === project.path,
          project.name,
          project.total_tasks - project.completed_tasks,
          () => setView({ kind: 'file', file: project.path }),
        ),
      )}

      <div className="mt-auto space-y-1 px-2 pt-4 text-[11px] leading-4 text-neutral-400">
        {snapshot.warnings.length > 0 && (
          <div className="rounded bg-amber-50 p-1.5 text-amber-700">
            {snapshot.warnings.length} 条解析警告
            <div className="mt-1 max-h-24 overflow-y-auto">
              {snapshot.warnings.slice(0, 20).map((w, i) => (
                <div key={i} className="truncate" title={w}>
                  {w}
                </div>
              ))}
            </div>
          </div>
        )}
        <div>
          <kbd>Q</kbd> 快速添加 · <kbd>G</kbd>+<kbd>D/P/T/I/A</kbd> 切换视图
        </div>
        <div>
          <kbd>↑↓</kbd> 选择 · <kbd>1-4</kbd> 优先级 · <kbd>T</kbd> 今日 · <kbd>Space</kbd> 详情
        </div>
      </div>
    </aside>
  )
}

function projectsOpenBadge(projects: { total_tasks: number; completed_tasks: number }[]): number {
  return projects.reduce((total, project) => total + project.total_tasks - project.completed_tasks, 0)
}

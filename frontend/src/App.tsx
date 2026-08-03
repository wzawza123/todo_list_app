import { useEffect } from 'react'
import { connectWs } from './api'
import { AllTasksView } from './components/AllTasksView'
import { DetailPanel } from './components/DetailPanel'
import { DashboardView } from './components/DashboardView'
import { FileView } from './components/FileView'
import { ProjectManagementView } from './components/ProjectManagementView'
import { QuickAdd } from './components/QuickAdd'
import { Sidebar } from './components/Sidebar'
import { TodayView } from './components/TodayView'
import { Toasts } from './components/Toasts'
import { useStore } from './store'
import { useKeyboard } from './useKeyboard'

export default function App() {
  const { view, refresh, loading, inbox } = useStore()
  useKeyboard()

  useEffect(() => {
    refresh()
    return connectWs(() => useStore.getState().refresh())
  }, [])

  return (
    <div className="flex h-screen min-w-[1280px] overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-hidden bg-white">
        {loading ? (
          <div className="mt-24 text-center text-sm text-neutral-400">加载中…</div>
        ) : view.kind === 'dashboard' ? (
          <DashboardView />
        ) : view.kind === 'projects' ? (
          <ProjectManagementView />
        ) : view.kind === 'today' ? (
          <TodayView />
        ) : view.kind === 'all' ? (
          <AllTasksView />
        ) : view.kind === 'inbox' ? (
          <FileView path={inbox} title="📥 Inbox" />
        ) : (
          <FileView path={view.file!} title={view.file!} />
        )}
      </main>
      <DetailPanel />
      <QuickAdd />
      <Toasts />
    </div>
  )
}

import { create } from 'zustand'
import { ApiError, api } from './api'
import type { FileInfo, Priority, ProjectDeleteResult, ProjectSummary, Snapshot, Task, TodayPayload } from './types'

export type ViewKind = 'dashboard' | 'projects' | 'today' | 'inbox' | 'all' | 'file'
export interface View {
  kind: ViewKind
  file?: string
}

export interface Toast {
  id: number
  message: string
  tone: 'info' | 'error'
}

const COLLAPSE_KEY = 'mdtask.collapsed'

function loadCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '[]'))
  } catch {
    return new Set()
  }
}

function saveCollapsed(set: Set<string>) {
  localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...set]))
}

export function flatten(tasks: Task[], out: Task[] = []): Task[] {
  for (const t of tasks) {
    out.push(t)
    flatten(t.children, out)
  }
  return out
}

interface State {
  snapshot: Snapshot
  files: FileInfo[]
  projects: ProjectSummary[]
  inbox: string
  today: TodayPayload | null
  view: View
  selected: string | null
  detailOpen: boolean
  quickAdd: boolean
  collapsed: Set<string>
  toasts: Toast[]
  loading: boolean
  carryOverPrompted: boolean

  refresh: () => Promise<void>
  setView: (view: View) => void
  select: (key: string | null) => void
  toggleCollapse: (key: string) => void
  toast: (message: string, tone?: 'info' | 'error') => void
  dismissToast: (id: number) => void
  setDetailOpen: (open: boolean) => void
  setQuickAdd: (open: boolean) => void
  run: <T>(fn: () => Promise<T>) => Promise<T | null>

  allTasks: () => Task[]
  taskById: (id: string) => Task | undefined
  todayIds: () => Set<string>

  createProject: (name: string) => Promise<ProjectSummary | null>
  renameProject: (path: string, name: string) => Promise<ProjectSummary | null>
  deleteProject: (path: string) => Promise<ProjectDeleteResult | null>
  createTask: (body: Parameters<typeof api.createTask>[0]) => Promise<Task | null>
  patchTask: (id: string, patch: Parameters<typeof api.patchTask>[1]) => Promise<Task | null>
  deleteTask: (id: string) => Promise<void>
  indent: (id: string, direction: 'in' | 'out') => Promise<void>
  moveTask: (id: string, parentId: string) => Promise<void>
  moveTaskToProject: (id: string, projectPath: string) => Promise<Task | null>
  toggleToday: (id: string) => Promise<void>
  reorderToday: (ids: string[]) => Promise<void>
  carryOver: () => Promise<void>
  cleanToday: () => Promise<void>
  dismissCarryOver: () => void
}

let toastSeq = 0
let refreshInFlight: Promise<void> | null = null
let refreshQueued = false

export const useStore = create<State>((set, get) => ({
  snapshot: { files: {}, warnings: [] },
  files: [],
  projects: [],
  inbox: 'Inbox.md',
  today: null,
  view: { kind: 'dashboard' },
  selected: null,
  detailOpen: false,
  quickAdd: false,
  collapsed: loadCollapsed(),
  toasts: [],
  loading: true,
  carryOverPrompted: false,

  toast: (message, tone = 'info') => {
    const id = ++toastSeq
    set((s) => ({ toasts: [...s.toasts, { id, message, tone }] }))
    window.setTimeout(() => get().dismissToast(id), 4000)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  run: async (fn) => {
    try {
      return await fn()
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e)
      get().toast(msg, 'error')
      return null
    }
  },

  refresh: async () => {
    if (refreshInFlight) {
      refreshQueued = true
      return refreshInFlight
    }

    const runRefreshLoop = async () => {
      do {
        refreshQueued = false
        const result = await get().run(async () => {
          const [snapshot, files, projects, today] = await Promise.all([
            api.tasks(),
            api.files(),
            api.projects(),
            api.today(),
          ])
          return { snapshot, files, projects, today }
        })
        if (!result) {
          set({ loading: false })
          continue
        }
        set({
          snapshot: result.snapshot,
          files: result.files.files,
          projects: result.projects.projects,
          inbox: result.files.inbox,
          today: result.today,
          loading: false,
        })
      } while (refreshQueued)
    }

    refreshInFlight = runRefreshLoop().finally(() => {
      refreshInFlight = null
    })
    return refreshInFlight
  },

  setView: (view) => {
    set({ view, selected: null, detailOpen: false })
    if (view.kind === 'dashboard' || view.kind === 'projects') void get().refresh()
  },
  select: (key) => set({ selected: key }),

  toggleCollapse: (key) =>
    set((s) => {
      const next = new Set(s.collapsed)
      next.has(key) ? next.delete(key) : next.add(key)
      saveCollapsed(next)
      return { collapsed: next }
    }),

  setDetailOpen: (detailOpen) => set({ detailOpen }),
  setQuickAdd: (quickAdd) => set({ quickAdd }),

  allTasks: () => flatten(Object.values(get().snapshot.files).flat()),
  taskById: (id) => get().allTasks().find((t) => t.id === id),
  todayIds: () => new Set((get().today?.items ?? []).map((i) => i.id)),

  createProject: async (name) => {
    const project = await get().run(() => api.createProject(name))
    if (project) await get().refresh()
    return project
  },

  renameProject: async (path, name) => {
    const project = await get().run(() => api.renameProject(path, name))
    if (project) {
      const currentView = get().view
      if (currentView.kind === 'file' && currentView.file === path) {
        set({ view: { kind: 'file', file: project.path } })
      }
      await get().refresh()
    }
    return project
  },

  deleteProject: async (path) => {
    const result = await get().run(() => api.deleteProject(path))
    if (result) {
      const currentView = get().view
      if (currentView.kind === 'file' && currentView.file === path) {
        set({ view: { kind: 'projects' }, selected: null, detailOpen: false })
      }
      await get().refresh()
    }
    return result
  },

  createTask: async (body) => {
    const task = await get().run(() => api.createTask(body))
    if (task) await get().refresh()
    return task
  },

  patchTask: async (id, patch) => {
    const task = await get().run(() => api.patchTask(id, patch))
    if (task) await get().refresh()
    return task
  },

  deleteTask: async (id) => {
    const res = await get().run(() => api.deleteTask(id))
    if (res) {
      if (get().selected === id) set({ selected: null, detailOpen: false })
      await get().refresh()
    }
  },

  indent: async (id, direction) => {
    const res = await get().run(() => api.indent(id, direction))
    if (res) await get().refresh()
  },

  moveTask: async (id, parentId) => {
    const res = await get().run(() => api.moveTask(id, parentId))
    if (res) {
      // 展开新父任务，免得拖进去后看不见
      set((s) => {
        if (!s.collapsed.size) return {}
        const next = new Set(s.collapsed)
        for (const t of flatten(Object.values(s.snapshot.files).flat())) {
          if (t.id === parentId) next.delete(t.key)
        }
        saveCollapsed(next)
        return { collapsed: next }
      })
      await get().refresh()
    }
  },

  moveTaskToProject: async (id, projectPath) => {
    const task = await get().run(() => api.moveTaskToProject(id, projectPath))
    if (task) {
      set({ selected: null, detailOpen: false })
      await get().refresh()
    }
    return task
  },

  toggleToday: async (id) => {
    const today = await get().run(() => api.toggleToday(id))
    if (today) set({ today })
  },

  reorderToday: async (ids) => {
    const today = await get().run(() => api.putToday(ids))
    if (today) set({ today })
  },

  carryOver: async () => {
    const today = await get().run(() => api.carryOver())
    if (today) set({ today, carryOverPrompted: true })
  },

  cleanToday: async () => {
    const today = await get().run(() => api.cleanToday())
    if (today) set({ today })
  },

  dismissCarryOver: () => set({ carryOverPrompted: true }),
}))

export const PRIORITY_KEYS: Record<string, Priority> = {
  '1': 'highest',
  '2': 'high',
  '3': 'medium',
  '4': 'low',
  '0': 'none',
}

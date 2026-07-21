import { create } from 'zustand'
import { ApiError, api } from './api'
import type { FileInfo, Priority, Snapshot, Task, TodayPayload } from './types'

export type ViewKind = 'today' | 'inbox' | 'all' | 'file'
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

  createTask: (body: Parameters<typeof api.createTask>[0]) => Promise<Task | null>
  patchTask: (id: string, patch: Parameters<typeof api.patchTask>[1]) => Promise<Task | null>
  deleteTask: (id: string) => Promise<void>
  indent: (id: string, direction: 'in' | 'out') => Promise<void>
  toggleToday: (id: string) => Promise<void>
  reorderToday: (ids: string[]) => Promise<void>
  carryOver: () => Promise<void>
  cleanToday: () => Promise<void>
  dismissCarryOver: () => void
}

let toastSeq = 0

export const useStore = create<State>((set, get) => ({
  snapshot: { files: {}, warnings: [] },
  files: [],
  inbox: 'Inbox.md',
  today: null,
  view: { kind: 'today' },
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
    const result = await get().run(async () => {
      const [snapshot, files, today] = await Promise.all([api.tasks(), api.files(), api.today()])
      return { snapshot, files, today }
    })
    if (!result) return set({ loading: false })
    set({
      snapshot: result.snapshot,
      files: result.files.files,
      inbox: result.files.inbox,
      today: result.today,
      loading: false,
    })
  },

  setView: (view) => set({ view, selected: null }),
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

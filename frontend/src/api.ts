import type {
  FileInfo,
  Priority,
  ProjectDeleteResult,
  ProjectSummary,
  ProjectsPayload,
  Snapshot,
  Task,
  TodayPayload,
} from './types'

export class ApiError extends Error {
  code: string
  detail: unknown
  constructor(code: string, message: string, detail?: unknown) {
    super(message)
    this.code = code
    this.detail = detail
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    let payload: any = null
    try {
      payload = await res.json()
    } catch {
      /* ignore */
    }
    const err = payload?.error
    throw new ApiError(err?.code ?? 'HTTP_' + res.status, err?.message ?? res.statusText, err?.detail)
  }
  return res.json() as Promise<T>
}

function projectUrl(path: string): string {
  const encodedPath = path
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `/api/projects/${encodedPath}`
}

export const api = {
  tasks: () => request<Snapshot>('/api/tasks'),
  files: () => request<{ files: FileInfo[]; inbox: string }>('/api/files'),
  projects: () => request<ProjectsPayload>('/api/projects'),
  createProject: (name: string) =>
    request<ProjectSummary>('/api/projects', { method: 'POST', body: JSON.stringify({ name }) }),
  renameProject: (path: string, name: string) =>
    request<ProjectSummary>(projectUrl(path), { method: 'PATCH', body: JSON.stringify({ name }) }),
  deleteProject: (path: string) => request<ProjectDeleteResult>(projectUrl(path), { method: 'DELETE' }),

  createTask: (body: {
    title: string
    file?: string | null
    parent_id?: string | null
    after_id?: string | null
    priority?: Priority
  }) => request<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(body) }),

  patchTask: (id: string, patch: Partial<Pick<Task, 'title' | 'status' | 'priority' | 'depends_on' | 'due'>>) =>
    request<Task>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  deleteTask: (id: string) => request<{ removed: string[] }>(`/api/tasks/${id}`, { method: 'DELETE' }),

  moveTask: (id: string, parent_id: string) =>
    request<Task>(`/api/tasks/${id}/move`, { method: 'POST', body: JSON.stringify({ parent_id }) }),

  indent: (id: string, direction: 'in' | 'out') =>
    request<Task>(`/api/tasks/${id}/indent`, { method: 'POST', body: JSON.stringify({ direction }) }),

  today: (date?: string) => request<TodayPayload>(`/api/today${date ? `?date=${date}` : ''}`),

  putToday: (task_ids: string[], date?: string) =>
    request<TodayPayload>('/api/today', { method: 'PUT', body: JSON.stringify({ date, task_ids }) }),

  toggleToday: (task_id: string, date?: string) =>
    request<TodayPayload>('/api/today/toggle', { method: 'POST', body: JSON.stringify({ task_id, date }) }),

  carryOver: (date?: string) =>
    request<TodayPayload>('/api/today/carry-over', { method: 'POST', body: JSON.stringify({ date }) }),

  cleanToday: (date?: string) =>
    request<TodayPayload>('/api/today/clean', { method: 'POST', body: JSON.stringify({ date }) }),
}

export function connectWs(onChange: () => void): () => void {
  let ws: WebSocket | null = null
  let timer: number | undefined
  let closed = false

  const open = () => {
    if (closed) return
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    ws = new WebSocket(`${proto}://${location.host}/ws`)
    ws.onmessage = (ev) => {
      try {
        if (JSON.parse(ev.data)?.type === 'vault_changed') onChange()
      } catch {
        /* ignore */
      }
    }
    ws.onclose = () => {
      if (!closed) timer = window.setTimeout(open, 1500)
    }
    ws.onerror = () => ws?.close()
  }
  open()

  return () => {
    closed = true
    window.clearTimeout(timer)
    ws?.close()
  }
}

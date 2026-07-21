export type Priority = 'highest' | 'high' | 'medium' | 'low' | 'none'
export type Status = 'todo' | 'done'

export interface Task {
  id: string | null
  key: string
  title: string
  status: Status
  priority: Priority
  depends_on: string[]
  due: string | null
  done_date: string | null
  file: string
  line: number
  level: number
  parent_id: string | null
  blocked: boolean
  children: Task[]
}

export interface Snapshot {
  files: Record<string, Task[]>
  warnings: string[]
}

export interface FileInfo {
  path: string
  total: number
  open: number
}

export interface TodayItem {
  id: string
  task: Task | null
  stale: boolean
}

export interface TodayPayload {
  date: string
  items: TodayItem[]
  done: number
  total: number
  carry_over?: { id: string; from: string; title: string }[]
}

export const PRIORITIES: Priority[] = ['highest', 'high', 'medium', 'low', 'none']

export const PRIORITY_LABEL: Record<Priority, string> = {
  highest: '最高 🔺',
  high: '高 ⏫',
  medium: '中 🔼',
  low: '低 🔽',
  none: '无',
}

export const PRIORITY_COLOR: Record<Priority, string> = {
  highest: '#dc2626',
  high: '#ea580c',
  medium: '#2563eb',
  low: '#9ca3af',
  none: 'transparent',
}

export const PRIORITY_RANK: Record<Priority, number> = {
  highest: 4,
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
}

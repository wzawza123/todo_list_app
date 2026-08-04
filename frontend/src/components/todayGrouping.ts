import type { TodayItem } from '../types'

export type TodayGroupKey = string | null

export interface TodayGroup {
  key: TodayGroupKey
  title: string
  path: string | null
  items: TodayItem[]
  done: number
  total: number
  progress: number
  stale: boolean
}

/**
 * A stale reference has no reliable project, even if a partially populated
 * task happens to be present in a future API response.
 */
export function todayGroupKey(item: TodayItem): TodayGroupKey {
  return item.stale || !item.task ? null : item.task.file
}

/** Keep the first-seen project order and the original item order per project. */
export function groupTodayItems(items: TodayItem[]): TodayGroup[] {
  const grouped = new Map<TodayGroupKey, TodayItem[]>()

  for (const item of items) {
    const key = todayGroupKey(item)
    const groupItems = grouped.get(key)
    if (groupItems) groupItems.push(item)
    else grouped.set(key, [item])
  }

  return [...grouped].map(([key, groupItems]) => {
    const done = groupItems.filter((item) => !item.stale && item.task?.status === 'done').length
    const total = groupItems.length
    const stale = key === null
    const inbox = key !== null && key.toLowerCase() === 'inbox.md'

    return {
      key,
      title: key === null ? '失效任务' : inbox ? 'Inbox' : fileStem(key),
      path: key === null || inbox ? null : key,
      items: groupItems,
      done,
      total,
      progress: total === 0 ? 0 : Math.round((done / total) * 100),
      stale,
    }
  })
}

/**
 * Reorder one project without flattening the grouped UI back into project
 * blocks. Only that project's original slots in the global schedule change.
 */
export function reorderTodayGroup(
  items: TodayItem[],
  groupKey: TodayGroupKey,
  activeId: string,
  overId: string,
): string[] | null {
  if (activeId === overId) return null

  const groupItems = items.filter((item) => todayGroupKey(item) === groupKey)
  const from = groupItems.findIndex((item) => item.id === activeId)
  const to = groupItems.findIndex((item) => item.id === overId)
  if (from < 0 || to < 0) return null

  const reorderedIds = groupItems.map((item) => item.id)
  const [movedId] = reorderedIds.splice(from, 1)
  reorderedIds.splice(to, 0, movedId)

  let groupIndex = 0
  return items.map((item) => {
    if (todayGroupKey(item) !== groupKey) return item.id
    return reorderedIds[groupIndex++]
  })
}

function fileStem(path: string): string {
  const segments = path.split(/[\\/]/)
  const filename = segments[segments.length - 1] || path
  const extensionAt = filename.lastIndexOf('.')
  return extensionAt > 0 ? filename.slice(0, extensionAt) : filename
}

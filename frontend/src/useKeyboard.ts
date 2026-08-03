import { useEffect, useRef } from 'react'
import { PRIORITY_KEYS, useStore } from './store'

function visibleKeys(): string[] {
  return [...document.querySelectorAll('[data-task-key]')].map((el) => el.getAttribute('data-task-key')!)
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

/** Global keyboard map. `G` acts as a leader key for view switching. */
export function useKeyboard() {
  const leader = useRef(false)

  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const s = useStore.getState()
      if (s.quickAdd) return
      if (document.querySelector('[aria-modal="true"]')) return
      if (isTyping(e.target)) return

      // leader: G D / G P / G T / G I / G A
      if (leader.current) {
        leader.current = false
        const map: Record<string, () => void> = {
          d: () => s.setView({ kind: 'dashboard' }),
          p: () => s.setView({ kind: 'projects' }),
          t: () => s.setView({ kind: 'today' }),
          i: () => s.setView({ kind: 'inbox' }),
          a: () => s.setView({ kind: 'all' }),
        }
        const fn = map[e.key.toLowerCase()]
        if (fn) {
          e.preventDefault()
          fn()
          return
        }
      }
      if (e.key.toLowerCase() === 'g' && !e.metaKey && !e.ctrlKey) {
        leader.current = true
        window.setTimeout(() => (leader.current = false), 1200)
        return
      }

      if (e.key.toLowerCase() === 'q' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        s.setQuickAdd(true)
        return
      }

      const keys = visibleKeys()
      const idx = s.selected ? keys.indexOf(s.selected) : -1

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (keys.length === 0) return
        const next = e.key === 'ArrowDown' ? Math.min(idx + 1, keys.length - 1) : Math.max(idx - 1, 0)
        s.select(keys[next < 0 ? 0 : next])
        document
          .querySelector(`[data-task-key="${CSS.escape(keys[next < 0 ? 0 : next])}"]`)
          ?.scrollIntoView({ block: 'nearest' })
        return
      }

      const task = s.allTasks().find((t) => t.key === s.selected)
      if (!task) return

      const needsId = () => {
        if (!task.id) {
          s.toast('该任务尚无 🆔，请先双击编辑标题以写入 id', 'error')
          return false
        }
        return true
      }

      if (e.key === 'Escape') {
        s.setDetailOpen(false)
        return
      }

      if (e.key === ' ') {
        e.preventDefault()
        s.setDetailOpen(!s.detailOpen)
        return
      }

      if (e.key in PRIORITY_KEYS) {
        e.preventDefault()
        if (needsId()) s.patchTask(task.id!, { priority: PRIORITY_KEYS[e.key] })
        return
      }

      const k = e.key.toLowerCase()

      if (k === 'x') {
        e.preventDefault()
        if (needsId()) s.patchTask(task.id!, { status: task.status === 'done' ? 'todo' : 'done' })
        return
      }

      if (k === 't') {
        e.preventDefault()
        if (needsId()) s.toggleToday(task.id!)
        return
      }

      if (k === 'e') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('mdtask:edit', { detail: task.key }))
        return
      }

      if (e.key === 'Tab') {
        e.preventDefault()
        if (!needsId()) return
        if (e.shiftKey) {
          s.indent(task.id!, 'out')
        } else if (task.level >= 4) {
          s.toast('已达到 4 级嵌套上限', 'error')
        } else {
          s.indent(task.id!, 'in')
        }
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        if (!needsId()) return
        if (e.shiftKey) {
          if (task.level >= 4) return s.toast('已达到 4 级嵌套上限', 'error')
          const created = await s.createTask({ title: '新任务', parent_id: task.id })
          if (created) {
            s.select(created.key)
            window.dispatchEvent(new CustomEvent('mdtask:edit', { detail: created.key }))
          }
        } else {
          const created = await s.createTask({ title: '新任务', after_id: task.id })
          if (created) {
            s.select(created.key)
            window.dispatchEvent(new CustomEvent('mdtask:edit', { detail: created.key }))
          }
        }
        return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        if (!needsId()) return
        if (confirm(`删除「${task.title}」及其所有子任务？`)) s.deleteTask(task.id!)
        return
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

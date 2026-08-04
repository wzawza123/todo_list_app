import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { PRIORITIES, PRIORITY_COLOR, PRIORITY_LABEL, type Priority } from '../types'

function Swatch({ p, className = '' }: { p: Priority; className?: string }) {
  return (
    <span
      className={`shrink-0 rounded-sm ${className}`}
      style={{
        background: PRIORITY_COLOR[p],
        border: p === 'none' ? '1px dashed #d4d4d8' : undefined,
      }}
    />
  )
}

export function QuickAdd() {
  const { quickAdd, setQuickAdd, createTask, view, inbox, toast } = useStore()
  const [value, setValue] = useState('')
  const [priority, setPriority] = useState<Priority>('none')
  const [menuOpen, setMenuOpen] = useState(false)
  const [cursor, setCursor] = useState(0)
  const [added, setAdded] = useState<string[]>([])
  const ref = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  const targetFile = view.kind === 'file' && view.file ? view.file : inbox

  useEffect(() => {
    if (quickAdd) {
      setValue('')
      setPriority('none')
      setMenuOpen(false)
      setAdded([])
      requestAnimationFrame(() => ref.current?.focus())
    }
  }, [quickAdd])

  if (!quickAdd) return null

  // Alt+P / Ctrl+P：聚焦优先级并展开下拉（裸 P 会和标题输入冲突）
  const isPriorityHotkey = (e: React.KeyboardEvent) =>
    (e.altKey || e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')

  const openMenu = () => {
    setCursor(Math.max(0, PRIORITIES.indexOf(priority)))
    setMenuOpen(true)
    trigger.current?.focus()
  }

  const pick = (p: Priority) => {
    setPriority(p)
    setMenuOpen(false)
    ref.current?.focus()
  }

  // 展开时按 1/2/3/4 直接选定优先级并收起（0 = 清除），与列表里的数字键一致
  const DIGIT: Record<string, Priority> = {
    '1': 'highest',
    '2': 'high',
    '3': 'medium',
    '4': 'low',
    '0': 'none',
  }

  const submit = async (p: Priority = priority) => {
    const title = value.trim()
    if (!title) return
    setValue('')
    const task = await createTask({ title, file: targetFile, priority: p })
    if (task) {
      setAdded((a) => [task.title, ...a].slice(0, 5))
      toast(`已添加到 ${targetFile}`)
      ref.current?.focus()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-32"
      onMouseDown={() => setQuickAdd(false)}
    >
      <div
        className="w-[560px] rounded-lg border border-neutral-200 bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 pr-3">
          <input
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (isPriorityHotkey(e)) {
                e.preventDefault()
                openMenu()
                return
              }
              if (e.key === 'Enter') submit()
              if (e.key === 'Escape') setQuickAdd(false)
            }}
            placeholder="快速添加任务…"
            className="min-w-0 flex-1 rounded-tl-lg px-4 py-3 text-base outline-none"
          />

          <div className="relative shrink-0">
            <button
              ref={trigger}
              type="button"
              aria-haspopup="listbox"
              aria-expanded={menuOpen}
              title="优先级（Alt+P 展开，1~4 直接选 / ↑↓ 选择，Enter 提交任务）"
              onClick={() => (menuOpen ? setMenuOpen(false) : openMenu())}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (isPriorityHotkey(e)) {
                  e.preventDefault()
                  openMenu()
                  return
                }
                if (DIGIT[e.key] !== undefined) {
                  e.preventDefault()
                  pick(DIGIT[e.key])
                  return
                }
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault()
                  if (!menuOpen) {
                    openMenu()
                    return
                  }
                  const step = e.key === 'ArrowDown' ? 1 : -1
                  setCursor((c) => (c + step + PRIORITIES.length) % PRIORITIES.length)
                  return
                }
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  if (!menuOpen) {
                    submit()
                    return
                  }
                  // 展开时 Enter：采用高亮项并直接提交任务；空格只选定
                  const p = PRIORITIES[cursor]
                  pick(p)
                  if (e.key === 'Enter') submit(p)
                  return
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  if (menuOpen) {
                    setMenuOpen(false)
                    ref.current?.focus()
                  } else {
                    setQuickAdd(false)
                  }
                }
              }}
              onBlur={() => setMenuOpen(false)}
              className="flex items-center gap-1.5 rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-600 outline-none hover:bg-neutral-50 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
            >
              <Swatch p={priority} className="h-3 w-[3px]" />
              {PRIORITY_LABEL[priority]}
              <span className="text-[12px] text-neutral-400">▾</span>
            </button>

            {menuOpen && (
              <div
                role="listbox"
                className="absolute right-0 top-8 z-30 w-32 rounded-md border border-neutral-200 bg-white py-1 shadow-lg"
              >
                {PRIORITIES.map((p, i) => (
                  <div
                    key={p}
                    role="option"
                    aria-selected={p === priority}
                    onMouseEnter={() => setCursor(i)}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pick(p)
                    }}
                    className={`flex cursor-pointer items-center gap-2 px-2 py-1 text-xs ${
                      i === cursor ? 'bg-neutral-100' : ''
                    } ${p === priority ? 'font-medium' : ''}`}
                  >
                    <Swatch p={p} className="h-3 w-[3px]" />
                    <span className="flex-1">{PRIORITY_LABEL[p]}</span>
                    <span className="text-[12px] text-neutral-400">{p === 'none' ? 0 : i + 1}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-neutral-100 px-4 py-1.5 text-xs text-neutral-400">
          <span className="min-w-0 flex-1 truncate" title={targetFile}>→ {targetFile}</span>
          <span className="shrink-0 whitespace-nowrap">
            <kbd>Enter</kbd> 提交并继续 · <kbd>Alt+P</kbd> 优先级（<kbd>1</kbd>–<kbd>4</kbd>）· <kbd>Esc</kbd> 关闭
          </span>
        </div>
        {added.length > 0 && (
          <div className="border-t border-neutral-100 px-4 py-2 text-xs text-neutral-500">
            {added.map((t, i) => (
              <div key={i} className="truncate">
                ✓ {t}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

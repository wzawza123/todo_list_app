import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'

export function QuickAdd() {
  const { quickAdd, setQuickAdd, createTask, view, inbox, toast } = useStore()
  const [value, setValue] = useState('')
  const [added, setAdded] = useState<string[]>([])
  const ref = useRef<HTMLInputElement>(null)

  const targetFile = view.kind === 'file' && view.file ? view.file : inbox

  useEffect(() => {
    if (quickAdd) {
      setValue('')
      setAdded([])
      requestAnimationFrame(() => ref.current?.focus())
    }
  }, [quickAdd])

  if (!quickAdd) return null

  const submit = async () => {
    const title = value.trim()
    if (!title) return
    setValue('')
    const task = await createTask({ title, file: targetFile })
    if (task) {
      setAdded((a) => [task.title, ...a].slice(0, 5))
      toast(`已添加到 ${targetFile}`)
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
        <input
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') setQuickAdd(false)
          }}
          placeholder="快速添加任务…  结尾用 !1~!4 设置优先级"
          className="w-full rounded-t-lg px-4 py-3 text-base outline-none"
        />
        <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-1.5 text-xs text-neutral-400">
          <span>→ {targetFile}</span>
          <span>
            <kbd>Enter</kbd> 提交并继续 · <kbd>Esc</kbd> 关闭
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

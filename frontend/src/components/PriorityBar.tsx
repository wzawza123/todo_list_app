import { useEffect, useRef, useState } from 'react'
import { PRIORITIES, PRIORITY_COLOR, PRIORITY_LABEL, type Priority } from '../types'

export function PriorityBar({
  priority,
  onChange,
}: {
  priority: Priority
  onChange: (p: Priority) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        title={`优先级：${PRIORITY_LABEL[priority]}`}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="block h-[18px] w-[3px] rounded-sm hover:w-[5px] transition-all"
        style={{
          background: PRIORITY_COLOR[priority],
          border: priority === 'none' ? '1px dashed #d4d4d8' : undefined,
        }}
      />
      {open && (
        <div className="absolute left-2 top-5 z-30 w-28 rounded-md border border-neutral-200 bg-white py-1 shadow-lg">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
                onChange(p)
              }}
              className={`flex w-full items-center gap-2 px-2 py-1 text-left text-xs hover:bg-neutral-100 ${
                p === priority ? 'font-medium' : ''
              }`}
            >
              <span
                className="h-3 w-[3px] rounded-sm"
                style={{
                  background: PRIORITY_COLOR[p],
                  border: p === 'none' ? '1px dashed #d4d4d8' : undefined,
                }}
              />
              {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

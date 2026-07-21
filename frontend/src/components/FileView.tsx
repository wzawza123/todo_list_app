import { useState } from 'react'
import { useStore } from '../store'
import { TaskTree } from './TaskTree'

export function FileView({ path, title }: { path: string; title: string }) {
  const { snapshot, createTask } = useStore()
  const [hideDone, setHideDone] = useState(true)
  const [draft, setDraft] = useState('')
  const roots = snapshot.files[path] ?? []

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-neutral-200 px-4 py-2">
        <h1 className="text-sm font-semibold">{title}</h1>
        <span className="text-xs text-neutral-400">{path}</span>
        <label className="ml-auto flex items-center gap-1 text-xs text-neutral-600">
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> 隐藏已完成
        </label>
      </header>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {roots.length === 0 ? (
          <div className="mt-24 text-center text-sm text-neutral-400">
            这个文件还没有任务。按 <kbd>Q</kbd> 快速添加。
          </div>
        ) : (
          <TaskTree tasks={roots} hideDone={hideDone} />
        )}
      </div>

      <div className="border-t border-neutral-200 px-4 py-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={async (e) => {
            e.stopPropagation()
            if (e.key === 'Enter' && draft.trim()) {
              const title = draft.trim()
              setDraft('')
              await createTask({ title, file: path })
            }
          }}
          placeholder="新建任务…（结尾 !1~!4 设置优先级）"
          className="w-full rounded border border-neutral-200 px-2 py-1 text-sm outline-none focus:border-blue-400"
        />
      </div>
    </div>
  )
}

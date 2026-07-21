import { useStore } from '../store'

export function Toasts() {
  const { toasts, dismissToast } = useStore()
  if (toasts.length === 0) return null
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => dismissToast(t.id)}
          className={`pointer-events-auto max-w-md cursor-pointer rounded-md px-3 py-2 text-xs shadow-lg ${
            t.tone === 'error' ? 'bg-red-600 text-white' : 'bg-neutral-800 text-white'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}

// How a place will look on the Kitchen board, updated as she picks: the same header the board cards use.
import { LocationHeader } from '../../ui/LocationHeader'
import type { LocationStyleDraft } from './LocationStyleFields'

export function LocationPreview({
  name,
  style,
  count,
}: {
  name: string
  style: LocationStyleDraft
  count: number
}) {
  const title = name.trim() || 'New place'
  return (
    <div role="group" aria-label="Preview" className="flex flex-col gap-1">
      <p className="text-sm font-semibold text-muted">Preview</p>
      <div className="overflow-hidden rounded-card border border-line shadow-card">
        <LocationHeader
          location={{ name: title, icon: style.icon, color: style.color }}
          title={title}
          status="As it looks on the Kitchen board"
          count={count}
          level={3}
        />
      </div>
    </div>
  )
}

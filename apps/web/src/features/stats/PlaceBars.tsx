// Where it lives (F-ST-05): the number of items in each place, with the place's own icon and tint. The count is
// written beside every bar.
import type { Location, StatsOverview } from '@chatchiu/contracts'
import { Icon } from '../../ui/Icon'
import { cx } from '../../ui/cx'
import { LOCATION_TINT_CLASS, locationStyle } from '../../ui/location-style'
import { Block } from './Block'

export function PlaceBars({
  byLocation,
  locations,
  className,
}: {
  byLocation: StatsOverview['byLocation']
  locations: readonly Location[]
  className?: string
}) {
  const max = Math.max(1, ...byLocation.map((l) => l.count))
  return (
    <Block title="Stock by location" lead="Items by place." className={className}>
      <ul className="flex flex-col gap-2">
        {byLocation.map((place) => {
          const location = locations.find((l) => l.id === place.locationId) ?? {
            name: place.location,
          }
          const { icon, color } = locationStyle(location)
          return (
            <li key={place.locationId ?? 'none'} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={cx(
                  'flex size-9 shrink-0 items-center justify-center rounded-control text-loc-ink',
                  LOCATION_TINT_CLASS[color],
                )}
              >
                <Icon name={icon} size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2 text-base">
                  <span className="truncate text-ink">{place.location}</span>
                  <span className="font-bold text-muted tabular">{place.count}</span>
                </span>
                <span aria-hidden="true" className="mt-1 block h-2 rounded-pill bg-track">
                  <span
                    className="block h-full rounded-pill bg-fill"
                    style={{ width: `${(place.count / max) * 100}%` }}
                  />
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </Block>
  )
}

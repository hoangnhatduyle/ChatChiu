// Locations (F-SE-01): add, edit and delete. Delete tells her first how many items will move to "No location"
// (it never removes items: NC-SE-NO-ORPHAN-SURPRISE) and is a held write with Undo, never a confirm.
import type { Location } from '@chatchiu/contracts'
import { useRef, useState } from 'react'
import { cx } from '../../ui/cx'
import { useBootstrapQuery, locationWrites } from '../../data/inventory'
import { newTempId } from '../../data/resource'
import { useHeldWrite } from '../../data/undoable'
import { useWrite } from '../../data/write'
import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'
import { IconButton } from '../../ui/IconButton'
import { Icon } from '../../ui/Icon'
import { LOCATION_TINT_CLASS, locationStyle } from '../../ui/location-style'
import { Skeleton } from '../../ui/Skeleton'
import { LocationPreview } from './LocationPreview'
import { LocationStyleFields, type LocationStyleDraft } from './LocationStyleFields'
import { SectionCard } from './SectionCard'
import { focusFirstInput } from './focus-first-input'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const NAME_REQUIRED = 'Enter a name for the location.'
const HEADING_ID = 'locations-heading'
const editButtonId = (id: number) => `edit-location-${id}`
/** Moves focus once the row it was on has gone: to this element, or the section heading. */
const focusAfterRender = (id: string) =>
  requestAnimationFrame(() =>
    (document.getElementById(id) ?? document.getElementById(HEADING_ID))?.focus(),
  )

function LocationEditor({
  location,
  count,
  onDone,
}: {
  location: Location
  count: number
  onDone: () => void
}) {
  const update = useWrite(locationWrites.update)
  const [name, setName] = useState(location.name)
  const [sub, setSub] = useState(location.subLocation ?? '')
  const [style, setStyle] = useState<LocationStyleDraft>({
    icon: location.icon ?? null,
    color: location.color ?? null,
  })
  const [error, setError] = useState<string>()
  const group = useRef<HTMLDivElement>(null)
  const save = () => {
    if (!name.trim()) {
      setError(NAME_REQUIRED)
      return focusFirstInput(group.current)
    }
    // Only what changed is sent, so an old place she only renames keeps sending just the name.
    const styled: Partial<LocationStyleDraft> = {}
    if (style.icon !== (location.icon ?? null)) styled.icon = style.icon
    if (style.color !== (location.color ?? null)) styled.color = style.color
    void update({
      id: location.id,
      patch: { name: name.trim(), subLocation: sub.trim() || null, ...styled },
    })
    onDone()
  }
  return (
    <div
      ref={group}
      role="group"
      aria-label={`Edit ${location.name}`}
      className="flex flex-col gap-2 py-2"
    >
      <Field
        label={`Name of ${location.name}`}
        value={name}
        onChange={(value) => {
          setName(value)
          setError(undefined)
        }}
        autoFocus
        isInvalid={Boolean(error)}
        errorMessage={error}
        maxLength={100}
      />
      <Field
        label={`Sub-location of ${location.name}`}
        value={sub}
        onChange={setSub}
        maxLength={100}
      />
      <LocationStyleFields value={style} onChange={setStyle} idPrefix={location.name} />
      <LocationPreview name={name} style={style} count={count} />
      <div className="flex gap-2">
        <Button variant="primary" onPress={save}>
          {`Save ${location.name}`}
        </Button>
        <Button variant="secondary" onPress={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function AddLocation() {
  const create = useWrite(locationWrites.create)
  const [name, setName] = useState('')
  const [sub, setSub] = useState('')
  const [style, setStyle] = useState<LocationStyleDraft>({ icon: null, color: null })
  const [error, setError] = useState<string>()
  const group = useRef<HTMLDivElement>(null)
  const add = () => {
    if (!name.trim()) {
      setError(NAME_REQUIRED)
      return focusFirstInput(group.current)
    }
    void create({
      tempId: newTempId(),
      body: {
        name: name.trim(),
        subLocation: sub.trim() || null,
        ...(style.icon ? { icon: style.icon } : {}),
        ...(style.color ? { color: style.color } : {}),
      },
    })
    setName('')
    setSub('')
    setStyle({ icon: null, color: null })
    setError(undefined)
  }
  return (
    <div
      ref={group}
      role="group"
      aria-label="Add a location"
      className="flex flex-col gap-2 border-t border-line pt-4 lg:sticky lg:top-6 lg:self-start lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6"
    >
      <Field
        label="Location name"
        value={name}
        onChange={(v) => {
          setName(v)
          setError(undefined)
        }}
        isInvalid={Boolean(error)}
        errorMessage={error}
        maxLength={100}
      />
      <Field label="Sub-location (optional)" value={sub} onChange={setSub} maxLength={100} />
      <LocationStyleFields value={style} onChange={setStyle} idPrefix="the new location" />
      <LocationPreview name={name} style={style} count={0} />
      <Button variant="primary" onPress={add} className="self-start">
        Add location
      </Button>
    </div>
  )
}

function PlaceSwatch({ location }: { location: Location }) {
  const { icon, color } = locationStyle(location)
  return (
    <span
      aria-hidden="true"
      className={cx(
        'flex size-10 shrink-0 items-center justify-center rounded-control text-loc-ink',
        LOCATION_TINT_CLASS[color],
      )}
    >
      <Icon name={icon} size={22} />
    </span>
  )
}

export function LocationsSection() {
  const { data } = useBootstrapQuery()
  const holdRemove = useHeldWrite(locationWrites.remove)
  const [editing, setEditing] = useState<number | null>(null)
  const countOf = (id: number) => data?.items.filter((i) => i.locationId === id).length ?? 0

  const remove = (location: Location) => {
    const count = countOf(location.id)
    const list = data?.locations ?? []
    const at = list.findIndex((l) => l.id === location.id)
    const neighbour = list[at + 1] ?? list[at - 1]
    const message =
      count > 0
        ? `${location.name} deleted · ${plural(count, 'item')} moved to No location`
        : `${location.name} deleted`
    if (holdRemove({ id: location.id }, message)) {
      focusAfterRender(neighbour ? editButtonId(neighbour.id) : HEADING_ID)
    }
  }

  return (
    <SectionCard
      headingId={HEADING_ID}
      title="Locations"
      description="Where things are kept. Items keep their place on the board."
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        {!data ? (
          <Skeleton className="h-16 w-full" />
        ) : data.locations.length === 0 ? (
          <p className="text-md text-muted">No locations yet. Add one below.</p>
        ) : (
          <ul role="list">
            {data.locations.map((location) => {
              const count = countOf(location.id)
              return (
                <li key={location.id} className="border-b border-line py-1 last:border-b-0">
                  {editing === location.id ? (
                    <LocationEditor
                      location={location}
                      count={count}
                      onDone={() => {
                        setEditing(null)
                        focusAfterRender(editButtonId(location.id))
                      }}
                    />
                  ) : (
                    <div className="flex items-center gap-3">
                      <PlaceSwatch location={location} />
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-bold text-ink">{location.name}</p>
                        <p className="text-sm text-muted">
                          {[location.subLocation, plural(count, 'item')]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <IconButton
                        icon="edit"
                        id={editButtonId(location.id)}
                        label={`Edit ${location.name}`}
                        onPress={() => setEditing(location.id)}
                      />
                      <IconButton
                        icon="trash"
                        label={
                          count > 0
                            ? `Delete ${location.name}, ${plural(count, 'item')} will move to No location`
                            : `Delete ${location.name}`
                        }
                        onPress={() => remove(location)}
                      />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        <AddLocation />
      </div>
    </SectionCard>
  )
}

// Location (F-IF-03): the shared picker over her locations, pre-filled by the page when the form was
// opened from a board column, with "Add a new location" through the locations write hook.
import type { Bootstrap } from '@chatchiu/contracts'
import { useCallback } from 'react'
import { locationWrites } from '../../data/inventory'
import { newTempId } from '../../data/resource'
import { useWrite } from '../../data/write'
import { AddablePicker } from './AddablePicker'

export type LocationPickerProps = {
  locations: Bootstrap['locations']
  value: number | null
  onChange: (id: number) => void
  error?: string
}

export function LocationPicker({ locations, value, onChange, error }: LocationPickerProps) {
  const create = useWrite(locationWrites.create)
  const add = useCallback(
    async (name: string) => {
      const handle = create({ tempId: newTempId(), body: { name } })
      const result = await handle.result
      if (result.status === 'saved') return result.data.id
      handle.discard()
      return null
    },
    [create],
  )
  return (
    <AddablePicker
      label="Location"
      noun="location"
      options={locations.map((l) => ({
        id: l.id,
        label: l.subLocation ? `${l.name} - ${l.subLocation}` : l.name,
      }))}
      value={value}
      onChange={onChange}
      onAdd={add}
      error={error}
    />
  )
}

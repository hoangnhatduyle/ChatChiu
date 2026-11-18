// Category (F-IF-02): the shared picker over her categories, with "Add a new category" creating through
// the categories write hook. Works with no categories at all (7.0.10).
import type { Bootstrap } from '@chatchiu/contracts'
import { useCallback } from 'react'
import { categoryWrites } from '../../data/inventory'
import { newTempId } from '../../data/resource'
import { useWrite } from '../../data/write'
import { AddablePicker } from './AddablePicker'

export type CategoryPickerProps = {
  categories: Bootstrap['categories']
  value: number | null
  onChange: (id: number) => void
  error?: string
}

export function CategoryPicker({ categories, value, onChange, error }: CategoryPickerProps) {
  const create = useWrite(categoryWrites.create)
  const add = useCallback(
    async (name: string) => {
      const handle = create({ tempId: newTempId(), body: { name } })
      const result = await handle.result
      if (result.status === 'saved') return result.data.id
      // Told here, inline; the failed write must not also wait for a Retry that adds it later.
      handle.discard()
      return null
    },
    [create],
  )
  return (
    <AddablePicker
      label="Category"
      noun="category"
      options={categories.map((c) => ({ id: c.id, label: c.name }))}
      value={value}
      onChange={onChange}
      onAdd={add}
      error={error}
    />
  )
}

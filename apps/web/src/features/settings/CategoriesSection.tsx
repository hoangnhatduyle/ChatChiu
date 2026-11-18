// Categories (F-SE-02): her own can be added, edited (name, icon, colour) and deleted; system ones are read-only
// (NC-SE-NO-SYSTEM-EDIT) and the section never assumes any exist (NC-SE-NO-SYSTEM-ASSUMPTION). A category
// that items still use is refused with a readable reason before anything is sent; the API says the same.
import type { Category } from '@chatchiu/contracts'
import { useState } from 'react'
import { categoryWrites, useBootstrapQuery } from '../../data/inventory'
import { newTempId } from '../../data/resource'
import { useHeldWrite } from '../../data/undoable'
import { useWrite } from '../../data/write'
import { Button } from '../../ui/Button'
import { IconButton } from '../../ui/IconButton'
import { Skeleton } from '../../ui/Skeleton'
import { CategoryFields, type CategoryDraft } from './CategoryFields'
import { SectionCard } from './SectionCard'

const NAME_REQUIRED = 'Enter a name for the category.'
const HEADING_ID = 'categories-heading'
const editButtonId = (id: number) => `edit-category-${id}`
/** Moves focus once the row it was on has gone: to this element, or the section heading. */
const focusAfterRender = (id: string) =>
  requestAnimationFrame(() =>
    (document.getElementById(id) ?? document.getElementById(HEADING_ID))?.focus(),
  )
const EMPTY: CategoryDraft = { name: '', icon: null, color: null }
const plural = (n: number) => `${n} item${n === 1 ? '' : 's'}`

function CategoryEditor({ category, onDone }: { category: Category; onDone: () => void }) {
  const update = useWrite(categoryWrites.update)
  const [draft, setDraft] = useState<CategoryDraft>({
    name: category.name,
    icon: category.icon,
    color: category.color,
  })
  const [error, setError] = useState<string>()
  const save = () => {
    if (!draft.name.trim()) return setError(NAME_REQUIRED)
    void update({ id: category.id, patch: { ...draft, name: draft.name.trim() } })
    onDone()
  }
  return (
    <div role="group" aria-label={`Edit ${category.name}`} className="flex flex-col gap-2 py-2">
      <CategoryFields
        draft={draft}
        onChange={(next) => {
          setDraft(next)
          setError(undefined)
        }}
        autoFocus
        nameLabel={`Name of ${category.name}`}
        error={error}
      />
      <div className="flex gap-2">
        <Button variant="primary" onPress={save}>
          {`Save ${category.name}`}
        </Button>
        <Button variant="secondary" onPress={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function AddCategory() {
  const create = useWrite(categoryWrites.create)
  const [draft, setDraft] = useState<CategoryDraft>(EMPTY)
  const [error, setError] = useState<string>()
  const add = () => {
    if (!draft.name.trim()) return setError(NAME_REQUIRED)
    void create({ tempId: newTempId(), body: { ...draft, name: draft.name.trim() } })
    setDraft(EMPTY)
    setError(undefined)
  }
  return (
    <div
      role="group"
      aria-label="Add a category"
      className="flex flex-col gap-2 border-t border-line pt-4"
    >
      <CategoryFields
        draft={draft}
        onChange={(next) => {
          setDraft(next)
          setError(undefined)
        }}
        nameLabel="Category name"
        error={error}
      />
      <Button variant="primary" onPress={add} className="self-start">
        Add category
      </Button>
    </div>
  )
}

export function CategoriesSection() {
  const { data } = useBootstrapQuery()
  const holdRemove = useHeldWrite(categoryWrites.remove)
  const [editing, setEditing] = useState<number | null>(null)
  const [blocked, setBlocked] = useState<string | null>(null)

  const remove = (category: Category) => {
    const used = data?.items.filter((i) => i.categoryId === category.id).length ?? 0
    if (used > 0) {
      setBlocked(
        `${category.name} is used by ${plural(used)}. Move them to another category first.`,
      )
      return
    }
    setBlocked(null)
    const list = data?.categories.filter((c) => !c.isSystem) ?? []
    const at = list.findIndex((c) => c.id === category.id)
    const neighbour = list[at + 1] ?? list[at - 1]
    if (holdRemove({ id: category.id }, `${category.name} deleted`)) {
      focusAfterRender(neighbour ? editButtonId(neighbour.id) : HEADING_ID)
    }
  }

  return (
    <SectionCard
      headingId={HEADING_ID}
      title="Categories"
      description="Built-in categories can't be changed. Your own can."
    >
      {blocked && (
        <p
          role="alert"
          className="rounded-control bg-status-expired-bg px-3 py-2 text-md font-semibold text-status-expired-fg"
        >
          {blocked}
        </p>
      )}
      {!data ? (
        <Skeleton className="h-16 w-full" />
      ) : data.categories.length === 0 ? (
        <p className="text-md text-muted">No categories yet. Add one below.</p>
      ) : (
        <ul role="list">
          {data.categories.map((category) => (
            <li key={category.id} className="border-b border-line py-1 last:border-b-0">
              {editing === category.id ? (
                <CategoryEditor
                  category={category}
                  onDone={() => {
                    setEditing(null)
                    focusAfterRender(editButtonId(category.id))
                  }}
                />
              ) : (
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="flex size-9 shrink-0 items-center justify-center rounded-control text-lg"
                    style={category.color ? { backgroundColor: `${category.color}33` } : undefined}
                  >
                    {category.icon ?? '🏷️'}
                  </span>
                  <p className="min-w-0 flex-1 text-base font-bold text-ink">{category.name}</p>
                  {category.isSystem ? (
                    <span className="text-sm font-semibold text-muted">Built in</span>
                  ) : (
                    <>
                      <IconButton
                        icon="edit"
                        id={editButtonId(category.id)}
                        label={`Edit ${category.name}`}
                        onPress={() => setEditing(category.id)}
                      />
                      <IconButton
                        icon="trash"
                        label={`Delete ${category.name}`}
                        onPress={() => remove(category)}
                      />
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <AddCategory />
    </SectionCard>
  )
}

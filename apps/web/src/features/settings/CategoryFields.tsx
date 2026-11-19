// The fields of a category form, shared by Add and Edit: name, an icon from the emoji set, a colour from the named set.
import { Radio, RadioGroup } from 'react-aria-components'
import { Field, LABEL } from '../../ui/Field'
import { cx } from '../../ui/cx'
import { CATEGORY_COLOURS, CATEGORY_ICONS } from '../../ui/category-colours'

export type CategoryDraft = { name: string; icon: string | null; color: string | null }

const PICK =
  'flex cursor-pointer items-center justify-center rounded-control border border-field-line ' +
  'data-hovered:bg-hover data-selected:border-2 data-selected:border-accent data-focus-visible:outline-2 data-focus-visible:outline-offset-2'

export function CategoryFields({
  draft,
  onChange,
  nameLabel,
  error,
  autoFocus,
}: {
  draft: CategoryDraft
  onChange: (next: CategoryDraft) => void
  nameLabel: string
  error?: string
  autoFocus?: boolean
}) {
  return (
    <>
      <Field
        label={nameLabel}
        value={draft.name}
        onChange={(name) => onChange({ ...draft, name })}
        isInvalid={Boolean(error)}
        errorMessage={error}
        autoFocus={autoFocus}
        maxLength={100}
      />
      <p className={LABEL}>Icon</p>
      <RadioGroup
        aria-label="Icon"
        value={draft.icon ?? ''}
        onChange={(icon) => onChange({ ...draft, icon })}
        className="flex flex-wrap gap-1.5"
      >
        {CATEGORY_ICONS.map((icon) => (
          <Radio
            key={icon}
            value={icon}
            aria-label={icon}
            className={cx(PICK, 'size-touch text-xl')}
          >
            {icon}
          </Radio>
        ))}
      </RadioGroup>
      <p className={LABEL}>Colour</p>
      <RadioGroup
        aria-label="Colour"
        value={draft.color ?? ''}
        onChange={(color) => onChange({ ...draft, color })}
        className="flex flex-wrap gap-1.5"
      >
        {CATEGORY_COLOURS.map((colour) => (
          <Radio
            key={colour.value}
            value={colour.value}
            aria-label={colour.name}
            className={cx(PICK, 'size-touch')}
          >
            <span
              aria-hidden="true"
              className="size-6 rounded-pill"
              style={{ backgroundColor: colour.value }}
            />
          </Radio>
        ))}
      </RadioGroup>
    </>
  )
}

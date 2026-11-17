// Select (e.g. "Stored in"): a labelled trigger with a listbox in a popover. Keyboard: arrows open
// and move, Enter picks, Escape closes; typing jumps to an option.
import {
  Button,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select as AriaSelect,
  SelectValue,
  type Key,
} from 'react-aria-components'
import { cx } from './cx'
import { CONTROL, InlineError, LABEL } from './Field'
import { Icon } from './Icon'

export type SelectOption<T extends string> = { id: T; label: string }

export type SelectProps<T extends string> = {
  label: string
  options: ReadonlyArray<SelectOption<T>>
  value: T | null
  onChange: (value: T) => void
  placeholder?: string
  isInvalid?: boolean
  errorMessage?: string
  className?: string
}

export function Select<T extends string>({
  label,
  options,
  value,
  onChange,
  placeholder = 'Choose…',
  isInvalid,
  errorMessage,
  className,
}: SelectProps<T>) {
  const handleChange = (key: Key | null) => {
    const next = options.find((o) => o.id === key)
    if (next) onChange(next.id)
  }
  return (
    <AriaSelect
      selectedKey={value}
      onSelectionChange={handleChange}
      placeholder={placeholder}
      isInvalid={isInvalid}
      className={cx('flex flex-col gap-1.5', className)}
    >
      <Label className={LABEL}>{label}</Label>
      <Button
        className={cx(
          CONTROL,
          'flex cursor-pointer items-center justify-between gap-2 text-left font-medium',
        )}
      >
        <SelectValue className="truncate data-placeholder:text-muted" />
        <Icon name="chevron-down" size={18} />
      </Button>
      <InlineError>{errorMessage}</InlineError>
      <Popover
        offset={6}
        className="min-w-(--trigger-width) rounded-card border border-line bg-surface shadow-pop"
      >
        <ListBox className="max-h-72 overflow-auto p-1.5 outline-none">
          {options.map((option) => (
            <ListBoxItem
              key={option.id}
              id={option.id}
              textValue={option.label}
              className={cx(
                'flex min-h-touch cursor-pointer items-center justify-between gap-3 rounded-control px-3',
                'text-base text-ink data-focused:bg-hover data-pressed:bg-pressed data-selected:font-bold',
              )}
            >
              {({ isSelected }) => (
                <>
                  {option.label}
                  {isSelected && <Icon name="check" size={18} className="text-accent" />}
                </>
              )}
            </ListBoxItem>
          ))}
        </ListBox>
      </Popover>
    </AriaSelect>
  )
}

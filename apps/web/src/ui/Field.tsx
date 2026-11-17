// Text field with a visible label, optional help text and an inline error (NC-IF-NO-SNACKBAR-VALIDATION).
import {
  FieldError,
  Input,
  Label,
  Text,
  TextField,
  type TextFieldProps,
} from 'react-aria-components'
import { cx } from './cx'
import { Icon } from './Icon'

export type FieldProps = Omit<TextFieldProps, 'className' | 'children' | 'style'> & {
  label: string
  description?: string
  errorMessage?: string
  placeholder?: string
  className?: string
}

export const LABEL = 'text-sm font-semibold text-muted'
export const CONTROL =
  'min-h-touch w-full rounded-control border border-field-line bg-surface px-3 text-base text-ink ' +
  'placeholder:text-muted data-hovered:bg-hover data-invalid:border-error data-invalid:border-2'
export const ERROR = 'flex items-center gap-1.5 text-sm font-semibold text-error'

/** Inline error line with an alert glyph, shared by every form control. */
export function InlineError({ children }: { children?: string }) {
  // Without our own message, React Aria shows the browser's validation text (no lone glyph).
  if (!children) return <FieldError className={ERROR} />
  return (
    <FieldError className={ERROR}>
      <Icon name="alert" size={14} strokeWidth={2.4} />
      {children}
    </FieldError>
  )
}

export function Field({
  label,
  description,
  errorMessage,
  placeholder,
  className,
  ...props
}: FieldProps) {
  return (
    <TextField {...props} className={cx('flex flex-col gap-1.5', className)}>
      <Label className={LABEL}>
        {label}
        {props.isRequired && <span className="font-normal"> (required)</span>}
      </Label>
      <Input placeholder={placeholder} className={CONTROL} />
      {description && (
        <Text slot="description" className="text-sm text-muted">
          {description}
        </Text>
      )}
      <InlineError>{errorMessage}</InlineError>
    </TextField>
  )
}

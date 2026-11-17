// A password field, and the one "Show password" box that reveals every password field in a form
// (a tablet keyboard makes a 12-character password hard to type blind).
import { Field, type FieldProps } from '../../ui/Field'

type PasswordFieldProps = Omit<FieldProps, 'type'> & { revealed: boolean }

export function PasswordField({ revealed, ...props }: PasswordFieldProps) {
  return <Field {...props} type={revealed ? 'text' : 'password'} />
}

export function ShowPasswordsBox({
  revealed,
  onChange,
  label,
}: {
  revealed: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <label className="flex min-h-touch cursor-pointer items-center gap-2 text-md font-semibold text-ink">
      <input
        type="checkbox"
        checked={revealed}
        onChange={(event) => onChange(event.target.checked)}
        className="size-5 accent-[var(--color-accent)]"
      />
      {label}
    </label>
  )
}

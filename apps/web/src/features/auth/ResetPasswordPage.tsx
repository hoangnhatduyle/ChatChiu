// Choose a new password after a recovery link (F-AU-03). While the recovery session is active this
// is the only page she can use (F-AU-07); it ends by saving a password or by her Cancel (F-AU-08),
// never silently (NC-AU-RECOVERY-NO-SILENT-EXIT). Saving signs her in via the USER_UPDATED event.
import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { LOGIN_PATH } from '../../core/auth-paths'
import { useSession } from '../../core/session-context'
import { Button } from '../../ui/Button'
import { AuthLayout, FormMessage } from './AuthLayout'
import {
  focusFirstInvalid,
  hasErrors,
  validateNewPassword,
  type FieldErrors,
} from './auth-validation'
import { PasswordField, ShowPasswordsBox } from './PasswordFields'
import { useRevealed } from './use-revealed'

const LINK = 'font-bold text-accent underline underline-offset-2'

export default function ResetPasswordPage() {
  const { status } = useSession()
  // True from Cancel until it ends, so the form does not flash the "link expired" view while the
  // session state changes underneath it.
  const [cancelling, setCancelling] = useState(false)
  if (status === 'PASSWORD_RECOVERY' || cancelling) {
    return <NewPasswordForm onCancelling={setCancelling} />
  }
  return (
    <AuthLayout title="Reset password">
      <FormMessage role="status" tone="info">
        This reset link is no longer valid. Links work once and expire after a while.
      </FormMessage>
      <Link
        to={`${LOGIN_PATH}?forgot=1`}
        className={`${LINK} inline-flex min-h-touch items-center`}
      >
        Get a new reset link
      </Link>
    </AuthLayout>
  )
}

function NewPasswordForm({ onCancelling }: { onCancelling: (cancelling: boolean) => void }) {
  const { updatePassword, cancelRecovery } = useSession()
  const navigate = useNavigate()
  const form = useRef<HTMLFormElement>(null)
  const [values, setValues] = useState({ password: '', confirm: '' })
  const [errors, setErrors] = useState<FieldErrors<'password' | 'confirm'>>({})
  const [failure, setFailure] = useState('')
  const [pending, setPending] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const { revealed, toggle } = useRevealed()

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    const found = validateNewPassword(values)
    setErrors(found)
    setFailure('')
    if (hasErrors(found)) return focusFirstInvalid(form.current)
    setPending(true)
    const result = await updatePassword(values.password)
    // On success the USER_UPDATED event signs her in and <PublicRoute> leaves this page; if that
    // event does not come, the form must not stay locked.
    setPending(false)
    if (!result.success) setFailure(result.message)
  }

  async function handleCancel() {
    setFailure('')
    setCancelling(true)
    onCancelling(true)
    // She stays in recovery unless the session was really dropped (NC-AU-RECOVERY-NO-SILENT-EXIT).
    const result = await cancelRecovery()
    if (!result.success) {
      setFailure(result.message)
      setCancelling(false)
      onCancelling(false)
      return
    }
    void navigate(LOGIN_PATH, { replace: true })
  }

  return (
    <AuthLayout title="Reset password" intro="Choose a new password for your account.">
      <form ref={form} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <PasswordField
          label="New password"
          name="new-password"
          autoComplete="new-password"
          description="12 characters or more."
          value={values.password}
          onChange={(password) => setValues((prev) => ({ ...prev, password }))}
          revealed={revealed}
          isInvalid={errors.password !== undefined}
          errorMessage={errors.password}
          isRequired
        />
        <PasswordField
          label="Confirm password"
          name="confirm-password"
          autoComplete="new-password"
          value={values.confirm}
          onChange={(confirm) => setValues((prev) => ({ ...prev, confirm }))}
          revealed={revealed}
          isInvalid={errors.confirm !== undefined}
          errorMessage={errors.confirm}
          isRequired
        />
        <ShowPasswordsBox revealed={revealed} onChange={toggle} label="Show passwords" />
        <FormMessage role="alert" tone="error">
          {failure}
        </FormMessage>
        <Button type="submit" variant="primary" size="lg" shape="rounded" isPending={pending}>
          {pending ? 'Saving…' : 'Save password'}
        </Button>
        <Button
          variant="ghost"
          onPress={() => void handleCancel()}
          isPending={cancelling}
          className="self-start"
        >
          Cancel
        </Button>
      </form>
    </AuthLayout>
  )
}

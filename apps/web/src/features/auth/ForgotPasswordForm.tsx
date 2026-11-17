// Ask for a reset link (F-AU-03). NC-AU-NO-ENUMERATION: the answer is the same whether or not the
// address has an account; only a connection or server problem is reported (core/auth-actions.ts).
import { useRef, useState, type FormEvent } from 'react'
import { useSession } from '../../core/session-context'
import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'
import { AuthLayout, FormMessage } from './AuthLayout'
import { focusFirstInvalid, hasErrors, validateEmailOnly } from './auth-validation'

type ForgotPasswordFormProps = {
  email: string
  onEmailChange: (email: string) => void
  onBack: () => void
}

export function ForgotPasswordForm({ email, onEmailChange, onBack }: ForgotPasswordFormProps) {
  const { requestPasswordReset } = useSession()
  const form = useRef<HTMLFormElement>(null)
  const [error, setError] = useState<string | undefined>()
  const [failure, setFailure] = useState('')
  const [sent, setSent] = useState(false)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    const found = validateEmailOnly(email)
    setError(found.email)
    setFailure('')
    if (hasErrors(found)) return focusFirstInvalid(form.current)
    setPending(true)
    const result = await requestPasswordReset(email.trim())
    setPending(false)
    if (result.success) setSent(true)
    else setFailure(result.message)
  }

  return (
    <AuthLayout
      title="Forgot password"
      intro="Enter your email and we will send a link to choose a new password."
      focusTitle
    >
      {sent ? (
        <>
          <FormMessage role="status" tone="info" focusOnMount>
            If an account exists for that address, a reset link is on its way. Open it on this
            device.
          </FormMessage>
          <Button variant="secondary" shape="rounded" onPress={onBack}>
            Back to sign in
          </Button>
        </>
      ) : (
        <form ref={form} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <Field
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={onEmailChange}
            isRequired
            isInvalid={error !== undefined}
            errorMessage={error}
          />
          <FormMessage role="alert" tone="error">
            {failure}
          </FormMessage>
          <Button type="submit" variant="primary" size="lg" shape="rounded" isPending={pending}>
            {pending ? 'Sending…' : 'Send reset link'}
          </Button>
          <Button variant="ghost" onPress={onBack} className="self-start">
            Back to sign in
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}

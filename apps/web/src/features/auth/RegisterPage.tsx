// Create an account (F-AU-02): username, email, a password of 12+ characters and its confirmation.
// With email confirmation on, Supabase returns no session and she is told to check her email;
// otherwise the session event signs her in and <PublicRoute> moves her on.
import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useSession } from '../../core/session-context'
import { Button } from '../../ui/Button'
import { Field } from '../../ui/Field'
import { AuthLayout, FormMessage } from './AuthLayout'
import { focusFirstInvalid, hasErrors, validateRegister, type FieldErrors } from './auth-validation'
import { PasswordField, ShowPasswordsBox } from './PasswordFields'
import { useRevealed } from './use-revealed'

const LINK = 'font-bold text-accent underline underline-offset-2'
type Keys = 'username' | 'email' | 'password' | 'confirm'

export default function RegisterPage() {
  const { signUp } = useSession()
  const form = useRef<HTMLFormElement>(null)
  const [values, setValues] = useState({ username: '', email: '', password: '', confirm: '' })
  const [errors, setErrors] = useState<FieldErrors<Keys>>({})
  const [failure, setFailure] = useState('')
  const [pending, setPending] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState(false)
  const { revealed, toggle } = useRevealed()

  const bind = (key: Keys) => ({
    value: values[key],
    onChange: (value: string) => setValues((prev) => ({ ...prev, [key]: value })),
    isInvalid: errors[key] !== undefined,
    errorMessage: errors[key],
  })

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    const found = validateRegister(values)
    setErrors(found)
    setFailure('')
    if (hasErrors(found)) return focusFirstInvalid(form.current)
    setPending(true)
    const result = await signUp(values.email.trim(), values.password, values.username)
    // With a session the redirect replaces this page; if it does not come, the form must not stay locked.
    setPending(false)
    if (!result.success) setFailure(result.message)
    else if (result.needsConfirmation) setConfirmEmail(true)
  }

  if (confirmEmail) {
    return (
      <AuthLayout title="Create account">
        <FormMessage role="status" tone="info" focusOnMount>
          Check your email. We sent a link to confirm your account; open it, then sign in.
        </FormMessage>
        <Link to="/login" className={`${LINK} inline-flex min-h-touch items-center`}>
          Go to sign in
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Create account" intro="One account for the whole household kitchen.">
      <form ref={form} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <Field
          label="Username"
          name="username"
          autoComplete="username"
          isRequired
          {...bind('username')}
        />
        <Field
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          isRequired
          {...bind('email')}
        />
        <PasswordField
          label="Password"
          name="new-password"
          autoComplete="new-password"
          description="12 characters or more."
          revealed={revealed}
          isRequired
          {...bind('password')}
        />
        <PasswordField
          label="Confirm password"
          name="confirm-password"
          autoComplete="new-password"
          revealed={revealed}
          isRequired
          {...bind('confirm')}
        />
        <ShowPasswordsBox revealed={revealed} onChange={toggle} label="Show passwords" />
        <FormMessage role="alert" tone="error">
          {failure}
        </FormMessage>
        <Button type="submit" variant="primary" size="lg" shape="rounded" isPending={pending}>
          {pending ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
      <p className="text-md text-muted">
        Already have an account?{' '}
        <Link to="/login" className={LINK}>
          Sign in
        </Link>
      </p>
    </AuthLayout>
  )
}
